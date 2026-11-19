"""VIX.1 — THE CANDLE THAT BREAKS a change of character or a break of structure must qualify ON ITS OWN.

HIS RULE, 19 Nov 2026 (replacing his 29 Sep "with no pullback the trade comes from the 3rd candle after the break"):
*"Remove that rule. And replace with the candle that breaks CHOCH or BOS to be a qualifying volume candle that
qualifies on its own not by memory or error margin."*

What prompted it: EUR/USD 19 Nov, the 07:00 UTC 1H candle (his 10:00) broke the change of character at 1.09805 as a
15-pip momentum candle and "passed everything; held only by the candle count". The 3rd candle was small, so the trade
came three hours later, near the top, and was cancelled before filling.

So, when NOTHING has pulled back since the break, the break candle itself must pass `is_momentum_candle` — 2.5x the
100-bar median body, big for the last ~4 months, held its move — and NOT get in through the 15 Sep allowances that
`qualifies_for_trade` adds (the 0.2 margin = 2.3x, the 24-hour memory). It is the same strict test as his 17 Nov
pullback-end rule (`vix1_pullback_end`). If it passes, the setup may trade at once; if not, that break is not traded on
the no-pullback path. After a pullback this does not apply — the pullback rules (`vix1_retracement.entry_timing`) decide.

Asked where the 3-candle wait was asked: the change-of-character route (`vix1_choch`), the trend route's break of
structure (`vix1_bias`) and the pre-close heads-up (`vix1_preclose`), so they cannot disagree.
"""
from __future__ import annotations

from core.types import Candle
from strategies.vix1_momentum import is_momentum_candle
from strategies.vix1_retracement import since_pullback


def refusal(candles: list[Candle], h1: list[Candle], break_time: int | None, bullish: bool,
            symbol: str) -> str | None:
    """Why the setup may not trade on the no-pullback path, or None.

    `candles` is the window the pullback is counted in (as the old count used); `h1` the full 1H history, so the
    break candle's 100-bar and ~4-month yardsticks are complete. The break is found by its BAR TIME in each (indexes
    differ between the windows). A break not found is not refused — the same as the old count, which degraded to the
    pullback rules when it could not place the break."""
    if break_time is None:
        return None
    bi = next((k for k, c in enumerate(candles) if c.time == break_time), None)
    if bi is None:
        return None
    _, bars = since_pullback(candles[bi:], 1 if bullish else -1)
    if bars:
        return None                       # price pulled back since the break: the pullback rules decide
    hi = next((k for k, c in enumerate(h1) if c.time == break_time), None)
    if hi is None or is_momentum_candle(h1, hi, bullish, symbol):
        return None
    return ("the candle that made the break is not a momentum candle on its own — with no pullback since the break, "
            "his rule needs the break candle itself to qualify by the original 2.5x (not the 0.2 margin, not the "
            "24-hour memory)")
