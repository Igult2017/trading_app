"""
VIX.1 — HOW FAR BACK HAS PRICE COME, AND FOR HOW LONG? The retracement, counted in real time.

HIS RULE, 2026-08-11: *"A pullback can be from 1 candle or more so it should count candles... After a
rally we start counting retracement candles and if a momentum candle comes after them we trade."*

WHY THIS EXISTS. The 1HR had no notion of a retracement's LENGTH at all. It asked one question — are
the last two swing highs and the last two swing lows (8 bars either side) both moving against the
trend — and that instrument is wrong for the job in three ways, all measured over 12 months of real
H1 on both pairs:

  * it is 8 HOURS LATE by construction. A turn needs 8 bars after it before it can be confirmed.
  * it is BLIND TO SHORT RETRACEMENTS. 99% of retracements run under 8 candles (48% are a single
    candle, 26% are two), so it never sees the ones he actually means.
  * it fires on the WRONG SIZE of move. It refuses at a median 58 pips / 43 bars and allows at
    19 pips / 14 bars — it is catching two-day counter-legs, not pullbacks. Counter candles
    immediately before the momentum candle: 0 when it allows, 1 when it refuses. No signal at all.

This module answers the question directly and with no delay: from the trend's best CLOSED price,
count the bars and measure the distance.

LENGTH NEVER DISQUALIFIES ANYTHING — his instruction, and he is right. A 12-candle retracement inside
an intact trend is healthy; a 5-candle one that breaks structure is not, and counting cannot tell
them apart. So this module DECIDES NOTHING. It reports. The reversal reader (vix1_trend) and the
range reader (vix1_regime) are what disqualify, and they work with these numbers rather than being
replaced by them.

AS OF PHASE A THIS GATES NOTHING AT ALL — the numbers go on the card and in the log so their real
values can be seen on real signals before any threshold is chosen. Choosing one from a year of two
pairs is how two earlier "improvements" looked right on the day and were worse over four years.

CLOSED CANDLES ONLY. The extreme is a LEVEL, and a level read from the still-forming bar drifts every
tick (the platform-wide rule). Callers pass the same `closed_only` list the rest of the 1HR side
uses; there is no live-price argument here and there must never be one.

TWO NUMBERS, BECAUSE THERE ARE TWO QUESTIONS — and conflating them is the mistake this module was
built to fix, so it must not repeat it one level down.

  bars       THE RETRACEMENT HE MEANS. The run of candles right now that are not carrying the trend
             on. "After a rally we start counting retracement candles." Typically 1-3 (48% of all
             retracements are a single candle, 26% are two). It resets when a candle goes the
             trend's way, which is exactly how the 1M side has always read one.
  stall_bars HOW LONG SINCE THE TREND LAST MADE PROGRESS — candles since its own extreme. A
             different fact entirely, and NOT a retracement: a trend that has not made a new high in
             156 candles has stalled, and whether that is a range or a reversal is answered by
             vix1_regime and vix1_trend, not here.

MEASURED, AND THIS IS WHY BOTH ARE CARRIED (2026-08-11). The first version of this module reported
only the second and called it "the retracement". Over 12 months the median came out at 156 candles —
which is a true statement about the trend and a useless answer to "how many candles is this
pullback". The distance from the extreme is still worth showing; it just is not what he asked to be
counted.
"""
from dataclasses import dataclass

from core.types import Candle
from shared.candle_math import atr, is_bearish, is_bullish

_ATR_N = 14


@dataclass(frozen=True)
class Retracement:
    """The pullback the latest candle came after, and — separately — how long the trend has gone
    without making progress."""
    active: bool = False        # did the latest candle follow a retracement at all?
    bars: int = 0               # HIS COUNT: how many candles that retracement ran for
    stall_bars: int = 0         # candles since the trend last made a new extreme (a different fact)
    pips: float = 0.0           # how far back from that extreme, in price
    atr: float = 0.0            # ...and the same distance as a multiple of ATR(14)
    extreme: float | None = None
    extreme_index: int | None = None

    def describe(self, pip: float) -> str:
        """One line for the card and the log. Decimals ON PURPOSE — `vix1_log.shape` collapses
        decimals but keeps integers, so only the BAR COUNTS changing mark the line as new. That is
        the intent: one line an hour per instrument, not one per 60-second scan."""
        n = self.bars
        head = (f"came after a retracement of {n} candle{'s' if n != 1 else ''}" if self.active
                else "no retracement before this candle")
        return (f"{head}; {self.pips / pip:.1f} pips ({self.atr:.2f}x ATR) below the trend extreme, "
                f"which is {self.stall_bars} candles old")


