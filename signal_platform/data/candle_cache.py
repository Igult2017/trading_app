"""
Between-tick candle cache.

Problem solved: without this, every 60s scan re-fetches H4 bars that only
close every 4 hours — wasting ~1,440 network calls/day per instrument.

Design:
  - Keyed by (symbol, timeframe)
  - TTL = 80% of the bar duration so we refresh before the next bar closes
  - Fast intraday TFs (M1/M2) use a short 20s TTL so they refetch EVERY scan even during
    the 30s London/NY-overlap cadence — otherwise a 55s+ TTL, being coarser than the sped-up
    scan interval, serves stale M1 (the observed "M1 data is stale" warnings at session open)
  - Thread-safe: written from executor threads, read from the event loop

The cache is module-level so it persists across scan ticks for the
lifetime of the process.
"""

import threading
import time
import logging
from shared.mtf_utils import to_minutes

log = logging.getLogger(__name__)

_store: dict[tuple[str, str], tuple[list, float]] = {}  # (symbol, tf) → (candles, expire_at)
_lock  = threading.Lock()


# Fastest scan cadence is 30s (London/NY overlap). Fast intraday TFs must refetch inside that so
# the cache is never coarser than the scan interval (which is what let M1 go 2-3 min stale).
_FAST_TF_TTL = 20.0   # seconds — for M1/M2


def _ttl_for(tf: str) -> float:
    """Cache duration in seconds. M1/M2 refetch every scan (20s, under the 30s overlap cadence);
    higher TFs use 80% of the bar duration (min 55s) since those bars change slowly."""
    mins = to_minutes(tf)
    if mins <= 2:
        return _FAST_TF_TTL
    return max(55.0, mins * 60 * 0.80)


def get(symbol: str, tf: str) -> list | None:
    """Return cached candles if still fresh, else None."""
    key = (symbol, tf)
    with _lock:
        entry = _store.get(key)
        if entry and time.monotonic() < entry[1]:
            return entry[0]
        if entry:
            del _store[key]   # expired
        return None


def put(symbol: str, tf: str, candles: list) -> None:
    """Store candles with a TTL derived from the timeframe duration."""
    if not candles:
        return
    ttl     = _ttl_for(tf)
    expires = time.monotonic() + ttl
    with _lock:
        _store[(symbol, tf)] = (candles, expires)
    log.debug(f"[candle_cache] cached {symbol} {tf} — {len(candles)} bars, TTL={ttl:.0f}s")


def invalidate(symbol: str | None = None) -> None:
    """Remove entries for a symbol, or clear all if symbol is None."""
    with _lock:
        if symbol is None:
            _store.clear()
        else:
            keys = [k for k in _store if k[0] == symbol]
            for k in keys:
                del _store[k]


def stats() -> dict:
    now = time.monotonic()
    with _lock:
        total   = len(_store)
        fresh   = sum(1 for _, exp in _store.values() if now < exp)
        expired = total - fresh
    return {"fresh": fresh, "expired": expired, "total": total}
