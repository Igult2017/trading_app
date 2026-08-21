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
  - WHERE THE BAR CLOSE IS, is read from the newest bar's own timestamp, never assumed. See
    `_phase`. (Until 2026-08-21 it was assumed, and the assumption was wrong on H4.)
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

# THE LAST STRETCH OF A BAR, kept refreshed to the minute. Originally so the FORMING bar would be
# current — 6 minutes covers `vix1_preclose.LEAD_S` (5 min) with a minute of margin.
#
# THAT REASON TURNS OUT NOT TO APPLY, and the stretch is kept for a different one. Measured against
# the live broker 2026-08-21: `ProtoOAGetTrendbarsReq` serves CLOSED bars ONLY — 14 polls across 3
# minute boundaries never once returned the minute in progress — so there is no forming bar in this
# feed for anything to read. What the stretch actually buys is the OPPOSITE end: a bar is published
# 10-70s AFTER it closes, and refreshing every 55s through the boundary is what picks the new one up
# promptly instead of at the next multi-hour expiry. Same 6 minutes, real justification.
_FINAL_STRETCH_S = 6 * 60
# How fresh to keep it inside that stretch. 55s is the platform's existing minimum cache duration
# for non-fast timeframes — reused rather than inventing a new number.
_FINAL_STRETCH_TTL = 55.0


# WHICH (symbol, tf) GRIDS HAVE BEEN ANNOUNCED, so the alignment notice is logged once each rather
# than on every fetch. A grid that is not the assumed one is exactly the fact that was invisible for
# a day, so it is stated out loud once instead of being silently handled.
_grid_logged: set[tuple[str, str]] = set()


def _phase(period: int, now: float, last_open: float | None) -> float:
    """WHERE THIS TIMEFRAME'S BARS SIT ON THE CLOCK, read from a real bar instead of assumed.

    WHAT WAS WRONG (found 2026-08-21, shipped 2026-08-20). `_ttl_for` computed the next bar close as
    `period - (now % period)`, which is only true when bars start at midnight UTC and step from
    there. The broker's H4 bars open at 01:00 / 05:00 / 09:00 / 13:00 / 17:00 / 21:00 UTC — one hour
    off that grid. So a copy taken at 08:05 was given a TTL running to 11:17, straight through the
    real 09:00 close: **the "never hold a copy across a bar close" guarantee did not hold on H4**,
    which is the timeframe BX-S/D's entire zone book is built on. It went unnoticed because the
    computed boundary is always a valid instant, just the wrong one, and because a redeploy empties
    the cache and hides it for the next few hours.

    THE FIX IS TO STOP CALCULATING IT. Bars are stamped at their OPEN, so any real bar's timestamp
    reveals the grid: every bar on this timeframe opens at `last_open % period` past each period
    boundary. `put` always has the bars in its hand, so this costs nothing and cannot drift.

    A GRID, NOT A COUNTDOWN — deliberately. `last_open + period` would also give the next close, but
    only while the newest bar really is the forming one. Over a weekend, a feed gap or a stale copy
    the newest bar is long closed and that sum is in the past; the phase survives all three, because
    a gap moves which bars exist, never where they sit.

    Returns 0.0 (the old assumed grid) when there is no usable bar time. The bounds check also
    rejects a millisecond timestamp, so a units change in the feed degrades to the old behaviour
    rather than poisoning every TTL on the platform.
    """
    if last_open is None or not (0 < last_open <= now + period):
        return 0.0
    return last_open % period


def _to_close(period: int, now: float, last_open: float | None) -> float:
    """Seconds until the next bar close on THIS timeframe's real grid."""
    return (_phase(period, now, last_open) - now) % period or float(period)


def _ttl_for(tf: str, now: float | None = None, last_open: float | None = None) -> float:
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

    BAR ALIGNMENT IS READ, NOT ASSUMED — `last_open` is the newest bar's timestamp and `_phase`
    derives the real grid from it. Without one this falls back to the epoch grid, which is what this
    function assumed outright until 2026-08-21 and got wrong on H4. Both rules above are only as good
    as the boundary they are measured from.
    """
    mins = to_minutes(tf)
    if mins <= 2:
        return _FAST_TF_TTL
    base   = max(55.0, mins * 60 * 0.80)         # the old value — now a ceiling, never the answer
    period = mins * 60
    now    = time.time() if now is None else now
    to_close = _to_close(period, now, last_open)  # seconds until this bar finishes, on its own grid
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


def _note_grid(symbol: str, tf: str, last_open: float | None) -> None:
    """Say once, out loud, where this instrument's bars actually close.

    The wrong grid was handled silently for a day because a wrong boundary looks exactly like a right
    one from the outside. One line per (symbol, tf) — at most a dozen at boot — makes it checkable.
    """
    if last_open is None or (symbol, tf) in _grid_logged:
        return
    _grid_logged.add((symbol, tf))
    period = to_minutes(tf) * 60
    if period <= 120:
        return
    off = _phase(period, time.time(), last_open)
    if off:
        closes = ", ".join(time.strftime("%H:%M", time.gmtime(off + i * period))
                           for i in range(min(6, 86400 // period)))
        log.info(f"[candle_cache] {symbol} {tf} bars close at {closes} UTC — {off / 60:.0f} min off "
                 f"the midnight grid; TTL follows the feed's own timing, not an assumed one")


def put(symbol: str, tf: str, candles: list) -> None:
    """Store candles with a TTL that expires on this timeframe's REAL next bar close.

    The newest bar's timestamp is what tells us where that close is (`_phase`) — so the series being
    cached is also the thing that dates it, and there is nothing left to assume.
    """
    if not candles:
        return
    last_open = getattr(candles[-1], "time", None)
    _note_grid(symbol, tf, last_open)
    ttl     = _ttl_for(tf, last_open=last_open)
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
