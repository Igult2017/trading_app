"""VIX.1 — THE STOMACH RULE: where the momentum candle OPENED, and how big the candle before it was.

HIS RULE HAS THREE SENTENCES, and all three are here. From 2026-11-09:

 1. CANNOT QUALIFY — *"It cannot qualify if its open is the same level or close to same level as the
    previous candle's and the previous candles body is more than half its body or has body equal to
    its"*.
 2. CAN QUALIFY — *"it can qualify if its candle open starts past half the body of the previous
    candle all the way to the point I have pointed"*, and *"even past it"*, which he confirmed
    includes *"leaving a gap between candles and starting after the gap"*.
 3. CAN ALSO QUALIFY — *"if the open of the momentum candle is same level or close to same level IF
    the previous candle body was less than half the body of the momentum candle"*.

So there are TWO questions, each answered with his own word "half" and no tuned number anywhere:
WHERE along the previous body did this candle open, and HOW BIG was that previous candle compared
with this one. A small previous candle has a midpoint that means nothing, which is sentence 3.

*"The main function of this feature is to ensure we trade real momentum not indecisive market."*

⚠ ONLY SENTENCE 2 SHIPPED AT FIRST, and it was wrong by a wide margin. Measured on 26,000 real
GBP/USD H1 bars through the platform's own `qualifies_for_trade`: of 2,759 momentum candles, 1,439
(52.2%) opened in the far half and were ALL refused — but 1,033 of them (37.4% of everything) are
candles his sentence 3 qualifies. The rule was wrongly refusing more than twice as many as it
correctly refused. He caught it by reading his own rule back: *"are we still doing this?"*

WHY IT IS CALLED THE STOMACH, researched rather than invented. In candlestick terminology the
midpoint of a candle's REAL BODY is THE STOMACH — *"The midpoint of the first real body is the
stomach"*, *"Add the open and the close, then divide by two. Shadows are ignored"*. The named
patterns ABOVE / BELOW THE STOMACH use the same line (Bulkowski, Encyclopedia of Candlestick
Charts, 2008). ⚠ HIS RULE IS NOT THOSE PATTERNS: they are two-candle REVERSAL patterns needing BOTH
the open AND the close past the line. His is a momentum QUALITY filter where only the OPEN matters.
The LINE carries the standard name; the RULE is his.

⚠ IT DECIDES, SINCE 2026-11-10. It reported on the DM for a day first, exactly as he asked, and
then he said: *"Turn it on. I have seen it working and it is doing the job."*
`vix1_momentum.qualifies_for_trade` now refuses any candle this refuses — one place, through
which the entry, the pre-close heads-up, the count-wait DM and spacing all ask.

⚠ THE DM ANNOUNCEMENT IS THE ONE EXCEPTION (`ignore_open_rule=True`). It still reports EVERY
momentum candle with its verdict, refused or not, so the rule stays visible now that it decides.

WHERE HE EXPECTS IT TO EARN ITS KEEP, recorded because it is the reasoning: *"i think it works best
for a pullback where the market was pulling back then going to a direction or when the market was
quiet then it starts moving or where the market was thin then it starts moving big."*

⚠ WHY THE POSITION IS USUALLY 100%. Forex H1 bars rarely gap: an open is within a pip of the
previous close 93.7% of the time, so it normally sits exactly ON the previous body's closing edge —
the near side for a candle carrying the move on, the far side for one turning back.
"""
from core.types import Candle
# The platform's own body measurement, already used by the momentum test itself
# (`vix1_momentum.py:217`). A second copy of "how big is this candle" is how two answers drift apart.
from shared.candle_math import body_size

#: WHERE along the previous body the open must land. NOT tuned — it is the word "half" in his
#: sentence 2, *"past half the body of the previous candle"*.
_HALF = 0.5

#: HOW BIG the previous candle may be before its midpoint counts. Also not tuned — the word "half"
#: in his sentences 1 and 3, *"less than half the body of the momentum candle"*.
_PREV_SMALL = 0.5

#: ⚠ AN OPEN EXACTLY ON THE MIDPOINT MUST PASS, and without this it did not. Off 5-decimal prices a
#: true 50.000% divides out as 0.49999999..., so the one candle sitting precisely on his boundary
#: was refused. `momentum_grade` carries the same epsilon for exactly the same reason.
#:
#: ⚠ IT IS SUBTRACTED ON THE SIZE TEST TOO, but to the OPPOSITE effect: a previous body of exactly
#: half must be REFUSED, because his sentence 1 covers *"more than half ... or has body equal to"*
#: and only *"less than half"* rescues. So the rescue needs a share strictly under half.
_EPS = 1e-9


