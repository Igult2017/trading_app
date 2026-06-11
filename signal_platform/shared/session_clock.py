"""
Granular forex session sub-windows based on UTC time.
The strategy only trades during these 6 high-liquidity windows.

All times are UTC. Windows can overlap — a moment may belong to multiple sub-sessions.
"""
from datetime import datetime
from enum import Enum


class SubSession(str, Enum):
    TOKYO_SYDNEY      = "tokyo_sydney_overlap"   # 00:00–07:00
    TOKYO_MID         = "tokyo_mid"              # 01:00–04:00
    LONDON_OPEN       = "london_open"            # 08:00–09:30
    LONDON_MID        = "london_mid"             # 09:30–12:00
    NY_LONDON_OVERLAP = "ny_london_overlap"      # 13:00–17:00
    NEW_YORK_MID      = "new_york_mid"           # 15:00–18:00


# (sub-session, start_minutes_utc, end_minutes_utc)  — all same calendar day
_WINDOWS: list[tuple[SubSession, int, int]] = [
    (SubSession.TOKYO_SYDNEY,        0 * 60,        7 * 60),
    (SubSession.TOKYO_MID,           1 * 60,        4 * 60),
    (SubSession.LONDON_OPEN,         8 * 60,        9 * 60 + 30),
    (SubSession.LONDON_MID,          9 * 60 + 30,  12 * 60),
    (SubSession.NY_LONDON_OVERLAP,  13 * 60,       17 * 60),
    (SubSession.NEW_YORK_MID,       15 * 60,       18 * 60),
]


def active_sub_sessions(utc_dt: datetime) -> list[SubSession]:
    """Return all sub-sessions active at the given UTC datetime."""
    mins = utc_dt.hour * 60 + utc_dt.minute
    return [s for s, start, end in _WINDOWS if start <= mins < end]


def is_valid_session(utc_dt: datetime) -> bool:
    """True if any of the 6 trading windows is currently active."""
    return bool(active_sub_sessions(utc_dt))
