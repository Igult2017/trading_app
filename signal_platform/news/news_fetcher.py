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

_PORT         = os.getenv("PORT", "5000")
_APP_BASE_URL = os.getenv("APP_BASE_URL", f"http://localhost:{_PORT}")
_ENDPOINT     = f"{_APP_BASE_URL}/api/homepage/calendar"

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
        # datetime.fromisoformat rejects a trailing 'Z' on Python < 3.11 — a
        # parse failure here silently drops the event, so the news filter would
        # see nothing and let trades through during high-impact news. Normalise.
        if iso.endswith("Z"):
            iso = iso[:-1] + "+00:00"
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
    """App API first, direct scrape if that fails — plus the recent high-impact HISTORY."""
    result = _fetch_from_app_sync()
    if result is None:
        result = _fetch_direct_sync()
    return _merge_history(result, _fetch_history_sync()) if result else result


# THE PAST FOUR DAYS OF HIGH-IMPACT NEWS, straight from the shared `economic_events` table.
#
# WHY: VIX.1's void rule asks "was there news in this candle?" for candles up to 48 trading hours
# back — on a Monday that is last Thursday/Friday. The app's calendar endpoint serves only 2 days back
# (`calendarDb.ts` dbWindow), so Friday's releases were missing and those candles fell to "news
# unknown". The table keeps high-impact rows for 96 h (`calendarDb.ts` purge), written by MyFXBook
# (the main source) and by the ForexFactory backup alike. If this read fails, nothing breaks: the
# candles it would have covered count as "news unknown", the stricter side.
_HISTORY_HOURS = 96


def _fetch_history_sync() -> list[NewsEvent]:
    try:
        from sqlalchemy import text
        from storage.db import engine
        since = datetime.now(timezone.utc) - timedelta(hours=_HISTORY_HOURS)
        with engine.connect() as conn:
            rows = conn.execute(text(
                "SELECT title, currency, event_time FROM economic_events "
                "WHERE impact_level = 'High' AND event_time >= :since"), {"since": since}).fetchall()
        out = []
        for title, currency, when in rows:
            if when is None:
                continue
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            out.append(NewsEvent(title=title or "", currency=currency or "", impact=NewsImpact.HIGH,
                                 scheduled_at=when.astimezone(timezone.utc)))
        return out
    except Exception as exc:
        log.warning("[news_fetcher] news history read failed (%s) — older candles count as news unknown", exc)
        return []


def _merge_history(events: list[NewsEvent], history: list[NewsEvent]) -> list[NewsEvent]:
    """The app's calendar plus any history row it does not already hold (same currency, title, time)."""
    seen = {(e.currency, e.title, e.scheduled_at) for e in events}
    return events + [h for h in history if (h.currency, h.title, h.scheduled_at) not in seen]


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
        return _build_context(_cache_events, now)

    async with _fetch_lock:
        if now < _cache_expires:          # re-check inside lock
            return _build_context(_cache_events, now)

        loop = asyncio.get_running_loop()
        try:
            events = await asyncio.wait_for(
                loop.run_in_executor(None, _fetch_sync),
                timeout=10,
            )
            _cache_expires = now + timedelta(minutes=_CACHE_TTL_MINUTES)
            # AN EMPTY ANSWER NEVER REPLACES A GOOD CALENDAR. It used to: one failed scrape emptied the
            # cache, and an empty calendar reads as "no news" — trades through CPI. Keep the last good
            # one; whether it still covers now is what decides if the news is known (`_known`).
            if events:
                _cache_events = events
        except asyncio.TimeoutError:
            log.warning("[news_fetcher] fetch timed out (10s) — keeping the last good calendar")
        except Exception as exc:
            log.warning("[news_fetcher] error (%s) — keeping the last good calendar", exc)

    return _build_context(_cache_events, now)


# WHEN IS THE NEWS "KNOWN"? Two rulings of his, 2026-11-15:
#   *"if we miss the news we risk trading news candles which can be disastrous for propfirms."*
#   *"news blocking ... should only happen if we are expecting high impact news and it within the
#    time when it can affect us."*
# So the CALENDAR'S AGE DOES NOT MATTER — the schedule is published days ahead, and an older copy
# still says exactly when CPI is. (A 6-hour age limit was tried first and refused trades with a
# perfectly good schedule in hand; removed the same day.) What matters is whether the calendar
# COVERS NOW: it holds releases both before and after this moment. Then the normal news window
# decides (15 min before / 30 after, `vix1.py`). Only with no calendar covering now is VIX.1 blind,
# and then it takes no new trade until one is back.
def _known(events: list[NewsEvent], now: datetime) -> tuple[bool, str]:
    times = [e.scheduled_at for e in events if e.scheduled_at]
    if not times:
        return False, "no news calendar has been received"
    if max(times) <= now:
        return False, "the news calendar ends before now"
    if min(times) > now:
        return False, "the news calendar starts after now"
    return True, ""


def _build_context(events: list[NewsEvent], now: datetime | None = None) -> NewsContext:
    from config.settings import settings
    ok, why = _known(events, now or datetime.now(timezone.utc))
    if not ok:
        log.warning("[news_fetcher] NEWS UNKNOWN — %s", why)
    return NewsContext(
        events           = events,
        pre_window_mins  = settings.news_pre_window_mins,
        post_window_mins = settings.news_post_window_mins,
        ok               = ok,
        why              = why,
    )
