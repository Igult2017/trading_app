"""
Economic calendar fetcher.

PRIMARY source: GET /api/homepage/calendar on the app server.
  - Uses data already scraped and cached by the app (MyFXBook → TradingView → FF).
  - Single scrape shared between the UI calendar page and the signal platform.
  - No duplicate scraping; the app's 15-minute refresh cycle is the clock.

FALLBACK: server/python/news_calendar.py (direct scrape).
  - Only fires when the app server is unreachable (dev server down, deploy restart).
  - Keeps the signal platform independent of app uptime.

In-process cache: 15 minutes (aligns with the app's own refresh interval).
"""
import asyncio
import logging
import sys
import os
from datetime import datetime, timezone, timedelta

try:
    import requests as _requests
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False

from core.types import NewsContext, NewsEvent, NewsImpact

log = logging.getLogger(__name__)

_APP_BASE_URL  = os.getenv("APP_BASE_URL", "http://localhost:5000")
_ENDPOINT      = f"{_APP_BASE_URL}/api/homepage/calendar"

# Add server/python to sys.path for the direct-scrape fallback
_SERVER_PYTHON = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "server", "python")
)
if _SERVER_PYTHON not in sys.path:
    sys.path.insert(0, _SERVER_PYTHON)

# In-process cache
_cache_events:  list[NewsEvent] = []
_cache_expires: datetime        = datetime.min.replace(tzinfo=timezone.utc)
_CACHE_TTL_MINUTES              = 15
_fetch_lock                     = asyncio.Lock()

_IMPACT_MAP = {
    "High":    NewsImpact.HIGH,
    "Medium":  NewsImpact.MEDIUM,
    "Low":     NewsImpact.LOW,
    "Holiday": NewsImpact.LOW,
}


def _parse(item: dict) -> NewsEvent | None:
    """Convert one calendar event dict into a NewsEvent."""
    try:
        iso = item.get("eventTime", "")
        if not iso:
            return None
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        scheduled_at = dt.astimezone(timezone.utc)
        impact = _IMPACT_MAP.get(item.get("importance", "Low"), NewsImpact.LOW)
        return NewsEvent(
            title        = item.get("event", ""),
            currency     = item.get("currency", ""),
            impact       = impact,
            scheduled_at = scheduled_at,
            actual       = item.get("actual")   or None,
            forecast     = item.get("forecast") or None,
            previous     = item.get("previous") or None,
        )
    except Exception:
        return None


def _fetch_from_app_sync() -> list[NewsEvent] | None:
    """
    Call /api/homepage/calendar on the app server.
    Returns parsed events, or None if the server is unreachable.
    """
    if not _HAS_REQUESTS:
        return None
    try:
        r = _requests.get(_ENDPOINT, timeout=5)
        r.raise_for_status()
        raw = r.json()   # list[CalendarEvent]
        events = [e for item in raw if (e := _parse(item)) is not None]
        log.info("[news_fetcher] loaded %d events from app calendar API", len(events))
        return events
    except Exception as exc:
        log.warning("[news_fetcher] app calendar API unavailable (%s) — trying direct scrape", exc)
        return None


def _fetch_direct_sync() -> list[NewsEvent]:
    """Fallback: call news_calendar.py directly (same scraper the app uses)."""
    try:
        from news_calendar import scrape_calendar
        raw = scrape_calendar()
        events = [e for item in raw if (e := _parse(item)) is not None]
        log.info("[news_fetcher] fallback scrape: %d events", len(events))
        return events
    except ImportError as exc:
        log.error("[news_fetcher] cannot import news_calendar.py: %s", exc)
        return []
    except Exception as exc:
        log.warning("[news_fetcher] direct scrape failed: %s", exc)
        return []


def _fetch_sync() -> list[NewsEvent]:
    """App API first, direct scrape if that fails."""
    result = _fetch_from_app_sync()
    if result is not None:
        return result
    return _fetch_direct_sync()


async def fetch(now: datetime | None = None) -> NewsContext:
    """
    Return NewsContext for the current tick.
    Cache TTL = 15 min (matches the app's own calendar refresh interval).
    On failure: returns last cached result (never halts the platform).
    """
    global _cache_events, _cache_expires
    now = now or datetime.now(timezone.utc)

    if now < _cache_expires:
        log.debug("[news_fetcher] cache hit — %d events", len(_cache_events))
        return _build_context(_cache_events)

    async with _fetch_lock:
        if now < _cache_expires:          # re-check inside lock
            return _build_context(_cache_events)

        loop = asyncio.get_running_loop()
        try:
            events = await asyncio.wait_for(
                loop.run_in_executor(None, _fetch_sync),
                timeout=10,
            )
            _cache_events  = events
            _cache_expires = now + timedelta(minutes=_CACHE_TTL_MINUTES)
        except asyncio.TimeoutError:
            log.warning("[news_fetcher] fetch timed out (10s) — using stale/empty cache")
        except Exception as exc:
            log.warning("[news_fetcher] error (%s) — using stale/empty cache", exc)

    return _build_context(_cache_events)


def _build_context(events: list[NewsEvent]) -> NewsContext:
    from config.settings import settings
    return NewsContext(
        events           = events,
        pre_window_mins  = settings.news_pre_window_mins,
        post_window_mins = settings.news_post_window_mins,
    )
