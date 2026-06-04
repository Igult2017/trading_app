"""
Forex trading session UTC windows and helpers.
"""

from datetime import datetime, timezone
from core.types import Session

# Session UTC hour ranges (start_hour, end_hour) — 24h clock
_WINDOWS: dict[Session, tuple[int, int]] = {
    Session.ASIAN:    (22, 8),   # 22:00 UTC (prev day) – 08:00 UTC
    Session.LONDON:   (7,  16),  # 07:00 – 16:00 UTC
    Session.NEW_YORK: (12, 21),  # 12:00 – 21:00 UTC
}


def get_current_sessions(now: datetime | None = None) -> list[Session]:
    """Return all sessions that are currently active (sessions can overlap)."""
    now = now or datetime.now(timezone.utc)
    hour = now.hour
    active: list[Session] = [Session.ALL]

    for session, (start, end) in _WINDOWS.items():
        if start < end:
            if start <= hour < end:
                active.append(session)
        else:
            # Overnight session (e.g. Asian: 22–08)
            if hour >= start or hour < end:
                active.append(session)

    return active


def is_market_open(now: datetime | None = None) -> bool:
    """Forex is closed all day Saturday and Sunday before 22:00 UTC."""
    from data.instrument_filter import is_forex_open
    return is_forex_open(now)


def scan_interval_seconds(now: datetime | None = None) -> int:
    """
    Faster scans at session opens (higher volatility).
    London + NY overlap → 30s, otherwise → 60s.
    """
    sessions = get_current_sessions(now)
    if Session.LONDON in sessions and Session.NEW_YORK in sessions:
        return 30
    if Session.LONDON in sessions or Session.NEW_YORK in sessions:
        return 45
    return 60
