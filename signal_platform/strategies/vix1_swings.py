"""
VIX.1 — HIGHS AND LOWS IN REAL TIME. No hindsight, no fixed wait.

THE READING BEING IMPLEMENTED, stated before the code so it cannot be quietly swapped later:

    A high is the highest point of the current up-leg. It becomes a CONFIRMED turning point the
    moment a candle CLOSES BELOW THE LOW of the candle that made it — price has taken out the bar
    that topped the move, so the up-leg is over. Mirrored for a low.

That is the whole rule. There is no tuned number in it.

WHAT THIS REPLACES, AND WHY IT HAD TO. `shared/swing_points.find_swing_points(candles, n)` defines a
peak as "the highest bar with nothing higher for n bars EITHER SIDE". That definition **cannot be
evaluated in real time** — it needs the future. At the trend's n=48 it means a peak is not a peak
until 48 bars have passed after it, so the trend read is permanently **a median 2.2 days behind the
chart** (measured, min 49 bars, both pairs). His rule is a real-time one:

    "When a trend starts, it has a high then a low, and if it is a real trend it will print another
     high after the first low. So when it starts printing the second high after the first low, we
     start looking for a momentum candle."

You cannot express that with a definition that answers two days late. He put it plainly:
*"Why cant we detect Highs and lows in real time by monitoring the candles in real time?"* — and the
answer is that we can; nothing about it required the wait.

HOW LATE IS THIS ONE? Only as late as the market itself. A turning point is announced on the bar
price closes through the candle that made it — which may be the very next bar, or many bars later if
the market keeps grinding. The delay is a property of the move, not a constant.

CLOSED CANDLES ONLY. A turning point is a LEVEL (the platform-wide rule), so it is read from settled
bars; callers pass the same `closed_only` list as everything else on the 1HR side. There is no live
price argument here and there must never be one.

DERIVED, NEVER STORED — replayed from the passed window on every call, like `vix1_trend`. A stored
value that went wrong once froze the trend for 873 bars.
"""
from dataclasses import dataclass

from core.types import Candle


@dataclass(frozen=True)
class Turn:
    """A confirmed turning point: where it happened, and when we could first know."""
    is_high: bool
    price: float
    index: int          # the bar that MADE the extreme
    confirmed: int      # the bar whose close proved the leg had ended — always > index


def turning_points(candles: list[Candle]) -> list[Turn]:
    """Every turning point confirmed so far, oldest first. Closed bars in, no lookahead."""
    if len(candles) < 3:
        return []

    out: list[Turn] = []
    leg = 0                     # +1 = in an up-leg (tracking a high), -1 = down-leg, 0 = unknown
    hi_i = lo_i = 0             # the bars holding the running high and running low

    for i in range(1, len(candles)):
        c = candles[i]
        if c.high > candles[hi_i].high:
            hi_i = i
        if c.low < candles[lo_i].low:
            lo_i = i

        # A LEG ENDS WHEN PRICE CLOSES THROUGH THE CANDLE THAT MADE ITS EXTREME.
        # While the leg is still unknown — the very start of the window — both tests are live and
        # whichever fires first tells us which leg we were in.
        # ONLY THE LEG WE ARE ACTUALLY IN CAN END. Without the `leg` guards the opposite test keeps
        # firing off a stale extreme: in a down-leg the old high still sits above price, so
        # "price closed below that high's low" stays true on every bar and the same high is emitted
        # again and again. Found by the mirror fixture reporting three turning points on a series
        # with one.
        ended_up = leg >= 0 and c.close < candles[hi_i].low and hi_i < i
        ended_down = leg <= 0 and c.close > candles[lo_i].high and lo_i < i
        if not (ended_up or ended_down):
            continue

        # THE FIRST ONE IS NOT A TURNING POINT — it only reveals the leg.
        #
        # At the window's first bar the same candle is trivially both the running high AND the
        # running low, so the first move in either direction "closes through" it and would emit a
        # turn where nothing turned. That is an artefact of where the window happens to start, not
        # something the market did. It is used to set the leg and then discarded; every turn emitted
        # afterwards has a real leg behind it. (Caught by the first run of test_swings.py, which
        # reported a low on bar 0 of a series that only ever went up.)
        first = leg == 0
        if ended_up:
            if not first:
                out.append(Turn(True, candles[hi_i].high, hi_i, i))
            leg = -1
            # the new leg's extreme is the lowest bar SINCE that high, not since the window began
            lo_i = min(range(hi_i, i + 1), key=lambda j: candles[j].low)
        else:
            if not first:
                out.append(Turn(False, candles[lo_i].low, lo_i, i))
            leg = 1
            hi_i = max(range(lo_i, i + 1), key=lambda j: candles[j].high)

    return out


# ONE SOURCE OF TRUTH FOR WHERE TURNING POINTS COME FROM (2026-08-12, audit fix).
#
# It used to be a private helper in `vix1_bias` that returned None for the fallback, and two things
# went wrong with that:
#   * `vix1_watch` never got the memo and kept reading the OLD lookback trend, so a resting order was
#     judged for cancellation by a reader that DISAGREED with the one that opened it — measured, on
#     56% of GBP/USD and 60% of EUR/USD momentum candles.
#   * `classify(turns or [], ...)` turned that None into an empty list, so flipping the flag off made
#     the regime UNCERTAIN forever and silently muted the strategy: 24 setups -> 0. A switch that
#     reads like a fallback and behaves like a kill switch.
#
# So the flag lives here, every consumer asks this function, and the fallback returns REAL pivots in
# the same shape — an A/B switch, not an off switch.
REALTIME = True


def structure_turns(candles: list[Candle], n: int = 48) -> list[Turn]:
    """The turning points the whole strategy reads. Never empty-by-accident.

    With `REALTIME` on, turns are marked when price closes through the candle that made the extreme.
    With it off, the n-bar lookback pivots are adapted to the same shape — knowable `n` bars after
    they print, which is exactly what that detector means.
    """
    if REALTIME:
        return turning_points(candles)
    from shared.swing_points import find_swing_points
    return [Turn(p.is_high, p.price, p.index, p.index + n)
            for p in find_swing_points(candles, n)]
