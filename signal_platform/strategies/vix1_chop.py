"""VIX.1 — IS THIS MARKET CHOPPY? Is price moving between two lines, or actually going somewhere?

⚠ BUILT, NOT SWITCHED ON. Nothing in the live strategy calls this. His instruction, 2026-09-14:
*"Build it and then dont enable it. We will have to continue working on it."* `test_chop_band.py`
fails the day it is wired, so switching it on has to be a deliberate change, never a quiet one.

HIS IDEA, 2026-09-13 — and it is the reading this file makes:

    "We mark lines at the top and bottom and then ask whether the price is just moving within those
     lines or it is moving in a particular direction ... when it goes here it comes back it doesn't
     move like would a trend. I guess that would solve both chop and ranging market."

So: draw a line at the highest high and one at the lowest low of the last 24 candles. The lines alone
say nothing — price is inside them by definition. What says something is how often price CROSSES BACK
through the middle of them. A trend crosses once and leaves; a market going nowhere keeps coming back.
Six or more crossings in 24 candles reads choppy.

WHY THIS VERSION — measured 2026-09-14 on real EUR/USD bars, every number in
`docs/strategies/vix1-investigation.md`:

  * THE FIRST BUILD (his three signs over 12 candles, pullback set aside) caught ~10% of the hours
    inside his five circled chop markets and one market of five — and what it did flag he judged
    "not typically choppy". The cause: 12 candles cannot see a band that lasts 1.5 to 4 days.
  * HIS THREE SIGNS OVER 24 CANDLES caught 66% of his chop hours, but called 53% of ALL hours choppy,
    and on the 220 trades of the approved backtest it would have refused the better half.
  * THIS READING catches 32% of his chop hours, fires on only 13-14% of ordinary hours (EUR/USD and
    GBP/USD alike), flags 7% of his good readings, and is NEUTRAL on money — the 37 backtest trades it
    refuses did exactly as well as the 183 it keeps. The most honest version so far, and still only a
    third of his chop. Hence "continue working on it".

STILL OPEN, and his to decide:
  * whether the live pullback is set aside first. Measured, doing so halves detection inside chop —
    the pullback reader treats a sideways drift as one long pullback. Not done here.
  * the window (24) and the line (6) were read off five EUR/USD regions. More circled chop on GBP/USD
    and gold should come before either number is trusted.

NO TREND IS NEEDED to read this, deliberately: a band is a band whichever way the last trend ran.
`h1` must be CLOSED bars — the lines are levels, and a level never comes from a bar still forming.
"""
from dataclasses import dataclass

from core.types import Candle

LOOK = 24            # hours read. His circled bands last days; 12 could not see them, 24 can.
_CAME_BACK = 6       # crossings of the middle that make it choppy — read off his marks, not his words


@dataclass(frozen=True)
class Reading:
    """His two lines over the last `counted` candles, and what price did between them."""
    judged: bool = False     # were there enough candles to hold an opinion at all?
    choppy: bool = False
    came_back: int = 0       # times price CLOSED on the other side of the middle line
    top: float = 0.0         # the line at the top — the highest high
    bottom: float = 0.0      # the line at the bottom — the lowest low
    counted: int = 0


def read(h1: list[Candle], look: int = LOOK) -> Reading:
    """Draw his two lines over the last `look` closed candles and count how often price came back."""
    if look < 2 or len(h1) < look:
        return Reading()                    # too little to say — never a refusal
    seg = h1[-look:]
    top = max(c.high for c in seg)
    bottom = min(c.low for c in seg)
    if top <= bottom:
        return Reading(judged=True, top=top, bottom=bottom, counted=look)
    middle = (top + bottom) / 2.0
    came_back, side = 0, None
    for c in seg:
        # On CLOSES, like every other VIX.1 test — a wick poking across the middle is not a visit.
        above = c.close >= middle
        if side is not None and above != side:
            came_back += 1
        side = above
    return Reading(judged=True, choppy=came_back >= _CAME_BACK, came_back=came_back,
                   top=top, bottom=bottom, counted=look)


def market_not_choppy(h1: list[Candle], look: int = LOOK) -> str | None:
    """The refusal reason, or None to allow. NOT CALLED BY ANYTHING — see the top of this file.

    A MISSING MEASUREMENT IS NOT A REFUSAL: too few candles returns None, because refusing when nobody
    could measure is a guess.
    """
    r = read(h1, look)
    if not r.judged or not r.choppy:
        return None
    return (f"the market is choppy — over the last {r.counted} hours price crossed back through the "
            f"middle of its range {r.came_back} times: it is moving between two lines "
            f"({r.bottom:.5f} and {r.top:.5f}), not going anywhere")
