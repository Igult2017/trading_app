#!/usr/bin/env python3
"""
Price Daemon
────────────
Persistent background process that:
  • Streams 5 crypto pairs in real-time via Binance WebSocket (ms latency)
  • Polls forex / indices / commodities / stocks via yfinance (1 req per 6 s)
  • Applies market-hours gate — no requests for closed markets
  • Keeps a single in-memory cache as the source of truth
  • Exposes HTTP on 127.0.0.1:8765 so Node.js can read cache without ever
    triggering an external fetch

price_service.py is left untouched — it continues to serve candle/OHLCV data
via the existing subprocess mechanism.
"""

import asyncio
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
cache: dict[str, dict] = {}
cache_lock = threading.Lock()

# ── Instrument definitions ─────────────────────────────────────────────────────

# Crypto: Binance stream name → our symbol
CRYPTO_WS: dict[str, str] = {
    "BTCUSDT": "BTC/USDT",
    "ETHUSDT": "ETH/USDT",
    "SOLUSDT": "SOL/USDT",
    "XRPUSDT": "XRP/USDT",
    "ADAUSDT": "ADA/USDT",
}

# Non-crypto scheduler: (our symbol, yahoo ticker, asset class)
SCHEDULER_INSTRUMENTS: list[tuple[str, str, str]] = [
    # ── Forex ──────────────────────────────────────────────────────────────────
    ("EUR/USD", "EURUSD=X", "forex"),
    ("GBP/USD", "GBPUSD=X", "forex"),
    ("USD/JPY", "USDJPY=X", "forex"),
    ("USD/CHF", "USDCHF=X", "forex"),
    ("AUD/USD", "AUDUSD=X", "forex"),
    ("USD/CAD", "USDCAD=X", "forex"),
    ("EUR/GBP", "EURGBP=X", "forex"),
    ("EUR/JPY", "EURJPY=X", "forex"),
    # ── US Indices ─────────────────────────────────────────────────────────────
    ("US500",   "^GSPC",    "stock"),
    ("US100",   "^NDX",     "stock"),
    # ── Commodities ────────────────────────────────────────────────────────────
    ("XAU/USD", "GC=F",     "commodity"),
    ("XAG/USD", "SI=F",     "commodity"),
    ("WTI",     "CL=F",     "commodity"),
    # ── US Stocks ──────────────────────────────────────────────────────────────
    ("GOOGL",   "GOOGL",    "stock"),
    ("TSLA",    "TSLA",     "stock"),
    ("AAPL",    "AAPL",     "stock"),
    ("MSFT",    "MSFT",     "stock"),
    ("NVDA",    "NVDA",     "stock"),
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
    if asset_class == "forex":
        return is_forex_open()
    if asset_class in ("stock", "commodity"):
        return is_us_session_open()
    return True  # crypto handled by WS


# ── yfinance price fetch ───────────────────────────────────────────────────────

def fetch_yfinance(symbol: str, ticker: str, asset_class: str) -> Optional[dict]:
    try:
        fi    = yf.Ticker(ticker).fast_info
        price = fi.last_price
        if price is None:
            return None
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
        log.warning(f"yfinance  [{symbol}]  {exc}")
        return None


# ── Rotating scheduler ─────────────────────────────────────────────────────────

def scheduler_loop() -> None:
    """Round-robin through active instruments, one fetch every 6 seconds."""
    idx = 0
    log.info("yfinance scheduler started  (1 request / 6 s)")
    while True:
        active = [
            item for item in SCHEDULER_INSTRUMENTS
            if is_active(item[2])
        ]

        if active:
            sym, yticker, ac = active[idx % len(active)]
            data = fetch_yfinance(sym, yticker, ac)
            if data:
                with cache_lock:
                    cache[sym] = data
                log.info(f"  ↻  {sym:<16s} {data['price']}")
            idx += 1
        else:
            log.info("All non-crypto markets closed — scheduler idle")
            idx = 0

        time.sleep(6)


# ── Binance WebSocket ──────────────────────────────────────────────────────────

async def _binance_stream() -> None:
    try:
        import websockets  # type: ignore
    except ImportError:
        log.error("'websockets' package missing — crypto streaming disabled. "
                  "Run:  pip install websockets")
        return

    streams = "/".join(f"{k.lower()}@ticker" for k in CRYPTO_WS)
    url     = f"wss://stream.binance.com:9443/stream?streams={streams}"
    log.info("Connecting to Binance WebSocket …")

    while True:
        try:
            async with websockets.connect(
                url, ping_interval=20, open_timeout=15
            ) as ws:
                log.info("Binance WebSocket connected — streaming 5 pairs")
                async for raw in ws:
                    msg  = json.loads(raw)
                    d    = msg.get("data", {})
                    bsym = d.get("s", "")
                    pair = CRYPTO_WS.get(bsym)
                    if not pair:
                        continue
                    price    = float(d.get("c") or 0)
                    chg      = float(d.get("p") or 0)
                    chg_p    = float(d.get("P") or 0)
                    with cache_lock:
                        cache[pair] = {
                            "symbol":        pair,
                            "price":         price,
                            "change":        round(chg,   8),
                            "changePercent": round(chg_p, 4),
                            "previousClose": round(price - chg, 8),
                            "high":          float(d.get("h") or 0),
                            "low":           float(d.get("l") or 0),
                            "volume":        float(d.get("v") or 0),
                            "timestamp":     datetime.now(timezone.utc).isoformat(),
                            "source":        "binance_ws",
                            "assetClass":    "crypto",
                        }
        except Exception as exc:
            log.error(f"Binance WS error: {exc}  — reconnecting in 5 s")
            await asyncio.sleep(5)


def run_binance_thread() -> None:
    asyncio.run(_binance_stream())


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
    # 1. yfinance scheduler
    threading.Thread(
        target=scheduler_loop, daemon=True, name="yf-scheduler"
    ).start()

    # 2. Binance WebSocket (runs its own asyncio event loop)
    threading.Thread(
        target=run_binance_thread, daemon=True, name="binance-ws"
    ).start()

    # 3. HTTP cache server — blocks and keeps the process alive
    log.info(f"HTTP cache server  →  http://127.0.0.1:{DAEMON_PORT}")
    HTTPServer(("127.0.0.1", DAEMON_PORT), CacheHandler).serve_forever()
