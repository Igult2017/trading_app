"""
EURUSD trading sessions — London and New York only (UTC).

EURUSD is driven by European and US institutions. The Asian session
(00:00–07:00 UTC) has 20-40 pip ranges and thin liquidity — not suitable
for this strategy. Only trade when real volume is in the market.

Windows:
  London open    07:00–10:00  — strongest directional moves of the day
  London mid     10:00–12:00  — continuation and reversals
  NY/Ldn overlap 12:00–17:00  — highest volume of the day, both sessions open
"""
from datetime import datetime
from enum import Enum


class SubSession(str, Enum):
    LONDON_OPEN   = "london_open"         # 07:00–10:00 UTC
    LONDON_MID    = "london_mid"          # 10:00–12:00 UTC
    NY_LDN_OVERLAP = "ny_ldn_overlap"     # 12:00–17:00 UTC


_WINDOWS: list[tuple[SubSession, int, int]] = [
    (SubSession.LONDON_OPEN,    7 * 60,       10 * 60),
    (SubSession.LONDON_MID,    10 * 60,       12 * 60),
    (SubSession.NY_LDN_OVERLAP, 12 * 60,      17 * 60),
]


def active_sub_sessions(utc_dt: datetime) -> list[SubSession]:
    mins = utc_dt.hour * 60 + utc_dt.minute
    return [s for s, start, end in _WINDOWS if start <= mins < end]


def is_valid_session(utc_dt: datetime) -> bool:
    """True when London or NY is open (07:00–17:00 UTC)."""
    return bool(active_sub_sessions(utc_dt))
