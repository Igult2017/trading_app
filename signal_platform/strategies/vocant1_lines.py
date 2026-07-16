"""
VOCANT.1 — the 1HR lines, drawn off the FIRST volume candle.

These exist to make the 1M accurate: they say where an entry belongs (and where it does not), and
they are what the 1M is read against to tell whether it is running with the 1HR.

LINE 1 — the BODY CLOSE line, at candle 1's close. That price is also candle 2's open, so it is the
         single level the whole setup pivots on. This is the line, and usually the only one.
LINE 2 — the WICK line. Only worth drawing when candle 1's OPEN wick is a bit long: it sits INSIDE
         the body, that wick's height off line 1. It marks where an opposite move ends if price
         first pushes past line 1, and it warns that we could be wicked.

A candle's OPEN wick is the one at the end it opened from: a bull candle opens at the body's bottom
(so, its lower wick), a bear candle at the top (its upper wick).

In most cases line 2 does not matter at all — small or no wicks IS the volume-candle filter, so
there is usually nothing to draw and line 2 collapses onto line 1.
"""
from core.types import Candle
from shared.candle_math import upper_wick, lower_wick


def draw_lines(vc: Candle, bullish: bool) -> tuple[float, float]:
    """Return (body_close_line, wick_line) for the first volume candle. With no open wick the two
    are equal — so a caller can always just use line 2 and get the ordinary case for free."""
    w = lower_wick(vc) if bullish else upper_wick(vc)
    return vc.close, (vc.close - w if bullish else vc.close + w)