def running_now(candles: list[Candle], direction: int) -> int:
    """Is a retracement running RIGHT NOW? The count of candles at the END going against the trend.

    A DIFFERENT QUESTION FROM `measure`, and the difference is the step-over. `measure` answers "did
    the momentum candle come AFTER a retracement" — a question about that candle — so it steps over
    the candle itself. This asks "is price pulling back at this moment", which is a question about
    the present, so nothing is stepped over: if the newest closed candle is going against the trend,
    a retracement is running.

    HIS RULE, and it needs NO threshold (2026-08-19): *"I thought we were tracing pullback in real
    time. I thought the challenge would only be complex pullback not a simple swing."* He was right
    — a simple swing is just "the last candles went the other way", and asking for a depth number to
    see that was over-engineering on my part.

    ITS LIMIT, MEASURED AND STATED RATHER THAN HIDDEN: a single trend-way candle INSIDE a pullback
    resets this to 0. On the 19 Aug gold bounce it correctly refused at +1 and +2 candles, then read
    0 at the next bar while price was still $22 above the low. That is exactly the COMPLEX pullback
    he named, and this count does not solve it. Nothing threshold-free found so far does.
    """
    if direction == 0 or not candles:
        return 0
    trend_way = is_bullish if direction == 1 else is_bearish
    n, i = 0, len(candles) - 1
    while i >= 0 and not trend_way(candles[i]):
        n += 1
        i -= 1
    return n


def measure(candles: list[Candle], direction: int, since: int | None = None) -> Retracement:
    """Measure the live retracement. `candles` must be CLOSED bars; `direction` +1 up / -1 down.

    `since` is the bar the trend's current direction was established on (`TrendState.direction_since`)
    — the extreme is the best price the trend has managed FROM THERE, not from the start of whatever
    window happened to be passed in. Falls back to the whole list when it is unknown, which is only
    the case before a direction exists.

    `bars` counts back from the LAST candle while each one fails to carry the trend on, and stops at
    the first that does — a doji counts as part of the retracement, the same reading `vix1_pullback`
    uses on the 1M. `stall_bars` counts from the trend's own extreme instead, and answers a
    different question; see the module docstring for why both are here.
    """
    if direction == 0 or not candles:
        return Retracement()
    start = 0 if since is None else max(0, min(since, len(candles) - 1))
    seg = candles[start:]
    if not seg:
        return Retracement()

    up = direction == 1
    # The extreme is the FIRST bar to reach the best price, not the last. A flat top printed over
    # three bars stopped making progress at the first of them; taking the last would under-count.
    best = max(c.high for c in seg) if up else min(c.low for c in seg)
    off = next(i for i, c in enumerate(seg) if (c.high if up else c.low) == best)

    # HIS COUNT — the retracement the LAST CANDLE CAME AFTER. Walk back while price is not carrying
    # the trend on, having first stepped over the last candle if it IS carrying it on.
    #
    # THAT STEP IS THE WHOLE POINT AND IT WAS MISSING (found by measuring, 2026-08-11). Callers pass
    # a window ending at the momentum candle, and a momentum candle by definition goes the trend's
    # way — so a walk-back straight from the end hit it immediately and reported 0 at every single
    # setup, on both pairs, 100% of the time. His rule is "a momentum candle comes AFTER a
    # retracement", so the candle itself is stepped over and the run behind it is what is counted.
    #
    # Only ONE candle is stepped over. Two or more trend-way candles before the end means this
    # candle followed a rally, not a retracement, and 0 is the correct and honest answer.
    trend_way = (lambda c: is_bullish(c)) if up else (lambda c: is_bearish(c))
    i = len(candles) - 1
    if trend_way(candles[i]):
        i -= 1
    bars = 0
    while i >= 0 and not trend_way(candles[i]):
        bars += 1
        i -= 1

    # NON-NEGATIVE BY CONSTRUCTION, so there is no clamp here. `seg` always contains the last
    # candle, so on an uptrend best >= that candle's high >= its close, and the mirror holds on a
    # downtrend. A `max(0.0, ...)` guard sat here until it was broken on purpose and every test
    # still passed — the sign of a branch that can never run.
    last = candles[-1].close
    depth = (best - last) if up else (last - best)
    a = atr(candles, _ATR_N)
    return Retracement(active=bars > 0, bars=bars, stall_bars=len(seg) - 1 - off, pips=depth,
                       atr=(depth / a if a > 0 else 0.0),
                       extreme=best, extreme_index=start + off)
