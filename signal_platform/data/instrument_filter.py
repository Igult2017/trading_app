"""
Returns only tradeable instruments that are currently active
based on forex market hours (Mon 00:00 UTC – Fri 22:00 UTC).
"""

from datetime import datetime, timezone
from config.instruments import TRADEABLE_INSTRUMENTS


def is_forex_open(now: datetime | None = None) -> bool:
    """Forex: open Mon–Fri, closed all Saturday, closed Sun before 22:00 UTC."""
    now = now or datetime.now(timezone.utc)
    wd = now.weekday()   # 0=Mon … 6=Sun
    if wd == 5:
        return False
    if wd == 6 and now.hour < 22:
        return False
    return True


def get_open_instruments(now: datetime | None = None) -> list[str]:
    """Return app symbols for all currently tradeable instruments."""
    if not is_forex_open(now):
        return []
    return [symbol for symbol, *_ in TRADEABLE_INSTRUMENTS]
