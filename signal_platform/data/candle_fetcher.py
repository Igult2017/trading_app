"""
Candle fetcher — yfinance adapter with cache, validation, and timeout.

Non-native TFs (H2, H3, H6, H8, H12, M3, M10, …) are handled transparently:
_fetch_sync detects them, fetches the native base TF, and aggregates up.

To swap the broker: replace _fetch_sync. Same signature, nothing else changes.
Batch prefetch lives in data/candle_prefetch.py.
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
    Fetch candles for one symbol/timeframe, using the between-tick cache.
    Handles native and non-native TFs transparently via _fetch_sync.
    """
    cached = candle_cache.get(symbol, tf)
    if cached is not None:
        return cached[-count:]

    loop = asyncio.get_event_loop()
    try:
        future  = loop.run_in_executor(None, partial(_fetch_sync, symbol, tf, count))
        candles = await asyncio.wait_for(future, timeout=_FETCH_TIMEOUT)
    except asyncio.TimeoutError:
        log.error(f"[candle_fetcher] {symbol} {tf}: timed out after {_FETCH_TIMEOUT}s")
        return []
    except Exception as exc:
        log.error(f"[candle_fetcher] {symbol} {tf}: {exc}")
        return []

    if candles:
        candle_cache.put(symbol, tf, candles)
    return candles
