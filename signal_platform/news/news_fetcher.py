"""
Economic calendar fetcher.

Source: Forex Factory unofficial JSON feed (nfs.faireconomy.media).
This is the same data that powers Forex Factory's public calendar.
No API key required. Fetches this week + next week on each call,
caches for 30 minutes so repeated scan ticks don't hammer the endpoint.

If the request fails, returns an empty NewsContext so the platform
continues running — strategies with AVOID_HIGH_ONLY may trade through
news, which is preferable to a full platform halt.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import requests

from core.types import NewsContext, NewsEvent, NewsImpact

log = logging.getLogger(__name__)

# ── In-process cache: avoids hammering FF on every 60s scan tick ──────────────
_cache_events: list[NewsEvent] = []
_cache_expires: datetime = datetime.min.replace(tzinfo=timezone.utc)
_CACHE_TTL_MINUTES = 30

_FF_URLS = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
]

_IMPACT_MAP = {
    "High":    NewsImpact.HIGH,
    "Medium":  NewsImpact.MEDIUM,
    "Low":     NewsImpact.LOW,
    "Holiday": NewsImpact.LOW,
}


def _fetch_ff_sync() -> list[NewsEvent]:
    """Blocking HTTP fetch from Forex Factory. Run in executor."""
    events: list[NewsEvent] = []
    headers = {"User-Agent": "Mozilla/5.0 (compatible; TradingBot/1.0)"}

    for url in _FF_URLS:
        try:
            r = requests.get(url, headers=headers, timeout=10)
            r.raise_for_status()
            for item in r.json():
                try:
                    events.append(_parse_event(item))
                except Exception:
                    continue
        except Exception as exc:
            log.warning(f"[news_fetcher] FF fetch failed ({url}): {exc}")

    return events


def _parse_event(item: dict[str, Any]) -> NewsEvent:
    raw_date = item.get("date", "")
    # FF dates are ISO 8601 with timezone offset e.g. "2026-06-06T12:30:00-04:00"
    scheduled_at = datetime.fromisoformat(raw_date).astimezone(timezone.utc)

    impact_str = item.get("impact", "Low")
    impact = _IMPACT_MAP.get(impact_str, NewsImpact.LOW)

    return NewsEvent(
        title=item.get("title", ""),
        currency=item.get("country", ""),     # FF uses "country" for the currency code
        impact=impact,
        scheduled_at=scheduled_at,
        actual=item.get("actual") or None,
        forecast=item.get("forecast") or None,
        previous=item.get("previous") or None,
    )


async def fetch(now: datetime | None = None) -> NewsContext:
    """
    Return a NewsContext for the current tick.
    Uses the 30-minute in-process cache — only hits the network when stale.
    On any network error: returns last cached result (or empty on first failure).
    """
    global _cache_events, _cache_expires
    now = now or datetime.now(timezone.utc)

    if now < _cache_expires and _cache_events is not None:
        log.debug(f"[news_fetcher] cache hit — {len(_cache_events)} events")
        return _build_context(_cache_events)

    log.info("[news_fetcher] fetching Forex Factory calendar...")
    loop = asyncio.get_event_loop()
    try:
        events = await asyncio.wait_for(
            loop.run_in_executor(None, _fetch_ff_sync),
            timeout=15,
        )
        _cache_events  = events
        _cache_expires = now + timedelta(minutes=_CACHE_TTL_MINUTES)
        log.info(f"[news_fetcher] loaded {len(events)} events, cache valid for {_CACHE_TTL_MINUTES}m")
    except Exception as exc:
        log.warning(f"[news_fetcher] fetch error ({exc}) — using stale/empty cache")

    return _build_context(_cache_events)


def _build_context(events: list[NewsEvent]) -> NewsContext:
    from config.settings import settings
    return NewsContext(
        events=events,
        pre_window_mins=settings.news_pre_window_mins,
        post_window_mins=settings.news_post_window_mins,
    )
