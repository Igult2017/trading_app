"""
Candle fetcher — on-demand fetch with TTL cache and in-flight deduplication.

Data source priority:
  1. cTrader Open API — if .ctrader_token.json exists (run auth_setup.py once)
       Connects directly to Spotware servers. No desktop terminal required.
  2. MetaTrader 5   — fallback when token file is absent.
       Requires MT5 terminal open and logged in on the same machine.

Two concurrent requests for the same (symbol, tf) share one network call
via the in-flight future registry.
"""

import asyncio
import logging
import math
import time
from functools import partial

from core.types import Candle
from data import candle_cache, ctrader_client, ctrader_session, mt5_client
from data.candle_aggregator import aggregate
from shared.mtf_utils import to_minutes, is_native, native_base_for

log = logging.getLogger(__name__)
_FETCH_TIMEOUT = 15   # seconds — MT5 local call should be fast

# In-flight registry: (symbol, tf) → Future.
# Prevents duplicate MT5 calls when strategies run concurrently.
_in_flight: dict[tuple[str, str], asyncio.Future] = {}


def _is_valid_row(o: float, h: float, l: float, c: float) -> bool:
    for v in (o, h, l, c):
        if math.isnan(v) or math.isinf(v) or v <= 0:
            return False
    return h >= max(o, c) and l <= min(o, c)


def _validate(candles: list[Candle], symbol: str, tf: str) -> list[Candle]:
    valid = [c for c in candles if _is_valid_row(c.open, c.high, c.low, c.close)]
    dropped = len(candles) - len(valid)
    if dropped:
        log.warning(f"[candle_fetcher] {symbol} {tf}: dropped {dropped} invalid rows")
    if valid:
        age = time.time() - valid[-1].time
        if age > to_minutes(tf) * 120:   # 2× bar duration
            log.warning(
                f"[candle_fetcher] {symbol} {tf}: last bar is {age/60:.0f}m old"
            )
    return valid


async def _do_fetch(symbol: str, tf: str, count: int) -> list[Candle]:
    """
    Actual fetch — bypasses cache. Non-native TFs recurse through fetch_candles
    so the base TF is cached for other strategies sharing it.
    """
    if not is_native(tf):
        base  = native_base_for(tf)
        ratio = to_minutes(tf) // to_minutes(base)
        base_bars = await fetch_candles(symbol, base, count * ratio + ratio)
        return aggregate(base_bars, tf)[-count:]

    # Strip slash: "EUR/USD" → "EURUSD"
    broker_symbol = symbol.replace("/", "")

    if ctrader_session.is_configured():
        # cTrader: async, no terminal required
        raw = await asyncio.wait_for(
            ctrader_client.fetch_bars(broker_symbol, tf, count),
            timeout=_FETCH_TIMEOUT,
        )
    else:
        # MT5 fallback: sync API, must run in executor
        loop = asyncio.get_event_loop()
        raw = await asyncio.wait_for(
            loop.run_in_executor(None, partial(mt5_client.fetch_bars, broker_symbol, tf, count)),
            timeout=_FETCH_TIMEOUT,
        )
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
    Fetch candles for (symbol, tf) — cache-first, in-flight dedup.

    Fast path:   TTL cache hit → return slice, no network call.
    Shared path: another coroutine is mid-fetch → await its future, read cache.
    Fetch path:  start fetch, register future, cache result, resolve future.
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
        cached = candle_cache.get(symbol, tf)
        return (cached or [])[-count:]

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
        log.error(f"[candle_fetcher] {symbol} {tf}: timed out after {_FETCH_TIMEOUT}s")
        fut.set_result(None)
    except Exception as exc:
        log.error(f"[candle_fetcher] {symbol} {tf}: {exc}")
        fut.set_result(None)
    finally:
        _in_flight.pop(key, None)

    return candles[-count:] if candles else []
