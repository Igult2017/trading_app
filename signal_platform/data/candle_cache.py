"""
Between-tick candle cache.

Problem solved: without this, every 60s scan re-fetches H4 bars that only
close every 4 hours — wasting ~1,440 yfinance calls/day per instrument.

Design:
  - Keyed by (symbol, timeframe)
  - TTL = 80% of the bar duration so we refresh before the next bar closes
  - For sub-hour TFs (M1–M30) TTL is the bar duration itself — they change fast
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


def _ttl_for(tf: str) -> float:
    """Cache duration in seconds — 80% of bar duration, min 55s."""
    mins = to_minutes(tf)
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
        fresh   = sum(1 for _, exp in _store.values() if now < exp)
        expired = len(_store) - fresh
    return {"fresh": fresh, "expired": expired, "total": len(_store)}
