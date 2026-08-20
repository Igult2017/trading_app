"""
VIX.1 — THE CROSS, and the level the stop order rests at.

His words, 2026-08-20:

    "The whole point is that the price crosses the 1HR candle close line when we are in 1M entry.
     Then immediately after that cross, the price pulls back. Since we are using stop orders, we
     leave space on the predicted path of the price and also expect the price to pullback and never
     fill us. So if the price finishes pullback and fills us we are fine. And if it goes the pullback
     direction without filling us we are safe too. However, in some cases the price tend to be
     volatile so it would just knock us and then goes the pullback direction. In that case, we are
     out and wait for the next trade."

WHAT A CROSS IS — his answer, same day: *"going past 1HR candle closing line marked in 1HR by one 1M
candle or more. At least one 1M candle has to close past it."* A CLOSE, not a touch. The test it
replaces (`vix1_pullback.traded_past`) asked whether any WICK had traded past, which a single spike
satisfies.

THE LEVEL, MEASURED FROM HIS OWN TRADE rather than described. EUR/USD, 5 Aug 2019 (his screenshots),
against real broker bars — the 10:00 H1 candle closed at 1.11705, so that is the line:

    11:05  high 1.11689  close 1.11687   below the line
    11:06  high 1.11716  close 1.11716   <- CROSSES (first close past it)
    11:07  high 1.11733  close 1.11726   <- one candle later, still going up
    11:08  high 1.11725  close 1.11716   <- pulls back; his screenshot is taken here
    11:11  high 1.11735                  <- comes back through and FILLS

**His order sat at 1.11734. The furthest price had reached was 1.11733.** One tick beyond it.

SO THE RULE IS: the order rests one tick beyond the furthest point price reached between the cross
candle and the ONE candle after it. Not beyond the pullback candle, not beyond a swing or a fractal —
the 1M does no analysis at all. He was explicit: *"Everything has been settled in 1HR, in 1 min we
are only looking for entries."*

ONE CANDLE, THEN WE DECIDE — his answer to "what marks the spot": *"just 1 candle after price
crossing 1HR line."* If that candle is a pullback, the order is anchored exactly as he draws it. If
it is NOT, we do not stand aside:

    "A valid setup is not skipped because there is no pullback. If there is no pullback where we
     expect it, we assume it is there and enter but report that in the signal."

Which is why his own EUR/USD example is an ASSUMED one: 11:07 carried on up instead of turning, so
the level came from it — and the pullback then arrived a candle later anyway and filled him.
"""
from typing import NamedTuple

from core.types import Candle
from shared.candle_math import avg_body
from strategies.vix1_pullback import is_pullback_candle

# Candles to wait after the cross before the level is fixed. HIS NUMBER, not a tuning knob:
# *"just 1 candle after price crossing 1HR line."*
AFTER = 1

# The 1M baseline every derived size in this strategy is measured against.
_AVG_N = 14


class Cross(NamedTuple):
    """What the 1M has to say. `entry` is the order price; everything else explains it."""
    entry: float
    pullback: Candle | None    # the candle after the cross, when it IS a pullback
    seen: bool                 # False = no pullback formed, the level is ASSUMED
    cross_idx: int             # index into the closed window of the candle that crossed
    reach: float               # the furthest price got — the entry before the tick is added


def cross_index(wcl: list[Candle], bullish: bool, line: float) -> int | None:
    """Index of the FIRST closed 1M candle that CLOSED past the line, or None.

    CLOSED BARS ONLY (the platform's levels-closed rule): this sets a level, and the forming bar's
    close is just the live price — a spike that later closes back inside must not count as a cross.
    """
    for i, c in enumerate(wcl):
        if (c.close > line) if bullish else (c.close < line):
            return i
    return None


def reach(wcl: list[Candle], lo: int, hi: int, bullish: bool) -> float:
    """The furthest price got between two indices inclusive — the high on a buy, the low on a sell."""
    seg = wcl[lo:hi + 1]
    return max(c.high for c in seg) if bullish else min(c.low for c in seg)


def tick(pip: float) -> float:
    """One tick — a tenth of a pip.

    Measured at exactly this on his EUR/USD trade (reach 1.11733 -> order 1.11734). Expressed as a
    fraction of the pip so it means the same thing on a 5-digit pair and on gold, rather than being
    a hardcoded 0.00001 that would be a hundredth of the intended size on XAU.
    """
    return pip / 10.0


def decide(wcl: list[Candle], bullish: bool, line: float, pip: float) -> Cross | None:
    """The order level once the cross is `AFTER` candles old. None while there is not enough yet.

    A WHIPSAW IS NOT A PULLBACK, and that is his rule kept intact (`is_pullback_candle`): an
    abnormally wide bar whose body settles nowhere is chop. Such a candle counts as "no pullback", so
    the setup becomes an ASSUMED one rather than being anchored on chop — which is the same outcome
    the old code reached by standing aside, except that his rule says a valid setup is never skipped
    for want of a pullback.
    """
    ci = cross_index(wcl, bullish, line)
    if ci is None or len(wcl) < ci + AFTER + 1:
        return None
    nxt = wcl[ci + AFTER]
    seen = is_pullback_candle(nxt, bullish, avg_body(wcl, n=_AVG_N))
    far = reach(wcl, ci, ci + AFTER, bullish)
    # ONE TICK BEYOND, so a retest of the same high does not fill us — only a genuine break of it.
    entry = far + tick(pip) if bullish else far - tick(pip)
    return Cross(entry=entry, pullback=(nxt if seen else None), seen=seen, cross_idx=ci, reach=far)