def open_position(prev: Candle, cur: Candle, bullish: bool) -> float | None:
    """How far along the PREVIOUS candle's body this candle opened.

    0.0 = the far edge (the end the move came from), 1.0 = the near edge (its body close), and
    above 1.0 means it gapped beyond that body altogether — which he said also qualifies.

    None when the previous candle has no body to halve, so a doji can never disqualify anything.
    """
    top, bot = max(prev.open, prev.close), min(prev.open, prev.close)
    span = top - bot
    if span <= 0:
        return None
    return (cur.open - bot) / span if bullish else (top - cur.open) / span


def prev_share(prev: Candle, cur: Candle) -> float | None:
    """The PREVIOUS candle's body as a fraction of the MOMENTUM candle's body.

    Under 0.5 is his *"less than half the body of the momentum candle"* — the previous candle is too
    small for its midpoint to say anything, so the open may sit anywhere along it.

    None when the momentum candle itself has no body to measure against.
    """
    mine = body_size(cur)
    if mine <= 0:
        return None
    return body_size(prev) / mine


def verdict(h1: list[Candle], i: int, bullish: bool) -> tuple[bool, float | None, str]:
    """-> (does his rule approve this candle, where its open sat, WHICH SENTENCE decided).

    The reason is returned, not re-derived by the caller, because the card has to say which of his
    three sentences applied — an approval from sentence 2 and one from sentence 3 mean different
    things about the market and he is watching for exactly that difference.

    Approves when there is nothing to judge against — the first bar, or a previous candle with no
    body. A rule that cannot be evaluated must not invent a refusal.
    """
    if i < 1 or i >= len(h1):
        return True, None, "not-judged"
    prev, cur = h1[i - 1], h1[i]
    pos = open_position(prev, cur, bullish)
    if pos is None:
        return True, None, "not-judged"
    if pos >= _HALF - _EPS:
        return True, pos, "past-stomach"            # his sentence 2
    share = prev_share(prev, cur)
    if share is not None and share < _PREV_SMALL - _EPS:
        return True, pos, "small-previous"          # his sentence 3
    return False, pos, "short-of-stomach"           # his sentence 1


def line(h1: list[Candle], i: int, bullish: bool) -> str:
    """One sentence for the DM card.

    Written so he can read the verdict AND the reason without knowing the rule by heart — the whole
    point of putting it on the card is that he watches it and tells me what to change.
    """
    ok, pos, why = verdict(h1, i, bullish)
    # ⚠ AN APPROVAL PROMISES NOTHING. Passing this rule is one gate of several — the trend, the
    # range, the pullback and the candle count all still apply — so the approved wording makes no
    # claim about a trade. Only the REFUSAL is certain, and it is worth stating plainly.
    tail = " No signal will be taken from this candle."

    if why == "not-judged":
        return ("STOMACH RULE — not judged — the candle before it had no body to measure "
                "against, so this rule did not stand in the way.")

    where = ("GAPPED clear of the previous candle's body" if pos > 1.0
             else f"{pos:.0%} along the previous candle's body")
    share = prev_share(h1[i - 1], h1[i])
    sized = "" if share is None else f", and that candle's body is {share:.0%} of this one's"

    if why == "past-stomach":
        return (f"STOMACH RULE — APPROVED: it opened {where}, on the far side of the stomach "
                f"(the midpoint of that body) in the direction it is moving.")
    if why == "small-previous":
        return (f"STOMACH RULE — APPROVED: it opened {where}, which is short of the stomach — but "
                f"the candle before it is only {share:.0%} the size of this one, far too small for "
                f"its midpoint to mean anything.")
    return (f"STOMACH RULE — DISQUALIFIED: it opened {where}, short of the stomach (the midpoint "
            f"of that body){sized}, so the move doubled back instead of carrying on." + tail)


def tag(h1: list[Candle], i: int, bullish: bool) -> str:
    """The short verdict for the card's LABEL — the SECOND line of the message.

    ⚠ IT STAYS BINARY on purpose. He asked for one thing from this line: *"The DM message should
    clearly state that it is either approved by that new rule or not."* Which of his three sentences
    applied belongs in `line()` underneath, not in the glance.

    ⚠ IT GOES IN THE LABEL BECAUSE THE DETAILS LIST IS CAPPED AT FIVE BULLETS
    (telegram_formatter.py:52) and this card already fills all five, so the verdict sat third and
    was easy to miss.
    """
    ok, pos, why = verdict(h1, i, bullish)
    if why == "not-judged":
        return "STOMACH RULE: NOT JUDGED"
    return f"STOMACH RULE: {'APPROVED' if ok else 'DISQUALIFIED'}"
