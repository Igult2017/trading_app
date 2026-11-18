"""VIX.1 — THE FIRST CANDLE THAT ENDS A PULLBACK must qualify on his ORIGINAL momentum rule.

HIS RULE, 17 Nov 2026: *"In a pullback scenario, if we are to take trade on the first candle that ends the
pullback, it must qualify using the first qualification of a momentum candle not memory and not margin of
error."*

So that one candle must pass `is_momentum_candle` — 2.5x the 100-bar median body, big for the last ~4 months,
clean, unrejected — and NOT get in through the two allowances of 15 Sep that
`qualifies_for_trade` adds: the 0.2 margin (2.3x) and the 24-hour memory. His stomach rule is untouched: it
still applies through `qualifies_for_trade`, which the trade asks first.

"The first candle that ends the pullback" is the strategy's ONE pullback count, `vix1_retracement.since_pullback`:
the newest candle is the only candle the trade's way after a pullback of at least one candle (after == 1).

MEASURED before building (GBP/USD H1, 7 years, the strategy's own functions — counts only, not a backtest):
1,815 tradeable momentum candles were the first candle ending a pullback; 182 of them (10%) qualified only via
the margin (136) or the memory (46). Those are what this refuses. His 28 Jul EUR/USD trade is not affected.

Asked on BOTH trading routes in `vix1_bias.detect_bias` — a pullback can end on either.
"""
from __future__ import annotations

from core.types import Candle
from strategies.vix1_momentum import is_momentum_candle
from strategies.vix1_retracement import since_pullback


def ends_a_pullback(h1: list[Candle], bullish: bool) -> bool:
    after, bars = since_pullback(h1, 1 if bullish else -1)
    return after == 1 and bars >= 1


def refusal(h1: list[Candle], bullish: bool, symbol: str) -> str | None:
    """Asked about the NEWEST closed candle, the one traded. -> why it is refused, or None."""
    i = len(h1) - 1
    if i < 1 or not ends_a_pullback(h1, bullish) or is_momentum_candle(h1, i, bullish, symbol):
        return None
    return ("this candle ends a pullback, so it must be a momentum candle by his original 2.5x rule — it "
            "qualified only through the 0.2 margin or the 24-hour memory")
