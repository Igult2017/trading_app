#!/usr/bin/env python3
"""
Price Daemon
────────────
Persistent background process that:
  • Polls ALL instruments (crypto, forex, indices, commodities, stocks) via
    yfinance rotating scheduler (1 request per 6 s)
  • Applies market-hours gate — no requests for closed non-crypto markets
    (crypto is always active — 24/7 market)
  • Keeps a single in-memory cache as the source of truth
  • Exposes HTTP on 127.0.0.1:8765 so Node.js can read cache without ever
    triggering an external fetch

Note: Binance WebSocket was removed — Replit IP ranges are geo-blocked by
Binance (HTTP 451). yfinance serves crypto just as well from any server.

price_service.py is left untouched — it continues to serve candle/OHLCV data
via the existing subprocess mechanism.
"""

import json
import logging
import os
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Optional

import pytz
import yfinance as yf

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [price-daemon] %(levelname)s  %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("price_daemon")

# ── Shared cache ───────────────────────────────────────────────────────────────
# Simple TTL cache — no external dependency required.
# Entries expire after 30 s; reads beyond that return None (treated as cache
# miss by callers). maxsize=200 covers all known instruments.
_CACHE_TTL = 30  # seconds
_CACHE_MAX  = 200

class _TTLCache:
    """Minimal TTL + max-size cache (LRU eviction on overflow)."""
    def __init__(self, maxsize: int, ttl: float) -> None:
        self._maxsize = maxsize
        self._ttl     = ttl
        self._store: dict[str, tuple[dict, float]] = {}  # key → (value, expire_at)

    def __setitem__(self, key: str, value: dict) -> None:
        # Evict expired entries first; if still full, drop oldest by insertion order
        now = time.monotonic()
        self._store = {k: v for k, v in self._store.items() if v[1] > now}
        if len(self._store) >= self._maxsize:
            oldest = next(iter(self._store))
            del self._store[oldest]
        self._store[key] = (value, now + self._ttl)

    def __getitem__(self, key: str) -> dict:
        entry = self._store.get(key)
        if entry is None or time.monotonic() > entry[1]:
            raise KeyError(key)
        return entry[0]

    def get(self, key: str, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def __contains__(self, key: str) -> bool:
        return self.get(key) is not None

    def __len__(self) -> int:
        now = time.monotonic()
        return sum(1 for _, exp in self._store.values() if exp > now)


cache: _TTLCache = _TTLCache(maxsize=_CACHE_MAX, ttl=_CACHE_TTL)
cache_lock = threading.Lock()

# ── Instrument definitions ─────────────────────────────────────────────────────

# All instruments polled via yfinance: (our symbol, yahoo ticker, asset class)
SCHEDULER_INSTRUMENTS: list[tuple[str, str, str]] = [
    # ── Crypto (24/7 — always active) ─────────────────────────────────────────
    ("BTC/USDT",  "BTC-USD",  "crypto"),
    ("ETH/USDT",  "ETH-USD",  "crypto"),
    ("SOL/USDT",  "SOL-USD",  "crypto"),
    ("XRP/USDT",  "XRP-USD",  "crypto"),
    ("ADA/USDT",  "ADA-USD",  "crypto"),
    ("BNB/USDT",  "BNB-USD",  "crypto"),
    ("DOGE/USDT", "DOGE-USD", "crypto"),
    ("AVAX/USDT", "AVAX-USD", "crypto"),
    ("MATIC/USDT","MATIC-USD","crypto"),
    ("LTC/USDT",  "LTC-USD",  "crypto"),
    ("LINK/USDT", "LINK-USD", "crypto"),
    ("DOT/USDT",  "DOT-USD",  "crypto"),
    ("UNI/USDT",  "UNI-USD",  "crypto"),
    ("ATOM/USDT", "ATOM-USD", "crypto"),
    # ── Forex ──────────────────────────────────────────────────────────────────
    ("EUR/USD", "EURUSD=X", "forex"),
    ("GBP/USD", "GBPUSD=X", "forex"),
    ("USD/JPY", "USDJPY=X", "forex"),
    ("USD/CHF", "USDCHF=X", "forex"),
    ("AUD/USD", "AUDUSD=X", "forex"),
    ("USD/CAD", "USDCAD=X", "forex"),
    ("NZD/USD", "NZDUSD=X", "forex"),
    ("EUR/GBP", "EURGBP=X", "forex"),
    ("EUR/JPY", "EURJPY=X", "forex"),
    ("GBP/JPY", "GBPJPY=X", "forex"),
    ("EUR/AUD", "EURAUD=X", "forex"),
    ("EUR/CAD", "EURCAD=X", "forex"),
    ("GBP/AUD", "GBPAUD=X", "forex"),
    ("GBP/CAD", "GBPCAD=X", "forex"),
    ("AUD/JPY", "AUDJPY=X", "forex"),
    ("EUR/CHF", "EURCHF=X", "forex"),
    ("GBP/CHF", "GBPCHF=X", "forex"),
    ("AUD/CAD", "AUDCAD=X", "forex"),
    ("AUD/CHF", "AUDCHF=X", "forex"),
    ("NZD/JPY", "NZDJPY=X", "forex"),
    # ── US Indices ─────────────────────────────────────────────────────────────
    ("US500",      "^GSPC",  "stock"),
    ("US100",      "^NDX",   "stock"),
    ("US30",       "^DJI",   "stock"),
    ("RUSSELL2000","^RUT",   "stock"),
    ("VIX",        "^VIX",   "stock"),
    # ── Commodities ────────────────────────────────────────────────────────────
    ("XAU/USD", "GC=F",  "commodity"),
    ("XAG/USD", "SI=F",  "commodity"),
    ("WTI",     "CL=F",  "commodity"),
    # ── US Stocks ──────────────────────────────────────────────────────────────
    ("AAPL",  "AAPL",  "stock"),
    ("MSFT",  "MSFT",  "stock"),
    ("GOOGL", "GOOGL", "stock"),
    ("AMZN",  "AMZN",  "stock"),
    ("TSLA",  "TSLA",  "stock"),
    ("NVDA",  "NVDA",  "stock"),
    ("META",  "META",  "stock"),
    ("NFLX",  "NFLX",  "stock"),
    ("JPM",   "JPM",   "stock"),
    ("BAC",   "BAC",   "stock"),
    ("GS",    "GS",    "stock"),
    ("AMD",   "AMD",   "stock"),
    ("INTC",  "INTC",  "stock"),
    ("DIS",   "DIS",   "stock"),
    ("BABA",  "BABA",  "stock"),
]

# ── Market hours ───────────────────────────────────────────────────────────────
NY_TZ = pytz.timezone("America/New_York")


def is_forex_open() -> bool:
    """Forex: Mon 00:00 UTC through Fri 22:00 UTC (Sydney-close simplified).
    Closed all Saturday; closed Sunday before ~22:00 UTC."""
    now = datetime.now(pytz.UTC)
    wd = now.weekday()  # 0 = Monday … 6 = Sunday
    if wd == 5:                        # Saturday — always closed
        return False
    if wd == 6 and now.hour < 22:      # Sunday pre-Sydney open
        return False
    return True


def is_us_session_open() -> bool:
    """US stocks & indices: Mon–Fri 09:30–16:00 America/New_York."""
    now_ny = datetime.now(NY_TZ)
    if now_ny.weekday() >= 5:
        return False
    open_t  = now_ny.replace(hour=9,  minute=30, second=0, microsecond=0)
    close_t = now_ny.replace(hour=16, minute=0,  second=0, microsecond=0)
    return open_t <= now_ny <= close_t


def is_active(asset_class: str) -> bool:
    """Gate function: should we fetch this asset class right now?"""
    if asset_class == "crypto":
        return True   # 24/7 market — always active
    if asset_class == "forex":
        return is_forex_open()
    if asset_class in ("stock", "commodity"):
        return is_us_session_open()
    return True


# ── yfinance price fetch ───────────────────────────────────────────────────────

def fetch_yfinance(symbol: str, ticker: str, asset_class: str) -> Optional[dict]:
    t = yf.Ticker(ticker)

    # ── Primary path: fast_info (low-latency, single HTTP call) ──────────────
    try:
        fi    = t.fast_info
        price = fi.last_price
        if price is not None:
            prev  = fi.previous_close or price
            chg   = price - prev
            chg_p = (chg / prev * 100) if prev else 0.0
            return {
                "symbol":        symbol,
                "price":         round(float(price), 8),
                "change":        round(float(chg),   8),
                "changePercent": round(float(chg_p), 4),
                "previousClose": round(float(prev),  8),
                "high":          round(float(fi.day_high or price), 8),
                "low":           round(float(fi.day_low  or price), 8),
                "volume":        float(fi.three_month_average_volume or 0),
                "timestamp":     datetime.now(timezone.utc).isoformat(),
                "source":        "yfinance",
                "assetClass":    asset_class,
            }
    except Exception as exc:
        log.debug(f"fast_info failed [{symbol}]: {exc} — trying history fallback")

    # ── Fallback: recent history bars (always works, slightly slower) ─────────
    try:
        hist = t.history(period="2d", interval="5m")
        if hist.empty:
            hist = t.history(period="5d", interval="1d")
        if hist.empty:
            return None
        price = float(hist["Close"].iloc[-1])
        prev  = float(hist["Close"].iloc[0])
        chg   = price - prev
        chg_p = (chg / prev * 100) if prev else 0.0
        return {
            "symbol":        symbol,
            "price":         round(price, 8),
            "change":        round(chg,   8),
            "changePercent": round(chg_p, 4),
            "previousClose": round(prev,  8),
            "high":          round(float(hist["High"].iloc[-1]),  8),
            "low":           round(float(hist["Low"].iloc[-1]),   8),
            "volume":        float(hist["Volume"].iloc[-1]) if "Volume" in hist.columns else 0,
            "timestamp":     datetime.now(timezone.utc).isoformat(),
            "source":        "yfinance-hist",
            "assetClass":    asset_class,
        }
    except Exception as exc:
        log.warning(f"yfinance [{symbol}] both paths failed: {exc}")
        return None


# ── Rotating scheduler ─────────────────────────────────────────────────────────

def scheduler_loop() -> None:
    """Round-robin through active instruments, one fetch every 6 seconds."""
    idx = 0
    log.info("yfinance scheduler started  (crypto + forex + stocks + commodities, 1 req / 6 s)")
    while True:
        active = [
            item for item in SCHEDULER_INSTRUMENTS
            if is_active(item[2])
        ]

        # active always has at least crypto entries (24/7), so this branch is
        # always taken; the else is a safety net only
        if active:
            sym, yticker, ac = active[idx % len(active)]
            data = fetch_yfinance(sym, yticker, ac)
            if data:
                with cache_lock:
                    cache[sym] = data
                log.info(f"  ↻  {sym:<16s} {data['price']}")
            idx += 1
        else:
            idx = 0

        time.sleep(6)


# ── HTTP cache server ──────────────────────────────────────────────────────────

class CacheHandler(BaseHTTPRequestHandler):

    def do_GET(self) -> None:
        """GET /  →  full cache as JSON (used for health/status checks)."""
        with cache_lock:
            payload = json.dumps(cache).encode()
        self._respond(200, payload)

    def do_POST(self) -> None:
        """POST /
        Body: { "symbols": ["BTC/USDT", ...] }
              or { "symbols": [{ "symbol": "BTC/USDT", "assetClass": "crypto" }, ...] }
        Response: { "BTC/USDT": { price data }, ... }
        Missing symbols return null.
        """
        try:
            length   = int(self.headers.get("Content-Length", 0))
            body     = json.loads(self.rfile.read(length))
            raw_syms = body.get("symbols", [])
            syms = [
                s["symbol"] if isinstance(s, dict) else s
                for s in raw_syms
            ]
            with cache_lock:
                result = {s: cache.get(s) for s in syms}
            self._respond(200, json.dumps(result).encode())
        except Exception as exc:
            self._respond(400, json.dumps({"error": str(exc)}).encode())

    def _respond(self, code: int, payload: bytes) -> None:
        self.send_response(code)
        self.send_header("Content-Type",   "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_) -> None:
        pass   # suppress per-request stdout noise


# ── Entry point ────────────────────────────────────────────────────────────────

DAEMON_PORT = int(os.environ.get("PRICE_DAEMON_PORT", "8765"))

if __name__ == "__main__":
    # 1. yfinance scheduler (crypto + forex + stocks + indices + commodities)
    threading.Thread(
        target=scheduler_loop, daemon=True, name="yf-scheduler"
    ).start()

    # 2. HTTP cache server — blocks and keeps the process alive
    log.info(f"HTTP cache server  →  http://127.0.0.1:{DAEMON_PORT}")
    HTTPServer(("127.0.0.1", DAEMON_PORT), CacheHandler).serve_forever()
