"""
VIX.1 — the 1M pullback: the entry level.

Observed on the 1M ONLY. The 1HR never has a pullback in this strategy — it is there for momentum, for
trend, and to give us the lines.

THE PULLBACK IS ONE CANDLE, AND IT MUST SAY SOMETHING. It is disqualified at BOTH ends of the scale.
ABNORMALLY BIG for the 1M right now —
  * a VOLATILITY candle — body >= 1.5x the 1M's own recent (14-bar) average body, or
  * a VIOLENT candle    — full range >= 2.5x that average (the huge-wick whipsaw bar),
the platform's own volume/violent-candle thresholds (patterns/volume_patterns, patterns/wick_patterns
— shared platform definitions, not another strategy's logic). Those bars are market choppiness, and a
stop anchored just beyond one is both wide and placed exactly where chop hunts.
INSIGNIFICANT — a body under the 1M's own recent average, or under 60% of its own range (user
2026-07-26: "a PROPER pullback candle, not an insignificant candle that shows the STRUGGLE between
the buyers and sellers"). This REPLACED the 2026-07-22 "any type, doji included" rule, which had
the code anchoring entries on 1-2 pip dojis. See the constants below for what it did and did not
change — it fixes individual trades and is FLAT in aggregate.

Only the FIRST candle of the retrace matters — it sits nearest the resumption, so a stop just beyond
it fills us along the way, where a later one drags the stop deeper with every candle. A retrace ENDS
only when price actually resumes the trend: any non-resuming candle inside it is part of the retrace.
If the retrace OPENS with a volatility/violent candle, that retrace gives no entry — we stand aside
rather than anchor a stop on chop.

LINE 1 gates it in two parts: price must actually have TRADED past line 1 (the caller's job, on the
LIVE window), and the pullback candle itself must TAKE PLACE past (or on) line 1 — enforced HERE,
whole-candle, on the edge that faces the line. A retrace that has not cleared the line is not an
entry; we wait for one that has. There is no second line — see vix1_lines.
"""
from core.types import Candle
from shared.candle_math import is_bullish, is_bearish, body_size, full_range, avg_body

_AVG_N            = 14   # same baseline the platform's volume/violent patterns use

# CHOP — and what it is NOT. The user's rule is "not a volatility candle and not a violent candle
# TYPICAL OF MARKET CHOPPINESS". The qualifier is the whole rule: chop is a WHIPSAW — an abnormally
# wide bar whose body settles nowhere, buyers and sellers trading through each other. It is not a
# big candle.
#
# WHAT WAS HERE UNTIL 2026-07-26, AND WHY IT WAS WRONG. Two caps, ORed: body >= 1.5x avg OR range >=
# 2.5x avg -> rejected, with a comment claiming these were "the platform's own volume/violent-candle
# thresholds". Three errors in one:
#   * INVERTED. patterns/volume_patterns fires a VOLUME CANDLE at body >= 1.5x avg and grades its
#     STRENGTH from 0 at 1.5x to 1.0 at 3x. patterns/wick_patterns calls its violent candle "large
#     body AND long wick - high volatility, DIRECTIONAL CONVICTION". Both are conviction signals.
#     This code took the platform's threshold for "strong" and used it as "reject as chop".
#   * OR, where the platform's violent candle needs BOTH (body >= 1.5x avg AND range >= 2.5x avg).
#     So a wide bar with any body at all was thrown out on the range test alone.
#   * It cost a real trade: his setup-1 pullback (2021-07-06 14:07 UTC) is a 5.9-pip body in a
#     5.9-pip range - 100% body, 2.6x the 14-bar average, the cleanest pullback in that hour. Both
#     caps rejected it. The code waited five more minutes and anchored on a weaker candle instead.
#
# The anti-chop test is now what chop actually is, and it needs BOTH halves: abnormally wide AND not
# decisive. A candle that is 60%+ body cannot be a whipsaw however large it is, so in practice the
# _MIN_BODY_FRAC gate below already does this work - which is the point. Size alone never disqualifies.
_CHOP_RNG_MULT   = 2.5   # range >= this x the 14-bar avg body ... (first half of the whipsaw test)
_CHOP_BODY_FRAC  = 0.60  # ... AND body < this share of its own range -> a whipsaw, not a pullback
_MAX_BODY_VS_AVG = 0.0   # optional ceiling on body/avg; 0 = NONE, and none is correct: a big
                         # DECISIVE pullback is the best anchor there is, and one 1HR candle's
                         # range already caps the risk downstream (vix1_roi.max_risk).

