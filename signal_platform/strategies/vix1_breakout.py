"""VIX.1 — A BREAKOUT FROM A RANGING MARKET'S BAND (his rules, 23 Nov 2026; `docs/strategies/vix1.md`).

What prompted it: GBP/USD 23 Nov. The market ranged in his band (1.30755-1.31289), broke out DOWN with momentum
(14:00 UTC, a 22-pip SELL momentum candle, then −110 pips) and autotrade took nothing until he marked it by hand.

HIS RULES, in his words:
  * *"In a breakout scenario we only needed momentum candle not Highs and lows or lows and highs like we would a
    trend."* — no trend, no swings, no market-state gate here.
  * *"that first candle that caused CHOCH or breakout must qualify by standard not by memory or margin of error"* —
    and the stomach rule *"must apply here"*. *"I clearly said the first candle"*: candles after it qualify the
    normal way (`qualifies_for_trade` — standard, margin or memory, + stomach).
  * *"We wait for a momentum candle. It can come before pullback or after a pullback."*
  * *"if the breakout fails and price goes back inside the band, we wait for another breakout"* — and the band is
    stretched on that side (`vix1_trend`, `TrendState.stretched`); *"if price breaks out on the opposite side of the
    failed breakout, we take trade without waiting if we have a momentum candle."*
  * *"A breakout that establishes a trend or a move breaking BOS or CHOCH is not a failed breakout"* and from then on
    *"we have other rules"* — so this route stands down the moment the breakout has proven itself with candles AFTER
    the breakout candle, and the trend route owns it.

ONLY OUT OF A RANGING MARKET (`vix1_regime.ranging` — his "a ranging market does not make HH and HL or LL and LH").
*"A momentous move in a trend is just a continuation of an existing trend"* — that is the trend route, unchanged.

THE BAND is his 21 Sep two lines (`vix1_chop`, on the bodies). Nothing here re-detects structure: the lines, the
proposed turn and the failed-breakout memory all come from `vix1_trend.TrendState`.
"""
from __future__ import annotations

from core.types import Candle
from shared.candle_math import atr
from strategies import vix1_chop, vix1_open_rule, vix1_regime
from strategies.vix1_momentum import is_momentum_candle, qualifies_for_trade
from strategies.vix1_state import Bias, market_state
from strategies.vix1_swings import structure_turns
from strategies.vix1_trend import trend_state

ORIGIN = "breakout"


def _band(tstate) -> tuple[float, float] | None:
    """The band's two lines at wick level: the band an unproven breakout LEFT, or the current one."""
    if tstate.breakout and tstate.pending and tstate.breakout_level is not None and tstate.bos_price is not None:
        return tstate.bos_price, tstate.breakout_level
    if tstate.direction != 0 and tstate.protected is not None and tstate.bos_price is not None:
        return tstate.bos_price, tstate.protected
    return None


def find(h1: list[Candle], window: list[Candle], tstate, n: int) -> tuple[int, int] | None:
    """(h1 index of the breakout candle, +1 up / -1 down) for a breakout out of a RANGING band still in play, or None
    (price inside the band, no band, not a ranging market, or the breakout has already proven itself)."""
    band = _band(tstate)
    lines = vix1_chop.body_lines(h1, *band, tstate.stretched) if band else None
    if lines is None:
        return None
    bottom, top = lines
    last = h1[-1].close
    side = 1 if last > top else -1 if last < bottom else 0
    if side == 0:
        return None
    bi = len(h1) - 1
    while bi > 0 and ((h1[bi - 1].close > top) if side == 1 else (h1[bi - 1].close < bottom)):
        bi -= 1                                       # back to the first close outside, on this side
    off = len(h1) - len(window)
    if tstate.breakout and tstate.pending:            # the trend engine judged this one when it happened
        if tstate.breakout != side:
            return None
        return max(bi, tstate.breakout_index + off), side
    # PROVEN ALREADY? a break of structure AFTER the breakout candle, the breakout's way -> the trend route owns it.
    if tstate.direction == side and tstate.bos_index is not None and tstate.bos_index + off > bi:
        return None
    # RANGING BEFORE THE BREAK — on the candles up to the one BEFORE the breakout candle, exactly as the trend engine
    # reads it (same turning points, same rule): the breakout candle can confirm a turning point of its own and make
    # the range it is leaving look like a trend.
    w = h1[max(0, bi - len(window)):bi]
    st = trend_state(w, n=n, turns=structure_turns(w, n))
    if not vix1_regime.ranging(st.highs, st.lows):
        return None
    return bi, side


def pick(h1: list[Candle], bi: int, side: int, symbol: str, what: str = "breakout") -> tuple[int | None, str]:
    """The candle that trades, for a breakout from the band AND a change of character (one rule, his): the FIRST
    candle (`bi`) if it qualifies BY STANDARD + the stomach rule; else the newest closed candle after it that
    qualifies the NORMAL way (`qualifies_for_trade` — standard, margin or memory, + stomach). (index or None, why)."""
    bullish, i = side == 1, len(h1) - 1
    way = "up" if bullish else "down"
    if i == bi:
        if is_momentum_candle(h1, i, bullish, symbol) and vix1_open_rule.verdict(h1, i, bullish)[0]:
            return i, f"the {what} candle itself is a momentum candle {way} by standard and passes the stomach rule"
        return None, (f"the {what} candle is not a momentum candle {way} by standard (+ stomach rule) — waiting "
                      f"for a momentum candle {way}")
    if i > bi and qualifies_for_trade(h1, i, bullish, symbol):
        return i, f"a momentum candle {way} after the {what}"
    return None, f"after the {what} — waiting for a momentum candle {way}"


def entry(h1: list[Candle], window: list[Candle], tstate, n: int, symbol: str,
          news=None) -> tuple[Bias | None, str | None]:
    """(Bias, why) to trade · (None, why) a breakout is in play but nothing trades yet · (None, None) not this
    route's business — the other routes decide, unchanged."""
    got = find(h1, window, tstate, n)
    if got is None:
        return None, None
    bi, side = got
    bullish = side == 1
    mc, why = pick(h1, bi, side, symbol)
    if mc is None:
        return None, why
    from strategies import vix1_void                   # same veto the trend route asks (`vix1_bias`)
    band = _band(tstate)
    guard = min(band) if bullish else max(band)        # the band's far line protects the breakout
    veto = vix1_void.not_filling(window, guard, bullish, symbol, news=news)
    if veto:
        return None, veto
    before = h1[max(0, bi - len(window)):bi]
    regime = vix1_regime.classify(structure_turns(before, n), atr(before, 14)) if len(before) > 20 \
        else vix1_regime.Regime()
    ret, eff, _ = market_state(window, tstate, symbol)
    reason = (f"breakout {'up' if bullish else 'down'} from a ranging band — {why}"
              + (f" (the band was stretched to {tstate.stretched:.5f} by a failed breakout)"
                 if tstate.stretched else ""))
    return Bias(bullish, mc, ORIGIN, 1, reason, ret, eff, regime), reason
