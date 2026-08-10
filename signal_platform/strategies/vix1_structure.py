"""
VIX.1 — WHERE IN THE LEG ARE WE? The rule that stops the strategy trading pullbacks.

THE USER'S RULE, 2026-08-10/11, in his words:

    "For a trend, we must at least have the first HH and then HL, then our momentum candle can come
     from after HL which means the next HH is developing after pullback. In the downtrend it is LL
     and then LH then the momentum candle shows another LL is developing. So, we don't trade
     pullbacks, we don't trade ranging markets and we are always in trend."

    "the CHOCH on the other hand tells us the trend has ended and the market is reversing so we take
     trades in the new direction after LL and LH."

So a momentum candle is only tradeable once the leg it belongs to has PROVED itself:

    UPTREND    a higher high, then a higher low (the pullback has ENDED), then the momentum candle
               — which is the proof the next higher high is developing.
    DOWNTREND  a lower low, then a lower high, then the momentum candle.

TWO SCALES, AND WHY THIS FILE IS SEPARATE FROM vix1_trend.

DIRECTION comes only from vix1_trend, on WIDE swings (n=48). This module NEVER decides direction —
it only answers "has the pullback finished?" inside a direction already fixed. That separation is not
tidiness, it is the whole point: **half of all pullbacks are COMPLEX** (measured over 12 months: 21 of
42 on GBP/USD, 17 of 37 on EUR/USD). A complex pullback prints its own lower highs and lower lows and
looks exactly like a downtrend on any fast reading. Let a fast read decide direction and the strategy
sells the pullback of a rally — which is precisely what it was doing on 10 Aug.

WHY A FASTER SWING WIDTH IS UNAVOIDABLE HERE. A swing is only confirmed once `n` bars have printed on
EACH side of it. At the trend's n=48 a higher low is known 48 bars — two days — later, by which time
price has already moved a median 92 pips and the leg is over. Measured on 12 months of GBP/USD:

    width   confirmed after   higher lows/month   price already moved
      5       5 bars               15.1                25 pips
      8       8 bars                9.7                33 pips
     12      12 bars                7.0                38 pips
     48      48 bars                1.9                92 pips   <- the trend's own width

The width is a real dial between "in time" and "certain", and it caps how many trades can exist.
"""
from dataclasses import dataclass

from core.types import Candle
from shared.swing_points import find_swing_points

# The entry-timing swing width. NOT the trend's width (48) — see the table above.
_FAST_N = 8


@dataclass
class LegState:
    """Where price sits in the current leg, and whether that permits a trade."""
    ready: bool = False
    pivot: float | None = None      # the higher low / lower high the momentum candle must follow
    pivot_index: int | None = None
    why: str = ""


def leg_state(candles: list[Candle], direction: int, n: int = _FAST_N) -> LegState:
    """Has this trend printed its pair, and is the pullback over?

    `direction` MUST come from vix1_trend — this function never infers it. Returns not-ready with a
    stated reason rather than a bare False, because a refusal nobody can explain is how the last
    round of defects survived so long.
    """
    if direction == 0:
        return LegState(why="no established trend — nothing may be traded")
    pts = sorted(find_swing_points(candles, n), key=lambda p: p.index)
    # Only swings CONFIRMED by the end of the window: a pivot at index j needs n bars after it.
    cutoff = len(candles) - 1 - n
    pts = [p for p in pts if p.index <= cutoff]
    highs = [p for p in pts if p.is_high]
    lows = [p for p in pts if not p.is_high]
    if len(highs) < 2 or len(lows) < 2:
        return LegState(why=f"not enough confirmed structure yet ({len(highs)} highs, {len(lows)} lows)")

    if direction == 1:
        if not highs[-1].price > highs[-2].price:
            return LegState(why="no higher high yet — the uptrend has not printed its first leg")
        if not lows[-1].price > lows[-2].price:
            return LegState(why="no higher low yet — the pullback has not made a higher low")
        # The momentum candle must come AFTER the higher low. If the newest confirmed swing is the
        # HIGH, price is on its way down from it — we are INSIDE the pullback, which is exactly what
        # he does not want traded.
        if lows[-1].index < highs[-1].index:
            return LegState(why="inside the pullback — the higher low has not formed since the high")
        return LegState(True, lows[-1].price, lows[-1].index,
                        f"HH then HL confirmed; momentum after the HL at {lows[-1].price:.5f} "
                        f"— the next HH is developing")

    if not lows[-1].price < lows[-2].price:
        return LegState(why="no lower low yet — the downtrend has not printed its first leg")
    if not highs[-1].price < highs[-2].price:
        return LegState(why="no lower high yet — the pullback has not made a lower high")
    if highs[-1].index < lows[-1].index:
        return LegState(why="inside the pullback — the lower high has not formed since the low")
    return LegState(True, highs[-1].price, highs[-1].index,
                    f"LL then LH confirmed; momentum after the LH at {highs[-1].price:.5f} "
                    f"— the next LL is developing")
