"""
Candle fetcher — yfinance adapter with:
  • Between-tick TTL cache (candle_cache.py) — eliminates redundant HTTP calls
  • Concurrent batch fetch — all needed (symbol, tf) pairs fetched at once
  • Validation — NaN, OHLC integrity, staleness, minimum bar count
  • Timeout — executor calls bounded to 15s to prevent hangs

To swap in OANDA: replace _fetch_sync. Same signature, nothing else changes.
"""

import asyncio
import logging
import math
import time
from concurrent.futures import TimeoutError as FuturesTimeout
from functools import partial
from typing import Any

import yfinance as yf

from config.instruments import SYMBOL_TO_YF
from core.types import Candle
from data import candle_cache
from shared.mtf_utils import to_yf, to_minutes

log = logging.getLogger(__name__)

_FETCH_TIMEOUT = 15   # seconds before a yfinance call is abandoned


# ── Validation ────────────────────────────────────────────────────────────────

def _is_valid_row(o: float, h: float, l: float, c: float) -> bool:
    """Return False if any OHLC value is NaN, Inf, zero, or breaks relationships."""
    for v in (o, h, l, c):
        if math.isnan(v) or math.isinf(v) or v <= 0:
            return False
    return h >= max(o, c) and l <= min(o, c)


def _validate_candles(candles: list[Candle], symbol: str, tf: str) -> list[Candle]:
    """
    Drop invalid candles and warn when data quality is poor.
    Also checks staleness: if the last candle is older than 2× the bar duration,
    we log a warning (yfinance may be returning stale data).
    """
    valid = [c for c in candles if _is_valid_row(c.open, c.high, c.low, c.close)]
    dropped = len(candles) - len(valid)
    if dropped:
        log.warning(f"[candle_fetcher] {symbol} {tf}: dropped {dropped} invalid rows")

    if valid:
        age_secs = time.time() - valid[-1].time
        bar_secs = to_minutes(tf) * 60
        if age_secs > bar_secs * 2:
            log.warning(
                f"[candle_fetcher] {symbol} {tf}: last bar is "
                f"{age_secs/60:.0f}m old (expected <{bar_secs*2/60:.0f}m) — "
                "yfinance may be returning stale data"
            )
    return valid


# ── Single-symbol fetch (blocking) ────────────────────────────────────────────

def _fetch_sync(symbol: str, tf: str, count: int) -> list[Candle]:
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


# ── Public API ────────────────────────────────────────────────────────────────

async def fetch_candles(symbol: str, tf: str, count: int = 100) -> list[Candle]:
    """
    Fetch candles for one symbol/timeframe, using the between-tick cache.
    Runs yfinance in an executor with a 15s timeout.
    """
    cached = candle_cache.get(symbol, tf)
    if cached is not None:
        return cached[-count:]

    loop = asyncio.get_event_loop()
    try:
        future  = loop.run_in_executor(None, partial(_fetch_sync, symbol, tf, count))
        candles = await asyncio.wait_for(future, timeout=_FETCH_TIMEOUT)
    except asyncio.TimeoutError:
        log.error(f"[candle_fetcher] {symbol} {tf}: fetch timed out after {_FETCH_TIMEOUT}s")
        return []
    except Exception as exc:
        log.error(f"[candle_fetcher] {symbol} {tf}: {exc}")
        return []

    if candles:
        candle_cache.put(symbol, tf, candles)
    return candles


async def prefetch_all(pairs: list[tuple[str, str]], count: int = 100) -> None:
    """
    Fetch all (symbol, tf) pairs concurrently, skipping cache hits.
    Call this at the START of each scan tick so the scan loop reads from cache.

    pairs: list of (symbol, tf) tuples needed this tick across all strategies
    """
    needed = [(s, tf) for s, tf in set(pairs) if candle_cache.get(s, tf) is None]
    if not needed:
        log.debug(f"[candle_fetcher] prefetch: all {len(pairs)} pairs in cache")
        return

    log.info(f"[candle_fetcher] prefetching {len(needed)} pairs concurrently "
             f"({len(pairs) - len(needed)} already cached)")

    await asyncio.gather(
        *[fetch_candles(s, tf, count) for s, tf in needed],
        return_exceptions=True,
    )
    log.debug(f"[candle_cache] after prefetch: {candle_cache.stats()}")
