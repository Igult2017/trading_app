"""
VOCANT.1 — the 1HR lines, drawn off the FIRST momentum candle.

LINE 1 — the BODY CLOSE line, at candle 1's close. THE line. That price is also candle 2's open, so
         it is the level the whole setup pivots on. It exists to make the 1M accurate: it says where
         an entry belongs and where it does not, and it is what the 1M is read against.
LINE 2 — the WICK line, and it has exactly one job: adjusting the STOP. Drawn INSIDE the body, candle
         1's OPEN wick height off line 1, it marks where we expect an opposite move to reverse if it
         first pushes past line 1 — so the stop goes beyond it and that move cannot wick us out.
         It never gates an entry; line 1 does that.

A candle's OPEN wick is the one at the end it opened from: a bull candle opens at the body's bottom
(so, its lower wick), a bear candle at the top (its upper wick).

Line 2 is INSIDE the body by construction, never merely by luck. The momentum filter requires the
body to be >= 75% of the candle's range, so BOTH wicks together take at most 25% — the open wick is
therefore never more than a third of the body (0.25 range / 0.75 range). This used to rest on the old
filter capping EACH wick at 33% (body >= 34%); that cap is now asymmetric — only the wick AGAINST the
move is limited (<= 15%), because on a bull candle a lower wick is a dip being bought, not weakness.
The body-share rule is what carries the guarantee now, and it is the stronger of the two. In most
cases there is barely a line 2 to speak of — small or no wicks IS the momentum filter, so it
collapses onto line 1.
"""
from core.types import Candle
from shared.candle_math import is_bullish, upper_wick, lower_wick


def draw_lines(vc: Candle) -> tuple[float, float]:
    """Return (line 1 body-close, line 2 wick) for the first momentum candle. Direction is read off the
    candle itself — a momentum candle is in the trend direction by definition, so there is nothing to
    pass in and nothing that can disagree. With no open wick the two lines are equal."""
    w = lower_wick(vc) if is_bullish(vc) else upper_wick(vc)
    return vc.close, (vc.close - w if is_bullish(vc) else vc.close + w)
