"""Trading-session gate for copy followers — "only mirror trades during these sessions".

WHY THIS EXISTS. The setup panel has offered four session buttons (London / New York / Tokyo /
Sydney) since it was built, and they did nothing anywhere: the browser never sent the choice, and
the engine's follower model did not even map `session_filter` / `active_sessions`. Four controls
that looked like risk settings and were decoration.

HOURS ARE NOT INVENTED HERE. The local open/close hours match the platform's existing session
windows (`signal_platform/scheduler/session_windows.py`), which in turn match the Node
`/api/market-sessions` convention the sessions page renders — so the copy engine agrees with what he
sees elsewhere instead of holding a fifth opinion about when London opens.

Deliberately NOT imported from the signal platform: that is a separate process with its own
`sys.path`, and reaching across would couple the copy engine's startup to it. The hours are
duplicated with this note instead; if they ever change, both say where the other lives.

Computed from IANA timezones so daylight saving is handled without a seasonal edit, with a fixed-UTC
fallback so a missing tz database degrades instead of blocking every copied trade.
"""
from datetime import datetime, timezone

try:
    from zoneinfo import ZoneInfo
    _HAS_TZ = True
except ImportError:                                    # pragma: no cover
    _HAS_TZ = False

# (IANA zone, local open hour, local close hour). The panel lists Tokyo and Sydney separately, so
# unlike the scanner's combined "Asian" window they are kept apart here — the labels are the ones
# the buttons show, because that is what gets stored in `active_sessions`.
_ZONES: dict[str, tuple[str, int, int]] = {
    "London":   ("Europe/London",      8, 17),
    "New York": ("America/New_York",   8, 17),
    "Tokyo":    ("Asia/Tokyo",         9, 18),
    "Sydney":   ("Australia/Sydney",   8, 17),
}

# Only used if the tz database cannot be loaded. Hours that wrap past midnight UTC are handled below.
_FALLBACK: dict[str, tuple[int, int]] = {
    "London":   (7, 16),
    "New York": (12, 21),
    "Tokyo":    (0, 9),
    "Sydney":   (22, 7),
}


def active_sessions(now: datetime | None = None) -> set[str]:
    """Which sessions are open right now. They overlap, so this is a set, not one answer."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    if _HAS_TZ:
        try:
            return {name for name, (tz, o, c) in _ZONES.items()
                    if o <= now.astimezone(ZoneInfo(tz)).hour < c}
        except Exception:
            pass                                        # fall through to fixed UTC windows
    hour = now.hour
    # The parentheses are load-bearing: `if A if B else C` inside a comprehension parses as TWO
    # filter clauses, not a conditional expression, and will not compile.
    return {name for name, (start, end) in _FALLBACK.items()
            if ((start <= hour < end) if start < end else (hour >= start or hour < end))}


def is_session_allowed(follower, now: datetime | None = None) -> tuple[bool, str | None]:
    """May this follower copy a NEW trade at this moment?

    Returns (allowed, reason_when_refused).

    OFF BY DEFAULT, in two ways that both matter. `session_filter` false means no gate at all, and
    an empty `active_sessions` list also means no gate — otherwise a follower saved before this
    existed would have every trade refused the moment the feature shipped.
    """
    if not getattr(follower, "session_filter", False):
        return True, None
    chosen = list(getattr(follower, "active_sessions", None) or [])
    if not chosen:
        return True, None
    open_now = active_sessions(now)
    if open_now & set(chosen):
        return True, None
    return False, (f"outside the allowed sessions — chose {', '.join(sorted(chosen))}; "
                   f"open now: {', '.join(sorted(open_now)) or 'none'}")
