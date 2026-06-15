"""
Returns only tradeable instruments that are currently active
based on forex market hours (Mon 00:00 UTC – Fri 22:00 UTC).
"""

from datetime import datetime, timezone
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


def get_open_instruments(now: datetime | None = None) -> list[str]:
    """Return app symbols for all currently tradeable instruments."""
    if not is_forex_open(now):
        return []
    return [symbol for symbol, *_ in TRADEABLE_INSTRUMENTS]
