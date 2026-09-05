"""
Returns only tradeable instruments that are currently active
based on forex market hours (Mon 00:00 UTC – Fri 22:00 UTC).
"""

from datetime import datetime, timedelta, timezone
from config.instruments import TRADEABLE_INSTRUMENTS


def is_forex_open(now: datetime | None = None) -> bool:
    """
    Forex week: opens Sun 22:00 UTC, closes Fri 22:00 UTC.
    Closed all Saturday, Sunday before 22:00, and Friday from 22:00 onward.
    """
    now = now or datetime.now(timezone.utc)
    wd = now.weekday()   # 0=Mon … 6=Sun
    if wd == 5:                       # Saturday — closed all day
        return False
    if wd == 6 and now.hour < 22:     # Sunday before the 22:00 UTC open
        return False
    if wd == 4 and now.hour >= 22:    # Friday from 22:00 UTC — weekend close
        return False
    return True


def next_open(now: datetime | None = None) -> datetime:
    """When the forex week next opens. Returns `now` unchanged if it is already open.

    WALKS THE CLOCK rather than computing the edge, for the reason `shared/market_clock.py` already
    gives about the same week: the arithmetic version has to handle a Friday evening, a Saturday and
    a Sunday morning separately, while a loop that simply asks `is_forex_open` cannot disagree with
    it. There is one definition of market hours in this platform and everything defers to it.

    Stepping by the HOUR is exact here, not approximate: `is_forex_open` only ever looks at the
    weekday and the hour, and the single open edge (Sunday 22:00 UTC) sits on an hour boundary. The
    longest close is Friday 22:00 -> Sunday 22:00, i.e. 48 hours, so the bound is never reached.
    """
    now = now or datetime.now(timezone.utc)
    if is_forex_open(now):
        return now
    t = now.replace(minute=0, second=0, microsecond=0)
    for _ in range(72):
        t += timedelta(hours=1)
        if is_forex_open(t):
            return t
    return t          # unreachable while the week above has an opening edge


def get_open_instruments(now: datetime | None = None) -> list[str]:
    """Return app symbols for all currently tradeable instruments."""
    if not is_forex_open(now):
        return []
    return [symbol for symbol, *_ in TRADEABLE_INSTRUMENTS]
