"""
EURUSD trading sessions — all 6 institutional windows (UTC).

  Tokyo-Sydney Overlap  22:00–00:00  Sydney opens; pre-Tokyo liquidity build
  Tokyo Mid             00:00–03:00  Peak Tokyo session
  London Open           07:00–10:00  Strongest directional moves of the day
  London Mid            10:00–12:00  Continuation and reversals
  NY-London Overlap     12:00–17:00  Highest volume; both sessions active
  NY Mid                17:00–20:00  Post-London close; pure New York
"""
from datetime import datetime
from enum import Enum


class SubSession(str, Enum):
    TOKYO_SYDNEY_OVERLAP = "tokyo_sydney_overlap"
    TOKYO_MID            = "tokyo_mid"
    LONDON_OPEN          = "london_open"
    LONDON_MID           = "london_mid"
    NY_LDN_OVERLAP       = "ny_ldn_overlap"
    NY_MID               = "ny_mid"


# (SubSession, start_mins, end_mins) — end exclusive.
# Cross-midnight window (22:00–00:00) uses end = 24*60 = 1440.
_WINDOWS: list[tuple[SubSession, int, int]] = [
    (SubSession.TOKYO_SYDNEY_OVERLAP, 22 * 60, 24 * 60),
    (SubSession.TOKYO_MID,             0 * 60,  3 * 60),
    (SubSession.LONDON_OPEN,           7 * 60, 10 * 60),
    (SubSession.LONDON_MID,           10 * 60, 12 * 60),
    (SubSession.NY_LDN_OVERLAP,       12 * 60, 17 * 60),
    (SubSession.NY_MID,               17 * 60, 20 * 60),
]


def active_sub_sessions(utc_dt: datetime) -> list[SubSession]:
    mins = utc_dt.hour * 60 + utc_dt.minute
    return [s for s, start, end in _WINDOWS if start <= mins < end]


def is_valid_session(utc_dt: datetime) -> bool:
    """True during any of the 6 institutional session windows."""
    return bool(active_sub_sessions(utc_dt))
