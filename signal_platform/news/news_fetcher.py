"""
Economic calendar fetcher.

Source: the existing app's scraper at server/python/news_calendar.py.
  Primary:   MyFXBook (curl_cffi iOS Safari TLS impersonation → Cloudflare bypass)
  Fallback1: TradingView JSON API
  Fallback2: ForexFactory XML

The scraper already handles all three sources with a consistent retry chain.
This module adds a 30-minute in-process cache so repeated scan ticks
don't re-scrape on every call.

If all sources fail, returns the last cached result (or empty NewsContext on
first failure) — the platform never halts due to news unavailability.
"""

import asyncio
import logging
import sys
import os
from datetime import datetime, timezone, timedelta

from core.types import NewsContext, NewsEvent, NewsImpact

log = logging.getLogger(__name__)

# ── Add server/python to sys.path so we can import news_calendar directly ─────
_SERVER_PYTHON = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "server", "python")
)
if _SERVER_PYTHON not in sys.path:
    sys.path.insert(0, _SERVER_PYTHON)

# ── In-process cache ──────────────────────────────────────────────────────────
_cache_events: list[NewsEvent] = []
_cache_expires: datetime = datetime.min.replace(tzinfo=timezone.utc)
_CACHE_TTL_MINUTES = 30
_fetch_lock = asyncio.Lock()   # prevents concurrent scrapes when cache is stale

_IMPACT_MAP = {
    "High":    NewsImpact.HIGH,
    "Medium":  NewsImpact.MEDIUM,
    "Low":     NewsImpact.LOW,
    "Holiday": NewsImpact.LOW,
}


def _scrape_sync() -> list[NewsEvent]:
    """
    Blocking call to the app's existing scraper.
    Runs in a thread pool executor so it never blocks the asyncio loop.
    """
    try:
        from news_calendar import scrape_calendar
        raw_events = scrape_calendar()
        return [_parse(e) for e in raw_events if _parse(e) is not None]
    except ImportError as exc:
        log.error(f"[news_fetcher] Cannot import news_calendar.py: {exc}")
        return []
    except Exception as exc:
        log.warning(f"[news_fetcher] scrape_calendar() failed: {exc}")
        return []


def _parse(item: dict) -> NewsEvent | None:
    """Convert one scraped event dict into a NewsEvent."""
    try:
        # eventTime is an ISO string e.g. "2026-06-06T14:30:00"
        iso = item.get("eventTime", "")
        if iso:
            dt = datetime.fromisoformat(iso)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            scheduled_at = dt.astimezone(timezone.utc)
        else:
            return None   # no time → skip (can't filter windows without it)

        impact_str = item.get("importance", "Low")
        impact = _IMPACT_MAP.get(impact_str, NewsImpact.LOW)

        return NewsEvent(
            title=item.get("event", ""),
            currency=item.get("currency", ""),
            impact=impact,
            scheduled_at=scheduled_at,
            actual=item.get("actual") or None,
            forecast=item.get("forecast") or None,
            previous=item.get("previous") or None,
        )
    except Exception:
        return None


async def fetch(now: datetime | None = None) -> NewsContext:
    """
    Return a NewsContext for the current tick.
    Uses a 30-minute in-process cache — only hits the scraper when stale.
    On failure: returns last cached result (or empty on first-ever failure).
    """
    global _cache_events, _cache_expires
    now = now or datetime.now(timezone.utc)

    if now < _cache_expires:
        log.debug(f"[news_fetcher] cache hit — {len(_cache_events)} events")
        return _build_context(_cache_events)

    # Lock prevents multiple concurrent coroutines from each firing a scrape
    # when the cache turns stale between scan ticks.
    async with _fetch_lock:
        # Re-check inside the lock — another coroutine may have refreshed already
        if now < _cache_expires:
            return _build_context(_cache_events)

        log.info("[news_fetcher] fetching economic calendar (MyFXBook → TradingView → FF)...")
        loop = asyncio.get_running_loop()
        try:
            events = await asyncio.wait_for(
                loop.run_in_executor(None, _scrape_sync),
                timeout=45,   # MyFXBook can be slow; allow extra time
            )
            _cache_events  = events
            _cache_expires = now + timedelta(minutes=_CACHE_TTL_MINUTES)
            log.info(
                f"[news_fetcher] loaded {len(events)} events — "
                f"cache valid for {_CACHE_TTL_MINUTES}m"
            )
        except asyncio.TimeoutError:
            log.warning("[news_fetcher] scrape timed out (45s) — using stale/empty cache")
        except Exception as exc:
            log.warning(f"[news_fetcher] error ({exc}) — using stale/empty cache")

    return _build_context(_cache_events)


def _build_context(events: list[NewsEvent]) -> NewsContext:
    from config.settings import settings
    return NewsContext(
        events=events,
        pre_window_mins=settings.news_pre_window_mins,
        post_window_mins=settings.news_post_window_mins,
    )
