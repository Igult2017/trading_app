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


# ── WHAT A ZONE WAS AT AN EARLIER MOMENT ────────────────────────────────────────────────────
# Moved here from `bx_sd_signal1` (2026-08-22) so BOTH signals ask the question the same way and
# `choch_verdict` can use it without a circular import. Signal 1 needed "was it the extreme when
# price arrived"; the decisional-CHoCH rule needs exactly the same question about the parent.
def state_at(z: MarkedZone, when: int) -> str:
    """The zone's state as of `when`, rebuilt from its transition stamps.

    Each stamp is written ONCE, at the transition, so the latest one at or before `when` is the state
    then. Checked newest-first because the lifecycle is one-way:
    unmitigated -> wick/body_mitigated -> respected -> broken.
    """
    if z.marked_at is None or when < z.marked_at:
        return ""                                   # did not exist yet
    if z.broken_at is not None and z.broken_at <= when:
        return "broken"
    if z.respected_at is not None and z.respected_at <= when:
        return "respected"
    if z.mitigated_at is not None and z.mitigated_at <= when:
        # wick vs body is not separately stamped; `mitigation_kind` carries the LATEST kind, and a
        # body always upgrades the record. Only "was it still untouched" matters here, so both
        # collapse to one answer rather than guessing which it was at the time.
        return "mitigated"
    return "unmitigated"


def live_at(z: MarkedZone, when: int) -> bool:
    """Was the zone on the book and untraded-through at `when`?"""
    s = state_at(z, when)
    return s not in ("", "broken")


def was_extreme_at(z: MarkedZone, zones: list[MarkedZone], when: int) -> bool:
    """Was this zone the EXTREME of its group at `when`?

    Mirrors `bx_sd_registry._label` exactly — the furthest-from-price still-UNMITIGATED zone in the
    group is the extreme — but reads each zone's state AS OF `when` instead of now. The group is the
    one the registry already stamped (`z.group`), so the grouping rule is not re-implemented here and
    cannot drift from it.

    A zone alone in its group holds no role at all (registry:302), and that is honoured: a group of
    one returns False rather than claiming a distinction the market never drew.

    ONE HONEST APPROXIMATION, stated rather than hidden. `z.group` is the grouping the registry
    computed for the book AS IT STANDS NOW, and `classify_roles` groups only zones that are live now
    (registry:224). So a zone that was live when price tapped this one, but has since been broken,
    carries group -1 and is invisible to the reconstruction below. If that zone was the furthest
    unmitigated one at the time, this returns True where the registry would have said `decisional`.

    It is not re-derived here on purpose: grouping needs the structure events and splitting on
    counter-side cuts, and a second copy of that rule would drift from the registry's — which is the
    failure this codebase has already paid for more than once. The narrower risk is the better trade.
    A consequence worth knowing: if the extreme zone ITSELF is later broken, its group goes to -1 and
    the window closes, which is the right outcome for a different reason.
    """
    if z.group is None or z.group < 0:
        return False                                # ungrouped: registry claims no role
    if state_at(z, when) != "unmitigated":
        return False                                # only an untouched zone can be the extreme
    group = [o for o in zones if o.group == z.group and live_at(o, when)]
    if len(group) < 2:
        return False                                # alone in its group -> role "" (registry:302)
    fresh = [o for o in group if state_at(o, when) == "unmitigated"]
    if not fresh:
        return False
    best = (max(fresh, key=lambda o: o.proximal) if z.direction == "supply"
            else min(fresh, key=lambda o: o.proximal))
    return best is z



def choch_complete(child: MarkedZone) -> bool:
    """Did the move break at least one OPPOSITE zone? Half of validity — see `choch_verdict`.

    ONE, NOT TWO. Two is a STRENGTH input (`bx_sd_strength._DOUBLE_MIN`) and must never gate — §4 is
    singular, §22 numbers step 8 unconditional against step 9 *"IF ... becomes STRONGER"*, and §16
    says two is *"stronger than breaking ONLY ONE"*, which presupposes one is already valid.

    THIS ALONE USED TO BE THE WHOLE TEST, and that was the defect fixed on 2026-08-22. A structure
    break with no liquidity swept on the way to the extreme is what his document calls a FAKE CHoCH.
    Callers wanting the real answer must use `choch_verdict` / `choch_valid`.
    """
    return child.broke_through >= 1


