"""
VOCANT.1 — the 1M pullback: the entry level.

Observed on the 1M ONLY. The 1HR never has a pullback in this strategy — it is there for volume, for
trend, and to give us the line.

A pullback candle is a PROPER candle the other way: it must have a real body. A doji (open == close)
is indecision, not a pullback, and must never place a stop.

A pullback may RUN several candles, but only its FIRST one matters. That candle sits nearest the
resumption, so a stop just beyond it fills us along the way if price continues; taking the latest
candle of the run instead would drag the stop deeper into the retrace with every candle that prints.

And it must be PAST the 1HR line (vocant1_lines, LINE 1 — the body close of the first volume candle).
That is what makes a pullback confirm the bias rather than be just another candle going the other
way, and it is what keeps entries out of the places they do not belong.
"""
from core.types import Candle
from shared.candle_math import is_bullish, is_bearish


def is_pullback_candle(c: Candle, bullish: bool) -> bool:
    """A proper candle the other way — a real body, never a doji."""
    return is_bearish(c) if bullish else is_bullish(c)


def find_pullback(win: list[Candle], bullish: bool, line: float) -> tuple[float | None, str]:
    """Return (entry level, "") — the FIRST candle of the latest pullback run, once it is past the
    line — or (None, why-we-wait)."""
    p = next((i for i in range(len(win) - 1, -1, -1) if is_pullback_candle(win[i], bullish)), None)
    if p is None:
        return None, "no pullback candle yet — price is running"
    while p > 0 and is_pullback_candle(win[p - 1], bullish):    # walk back to the FIRST of the run
        p -= 1
    lvl = win[p].high if bullish else win[p].low
    if (lvl <= line) if bullish else (lvl >= line):
        return None, f"the pullback ({lvl:.5f}) is not past the line ({line:.5f})"
    return lvl, ""
