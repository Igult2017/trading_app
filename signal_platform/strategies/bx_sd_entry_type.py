"""BX-S/D — name the entry in the book's own vocabulary (Ch.2 "Entry Types").

The book splits entries on ONE axis: has the HTF trend been confirmed by a second BMS?

  Entry-1  RISK ENTRY          a limit order on the refined zone. "There is minimal confirmation for
                               entry therefore the likelihood of being stopped out is increased."
                               Diagram pp9-10: "Risk entry: Trend has yet to be confirmed/justified"
                               — it sits after the FIRST BMS.
  Entry-2  JUSTIFICATION ENTRY "Waiting for a BMS to occur on a LTF in the direction of the trend
                               gives you additional confirmation to take that trade more safely than
                               simply setting a limit order."
                               Diagram pp9-10: "Justification entry: Trend has now been
                               confirmed/justified" — after the SECOND BMS.

The book also names when a justification entry is the right tool regardless of BMS count: "when price
is moving back to your SC aggressively, YOU'RE LOOKING TO TAKE A COUNTER TREND TRADE, or when there
are multiple SCs to consider." That is the same conclusion the control model reaches from p35/p57 —
an against-control trade needs a confirmation — arrived at independently, which is why both are cited.

WHAT THIS IS NOT. BX has no risk-entry path: every signal passes the mandatory 1M/5M confirmation
(bx_sd.py STAGE 2-3), so BX is ALWAYS taking Entry-2 in substance. This module classifies and
explains; it NEVER rejects a setup. Its output is card text.

Consequence worth keeping: because BX never places an unconfirmed limit, p35's prohibition ("you
can't trade demand without a confirmation" when supply is in control) is satisfied structurally, not
by a check that could be forgotten.
"""
from strategies.bx_sd_control import NEUTRAL


def classify(structure, control_side: str, zone_direction: str) -> dict:
    """Which of the book's entry types this setup corresponds to, and why.

    `structure` is a StructureState (bx_sd_structure). Its `confirmed` flag is exactly the book's
    axis — True after two same-direction breaks — which is why it is still computed even though BX
    no longer GATES on the trend.
    """
    confirmed = bool(getattr(structure, "confirmed", False))
    # NEUTRAL covers both "none" and "contested" — neither is a side, so neither can be traded
    # against. Testing `!= "none"` alone would have read a contested bar as an against-control trade.
    against   = control_side not in NEUTRAL and control_side != zone_direction

    # READER-FACING TEXT CARRIES NO SOURCE CITATIONS. These strings go on the live signal card, and
    # a chapter or page number is noise to someone deciding whether to take a trade — it also puts
    # the method on display for anyone the card is forwarded to. The book remains the source of the
    # logic and stays cited in the code comments and the strategy docs, which is where a citation is
    # useful: it tells the next engineer where a rule came from. (User, 2026-08-01.)
    why = []
    if confirmed:
        why.append("HTF trend confirmed (2nd BMS) — justification entry")
    else:
        why.append("HTF trend NOT yet confirmed (1st BMS) — a risk-entry situation; "
                   "BX still confirms on 1M/5M, so it is taken as a justification entry")
    if against:
        why.append(f"{control_side} in control — counter-trend, taken as a justification entry")
    why.append("BX always waits for the LTF BMS/CHoCH — never an unconfirmed limit")

    return {"entry_type": "Entry-2 (justification)",
            "book_situation": "Entry-2" if confirmed else "Entry-1",
            "trend_confirmed": confirmed,
            "against_control": against,
            "why": why}


def phrase(info: dict) -> str:
    """One card line. No source citations — see the note in `classify`."""
    tail = ("trend confirmed" if info["trend_confirmed"]
            else "trend not yet confirmed — a risk-entry situation; BX confirms anyway")
    extra = ", counter-trend" if info["against_control"] else ""
    return f"Justification entry (LTF BMS/CHoCH) — {tail}{extra}"