# The two verdicts, named. He asked for the system to KNOW the difference rather than imply it:
# *"let the system know fake CHOCH and the valid CHOCH and liquidity sweep is now a gate."*
CHOCH_VALID = "valid"
CHOCH_FAKE_NO_SWEEP = "fake: no liquidity swept on the way to the extreme zone"
CHOCH_FAKE_NO_BREAK = "fake: the move broke no opposite zone — structure never changed"
CHOCH_FAKE_NO_PARENT = "fake: no extreme zone behind it — the reversal came from nowhere"
CHOCH_FAKE_DECISIONAL = ("fake: it arose from a DECISIONAL zone — that zone was not the extreme "
                         "when price tapped it, so price was still going on to the real one")


def choch_verdict(child: MarkedZone, zones: list[MarkedZone], bars, pools) -> str:
    """VALID OR FAKE, and WHY. `CHOCH_VALID` when it is real; a `CHOCH_FAKE_*` reason otherwise.

    HIS RULE, 2026-08-22: *"liquidity sweep is a gate for CHOCH validity... Before price taps the
    extreme zone, it must sweep liquidity then tap extreme zone to create a CHOCH. If no liquidity
    sweep occurred on the price way to tapping extreme zone, the CHOCH created becomes invalid.
    We dont trade invalid zones because invalid CHOCH is a perfect definition of decisional CHOCH."*

    HIS DOCUMENT SAYS THE SAME THING FOUR TIMES, and it was read before this was written:
      * p24, the numbered sequence — step 4 "Wait for liquidity sweep", step 5 "price reaches the
        higher-time-frame demand", step 7 the CHoCH. Step 4 carries NO condition; where the document
        means optional it says so, and step 9 begins "If".
      * p24, valid vs fake table — "Liquidity may remain unswept" sits on the FAKE side.
      * p25, Mistake 3 — "Entering before a liquidity sweep."
      * p25, Mistake 4 — "Entering from a decisional zone too early: price may continue toward the
        extreme zone and sweep liquidity first." His decisional/extreme/sweep link, in one sentence.
    Only p16 §10 reads softer ("additional confirmation"), and THAT is the passage the old code was
    built on — which is how the sweep ended up as a score that could refuse nothing.

    THE WINDOW ENDS AT THE PARENT'S FIRST TAP, and that is the correction. The old call measured up
    to the CURRENT bar — for signal 2 that is price RETURNING to the child zone, the document's step
    11, seven steps after the sweep it needs to see. The sweep that matters happened before the
    extreme was ever touched, so the window ends at `parent.mitigated_at` (stamped once, on the first
    tap — see `bx_sd_registry._advance`).

    `swept_within`, NEVER `swept_before`: at a tap the latter is vacuous — measured, it answered YES
    on 100% of taps on both pairs. See its docstring; it is correct only at zone FORMATION.
    """
    parent = parent_of(child, zones)
    if parent is None:
        return CHOCH_FAKE_NO_PARENT
    if not choch_complete(child):
        return CHOCH_FAKE_NO_BREAK
    if not swept_before_tap(parent, bars, pools):
        return CHOCH_FAKE_NO_SWEEP
    # THE DECISIONAL TEST — HIS DEFINITION, 2026-08-22:
    #
    #     "Any zone that causes decisional CHOCH is a decisional zone. Decisional CHOCH is caused by
    #      decisional zones."
    #
    # So it is asked of the PARENT, the zone the reversal came out of: was that zone the EXTREME when
    # price arrived at it? If it was the decisional one, price was still on its way to the real
    # extreme, and the change of character it produced is the fake the document warns about (p21 s20:
    # "price may create a decisional supply zone but still have liquidity sitting above it").
    #
    # AS OF THE TAP, NEVER "NOW" — and this is the trap that has now bitten three times. Only an
    # UNMITIGATED zone can hold the `extreme` label (`classify_roles`, registry:304), and a parent has
    # by definition been tapped, so its role TODAY is always `decisional`. Measured: 77 of 77 parents
    # read decisional now, which would refuse everything. Asked of the moment price arrived, 1 of 77
    # had a genuinely extreme parent — and that 1% matches the note already in `bx_sd_setup`: "of 86
    # EUR/USD taps and 73 GBP/USD taps, ONE was on an unmitigated zone."
    #
    # A ZONE ALONE IN ITS GROUP claims no role at all (registry:302), so `was_extreme_at` answers
    # False for it and it is treated as decisional here — the stricter reading, deliberately.
    if parent.mitigated_at is None or not was_extreme_at(parent, zones, parent.mitigated_at - 1):
        return CHOCH_FAKE_DECISIONAL
    return CHOCH_VALID


def choch_valid(child: MarkedZone, zones: list[MarkedZone], bars, pools) -> bool:
    """Is this a real change of character? The yes/no form of `choch_verdict`."""
    return choch_verdict(child, zones, bars, pools) == CHOCH_VALID


