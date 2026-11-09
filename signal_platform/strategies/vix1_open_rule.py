"""VIX.1 — THE STOMACH RULE: where the momentum candle OPENED, relative to the candle before it.

WHY IT IS CALLED THAT, and the name was researched rather than invented. In candlestick
terminology the midpoint of a candle's REAL BODY is called THE STOMACH — *"The midpoint of the
first real body is the stomach"*, and explicitly *"Add the open and the close, then divide by two.
Shadows are ignored"*. Wicks do not move it, which is exactly the line his rule draws. The named
patterns ABOVE THE STOMACH and BELOW THE STOMACH use the same line (Thomas Bulkowski published a
tested definition in Encyclopedia of Candlestick Charts, 2008).

⚠ HIS RULE IS NOT THOSE PATTERNS. They are two-candle REVERSAL patterns that need BOTH the open
AND the close past the line. His is a momentum QUALITY filter where only the OPEN matters, in
either direction. So the LINE carries the standard name and the RULE is his own.

⚠ THIS GATES NOTHING. It is reported on the DM card and nowhere else, at his instruction,
2026-11-09: *"first i need you to test it and when reporting momentum candles in the DM also report
it there until i approve that it is working then we will integrate it"*. Until he says otherwise,
no caller may use this to accept or refuse a candle, a setup or a trade.

HIS RULE, in his own words:

    "The candle open of a momentum candle can start from the upper half of the previous candle but
     not past the upper half. If it goes beyond the upper half to the lower half it is disqualified.
     So it can start from the upper half going up to the body close of that candle including leaving
     a gap between candles and starting after the gap"

    "The main function of this feature is to ensure we trade real momentum not indecisive market."

A previous candle's CLOSE is the top side of its body — his correction, and the thing that makes the
rule readable. So for a BUY the open must sit in the half of the previous body NEAREST the direction
of travel, at its body close, or gapped beyond it; for a SELL, mirrored. An open that has fallen
through to the far half is the market turning straight back on itself, which is the indecision he
wants kept out.

WHERE HE EXPECTS IT TO EARN ITS KEEP (2026-11-09), recorded because it is the reasoning, not the
code: *"i think it works best for a pullback where the market was pulling back then going to a
direction or when the market was quiet then it starts moving or where the market was thin then it
starts moving big."*

MEASURED BEFORE IT WAS WRITTEN, on 26,000 real GBP/USD H1 bars through the platform's own
`qualifies_for_trade`: of 3,111 momentum candles it would PASS 48.4% and REFUSE 51.6%. On the clean
15 July move he circled, every candle passes — they open at 100% and 106% of the previous body —
while the two turn-backs in the same window open at 3% and 6% and are refused. Refusing half of
everything is far too large a change to wire in off one reading, which is exactly why it is being
watched on the DM first.

⚠ WHY THE POSITION IS USUALLY 100%. Forex H1 bars rarely gap: on those same 26,000 bars an open is
within a pip of the previous close 93.7% of the time, so it normally sits exactly ON the previous
body's closing edge. For a candle carrying the move on, that edge is the near side (100%, approved);
for one turning against the candle before it, the same edge is the far side (0%, disqualified).
That is the whole mechanism — it asks whether the move carried on from where the last one ended, or
doubled back.
"""
from core.types import Candle

#: The midpoint his rule names. NOT a tuned number — it is the word "half" in his own sentence.
_HALF = 0.5

#: ⚠ AN OPEN EXACTLY ON THE MIDPOINT MUST PASS, and without this it did not. Off 5-decimal
#: prices a true 50.000% divides out as 0.49999999..., so the one candle sitting precisely on his
#: boundary was refused. `momentum_grade` carries the same epsilon for exactly the same reason.
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


def verdict(h1: list[Candle], i: int, bullish: bool) -> tuple[bool, float | None]:
    """-> (does his rule approve this candle, where its open sat).

    Approves when there is nothing to judge against — the first bar, or a previous candle with no
    body. A rule that cannot be evaluated must not invent a refusal.
    """
    if i < 1 or i >= len(h1):
        return True, None
    pos = open_position(h1[i - 1], h1[i], bullish)
    return (True, None) if pos is None else (pos >= _HALF - _EPS, pos)


def line(h1: list[Candle], i: int, bullish: bool) -> str | None:
    """One sentence for the DM card.

    Written so he can read the verdict AND the reason without knowing the rule by heart — the whole
    point of putting it on the card is that he watches it and tells me what to change.
    """
    ok, pos = verdict(h1, i, bullish)
    if pos is None:
        return ("STOMACH RULE — not judged — the candle before it had no body to measure "
                "against, so nothing was disqualified. (Watching only, it gates nothing yet.)")
    where = ("GAPPED clear of the previous candle's body" if pos > 1.0
             else f"{pos:.0%} along the previous candle's body")
    if ok:
        return (f"STOMACH RULE — APPROVED: it opened {where}, on the far side of the stomach "
                f"(the midpoint of that body) in the direction it is moving. "
                f"Watching only — this does not gate anything yet.")
    return (f"STOMACH RULE — DISQUALIFIED: it opened {where}, which is back through the stomach "
            f"(the midpoint of that body), so the move doubled back instead of carrying on. "
            f"Watching only — this does not gate anything yet.")


def tag(h1: list[Candle], i: int, bullish: bool) -> str:
    """The short verdict for the card's LABEL — the SECOND line of the message.

    ⚠ IT GOES IN THE LABEL BECAUSE THE DETAILS LIST IS CAPPED AT FIVE BULLETS
    (telegram_formatter.py:52) and this card already fills all five, so the verdict sat third and
    was easy to miss. His instruction, 2026-11-09: *"The DM message should clearly state that it is
    either approved by that new rule or not."*
    """
    ok, pos = verdict(h1, i, bullish)
    if pos is None:
        return "STOMACH RULE: NOT JUDGED"
    return f"STOMACH RULE: {'APPROVED' if ok else 'DISQUALIFIED'}"
