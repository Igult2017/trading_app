"""PIX — is the 4H trending? +1 up, -1 down, 0 ranging. READ FROM CLOSED 4H CANDLES ONLY. PIX's OWN reader.

His skeleton (18 Nov 2026): *"In 4 hours, we want to confirm if we are trending or not. If we are trending, we look for
zones in the direction of the trend not against."* The 1H does not vote: *"The whole point is not to go against 4H
trend."* A 1H move against the 4H is the pullback that brings price back to the zone, which is the trade.

COPIED, NOT SHARED (his rule, 18 Nov: *"copy the code which is different from saying let them share a code"*): this is
PIX's own copy of the structure read, so a fault in another strategy's reader cannot reach PIX. It carries the fix he
ordered for every strategy the same day — an equal high/low counts for neither side, and a trend needs its side's
labels to lead by at least `MIN_LEAD` — so on one flat range it reads RANGING wherever the window ends.

Over the last `LOOKBACK` closed 4H candles: swing points (`SWING_N` each side), labelled; UP when higher highs + higher
lows outnumber lower highs + lower lows by `MIN_LEAD` or more (and number at least 2), DOWN the mirror, else RANGING.
"""
from core.types import Candle
from strategies.pix_candles import closed_only
from strategies.pix_swings import find_swings, label_swings

LOOKBACK = 50
SWING_N  = 3
MIN_LEAD = 2


def regime(h4: list[Candle]) -> int:
    sample = closed_only(h4)[-LOOKBACK:]
    if len(sample) < 10:
        return 0
    labels = [lab for lab, _ in label_swings(find_swings(sample, SWING_N))]
    bull = labels.count("HH") + labels.count("HL")
    bear = labels.count("LH") + labels.count("LL")
    if bull - bear >= MIN_LEAD and bull >= 2:
        return 1
    if bear - bull >= MIN_LEAD and bear >= 2:
        return -1
    return 0


def direction(h4: list[Candle], h1: list[Candle]) -> tuple[int, str]:
    """THE DIRECTION PIX TRADES (his rule, 18 Nov 2026): *"4H is mainly for trend and we can also use 1H for trend
    because trend starts in lower TF. We only dont go against trend."*

    4H trending → its direction (a 1H move against it is a pullback, not a new trend). 4H ranging and the 1H trending →
    the 1H's direction. Both ranging → 0. Returns (direction, which timeframe set it: "4H" / "1H" / "").
    """
    t4 = regime(h4)
    if t4:
        return t4, "4H"
    t1 = regime(h1)
    return (t1, "1H") if t1 else (0, "")
