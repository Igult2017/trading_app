"""PIX — BITCOIN'S REAL BUYING AND SELLING, per 5M / 1M candle, from Binance (18 Nov 2026).

Binance reports, on every candle, how much traded against resting sell orders — aggressive BUYING (`taker buy base
volume`, field 9 of a kline). Selling is the rest of the volume. That is the exchange's own record, not a guess, and it
needs no account or key. The idea comes from the audited Tworasos/tape-and-book (`binance_hist.py`), REWRITTEN to fix
what did not fit us: volumes kept as decimals (it cast them to whole numbers, so 0.003 BTC became 0), the still-forming
candle DROPPED (Binance returns it last), no numpy, a fallback source, and a hard time limit so a slow exchange can never
hold up the scan.

SOURCES, IN ORDER: Binance futures (`fapi`, the deepest Bitcoin market), then Binance's public spot mirror
(`data-api.binance.vision`, which regions that block the main API still reach). One fetch = one source, so the CVD
never mixes the two. Candles are matched to the broker's BY OPEN TIME (both open on the same UTC minute grid) — only
the volumes are used, never Binance's prices.
"""
from __future__ import annotations

import logging
import time

import httpx

from strategies.pix_footprint import merge

log = logging.getLogger(__name__)

SOURCES = [("Binance futures", "https://fapi.binance.com/fapi/v1/klines"),
           ("Binance spot", "https://data-api.binance.vision/api/v3/klines")]
SYMBOL = "BTCUSDT"
TIMEOUT_S = 5.0
CACHE_S = 20.0
_INTERVAL = {"M1": ("1m", 60), "M5": ("5m", 300)}
_cache: dict[str, tuple[float, str, dict[int, tuple[float, float]]]] = {}


def parse(rows: list, period_s: int, now: float) -> dict[int, tuple[float, float]]:
    """Kline rows → {open time (s): (bought, sold)} for CLOSED candles only."""
    out: dict[int, tuple[float, float]] = {}
    for r in rows:
        t = int(r[0]) // 1000
        if t + period_s > now:
            continue                                   # still forming — its volumes are still growing
        vol, buy = float(r[5]), float(r[9])
        out[t] = (buy, max(vol - buy, 0.0))
    return out


async def flows(tf: str, count: int = 60, client: httpx.AsyncClient | None = None,
                now: float | None = None) -> tuple[str, dict[int, tuple[float, float]]]:
    """(source name, flows) for the last `count` closed candles of `tf` ("M1" / "M5"). Never raises: ("", {}) on failure."""
    if tf not in _INTERVAL:
        return "", {}
    now = time.time() if now is None else now
    hit = _cache.get(tf)
    if hit and now - hit[0] < CACHE_S:
        return hit[1], hit[2]
    interval, period = _INTERVAL[tf]
    own = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT_S)
    try:
        for name, url in SOURCES:
            try:
                r = await client.get(url, params={"symbol": SYMBOL, "interval": interval, "limit": count + 1})
                if r.status_code != 200:
                    log.warning(f"[pix] {name} answered {r.status_code} for {interval} — trying the next source")
                    continue
                got = parse(r.json(), period, now)
                if got:
                    _cache[tf] = (now, name, got)
                    return name, got
            except Exception as exc:                    # network, timeout, bad JSON — next source
                log.warning(f"[pix] {name} {interval} failed: {type(exc).__name__}: {exc}")
        return "", {}
    finally:
        if own:
            await client.aclose()


# ── THE FOOTPRINT: Bitcoin's individual trades, per price ─────────────────────────────────────────────────────────────
# Binance's aggregated trades carry price, size and `m` ("the buyer was the resting order") — so `m` false = an
# aggressive BUY. Kept per CLOSED MINUTE as {price: (bought, sold)}; a 5M footprint is its five minutes merged. Fetched a
# few minutes per scan (`TRADE_MINUTES_PER_CALL`) and kept for `KEEP_MIN`, so after a restart it fills in within ~15
# scans. A minute that needed more than `MAX_PAGES` pages is NOT kept (a part-minute would understate one side).
TRADE_SOURCES = [("Binance futures", "https://fapi.binance.com/fapi/v1/aggTrades"),
                 ("Binance spot", "https://data-api.binance.vision/api/v3/aggTrades")]
TRADE_MINUTES_PER_CALL = 6
KEEP_MIN = 90
MAX_PAGES = 15
_minutes: dict[int, dict[float, tuple[float, float]]] = {}


def parse_trades(rows: list, start: int, end: int) -> dict[float, tuple[float, float]]:
    out: dict[float, list[float]] = {}
    for r in rows:
        t = int(r["T"]) // 1000
        if not start <= t <= end:
            continue
        p, q = float(r["p"]), float(r["q"])
        cell = out.setdefault(p, [0.0, 0.0])
        cell[1 if r["m"] else 0] += q
    return {p: (v[0], v[1]) for p, v in out.items()}


async def _minute(client, m: int) -> dict[float, tuple[float, float]] | None:
    for name, url in TRADE_SOURCES:
        try:
            rows, params = [], {"symbol": SYMBOL, "startTime": m * 1000, "endTime": m * 1000 + 59_999, "limit": 1000}
            for _ in range(MAX_PAGES):
                r = await client.get(url, params=params)
                if r.status_code != 200:
                    raise RuntimeError(f"answered {r.status_code}")
                page = r.json()
                rows += page
                if len(page) < 1000 or int(page[-1]["T"]) > m * 1000 + 59_999:
                    return parse_trades(rows, m, m + 59)
                params = {"symbol": SYMBOL, "fromId": int(page[-1]["a"]) + 1, "limit": 1000}
            log.warning(f"[pix] {name} minute {m}: over {MAX_PAGES} pages — not kept")
            return None
        except Exception as exc:
            log.warning(f"[pix] {name} trades for minute {m} failed: {type(exc).__name__}: {exc}")
    return None


async def refresh_prints(client: httpx.AsyncClient | None = None, now: float | None = None) -> None:
    """Fetch the newest closed minutes not yet kept (up to `TRADE_MINUTES_PER_CALL`), drop the old. Never raises."""
    now = time.time() if now is None else now
    last_closed = int(now) // 60 * 60 - 60
    want = [m for m in range(last_closed - 60 * (KEEP_MIN - 1), last_closed + 1, 60) if m not in _minutes]
    own = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT_S)
    try:
        for m in sorted(want, reverse=True)[:TRADE_MINUTES_PER_CALL]:     # newest first: the tap is recent
            got = await _minute(client, m)
            if got is not None:
                _minutes[m] = got
    except Exception as exc:
        log.warning(f"[pix] trade refresh failed: {type(exc).__name__}: {exc}")
    finally:
        if own:
            await client.aclose()
    for m in [k for k in _minutes if k < last_closed - 60 * KEEP_MIN]:
        del _minutes[m]


def prints(tf: str) -> dict[int, dict[float, tuple[float, float]]]:
    """{candle open time: {price: (bought, sold)}} for the CLOSED M1 / M5 candles kept so far."""
    if tf == "M1":
        return dict(_minutes)
    if tf == "M5":
        out = {}
        for s5 in {m // 300 * 300 for m in _minutes}:
            parts = [_minutes.get(s5 + 60 * k) for k in range(5)]
            if all(p is not None for p in parts):
                out[s5] = merge(parts)
        return out
    return {}
