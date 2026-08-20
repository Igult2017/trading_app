"""
BX-S/D — WHICH ZONE WAS BORN OF WHICH REACTION. The parent -> child link, and nothing else.

HIS SEQUENCE, and the one sentence BX could not say:

    liquidity swept -> price taps the EXTREME HTF unmitigated zone -> it is RESPECTED -> the CHoCH
    breaks the opposite zone (the last protected low of the trend) -> price RETURNS to tap the zone
    that was created when the CHoCH was born at the HTF zone -> confirmed entry.

    "This means the signal fires twice."

BOTH ZONES ALREADY EXIST IN THE BOOK. The reaction at the HTF zone leaves an imbalance and its move
breaks structure, so `bx_sd_registry.build()` marks the new zone like any other 4H zone. Nothing here
mints a zone, and there must never be a second way to do so.

WHAT WAS MISSING IS ONLY THE LINK — *"this zone was born of the reaction at that one"*. Without it BX
re-traded the SAME zone twice instead of moving to the child, because the child is just another zone
in a book of hundreds with nothing marking it as the one to wait for.

IT IS A 4H ZONE, NOT AN LTF ONE. His correction, after I misread the diagram's `1M Supply` label:
*"The LTF is for entry. The zone created is a 4HR zone. It is another 4HR zone; however, in that
diagram I marked the LTF zone which is entry TF still inside the 4 hour zone."* So the child is found
in the same 4H book, and `bx_sd_ltf.refine_zone` prices the entry INSIDE it exactly as it does today.
"""
from strategies.bx_sd_registry import MarkedZone


def child_of(parent: MarkedZone, zones: list[MarkedZone]) -> MarkedZone | None:
    """The OPPOSITE-side 4H zone created by the reaction out of `parent`. None if there is not one.

    THE REACTION IS THE ANCHOR, not the tap. A zone is only a child if it was marked at or after the
    moment `parent` was respected — that is when price actually turned and left the zone behind. Using
    the tap instead would catch zones formed while price was still working INTO the parent, which is
    the opposite side of the move.

    NEAREST, NOT FURTHEST. The reaction leaves its zone immediately adjacent to the parent (his
    diagram draws it flush under the HTF Supply). Taking the furthest opposite zone would wander to a
    different move entirely — the same 550-pip mistake `classify_roles` already had to be scoped for.

    THE CHILD IS THE SAME SIDE AS THE PARENT, and this is worth being exact about because it is easy
    to get backwards. Bearish case: price rallies into a SUPPLY zone and reacts DOWN. The zone left
    behind at the top of that sell-off is itself a SUPPLY zone — his diagram draws it flush beneath
    the HTF Supply and labels it EXTREME. What the CHoCH goes on to BREAK is the opposite side
    (demand), and that count is `broke_through` on the child. So: child same side, breakthroughs
    opposite side. Mirrored for bullish. Both directions are asserted in `test_lineage`.
    """
    if parent.respected_at is None:
        return None
    same = [z for z in zones
            if z is not parent
            and z.direction == parent.direction
            and z.marked_at is not None
            and z.marked_at >= parent.respected_at
            and z.state != "broken"]
    if not same:
        return None
    # nearest to the parent's proximal — the reaction's own zone sits against it
    return min(same, key=lambda z: abs(z.proximal - parent.proximal))


def parent_of(child: MarkedZone, zones: list[MarkedZone]) -> MarkedZone | None:
    """The zone whose reaction created `child` — the inverse of `child_of`. None if it has no parent.

    DERIVED, NOT REMEMBERED. The first design for this stored the child on `self._locked[symbol]` at
    signal 1 and waited for the return. Deriving it from the book instead is strictly better: it
    survives a restart, it replays identically, and it cannot go stale or disagree with the registry.
    The book already holds both zones and their times; the relationship was always computable.

    A zone with NO parent is not an entry candidate under his model. That is the point — it means the
    zone was not born of a reaction out of an extreme, so there is no CHoCH behind it to trade.
    """
    if child.marked_at is None:
        return None
    cands = [z for z in zones
             if z is not child
             and z.direction == child.direction
             and z.respected_at is not None
             and z.respected_at <= child.marked_at
             and z.state != "broken"]
    if not cands:
        return None
    return min(cands, key=lambda z: abs(z.proximal - child.proximal))


def choch_complete(child: MarkedZone) -> bool:
    """Has the CHoCH finished? His rule, and the document's:

        "a valid CHoCH originates from an UNMITIGATED HTF zone and breaks ONE opposite zone;
         breaking TWO is a stronger confirmation."

    ONE, NOT TWO. Two is a STRENGTH input (`bx_sd_strength._DOUBLE_MIN`) and must never gate — §4 is
    singular, §22 numbers step 8 unconditional against step 9 *"IF ... becomes STRONGER"*, and §16
    says two is *"stronger than breaking ONLY ONE"*, which presupposes one is already valid.
    """
    return child.broke_through >= 1


def is_entry_zone(mz: MarkedZone, zones: list[MarkedZone], live) -> bool:
    """SIGNAL 2 — may we enter on this zone right now? His rule, end to end:

        "After the price breaking an opposite zone or two, it is anticipated to go back and tap the
         unmitigated zone it formed when it tapped the HTF zone to birth the CHoCH. ... the second one
         is a confirmed entry when the price comes back to tap the zone that was created when CHoCH
         happened."

    Four things, all derived from the book:
      * this zone was BORN of a reaction out of a parent          (`parent_of`)
      * the CHoCH completed — one opposite zone broken            (`choch_complete`)
      * the zone is still LOADED — unmitigated, or wick-only      (the return visit fills it)
      * price is TAPPING it right now

    The entry PRICE inside it is unchanged: `bx_sd_ltf.refine_zone` to the entry TF, entry at the
    refined proximal and stop at its distal (the book's p81 model). His correction stands — the LTF
    is for entry, the zone itself is 4H.
    """
    return parent_of(mz, zones) is not None and ready_for_entry(mz, live)


def ready_for_entry(child: MarkedZone, live) -> bool:
    """Is price back at the child zone, with the CHoCH behind it and the zone still loaded?

    UNMITIGATED — the return visit is the FIRST time orders there get filled. A child already traded
    through is spent, and entering it is the fake-CHoCH mistake one level down: the reaction has
    already been used. `wick_only` still qualifies, his settled rule — a wick leaves the orders
    unfilled, so the zone is still loaded.
    """
    return (choch_complete(child)
            and (child.state == "unmitigated" or child.wick_only)
            and child.tapped_by(live))
