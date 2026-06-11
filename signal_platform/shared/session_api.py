"""
Session clock client — fetches live session status from the app's
/api/market-sessions endpoint.

Falls back to local UTC window calculation if the server is unreachable,
so the signal platform never dies because the web app is down.
"""
import os, time, logging
from datetime import datetime
from typing import Optional

try:
    import requests as _requests
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False

logger = logging.getLogger(__name__)

_APP_BASE_URL  = os.getenv("APP_BASE_URL", "http://localhost:5000")
_ENDPOINT      = f"{_APP_BASE_URL}/api/market-sessions"
_CACHE_TTL     = 55   # seconds — refresh just before next H1 bar
_cache: dict   = {}   # {"data": ..., "ts": float}


def _fetch_from_api() -> Optional[dict]:
    """Fetch session state from the Express server. Returns None on failure."""
    if not _HAS_REQUESTS:
        return None
    try:
        r = _requests.get(_ENDPOINT, timeout=3)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        logger.warning("session_api: fetch failed (%s), using local fallback", exc)
        return None


def _local_is_active(open_utc: float, close_utc: float, utc_hour: float) -> bool:
    """Mirror of the JS isSessionActive() function."""
    if open_utc < close_utc:
        return open_utc <= utc_hour < close_utc
    return utc_hour >= open_utc or utc_hour < close_utc


_LOCAL_SESSIONS = [
    {"name": "Sydney",   "openUTC": 22,  "closeUTC": 7   },
    {"name": "Tokyo",    "openUTC": 0,   "closeUTC": 9   },
    {"name": "London",   "openUTC": 7,   "closeUTC": 15.5},
    {"name": "New York", "openUTC": 12,  "closeUTC": 21  },
]


def _local_market_sessions(utc_dt: datetime) -> dict:
    """Local fallback — mirrors tradingSessions.ts logic exactly."""
    utc_hour   = utc_dt.hour + utc_dt.minute / 60
    is_weekend = utc_dt.weekday() >= 5   # Saturday=5, Sunday=6

    sessions = [
        {
            "name":     s["name"],
            "openUTC":  s["openUTC"],
            "closeUTC": s["closeUTC"],
            "isActive": not is_weekend and _local_is_active(s["openUTC"], s["closeUTC"], utc_hour),
        }
        for s in _LOCAL_SESSIONS
    ]
    return {
        "utcHour":   utc_hour,
        "isWeekend": is_weekend,
        "anyActive": any(s["isActive"] for s in sessions),
        "sessions":  sessions,
    }


def get_market_sessions(utc_dt: datetime) -> dict:
    """
    Return session data from the API (cached) or local fallback.
    Always returns a dict with keys: utcHour, isWeekend, anyActive, sessions.
    """
    now = time.monotonic()
    if _cache.get("ts") and now - _cache["ts"] < _CACHE_TTL:
        return _cache["data"]

    data = _fetch_from_api() or _local_market_sessions(utc_dt)
    _cache["data"] = data
    _cache["ts"]   = now
    return data


def is_valid_session(utc_dt: datetime) -> bool:
    """True during any active forex session (weekdays only)."""
    data = get_market_sessions(utc_dt)
    return bool(data.get("anyActive"))


def active_session_names(utc_dt: datetime) -> list[str]:
    """Returns names of currently active sessions."""
    data = get_market_sessions(utc_dt)
    return [s["name"] for s in data.get("sessions", []) if s.get("isActive")]
