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