def swept_before_tap(parent: MarkedZone, bars, pools) -> bool:
    """Was resting liquidity taken out on the approach to this extreme zone, BEFORE price tapped it?

    The document's step 4 before its step 5. `parent.mitigated_at` is the moment price first touched
    the zone, so the window is the `LIQ_WINDOW` bars leading up to it — the same constant the
    formation check uses, deliberately: a second number for "how recently" would be invented.

    A zone never tapped has no approach to judge, so there is nothing to have swept: False.
    """
    from strategies.bx_sd_liquidity import swept_within
    from strategies.bx_sd_registry import LIQ_WINDOW
    if parent.mitigated_at is None:
        return False
    idx = {c.time: i for i, c in enumerate(bars)}
    tap_i = idx.get(parent.mitigated_at)
    if tap_i is None:
        return False                    # older than the window handed to us — cannot judge it
    side = "sell" if parent.direction == "demand" else "buy"
    return swept_within(pools, bars, side, max(0, tap_i - LIQ_WINDOW), tap_i)


def is_entry_zone(mz: MarkedZone, zones: list[MarkedZone], live,
                  bars=None, pools=None) -> bool:
    """SIGNAL 2 — may we enter on this zone right now? His rule, end to end:

        "After the price breaking an opposite zone or two, it is anticipated to go back and tap the
         unmitigated zone it formed when it tapped the HTF zone to birth the CHoCH. ... the second one
         is a confirmed entry when the price comes back to tap the zone that was created when CHoCH
         happened."

    Four things, all derived from the book:
      * this zone was BORN of a reaction out of a parent          (`parent_of`)
      * the CHoCH is VALID — swept, and it broke an opposite zone (`choch_verdict`)
      * the zone is still LOADED — unmitigated, or wick-only      (the return visit fills it)
      * price is TAPPING it right now

    `bars` and `pools` are what the sweep is judged from. They are OPTIONAL only so the older
    two-argument callers and tests keep working; when they are absent the sweep cannot be checked and
    this falls back to the pre-2026-08-22 answer. Production always passes them — `bx_sd_setup` has
    both to hand — so the gate is live where it matters.

    The entry PRICE inside it is unchanged: `bx_sd_ltf.refine_zone` to the entry TF, entry at the
    refined proximal and stop at its distal (the book's p81 model). His correction stands — the LTF
    is for entry, the zone itself is 4H.
    """
    return entry_refusal(mz, zones, live, bars, pools) is None


def entry_refusal(mz: MarkedZone, zones: list[MarkedZone], live,
                  bars=None, pools=None) -> str | None:
    """WHICH condition refused this zone — None when it qualifies as a signal-2 entry.

    `is_entry_zone` answers yes/no, and a bare no is what made BX's eight-day silence undiagnosable:
    the caller could only report "the move broke no opposite zone", which is one of several reasons
    and was usually not the one that fired. Four different facts — no parent, a FAKE change of
    character, the zone already spent, price not on it — arrived as one sentence.

    The architecture doc's own instruction, after a 0 was misread once already: *"Verify a 0 against
    the book before believing it."* This is what makes that answerable from one query.
    """
    if parent_of(mz, zones) is None:
        return "no parent zone — it was not born of a reaction, so it is not an entry candidate"
    # THE VALIDITY GATE (2026-08-22). A structure break with no liquidity swept on the way to the
    # extreme is a FAKE CHoCH by his rule and his document, and a fake one is a decisional one.
    # Only answerable with the bars and pools; without them this degrades to the break test alone.
    if bars is not None and pools is not None:
        _v = choch_verdict(mz, zones, bars, pools)
        if _v != CHOCH_VALID:
            return _v
    elif not choch_complete(mz):
        return "the CHoCH has not completed — no opposite zone broken behind it"
    if not (mz.state == "unmitigated" or mz.wick_only):
        return f"the zone is already spent ({mz.state}) — the return visit would not be the first fill"
    if not mz.tapped_by(live):
        return "price is not tapping it right now"
    return None


def ready_for_entry(child: MarkedZone, live) -> bool:
    """Is price back at the child zone, with a completed CHoCH behind it and the zone still loaded?

    UNMITIGATED — the return visit is the FIRST time orders there get filled. A child already traded
    through is spent, and entering it is the fake-CHoCH mistake one level down: the reaction has
    already been used. `wick_only` still qualifies, his settled rule — a wick leaves the orders
    unfilled, so the zone is still loaded.

    NO SWEEP CHECK HERE, on purpose: it needs the PARENT, and this function only sees the child.
    Validity lives in `choch_verdict`, which `is_entry_zone` asks. Do not add a second copy.
    """
    return (choch_complete(child)
            and (child.state == "unmitigated" or child.wick_only)
            and child.tapped_by(live))
