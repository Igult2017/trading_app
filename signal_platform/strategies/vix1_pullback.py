"""
VIX.1 — the 1M pullback: the entry level.

Observed on the 1M ONLY. The 1HR never has a pullback in this strategy — it is there for momentum, for
trend, and to give us the lines.

The market is never tidy, so nothing here is measured in fixed pips — every threshold comes off the
1M's own recent candles or off the momentum candle itself:

  A PROPER candle the other way — a real body, judged against the 1M's own recent average body, not
  a pip count. A doji is indecision and a tick of noise is noise; neither may place a stop. What is
  a real body in London is noise in Tokyo, so the bar has to move with the market.

  Only the FIRST candle of the retrace matters — it sits nearest the resumption, so a stop just
  beyond it fills us along the way, where a later one drags the stop deeper with every candle. A
  retrace ENDS only when price actually resumes the trend: a doji or a stray tick inside it is part
  of the retrace, not the end of it.

  LINE 1 gates it, and in two parts. Price must actually have TRADED past line 1 — without that the
  band below is just a corridor, and a setup where price never reached the line at all would still
  produce an entry, which is the exact thing the line exists to prevent. Then the pullback itself
  must not have run beyond LINE 2: an opposite move is allowed to push past line 1 and reverse at
  line 2, so that band is the tolerance and no fifth decimal decides a trade. The band is the momentum
  candle's own open wick, so the market sizes it — no wick, no slack; a wicky candle, more.
"""
from core.types import Candle
from shared.candle_math import is_bullish, is_bearish, body_size, avg_body

_BODY_FRAC = 0.25   # share of the 1M's own recent average body below which a candle is noise


def is_pullback_candle(c: Candle, bullish: bool, min_body: float = 0.0) -> bool:
    """A proper candle the other way — a real body, never a doji or a tick of noise."""
    if not (is_bearish(c) if bullish else is_bullish(c)):
        return False
    return body_size(c) >= min_body


def _resumes(c: Candle, bullish: bool) -> bool:
    """Price going WITH the trend again — the only thing that ends a retrace. A doji or a stray tick
    inside the retrace is part of it, so it must not split the run."""
    return is_bullish(c) if bullish else is_bearish(c)


def traded_past(win: list[Candle], bullish: bool, line: float) -> bool:
    """Has price actually gone past LINE 1 since it was drawn? The whole point of the line."""
    return max(c.high for c in win) > line if bullish else min(c.low for c in win) < line


def find_pullback(win: list[Candle], bullish: bool,
                  line: float, wick_line: float) -> tuple[Candle | None, str]:
    """Return (the pullback CANDLE, "") — the FIRST candle of the latest retrace, once price has gone
    past line 1 and the retrace has held within the lines — or (None, why-we-wait).

    The whole candle, not just a level: the caller needs BOTH edges. Its extreme on the trend side is
    the entry (the stop goes just beyond it); its extreme on the other side is what the SL must clear,
    since the candle we entered off cannot be the thing that stops us out (vix1_roi).
    """
    if not traded_past(win, bullish, line):
        return None, (f"price has not traded past line 1 ({line:.5f}) yet — an entry does not "
                      f"belong here")
    min_body = _BODY_FRAC * avg_body(win)          # the 1M's own scale, not a fixed pip count
    p = next((i for i in range(len(win) - 1, -1, -1)
              if is_pullback_candle(win[i], bullish, min_body)), None)
    if p is None:
        return None, "no pullback candle with a real body yet — price is running"
    while p > 0 and not _resumes(win[p - 1], bullish):    # noise inside the retrace is still retrace
        p -= 1
    lvl = win[p].high if bullish else win[p].low
    if (lvl < wick_line) if bullish else (lvl > wick_line):
        return None, (f"the pullback ({lvl:.5f}) ran beyond the lines "
                      f"({line:.5f} / wick {wick_line:.5f}) — not a pullback any more")
    return win[p], ""
