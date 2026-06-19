"""
Forex trading session windows — computed live from each centre's IANA timezone
so Daylight Saving Time is always handled, matching the Node /api/market-sessions
convention (standard local session hours). This keeps the signal platform's
session logic in agreement with the sessions page. Falls back to fixed UTC
windows if the tz database is unavailable, so a scan can never crash on it.
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from core.types import Session

# (IANA zone, local open hour, local close hour) per session. ASIAN = Tokyo ∪
# Sydney — the page lists them separately, but the gate uses one combined Asian
# window; the underlying hours are identical.
_ZONES: dict[Session, list[tuple[str, int, int]]] = {
    Session.ASIAN:    [("Asia/Tokyo", 9, 18), ("Australia/Sydney", 8, 17)],
    Session.LONDON:   [("Europe/London", 8, 17)],
    Session.NEW_YORK: [("America/New_York", 8, 17)],
}

# Fixed-UTC fallback — only used if the tz database can't be loaded.
_FALLBACK: dict[Session, tuple[int, int]] = {
    Session.ASIAN:    (22, 9),
    Session.LONDON:   (7, 16),
    Session.NEW_YORK: (12, 21),
}


def get_current_sessions(now: datetime | None = None) -> list[Session]:
    """Return all sessions currently active (they overlap). DST-aware."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    active: list[Session] = [Session.ALL]
    try:
        for session, zones in _ZONES.items():
            if any(o <= now.astimezone(ZoneInfo(tz)).hour < c for tz, o, c in zones):
                active.append(session)
    except Exception:
        # tz database unavailable — degrade to fixed UTC windows rather than crash.
        hour = now.hour
        for session, (start, end) in _FALLBACK.items():
            ok = (start <= hour < end) if start < end else (hour >= start or hour < end)
            if ok:
                active.append(session)
    return active


def is_market_open(now: datetime | None = None) -> bool:
    """Forex is closed all day Saturday and Sunday before 22:00 UTC."""
    from data.instrument_filter import is_forex_open
    return is_forex_open(now)


def scan_interval_seconds(now: datetime | None = None) -> int:
    """
    Faster scans at session opens (higher volatility).
    London + NY overlap → 30s, single major session → 45s, otherwise → 60s.
    """
    sessions = get_current_sessions(now)
    if Session.LONDON in sessions and Session.NEW_YORK in sessions:
        return 30
    if Session.LONDON in sessions or Session.NEW_YORK in sessions:
        return 45
    return 60
