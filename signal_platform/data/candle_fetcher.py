"""
Candle fetcher — yfinance adapter with cache, in-flight dedup, and timeout.

Non-native TFs (H2, H3, H6, H8, H12, M3, M10, …) are handled transparently:
_fetch_sync detects them, fetches the native base TF, and aggregates up.

In-flight deduplication: when two strategies concurrently need the same
(symbol, tf) and the cache is cold, only ONE yfinance call fires. The second
coroutine awaits the first's future then reads from cache — zero wasted
network calls even under full concurrency.

To swap the broker: replace _fetch_sync. Same signature, nothing else changes.
"""

import asyncio
import logging
import math
import time
from functools import partial

import yfinance as yf

from config.instruments import SYMBOL_TO_YF
from core.types import Candle
from data import candle_cache
from data.candle_aggregator import aggregate
from shared.mtf_utils import to_yf, to_minutes, is_native_yf, native_base_for

log = logging.getLogger(__name__)
_FETCH_TIMEOUT = 15   # seconds before a yfinance call is abandoned

# In-flight registry: (symbol, tf) → asyncio.Future for the pending fetch.
# When two coroutines need the same pair simultaneously, the second awaits the
# first's future instead of spawning a duplicate yfinance call. After the fetch
# completes the future is resolved and removed so the next tick fetches fresh.
_in_flight: dict[tuple[str, str], asyncio.Future] = {}


def _is_valid_row(o: float, h: float, l: float, c: float) -> bool:
    """Return False if any OHLC value is NaN, Inf, zero, or breaks relationships."""
    for v in (o, h, l, c):
        if math.isnan(v) or math.isinf(v) or v <= 0:
            return False
    return h >= max(o, c) and l <= min(o, c)


def _validate_candles(candles: list[Candle], symbol: str, tf: str) -> list[Candle]:
    valid = [c for c in candles if _is_valid_row(c.open, c.high, c.low, c.close)]
    dropped = len(candles) - len(valid)
    if dropped:
        log.warning(f"[candle_fetcher] {symbol} {tf}: dropped {dropped} invalid rows")
    if valid:
        age_secs = time.time() - valid[-1].time
        bar_secs = to_minutes(tf) * 60
        if age_secs > bar_secs * 2:
            log.warning(f"[candle_fetcher] {symbol} {tf}: last bar is "
                        f"{age_secs/60:.0f}m old — possible stale data")
    return valid


def _fetch_sync(symbol: str, tf: str, count: int) -> list[Candle]:
    # Non-native TF: fetch the native base TF then aggregate up to target.
    # Recursion terminates in one step — base is always native.
    if not is_native_yf(tf):
        base  = native_base_for(tf)
        ratio = to_minutes(tf) // to_minutes(base)
        return aggregate(_fetch_sync(symbol, base, count * ratio + ratio), tf)[-count:]

    yf_ticker = SYMBOL_TO_YF.get(symbol)
    if not yf_ticker:
        raise ValueError(f"Unknown symbol '{symbol}' — add it to instruments.py")

    interval, period = to_yf(tf)
    hist = yf.Ticker(yf_ticker).history(period=period, interval=interval)

    if hist.empty:
        log.warning(f"[candle_fetcher] {symbol} {tf}: yfinance returned empty")
        return []

    hist = hist.tail(count)
    candles: list[Candle] = []
    for ts, row in hist.iterrows():
        try:
            o = float(row["Open"])
            h = float(row["High"])
            l = float(row["Low"])
            c = float(row["Close"])
            v = float(row.get("Volume") or 0)
            candles.append(Candle(
                time=int(ts.timestamp()),
                open=round(o, 6), high=round(h, 6),
                low=round(l, 6),  close=round(c, 6),
                volume=v, timeframe=tf,
            ))
        except Exception as exc:
            log.debug(f"[candle_fetcher] {symbol} {tf}: skipped row — {exc}")

    return _validate_candles(candles, symbol, tf)


async def fetch_candles(symbol: str, tf: str, count: int = 100) -> list[Candle]:
    """
    Fetch candles for one (symbol, tf) pair — cache-first, in-flight dedup.

    Fast path: TTL cache hit → return slice, no I/O.
    Shared path: another coroutine is already fetching this pair → await its
      future, then read from cache. ONE network call regardless of how many
      strategies concurrently request the same pair.
    Fetch path: this coroutine starts the fetch, registers a future so others
      can wait, stores the result in cache, resolves the future, and removes it.
    """
    # Fast path: cache hit
    cached = candle_cache.get(symbol, tf)
    if cached is not None:
        return cached[-count:]

    key = (symbol, tf)

    # Shared path: await a fetch that another coroutine already started.
    # No yield between the dict check and fut capture — asyncio guarantees
    # no other coroutine runs between these two lines.
    if key in _in_flight:
        try:
            await _in_flight[key]
        except Exception:
            pass  # fetch failed — try cache anyway (may have partial results)
        cached = candle_cache.get(symbol, tf)
        return (cached or [])[-count:]

    # Fetch path: this coroutine wins the race, registers the future first.
    loop = asyncio.get_event_loop()
    fut: asyncio.Future = loop.create_future()
    _in_flight[key] = fut
    candles: list[Candle] = []

    try:
        raw     = loop.run_in_executor(None, partial(_fetch_sync, symbol, tf, count))
        candles = await asyncio.wait_for(raw, timeout=_FETCH_TIMEOUT)
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
