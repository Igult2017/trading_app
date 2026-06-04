"""
News filter — applied before candle data is fetched for a strategy.
Returns True if the strategy is allowed to run, False to skip this tick.

_currencies_for() handles: forex pairs, gold/silver, US/EU/UK indices, crypto.
Unknown instruments return [] — no news filtering applied (safe default).
"""

from datetime import datetime, timezone
from config.instruments import SYMBOL_TO_CURRENCIES
from core.types import NewsContext, NewsImpact, NewsStance
from core.base_strategy import BaseStrategy


def _currencies_for(instrument: str) -> list[str]:
    """
    Return the currency codes relevant to an instrument for news filtering.
    Handles forex, commodities, indices, and crypto.
    """
    # Forex pairs from the known instrument table
    known = SYMBOL_TO_CURRENCIES.get(instrument)
    if known:
        return [c for c in known if c]

    # Normalise: remove separators, uppercase
    sym = instrument.upper().replace("/", "").replace("-", "").replace("_", "")

    # ── Precious metals (all USD-denominated) ────────────────────────────────
    if sym.startswith(("XAU", "XAG", "XPT", "XPD")):
        return ["USD"]

    # ── Energy commodities ───────────────────────────────────────────────────
    if any(x in sym for x in ("OIL", "WTI", "BRENT", "NGAS", "USOIL", "UKOIL")):
        return ["USD"]

    # ── US indices → USD ─────────────────────────────────────────────────────
    if any(x in sym for x in ("US500", "US100", "US30", "SPX", "NDX", "DJI",
                               "RUT", "VIX", "SP500", "NASDAQ", "DOW",
                               "RUSSELL")):
        return ["USD"]

    # ── UK index → GBP ───────────────────────────────────────────────────────
    if any(x in sym for x in ("UK100", "FTSE", "UK200")):
        return ["GBP"]

    # ── EU/German indices → EUR ──────────────────────────────────────────────
    if any(x in sym for x in ("GER40", "GER30", "DAX", "EU50", "STOXX")):
        return ["EUR"]

    # ── Japanese index → JPY ─────────────────────────────────────────────────
    if any(x in sym for x in ("JP225", "NIKKEI")):
        return ["JPY"]

    # ── Crypto (BTCUSD, ETHUSD, BTC/USDT etc.) → USD ────────────────────────
    if sym.endswith(("USDT", "USD", "USDC")):
        return ["USD"]
    if sym.endswith("BTC"):
        return ["USD"]   # BTC-denominated crypto — still USD-correlated

    # ── Generic 6-char forex-like pair (e.g. EURUSD not in mapping) ──────────
    if len(sym) == 6 and sym.isalpha():
        return [sym[:3], sym[3:]]

    # ── Unknown — no currency mapping, news filter will not block ────────────
    return []


def _in_window(event, pre_mins: int, post_mins: int, now: datetime) -> bool:
    delta_mins = (event.scheduled_at - now).total_seconds() / 60
    return -post_mins <= delta_mins <= pre_mins


def check(strategy: BaseStrategy,
          news_context: NewsContext,
          instrument: str,
          now: datetime | None = None) -> bool:
    """
    Returns True  → strategy may run this tick.
    Returns False → skip (news stance condition not met).
    """
    if strategy.news_stance == NewsStance.NEWS_AGNOSTIC:
        return True

    now = now or datetime.now(timezone.utc)
    currencies = _currencies_for(instrument)

    # No currencies resolved → can't match any news events → safe to trade
    if not currencies:
        return strategy.news_stance != NewsStance.REQUIRE_NEWS

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