# A PROPER pullback candle, the OTHER end of the same scale (user 2026-07-26: "I just waited for a
# PROPER pullback candle, not an insignificant candle that shows the STRUGGLE between the buyers and
# sellers"). The two tests above throw out bars that are abnormally BIG (chop); these throw out the
# ones that say NOTHING. Both are measured against the 1M's own recent activity, never a pip count.
#   SIGNIFICANT — its body is a real share of what a 1M candle is doing right now. An 0.9-pip body
#                 when the market is running 3-pip bars is not a pullback, it is a pause.
#   DECISIVE    — its body is a real share of its OWN range. A candle that opens and closes in the
#                 same place IS the struggle between buyers and sellers; neither side won, so it
#                 marks nothing and a stop just beyond it rests on noise.
# Measured before this existed (GBP/USD Jan-Jun 2021): the median pullback the code anchored on was
# a 2.2-pip candle with an 0.9-pip body, and 31% of them had a body under 25% of their range. His
# own setup-1 pullback was a 5.9-pip candle with a 5.9-pip body — 100%. The code took a 1.4-pip
# ZERO-body doji four minutes earlier and was stopped out of a trade he made +2.28R on.
#
# MEASURED, AND IT DOES NOT PAY — read this before tuning these two numbers. Swept over 1,518
# structural setups (GBP/USD + EUR/USD, 26 months) the rule is FLAT at every strictness:
#     anything (the old rule)          871 trades  33% WR   -1.5R
#     body >=0.25x avg, >=20% of range 851 trades  33% WR  -10.5R
#     body >=0.50x avg, >=35% of range 816 trades  32% WR  -23.7R
#     body >=0.75x avg, >=50% of range 766 trades  32% WR  -17.3R
#     body >=1.00x avg, >=60% of range 674 trades  33% WR   -3.8R   <- shipped
# It changes individual trades a lot (his setup 1 goes from breakeven to +2.00R) and the changes
# CANCEL — which is the signature of noise, not edge. The setting below is kept because it is the
# most faithful reading of his rule and costs nothing measurable against the old one, NOT because
# it improves anything. Do not tune these to chase R; the lever is not here.
_MIN_BODY_VS_AVG = 1.00  # body >= this x the 1M's 14-bar avg body   -> it is SIGNIFICANT
_MIN_BODY_FRAC   = 0.60  # body >= this share of its own range        -> it is DECISIVE, not a doji


def is_pullback_candle(c: Candle, bullish: bool, avg: float = 0.0) -> bool:
    """A candle not going WITH the bias, that is neither ABNORMAL nor INSIGNIFICANT.
    Chop     -> a WHIPSAW: an abnormally wide bar (range >= 2.5x the recent avg body) whose body
                settles nowhere (< 60% of its range). Size alone is NOT a disqualifier.
    Too small-> a body under the recent average, or under 60% of its own range: indecision, which
                marks no level worth anchoring an entry and a stop to."""
    if is_bullish(c) if bullish else is_bearish(c):     # a candle WITH the bias is not a pullback
        return False
    rng = full_range(c)
    if avg > 0 and body_size(c) < _MIN_BODY_VS_AVG * avg:
        return False                                   # insignificant — a pause, not a pullback
    if rng > 0 and body_size(c) < _MIN_BODY_FRAC * rng:
        return False                                   # indecision — the struggle he described
    if avg > 0 and rng > 0 and rng >= _CHOP_RNG_MULT * avg and body_size(c) < _CHOP_BODY_FRAC * rng:
        return False                                   # a WHIPSAW: wide AND settles nowhere
    if _MAX_BODY_VS_AVG and avg > 0 and body_size(c) >= _MAX_BODY_VS_AVG * avg:
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


def find_pullback(win: list[Candle], bullish: bool, line: float) -> tuple[Candle | None, str]:
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
        return None, (f"the retrace opened with an unusable candle "
                      f"(body {body_size(c):.5f} / range {full_range(c):.5f} vs avg body {avg:.5f}) "
                      f"— either chop or indecision, not a pullback to anchor; waiting")
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
    # (A "ran beyond LINE 2" guard sat here until 2026-07-26. Line 2 is deleted, and the guard was
    #  already dead: the past-the-line test above requires the WHOLE candle on our side of line 1,
    #  which is strictly stronger than anything line 2 could have caught.)
    return c, ""
