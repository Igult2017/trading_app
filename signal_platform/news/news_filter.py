"""
News filter — applied before candle data is fetched for a strategy.
Returns True if the strategy is allowed to run, False to skip this tick.

Fix: `now` is computed once and passed in, not re-evaluated per event.
"""

from datetime import datetime, timezone, timedelta
from config.instruments import SYMBOL_TO_CURRENCIES
from core.types import NewsContext, NewsImpact, NewsStance
from core.base_strategy import BaseStrategy


def _in_window(event, pre_mins: int, post_mins: int,
               now: datetime) -> bool:
    """True if the event is within the pre/post window of `now`."""
    delta_mins = (event.scheduled_at - now).total_seconds() / 60
    return -post_mins <= delta_mins <= pre_mins


def check(strategy: BaseStrategy,
          news_context: NewsContext,
          instrument: str,
          now: datetime | None = None) -> bool:
    """
    Returns True  → strategy may run.
    Returns False → skip this tick.

    `now` is passed in so it stays consistent across the entire scan tick.
    """
    if strategy.news_stance == NewsStance.NEWS_AGNOSTIC:
        return True

    now = now or datetime.now(timezone.utc)
    currencies = list(SYMBOL_TO_CURRENCIES.get(instrument, ("", "")))
    currencies = [c for c in currencies if c]

    relevant = [
        e for e in news_context.events
        if e.currency in currencies
        and e.impact in strategy.news_impact_filter
        and _in_window(e, news_context.pre_window_mins,
                       news_context.post_window_mins, now)
    ]

    if strategy.news_stance == NewsStance.AVOID_ALL:
        return len(relevant) == 0

    if strategy.news_stance == NewsStance.AVOID_HIGH_ONLY:
        high = [e for e in relevant if e.impact == NewsImpact.HIGH]
        return len(high) == 0

    if strategy.news_stance == NewsStance.REQUIRE_NEWS:
        return len(relevant) > 0

    return True
