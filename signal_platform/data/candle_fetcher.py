"""
Candle fetcher — TTL cache + in-flight deduplication over any data source.

data_source.py owns which provider is active (cTrader → MT5 → yfinance).
This module owns caching and concurrency: strategies always call
fetch_candles() and two concurrent requests for the same (symbol, tf)
share exactly one network call via the in-flight future registry.

The cache is count-aware: a cached series only satisfies a request when it
holds at least as many bars as asked for. A small request (e.g. the monitor's
M1 count=1) can therefore never starve a later large request (a strategy's
M1 count=250) — the large request re-fetches instead of slicing 1 bar.
"""

import asyncio
import logging
import math
import time

from core.types import Candle
from data import candle_cache
from data.candle_aggregator import aggregate
from data.data_source import fetch_raw
from shared.mtf_utils import to_minutes, is_native, native_base_for

log = logging.getLogger(__name__)

_in_flight: dict[tuple[str, str], asyncio.Future] = {}


def _is_valid_row(o: float, h: float, l: float, c: float) -> bool:
    for v in (o, h, l, c):
        if math.isnan(v) or math.isinf(v) or v <= 0:
            return False
    return h >= max(o, c) and l <= min(o, c)


def _validate(candles: list[Candle], symbol: str, tf: str) -> list[Candle]:
    valid = [c for c in candles if _is_valid_row(c.open, c.high, c.low, c.close)]
    if len(valid) < len(candles):
        log.warning(f"[candle_fetcher] {symbol} {tf}: dropped {len(candles)-len(valid)} invalid rows")
    if not valid:
        return []
    age      = time.time() - valid[-1].time
    bar_secs = to_minutes(tf) * 60
    # Fail-safe: an egregiously old last bar means a feed gap / outage. Returning
    # it would let strategies trade on stale prices, so drop the whole series —
    # downstream length guards then reject the tick. Floor at 15m so a single
    # slightly-late bar on fast TFs is not nuked.
    if age > max(5 * bar_secs, 900):
        log.error(f"[candle_fetcher] {symbol} {tf}: last bar {age/60:.0f}m old — dropping (stale fail-safe)")
        return []
    if age > 2 * bar_secs:
        log.warning(f"[candle_fetcher] {symbol} {tf}: data is stale ({age/60:.0f}m old)")
    return valid


async def _do_fetch(symbol: str, tf: str, count: int) -> list[Candle]:
    # Non-native TF: recurse through fetch_candles so the base enters cache
    if not is_native(tf):
        base  = native_base_for(tf)
        ratio = to_minutes(tf) // to_minutes(base)
        base_bars = await fetch_candles(symbol, base, count * ratio + ratio)
        return aggregate(base_bars, tf)[-count:]

    raw = await fetch_raw(symbol, tf, count)
    if not raw:
        return []
    candles = [
        Candle(time=int(b["time"]), open=b["open"], high=b["high"],
               low=b["low"], close=b["close"], volume=b["volume"], timeframe=tf)
        for b in raw
    ]
    return _validate(candles, symbol, tf)


async def fetch_candles(symbol: str, tf: str, count: int = 100) -> list[Candle]:
    """
    Public API — count-aware, cache-first, in-flight deduplicated candle fetch.

    Fast path:   cache holds >= count bars → return slice, zero network calls.
    Shared path: another coroutine fetching same key → await it, then re-check.
    Fetch path:  call data_source, cache result, resolve waiting coroutines.

    A cached series with fewer than `count` bars does NOT satisfy the request —
    the caller (re)fetches so an earlier small fetch can never short-change a
    later larger one.
    """
    key = (symbol, tf)

    while True:
        cached = candle_cache.get(symbol, tf)
        if cached is not None and len(cached) >= count:
            return cached[-count:]

        inflight = _in_flight.get(key)
        if inflight is not None:
            # Someone else is already fetching this key — wait, then loop and
            # re-evaluate (their result may satisfy us, or we fetch ourselves).
            try:
                await inflight
            except Exception:
                pass
            continue

        # We own the fetch for this key.
        loop = asyncio.get_running_loop()
        fut: asyncio.Future = loop.create_future()
        _in_flight[key] = fut
        candles: list[Candle] = []
        try:
            candles = await _do_fetch(symbol, tf, count)
            if candles:
                candle_cache.put(symbol, tf, candles)
        except asyncio.TimeoutError:
            log.error(f"[candle_fetcher] {symbol} {tf}: timed out — treated as empty")
        except Exception as exc:
            log.error(f"[candle_fetcher] {symbol} {tf}: {exc} — treated as empty")
        finally:
            fut.set_result(None)
            _in_flight.pop(key, None)

        # The owner always returns its own result — never loops — so a data
        # source that returns fewer bars than `count` cannot spin forever.
        return candles[-count:] if candles else []
