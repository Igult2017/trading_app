"""
Batch candle prefetch for the scan tick.

Two-pass strategy:
  Pass 1 — native TFs fetched concurrently (includes base TFs for non-native pairs)
  Pass 2 — non-native TFs aggregated from their now-cached base TFs

This ensures H2, H6, H8, H12, M3, M10, etc. are built from exact-granularity
base data rather than from the nearest (wrong) yfinance interval.
"""

import asyncio
import logging

from data import candle_cache
from data.candle_fetcher import fetch_candles
from data.candle_aggregator import aggregate
from shared.mtf_utils import to_minutes, is_native_yf, native_base_for

log = logging.getLogger(__name__)


async def prefetch_all(pairs: list[tuple[str, str]], count: int = 100) -> None:
    """
    Prefetch all (symbol, tf) pairs needed for the current scan tick.

    Call this at the START of each tick so strategies always read from cache.
    Already-fresh cache entries are skipped. Non-native TFs are aggregated
    from their base after the native fetch completes.
    """
    unique = set(pairs)

    # Build map: native (symbol, tf) → max bars needed this tick.
    # Non-native pairs contribute their base TF with ratio-scaled count.
    native: dict[tuple[str, str], int] = {}
    for s, tf in unique:
        if candle_cache.get(s, tf) is not None:
            continue
        if is_native_yf(tf):
            k = (s, tf)
            native[k] = max(native.get(k, 0), count)
        else:
            base  = native_base_for(tf)
            ratio = to_minutes(tf) // to_minutes(base)
            k = (s, base)
            native[k] = max(native.get(k, 0), count * ratio + ratio)

    if not native:
        log.debug(f"[prefetch] all {len(pairs)} pairs already cached")
        return

    already = sum(1 for s, tf in unique if candle_cache.get(s, tf) is not None)
    log.info(f"[prefetch] fetching {len(native)} native pairs ({already} cached)")

    # Pass 1: fetch all native TFs concurrently
    await asyncio.gather(
        *[fetch_candles(s, tf, c) for (s, tf), c in native.items()],
        return_exceptions=True,
    )

    # Pass 2: aggregate non-native TFs from their now-cached base TFs
    for s, tf in unique:
        if is_native_yf(tf) or candle_cache.get(s, tf) is not None:
            continue
        base      = native_base_for(tf)
        base_bars = candle_cache.get(s, base) or []
        if base_bars:
            agg = aggregate(base_bars, tf)[-count:]
            if agg:
                candle_cache.put(s, tf, agg)
                log.debug(f"[prefetch] {s} {tf}: {len(agg)} bars aggregated from {base}")
        else:
            # Base TF unavailable (network error): fall back to direct fetch
            log.warning(f"[prefetch] {s} {tf}: base {base} not cached, fetching directly")
            await fetch_candles(s, tf, count)

    log.debug(f"[candle_cache] after prefetch: {candle_cache.stats()}")
