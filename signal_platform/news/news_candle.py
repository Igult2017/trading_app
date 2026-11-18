"""
News timing — a shared PLATFORM RESOURCE, independent of any strategy.

`in_news_window` — is NOW within 10 minutes before / after a scheduled high-impact release for the instrument
(his rule of 18 Nov 2026; entries and waiting orders both read it). `release_near` — was there a release in this
H1 candle or the hour before (VIX.1's liquidity-void rule). The old "news candle" identifier was deleted with his
18 Nov ruling: a candle holding the news may be traded once the 10 minutes have passed.

Reuses the platform's own currency map (`news_filter._currencies_for`). No trading logic.
"""
from datetime import datetime, timezone, timedelta

from core.types import NewsContext, NewsImpact
from news.news_filter import _currencies_for

_DEFAULT_IMPACTS: tuple[NewsImpact, ...] = (NewsImpact.HIGH,)
# HIS NEWS RULE, 18 Nov 2026: *"Ten minutes before and after news means we dont trade any candle 10 before news and we
# trade any candle 10 after news unless that candle is the liquidity void defined in VIX."* (Was 15 before / 30 after,
# plus a separate "never trade the news candle" skip, which is gone.) ONE place, read by entries and waiting orders.
NEWS_BEFORE_MIN = 10
NEWS_AFTER_MIN = 10


def in_news_window(
    news_context: NewsContext | None,
    instrument: str,
    before_min: int = NEWS_BEFORE_MIN,
    after_min: int = NEWS_AFTER_MIN,
    impacts: tuple[NewsImpact, ...] = _DEFAULT_IMPACTS,
    now: datetime | None = None,
) -> bool:
    """
    True if NOW is inside [event - before_min, event + after_min] of a scheduled release (of
    `impacts`, for `instrument`'s currencies). A shared resource: a strategy calls this to BLOCK
    entering around high-impact news — the window where spreads blow out and stops get slipped tens
    of pips — not just on the news candle itself. Safe defaults → False (no context / no currencies).
    """
    if not news_context or not news_context.events:
        return False
    currencies = _currencies_for(instrument)
    if not currencies:
        return False
    now  = now or datetime.now(timezone.utc)
    pre  = timedelta(minutes=before_min)
    post = timedelta(minutes=after_min)
    for e in news_context.events:
        if e.impact in impacts and e.currency in currencies and e.scheduled_at:
            if (e.scheduled_at - pre) <= now <= (e.scheduled_at + post):
                return True
    return False


def release_near(
    bar_open: int,
    news_context: NewsContext | None,
    instrument: str,
    impacts: tuple[NewsImpact, ...] = _DEFAULT_IMPACTS,
) -> bool | None:
    """Was a release (of `impacts`, for `instrument`'s currencies) in this H1 candle OR the hour before
    it? Used by VIX.1's void rule: *"News release leads to less trading activities which causes a
    liquidity void"* (his words, 2026-11-15).

    THREE ANSWERS, AND THE THIRD IS THE POINT. True / False when the calendar covers that hour; **None
    when it does not** — no calendar, a calendar marked not-`ok`, or a candle older than the earliest
    release the calendar holds (ForexFactory's feed is this-week-only, so on a Monday last Friday is
    unknown). The caller must treat None as "there may have been news", never as "there was none".
    """
    if news_context is None or not news_context.ok or not news_context.events:
        return None
    first = news_context.covers_from
    if first is None or bar_open < first.timestamp():
        return None
    currencies = _currencies_for(instrument)
    if not currencies:
        return None
    lo, hi = bar_open - 3600, bar_open + 3600
    for e in news_context.events:
        if e.impact in impacts and e.currency in currencies and e.scheduled_at:
            if lo <= e.scheduled_at.timestamp() < hi:
                return True
    return False
