"""
Candle fetcher — TTL cache + in-flight deduplication over any data source.

data_source.py owns which provider is active (cTrader → MT5 → yfinance).
This module owns caching and concurrency: strategies always call
fetch_candles() and two concurrent requests for the same (symbol, tf)
share exactly one network call via the in-flight future registry.
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
    if valid and time.time() - valid[-1].time > to_minutes(tf) * 120:
        log.warning(f"[candle_fetcher] {symbol} {tf}: data is stale")
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
    Public API — cache-first, in-flight deduplicated candle fetch.

    Fast path:   TTL cache hit → return slice, zero network calls.
    Shared path: another coroutine fetching same key → await, read cache.
    Fetch path:  call data_source, cache result, resolve waiting coroutines.
    """
    cached = candle_cache.get(symbol, tf)
    if cached is not None:
        return cached[-count:]

    key = (symbol, tf)
    if key in _in_flight:
        try:
            await _in_flight[key]
        except Exception:
            pass
        return (candle_cache.get(symbol, tf) or [])[-count:]

    loop = asyncio.get_event_loop()
    fut: asyncio.Future = loop.create_future()
    _in_flight[key] = fut
    candles: list[Candle] = []

    try:
        candles = await _do_fetch(symbol, tf, count)
        if candles:
            candle_cache.put(symbol, tf, candles)
        fut.set_result(None)
    except asyncio.TimeoutError:
        log.error(f"[candle_fetcher] {symbol} {tf}: timed out")
        fut.set_result(None)
    except Exception as exc:
        log.error(f"[candle_fetcher] {symbol} {tf}: {exc}")
        fut.set_result(None)
    finally:
        _in_flight.pop(key, None)

    return candles[-count:] if candles else []
