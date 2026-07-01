"""
News-candle identifier — a shared PLATFORM RESOURCE, independent of any strategy.

A "news candle" is a candle whose OWN time window contains a scheduled news release of the
requested impact(s) for the instrument's currencies. Any strategy that declares `requires_news`
can consume this to honour a "never trade the news candle" rule (e.g. VOCANT.1's playbook) — the
identifier lives here, in the news resource layer, not inside a strategy.

Reuses the platform's own building blocks only: the currency map (`news_filter._currencies_for`)
and the bar-duration helper (`mtf_utils.seconds`). No trading logic.
"""
from core.types import Candle, NewsContext, NewsImpact
from news.news_filter import _currencies_for
from shared.mtf_utils import seconds as _bar_seconds

_DEFAULT_IMPACTS: tuple[NewsImpact, ...] = (NewsImpact.HIGH,)


def is_news_candle(
    candle: Candle,
    news_context: NewsContext | None,
    instrument: str,
    impacts: tuple[NewsImpact, ...] = _DEFAULT_IMPACTS,
) -> bool:
    """
    True if a scheduled news release (of `impacts`, for `instrument`'s currencies) falls inside
    this candle's own time window [open, open + one bar). That is the "news candle" a strategy
    may want to exclude. Safe defaults → False when: no news context, no currency mapping for the
    instrument, or an unrecognised timeframe.
    """
    if not news_context or not news_context.events:
        return False
    currencies = _currencies_for(instrument)
    if not currencies:
        return False
    try:
        start = candle.time
        end   = start + _bar_seconds(candle.timeframe)
    except (ValueError, TypeError):
        return False
    for e in news_context.events:
        if e.impact in impacts and e.currency in currencies and e.scheduled_at:
            if start <= e.scheduled_at.timestamp() < end:
                return True
    return False


def news_candles(
    candles: list[Candle],
    news_context: NewsContext | None,
    instrument: str,
    impacts: tuple[NewsImpact, ...] = _DEFAULT_IMPACTS,
) -> set[int]:
    """Indices of the candles that are news candles — batch helper for scans / back-fills."""
    return {i for i, c in enumerate(candles)
            if is_news_candle(c, news_context, instrument, impacts)}
