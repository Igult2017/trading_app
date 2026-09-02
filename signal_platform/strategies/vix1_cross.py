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

# HOW LONG WE LOOK FOR THE PULLBACK BEFORE CHANGING TACK. His numbers, 2026-09-02: *"we can enter at
# 1-3 candles, past that we wait for price to come back to the line then we enter before it
# reverses... if it does not come back to a good level near the line we dont enter."*
#
# THIS REPLACES `AFTER = 1`, and the measurement is why. A pullback candle appeared within 20 candles
# of the cross in **100.0%** of 13,188 EUR/USD crosses and 1,916 XAU/USD crosses — never once absent,
# exactly as he said (*"when 1 1HR candle closes, the price pulls back to start a new 1HR candle"*).
# But only **45.7%** had arrived by candle 1. So the old "PULLBACK ASSUMED" entry was never a missing
# pullback; it was asking too early and then ordering wherever price had run to. That chase is the
# worst bucket in every measurement: entering closest to the line wins 27.4% / 26.6% / 25.0% on
# EUR/USD, GBP/USD and gold against ~33% for the good band.
PB_WINDOW = 3

# How long we then wait for price to come back to the line before giving up on the setup entirely.
# Price returns within 20 candles 79% of the time on EUR/USD and 82% on gold; the rest are setups
# that ran away, and his rule for those is that we do not chase them.
RETURN_WINDOW = 20

# The 1M baseline every derived size in this strategy is measured against.
_AVG_N = 14


class Cross(NamedTuple):
    """What the 1M has to say. `entry` is the order price; everything else explains it."""
    entry: float
    pullback: Candle | None    # the candle the level was taken from — the pullback, or the return bar
    seen: bool                 # True = a pullback candle formed inside PB_WINDOW
    cross_idx: int             # index into the closed window of the candle that crossed
    reach: float               # the furthest price got — the entry before the tick is added
    returned: bool = False     # True = the level came from price COMING BACK to the line


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


def decide(wcl: list[Candle], bullish: bool, line: float, pip: float,
           spread: float = 0.0) -> Cross | None:
    """The order level once the cross is `AFTER` candles old. None while there is not enough yet.

    A WHIPSAW IS NOT A PULLBACK, and that is his rule kept intact (`is_pullback_candle`): an
    abnormally wide bar whose body settles nowhere is chop. Such a candle counts as "no pullback", so
    the setup becomes an ASSUMED one rather than being anchored on chop — which is the same outcome
    the old code reached by standing aside, except that his rule says a valid setup is never skipped
    for want of a pullback.

    THE SPREAD IS ADDED ON A BUY AND NOT ON A SELL, and the asymmetry is the broker's, not a
    preference. cTrader triggers a BUY stop on the ASK; candles are BID. An order at `bid_high + tick`
    therefore fires when the ask reaches it — i.e. when the real (bid) price is still a whole spread
    BELOW the high it was supposed to break. Adding the spread makes the trigger mean what it says:

        bid must exceed `far` + tick   <=>   ask must exceed `far` + spread + tick

    A SELL stop triggers on the BID, the same frame the candles are in, so it needs nothing. Measured
    2026-08-20: EUR/USD 1.20 pips, GBP/USD 1.20-1.30, XAU/USD $0.24 — against a median VIX.1 stop of
    3.7 pips on EUR/USD, so on buys this was a third of the risk given away silently.

    `spread=0.0` reproduces the pre-spread behaviour exactly, which is what the fixture of his own
    5 Aug 2019 trade is asserted at — if that stops returning 1.11734, something other than the
    spread has moved.
    """
    ci = cross_index(wcl, bullish, line)
    if ci is None or len(wcl) < ci + 2:
        return None
    avg = avg_body(wcl, n=_AVG_N)
    sp = max(0.0, spread or 0.0)
    last = len(wcl) - 1

    def order(far: float, bar: Candle | None, seen: bool, returned: bool) -> Cross:
        # ONE TICK BEYOND, so a retest of the same high does not fill us — only a genuine break of it.
        e = far + sp + tick(pip) if bullish else far - tick(pip)
        return Cross(entry=e, pullback=bar, seen=seen, cross_idx=ci, reach=far, returned=returned)

    # ── 1) THE PULLBACK, within PB_WINDOW candles of the cross ──────────────
    # The FIRST one wins; the level is one tick beyond how far price got across the cross and it,
    # which is his own rule and the shape his 5 Aug 2019 trade takes (its pullback landed on the
    # candle right after the cross, so that trade is untouched by any of this).
    for k in range(1, PB_WINDOW + 1):
        if ci + k > last:
            return None                       # not enough candles yet — wait, do not assume
        if is_pullback_candle(wcl[ci + k], bullish, avg):
            return order(reach(wcl, ci, ci + k, bullish), wcl[ci + k], True, False)

    # ── 2) NO PULLBACK BY CANDLE 3 — WAIT FOR PRICE TO COME BACK TO THE LINE ─
    # His rule: *"we wait for price to come back to the line then we enter before it reverses so that
    # it can fill us when it reverses"*. The order is placed one tick beyond the bar that touched the
    # line, so it rests just above it — near the line, which is where he wants the entry, and which
    # is what makes the stop small.
    #
    # THIS IS ALSO THE FIX FOR THE FRACTAL ROUTE. There, price is by definition on the WRONG side of
    # the line, so it has already come back through — and the old code still took its level from
    # `reach(ci, ci+1)`, a cross a median 24 candles old sitting ~1R away from the market (p90 ~3R).
    # Deriving the level here, from the bar that actually touched the line, removes that staleness
    # without a second mechanism.
    for k in range(PB_WINDOW + 1, min(RETURN_WINDOW, last - ci) + 1):
        bar = wcl[ci + k]
        touched = (bar.low <= line) if bullish else (bar.high >= line)
        if touched:
            return order(bar.high if bullish else bar.low, bar, False, True)

    # ── 3) NEVER CAME BACK ───────────────────────────────────────────────────
    # *"If it does not come back to a good level near the line we dont enter."* Past the window the
    # setup is gone; nothing is assumed and nothing is chased.
    return None
