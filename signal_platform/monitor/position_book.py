"""
WHAT IS OPEN, ASKED ONCE AND SHARED — instead of once per price check, per watcher.

THE PROBLEM. Both stop-moving paths began the same way: ask the broker "what is open?", THEN look at
the price. `open_positions()` is a full reconcile request with a 15-second timeout, taken under a
lock shared with everything else on that socket (`data/ctrader_positions.py`). The fast watcher
issued one **every 0.5 seconds**, plus another after every stop move to confirm it.

So the loop whose entire purpose is to react quickly could not run faster than the broker answered —
and it spent a request every half second re-asking a question whose answer changes a few times a day.
The price changes constantly; the position list does not. They were on the same clock and it was the
wrong one for both.

WHAT THIS CHANGES. The list is refreshed on its own slow timer and handed out from memory. A price
check costs nothing, so it can run on every tick. This REMOVES broker requests; it does not add any.

NONE AND [] STILL MEAN DIFFERENT THINGS, and that contract is load-bearing — `ctrader_positions`
states it and a boot test caught a real bug where it was confused:

    []    you have no trades open
    None  I could not find out

A cache must never turn the second into the first: "the broker did not answer" becoming "nothing is
open" would stop a watcher guarding a real position. So a failed refresh keeps serving the LAST GOOD
list (with its age attached, so a caller can refuse it) and only reports None when there has never
been one.

NEVER RAISES. Every caller here is a loop that must not die.
"""
import asyncio
import logging
import time

from data import ctrader_positions

log = logging.getLogger(__name__)

# HOW OLD THE LIST MAY BE BEFORE IT IS RE-ASKED. Five seconds against a list that changes a few times
# a day is generous in the direction that matters: a position that OPENED is picked up within five
# seconds, and one that CLOSED costs at most one wasted price check on a position that is gone —
# which does nothing, because every rung already checks the live position before amending.
_MAX_AGE_S = 5.0

# A LIST THIS OLD IS NOT EVIDENCE OF ANYTHING. If the broker has been unreachable this long, serving
# the last good list would be inventing a fact about the account. Callers get None and behave exactly
# as they do today when a read fails.
_ABANDON_AFTER_S = 120.0

_cached: list | None = None
_cached_at: float = 0.0
# "ASK AGAIN NEXT TIME", kept SEPARATE from the timestamp — and that separation is a real bug fix,
# caught by `test_position_book`. `invalidate()` first did its job by setting `_cached_at = 0.0`, but
# `age()` then read that as "this list is as old as the process", so the very next failed broker read
# threw away a perfectly good list and reported "I don't know what is open". That would fire right
# after a stop move, which is exactly when we least want to stop watching a position. A flag says
# "refresh me"; the timestamp stays an honest record of when we last actually heard from the broker.
_forced: bool = False
_lock = asyncio.Lock()


def age() -> float | None:
    """Seconds since the list was last read from the broker, or None if it never was."""
    return None if _cached is None else (time.monotonic() - _cached_at)


def _fresh() -> bool:
    return (not _forced) and _cached is not None and (time.monotonic() - _cached_at) < _MAX_AGE_S


async def refresh() -> list | None:
    """Ask the broker now. Returns the new list, or the last good one if the read failed."""
    global _cached, _cached_at, _forced
    # ONE REFRESH AT A TIME. Without this, a tick-driven watcher and the tracker can both find the
    # list stale in the same instant and fire two reconciles at a socket that serialises them anyway
    # — doubling the cost to answer the same question.
    async with _lock:
        # Someone else may have refreshed it while we waited for the lock.
        if _fresh():
            return _cached
        try:
            fresh = await ctrader_positions.open_positions()
        except Exception as exc:
            log.error(f"[position_book] read failed: {type(exc).__name__}: {exc}")
            fresh = None
        if fresh is not None:
            _cached, _cached_at, _forced = fresh, time.monotonic(), False
            return _cached
        # THE READ FAILED. Keep serving what we last knew, until it is too old to mean anything.
        stale = age()
        if stale is not None and stale > _ABANDON_AFTER_S:
            log.warning(f"[position_book] the broker has been unreadable for {stale:.0f}s — "
                        f"reporting 'unknown' rather than a {stale:.0f}s-old list")
            _cached = None
            return None
        return _cached


async def positions() -> list | None:
    """Every open position. From memory when it is fresh, from the broker when it is not."""
    return _cached if _fresh() else await refresh()


def invalidate() -> None:
    """Force the next read to go to the broker.

    Called after a stop move: the position we hold now has the OLD stop on it, and the ratchet in
    `execution.breakeven` compares against exactly that. Serving it again would let the same rung
    look un-done — which the delivery ledger stops from being acted on twice, but there is no reason
    to make the ledger do that work when the fact is already known here.

    IT DOES NOT DISCARD WHAT WE HAVE. If the re-read then fails, the last good list is still the best
    answer available — see the note on `_forced`.
    """
    global _forced
    _forced = True
