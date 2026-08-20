"""
Between-tick candle cache.

Problem solved: without this, every 60s scan re-fetches H4 bars that only
close every 4 hours — wasting ~1,440 network calls/day per instrument.

Design:
  - Keyed by (symbol, timeframe)
  - TTL never spans a bar close, and drops to ~1 minute through the last 6 minutes of a bar, so a
    closed bar is seen on the next tick and the FORMING bar is current when something reads it.
    (Until 2026-08-20 this was a flat 80% of the bar duration — 48 minutes on H1 — which is correct
    for closed bars and wrong for both of the above. See `_ttl_for`.)
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

# THE LAST STRETCH OF A BAR, where the forming bar has to be CURRENT rather than merely recent.
# 6 minutes covers `vix1_preclose.LEAD_S` (5 min) with a minute of margin, so the copy is already
# being refreshed before anything starts reading the forming bar to decide something.
_FINAL_STRETCH_S = 6 * 60
# How fresh to keep it inside that stretch. 55s is the platform's existing minimum cache duration
# for non-fast timeframes — reused rather than inventing a new number.
_FINAL_STRETCH_TTL = 55.0


def _ttl_for(tf: str, now: float | None = None) -> float:
    """Cache duration in seconds — never across a bar close, and kept current near one.

    WHAT WAS WRONG (fixed 2026-08-20). This returned a flat `max(55, duration * 0.80)`, which for H1
    is 2,880s — FORTY-EIGHT MINUTES. The docstring's reasoning ("80% of the bar duration so we
    refresh before the next bar closes") holds only for reading bars that have ALREADY CLOSED: a
    finished bar never changes, so a stale copy of it is as good as a fresh one. Two things it does
    not cover:

      * THE BAR STILL FORMING. Its high, low and close move continuously. A 48-minute-old copy of a
        60-minute bar is that bar as it looked when it was a third grown.
      * WHETHER A NEW BAR HAS CLOSED AT ALL. A candle closing at 15:00 was not necessarily seen at
        15:00 — it was seen whenever the copy next happened to expire, anywhere from seconds to 48
        minutes later. The 48-minute refresh cycle drifts against the 60-minute bar cycle, so the
        same signal was sometimes instant and sometimes very late, which is exactly the intermittent
        lateness that was reported twice and that a single fast measurement wrongly cleared.

    THE TWO RULES NOW:
      1. **Never hold a copy across a bar close.** The copy expires when the bar does, so a closed
         bar is picked up on the very next tick, every time.
      2. **Refresh once a minute through the final stretch**, so anything reading the forming bar is
         reading it as it actually stands.

    Rule 1 alone would fix the lateness and leave the forming bar stale for most of the hour; rule 2
    alone would not stop a closed bar going unseen. Both are needed.

    THE RESULT IS ALWAYS <= THE OLD VALUE, which is the safety argument for changing something the
    whole platform's data path runs through: this can only ever make candles fresher, never staler.
    Cost is ~7 extra fetches per hour per instrument on H1, against the ~1,440/day this cache exists
    to prevent — the saving it was built for is untouched.

    BAR ALIGNMENT is assumed to be epoch-aligned (H1 on the hour, H4 at 00/04/08... UTC), which is
    what the feed serves. If a timeframe were aligned differently the boundary would be computed
    wrong — and it would still be safe, because the `min` with the old value bounds it.
    """
    mins = to_minutes(tf)
    if mins <= 2:
        return _FAST_TF_TTL
    base   = max(55.0, mins * 60 * 0.80)         # the old value — now a ceiling, never the answer
    period = mins * 60
    now    = time.time() if now is None else now
    to_close = period - (now % period)           # seconds until this bar finishes
    if to_close > _FINAL_STRETCH_S:
        # Expire when the final stretch BEGINS, not at the bar close — otherwise a copy taken at
        # 15:48 would be served right through the 15:54-16:00 window it is supposed to keep fresh.
        return min(base, to_close - _FINAL_STRETCH_S)
    return min(_FINAL_STRETCH_TTL, to_close)


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


def stats() -> dict:
    now = time.monotonic()
    with _lock:
        total   = len(_store)
        fresh   = sum(1 for _, exp in _store.values() if now < exp)
        expired = total - fresh
    return {"fresh": fresh, "expired": expired, "total": total}
