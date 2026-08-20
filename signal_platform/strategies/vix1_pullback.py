"""
VIX.1 — IS THIS CANDLE A PULLBACK? One question, one answer.

Observed on the 1M ONLY. The 1HR never has a pullback in this strategy — it is there for momentum, for
trend, and to give us the line.

WHAT THIS FILE IS NOW, after the 2026-08-20 entry rebuild. It used to also FIND the pullback —
searching backwards for the latest retrace and gating it against the line — and that search is gone
with the rest of the 1M analysis. The entry no longer looks for a retrace: it takes the ONE candle
after the cross and asks this file whether it is a pullback (`vix1_cross.decide`). A "no" is not a
refusal; it makes the entry an ASSUMED one, which is his rule: *"A valid setup is not skipped because
there is no pullback."*

`find_pullback`, `traded_past` and their helpers were DELETED, not left for reference — nothing
imports them and a dead search that still reads like live code is how the next session concludes the
feature exists. Their history is in the vix1.md fix log and in git.

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

THE LINE NO LONGER GATES THIS FILE. It used to, in two parts — price had to have traded past the
line, and the pullback candle had to sit wholly past it. Both moved out with the search: the cross
(a 1M CLOSE past the line) is now what proves price got there, and the order level is measured from
how far price reached, not from where the pullback sits. There is no second line — see vix1_lines.
"""
from core.types import Candle
from shared.candle_math import is_bullish, is_bearish, body_size, full_range

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
# The anti-chop test is what chop actually is, and it needs BOTH halves: abnormally wide AND not
# decisive. A candle that is 60%+ body cannot be a whipsaw however large it is. Size alone never
# disqualifies — at EITHER end.
#
# (This paragraph used to add "the _MIN_BODY_FRAC gate below already does this work". That gate was
#  deleted on 2026-08-07, so the whipsaw test is now the ONLY shape rejection and carries the job
#  alone. Left uncorrected it would tell the next reader this test is partly redundant.)
_CHOP_RNG_MULT   = 2.5   # range >= this x the 14-bar avg body ... (first half of the whipsaw test)
_CHOP_BODY_FRAC  = 0.60  # ... AND body < this share of its own range -> a whipsaw, not a pullback
_MAX_BODY_VS_AVG = 0.0   # optional ceiling on body/avg; 0 = NONE, and none is correct: a big
                         # DECISIVE pullback is the best anchor there is, and one 1HR candle's
                         # range already caps the risk downstream (vix1_entry's ceiling).

# NO MINIMUM SIZE. THE PULLBACK IS ANY CANDLE — user, 2026-08-07: *"make it to be pullback of any
# candle. Any other thing I will decide on my own."*
#
# A `_MIN_BODY_VS_AVG = 1.00` / `_MIN_BODY_FRAC = 0.60` pair lived here from 2026-07-26. DO NOT
# RESTORE IT without him asking — the full round trip is in the vix1.md fix log. In short: it was
# added on his "I just waited for a PROPER pullback candle" and it did the opposite of what he
# wanted in practice, because the old `find_pullback` RETURNED NONE when the first candle of a retrace failed
# rather than falling through to a later one. So a small first pullback did not merely get skipped,
# the whole retrace did, and the entry waited for a later retrace that happened to open big — later
# in time and further from the line. He caught it on a live GBP/USD chart (06 Aug 2026): *"I got it
# late… the entry should be immediately at the first pullback… The first pullback ever."*
#
# Measured at the time it was removed: with a 4.16-pip average body, a 1.1-pip first pullback was
# rejected AND so was a 3.8-pip later one — in a trending move a retrace candle is normally SMALLER
# than the average bar, so "body >= the average" is rarely satisfied at all.


def is_pullback_candle(c: Candle, bullish: bool, avg: float = 0.0) -> bool:
    """A candle not going WITH the bias, of ANY shape — doji included — that is not ABNORMAL.

    Size is never a disqualifier, at either end. The only rejection is the one he stated himself
    (2026-07-22): *"so long as that pullback is not volatility candle and not violent candle typical
    of market choppiness"* — a WHIPSAW: an abnormally wide bar (range >= 2.5x the recent avg body)
    whose body settles nowhere (< 60% of its range). Both halves are required; a wide DECISIVE
    candle is conviction, not chop.
    """
    if is_bullish(c) if bullish else is_bearish(c):     # a candle WITH the bias is not a pullback
        return False
    rng = full_range(c)
    if avg > 0 and rng > 0 and rng >= _CHOP_RNG_MULT * avg and body_size(c) < _CHOP_BODY_FRAC * rng:
        return False                                   # a WHIPSAW: wide AND settles nowhere
    if _MAX_BODY_VS_AVG and avg > 0 and body_size(c) >= _MAX_BODY_VS_AVG * avg:
        return False
    return True
