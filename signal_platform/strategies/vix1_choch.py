"""
VIX.1 — THE CHANGE-OF-CHARACTER ROUTE: a break AGAINST a trend, traded on momentum, no swings needed.

HIS RULES, 23 Nov 2026 (they replace the 14 Sep switch-off, the 29 Sep candle count and the 20 Sep void-only
exception — all of which made a change of character wait for swings that arrive after the momentum has died):

    "There is a rule that when the first candle that causes CHOCH is a qualifying momentum candle we take trade
     if not we wait."
    "in a CHOCH we dont need those swings because by the time we get the swings the momentum has died."
    "that first candle that caused CHOCH or breakout must qualify by standard not by memory or margin of error"
    "I clearly said the first candle." — candles after it qualify the normal way.
    "We wait for a momentum candle. It can come before pullback or after a pullback."

So, while a turn is proposed (`TrendState.pending`):
    the breaking candle is a momentum candle BY STANDARD (2.5x on its own, no memory, no margin) and passes the
    stomach rule -> trade it now;
    otherwise the newest closed candle after the break that qualifies the NORMAL way (`qualifies_for_trade`) ->
    trade it. The same choice as a breakout from a ranging band (`vix1_breakout.pick`) — one rule, one function.

THIS ROUTE IS FOR A BREAK OUT OF A TREND. A break out of a RANGING market is a breakout from his band and belongs to
`vix1_breakout` (the trend engine marks it, `TrendState.breakout`), so the old refusal "out of a RANGE or CHOP we
don't trade" (his 15 Aug answer) is gone from here: that case is now traded — by the breakout rule.

HISTORY (git holds the code): first built 15 Aug on his EUR/USD 28 Jul 17:00 BUY; a turn down lost the shortcut
25 Aug, a turn up 14 Sep; a void-break exception 20 Sep; a 3-candle wait 29 Sep, replaced by the break-candle rule
19 Nov. The chaotic-move check has never been asked here (his option A, 17 Nov) and is information-only since 18 Nov.

NOTHING IS RE-DETECTED HERE. The break, its price and its bar come from `vix1_trend.TrendState`.
"""
from core.types import Candle
from shared.candle_math import atr
from strategies import vix1_breakout, vix1_regime
from strategies.vix1_state import Bias, market_state
from strategies.vix1_swings import structure_turns
from strategies.vix1_trend import TrendState

ORIGIN = "choch"


def choch_entry(window: list[Candle], h1: list[Candle], tstate: TrendState, n: int,
                symbol: str) -> tuple[Bias | None, str]:
    """His change-of-character route. Returns (Bias or None, the reason either way). `window` is the trend window
    (the tail of `h1`); `tstate` was computed from it by the caller."""
    if tstate.pending == 0 or tstate.choch_index is None:
        return None, "no change of character is pending"
    if tstate.breakout:
        return None, "a breakout from a ranging band — the breakout rule decides it"
    bullish = tstate.pending == 1
    way = "up" if bullish else "down"
    broke = tstate.choch_price
    bi = tstate.choch_index + (len(h1) - len(window))          # the breaking candle, in h1
    mc, why = vix1_breakout.pick(h1, bi, 1 if bullish else -1, symbol, what="change of character")
    if mc is None:
        return None, f"change of character {way} at {broke:.5f} — {why}"
    before = window[:tstate.choch_index]
    regime = (vix1_regime.classify(structure_turns(before, n), atr(before, 14)) if len(before) > 20
              else vix1_regime.Regime())
    ret, eff, _ = market_state(window, tstate, symbol)
    reason = f"change of character {way}: price closed through {broke:.5f} — {why}; no swings needed (his rule)"
    return Bias(bullish, mc, ORIGIN, 1, reason, ret, eff, regime), reason
