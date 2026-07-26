"""
VIX.1 — the 1M pullback: the entry level.

Observed on the 1M ONLY. The 1HR never has a pullback in this strategy — it is there for momentum, for
trend, and to give us the lines.

THE PULLBACK IS ONE CANDLE OF ANY TYPE (user 2026-07-22: "just look for one pullback candle of any
type at 1m entry so long as that pullback is not volatility candle and not violent candle typical of
market choppiness"). This SUPERSEDES the old "real body, never a doji" filter — a doji or a small
candle opening the retrace IS the pullback now. The filter points the other way: what disqualifies a
pullback candle is being ABNORMALLY BIG for the 1M right now —
  * a VOLATILITY candle — body >= 1.5x the 1M's own recent (14-bar) average body, or
  * a VIOLENT candle    — full range >= 2.5x that average (the huge-wick whipsaw bar),
the platform's own volume/violent-candle thresholds (patterns/volume_patterns, patterns/wick_patterns
— shared platform definitions, not another strategy's logic). Those bars are market choppiness, and a
stop anchored just beyond one is both wide and placed exactly where chop hunts.

Only the FIRST candle of the retrace matters — it sits nearest the resumption, so a stop just beyond
it fills us along the way, where a later one drags the stop deeper with every candle. A retrace ENDS
only when price actually resumes the trend: any non-resuming candle inside it is part of the retrace.
If the retrace OPENS with a volatility/violent candle, that retrace gives no entry — we stand aside
rather than anchor a stop on chop.

LINE 1 gates it in two parts: price must actually have TRADED past line 1 (the caller's job, on the
LIVE window), and the pullback candle itself must TAKE PLACE past (or on) line 1 — enforced HERE,
whole-candle, on the edge that faces the line. A retrace that has not cleared the line is not an
entry; we wait for one that has. The wick-line check is the third guard: a retrace that has run
beyond LINE 2 is not a pullback any more.
"""
from core.types import Candle
from shared.candle_math import is_bullish, is_bearish, body_size, full_range, avg_body

_VOLA_BODY_MULT  = 1.5   # body >= this x the 1M's 14-bar avg body  -> volatility candle (excluded)
_VIOLENT_RNG_MULT = 2.5  # range >= this x the 1M's 14-bar avg body -> violent candle    (excluded)
_AVG_N            = 14   # same baseline the platform's volume/violent patterns use


def is_pullback_candle(c: Candle, bullish: bool, avg: float = 0.0) -> bool:
    """ANY candle not going WITH the bias (an opposite candle or a doji) — except an abnormal one.
    A volatility candle (body >= 1.5x the recent avg body) or a violent candle (range >= 2.5x it)
    is market choppiness, not a pullback, and may not anchor a stop."""
    if is_bullish(c) if bullish else is_bearish(c):     # a candle WITH the bias is not a pullback
        return False
    if avg > 0 and (body_size(c) >= _VOLA_BODY_MULT * avg
                    or full_range(c) >= _VIOLENT_RNG_MULT * avg):
        return False
    return True


def _counter(c: Candle, bullish: bool) -> bool:
    """Any candle NOT carrying the bias on — what a retrace is made of (dojis included)."""
    return not (is_bullish(c) if bullish else is_bearish(c))


def _resumes(c: Candle, bullish: bool) -> bool:
    """Price going WITH the trend again — the only thing that ends a retrace."""
    return is_bullish(c) if bullish else is_bearish(c)


def traded_past(win: list[Candle], bullish: bool, line: float) -> bool:
    """Has price actually gone past LINE 1 since it was drawn? The whole point of the line."""
    return max(c.high for c in win) > line if bullish else min(c.low for c in win) < line


def find_pullback(win: list[Candle], bullish: bool,
                  line: float, wick_line: float) -> tuple[Candle | None, str]:
    """Return (the pullback CANDLE, "") — the FIRST candle of the latest retrace — or
    (None, why-we-wait). `win` must be CLOSED bars only: the candle's edges become the entry and
    the SL clearance, and a level read from the forming bar drifts until it closes (the hard rule).
    The line-1 gates are the CALLER's job (traded-past on the LIVE window; pullback past/on the line).

    The whole candle, not just a level: the caller needs BOTH edges. Its extreme on the trend side is
    the entry (the stop goes just beyond it); its extreme on the other side is what the SL must clear,
    since the candle we entered off cannot be the thing that stops us out (vix1_roi).
    """
    p = next((i for i in range(len(win) - 1, -1, -1) if _counter(win[i], bullish)), None)
    if p is None:
        return None, "no pullback candle yet — price is running"
    while p > 0 and not _resumes(win[p - 1], bullish):    # anything non-resuming is still retrace
        p -= 1
    c   = win[p]
    avg = avg_body(win, n=_AVG_N)
    if not is_pullback_candle(c, bullish, avg):
        return None, (f"the retrace opened with a volatility/violent candle "
                      f"(body {body_size(c):.5f} / range {full_range(c):.5f} vs avg body {avg:.5f}) "
                      f"— market choppiness, not a pullback to anchor")
    # PAST THE LINE — the WHOLE pullback candle must sit past (or on) line 1. The edge that faces
    # the line is the one that has to clear it: the LOW on a buy, the HIGH on a sell. Touching is
    # allowed ("past the 1HR line or on the 1HR line").
    #
    # This gate existed, was REMOVED on 2026-07-25, and is RE-ADDED on 2026-07-26 on the user's
    # direct instruction ("just make sure any pullback is past the 1HR line"). The removal was based
    # on my own reconstruction of his pullbacks from screenshots — which measured only 9-10 of 19
    # keeping their extreme past the line. That reconstruction has since been wrong twice (the
    # invented "line 2", the symmetric wick cap), and he is the authority on his own method.
    # Measured before re-adding: 53% of the pullbacks the code anchored on were NOT fully past the
    # line, and the 8% of entries that landed outright behind it returned 12% WR / -5.0R.
    near = c.low if bullish else c.high
    if (near < line) if bullish else (near > line):
        return None, (f"the pullback candle ({near:.5f}) is not past line 1 ({line:.5f}) — "
                      f"the whole candle must sit past (or on) the line; waiting for one that does")
    lvl = c.high if bullish else c.low
    if (lvl < wick_line) if bullish else (lvl > wick_line):
        return None, (f"the pullback ({lvl:.5f}) ran beyond the lines "
                      f"({line:.5f} / wick {wick_line:.5f}) — not a pullback any more")
    return c, ""
