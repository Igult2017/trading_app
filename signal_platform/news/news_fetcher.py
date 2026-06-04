"""
Economic calendar fetcher.
Current implementation: stub returning an empty NewsContext.
Strategies with NEWS_AGNOSTIC stance run normally.

To wire in a real calendar API (Forex Factory, Finnhub, etc.):
  - Replace _fetch_real() with the actual HTTP call
  - Parse response into list[NewsEvent]
  - No other files need to change.
"""

import logging
from datetime import datetime, timezone
from core.types import NewsContext, NewsEvent

log = logging.getLogger(__name__)


async def fetch(now: datetime | None = None) -> NewsContext:
    """
    Fetch the economic calendar for the current tick window.
    Returns a NewsContext. Called once per scan tick — shared across strategies.
    """
    now = now or datetime.now(timezone.utc)
    events = await _fetch_events(now)
    return NewsContext(events=events)


async def _fetch_events(now: datetime) -> list[NewsEvent]:
    """
    Stub: returns empty list until a real calendar API is configured.
    Replace this function body to add live news filtering.
    """
    return []
