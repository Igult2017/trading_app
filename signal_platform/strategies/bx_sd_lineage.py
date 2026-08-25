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


def parent_of(child: MarkedZone, zones: list[MarkedZone],
              bars=None, pools=None) -> MarkedZone | None:
    """The zone whose reaction created `child` — the inverse of `child_of`. None if it has no parent.

    DERIVED, NOT REMEMBERED. The first design for this stored the child on `self._locked[symbol]` at
    signal 1 and waited for the return. Deriving it from the book instead is strictly better: it
    survives a restart, it replays identically, and it cannot go stale or disagree with the registry.
    The book already holds both zones and their times; the relationship was always computable.

    A zone with NO parent is not an entry candidate under his model. That is the point — it means the
    zone was not born of a reaction out of an extreme, so there is no CHoCH behind it to trade.

    A PARENT MUST BE A REAL EXTREME ZONE (2026-08-25). This accepted any respected same-side zone,
    which made "extreme" mean nothing more than "price held here" — a demand zone behind price in a
    rally counted identically to a supply zone standing in front of it. `bx_sd_extreme.is_extreme`
    is now the test, and it is the SAME one signal 1 opens its window on, which is his rule:
    *"Signal 1 and 2 use the same extreme/respected zone."*

    `bars`/`pools` are optional only so the older two-argument callers and tests keep working; without
    them the candidate half cannot be judged and this degrades to the pre-2026-08-25 answer. Production
    always passes them — `bx_sd_setup` has both to hand.
    """
    if child.marked_at is None:
        return None
    cands = [z for z in zones
             if z is not child
             and z.direction == child.direction
             and z.respected_at is not None
             and z.respected_at <= child.marked_at
             and z.state != "broken"]
    if bars is not None and pools is not None:
        from strategies.bx_sd_extreme import is_extreme
        cands = [z for z in cands if is_extreme(z, bars, pools, zones)]
    if not cands:
        return None
    return min(cands, key=lambda z: abs(z.proximal - child.proximal))


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
# THERE IS NO FOURTH REASON, and `CHOCH_FAKE_DECISIONAL` was DELETED on 2026-08-23. It asked "was the
# parent the furthest-out zone in its group when price arrived" — a test on WHERE THE ZONE SAT. His
# definition runs the other way round: *"decisional zones are zones that cause fake choch"*, so the
# label is the VERDICT, and using it as evidence for the verdict was circular. See `choch_verdict`.


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

    THREE TESTS, NOT FOUR (2026-08-23). A fourth test used to ask whether the parent was the
    furthest-out zone in its group when price arrived, and returned `CHOCH_FAKE_DECISIONAL` if not.
    It was deleted because it runs his definition backwards. His words: *"decisional zones are zones
    that cause fake choch. The code already has logic for detecting fake choch and what qualifies as
    fake choch."* So DECISIONAL IS THE VERDICT, not the evidence — the three tests above decide it,
    and a zone is decisional precisely because it produced a change of character that failed them.

    It was also the single biggest refusal in BX. Walked against 19 changes of character counted BY
    HAND from raw EUR/USD 4H candles over 3 months (no BX involved), it refused 15 of them — 79% —
    and nothing passed at all.

    HIS OWN `Fake CHOCH` DIAGRAM IS STILL REFUSED WITHOUT IT, twice over, which is the proof the test
    was carrying nothing: the rally there comes off a bare low with no zone behind it (test 1, no
    parent) and takes no liquidity on the way (test 3, no sweep). See `test_choch_validity`.
    """
    parent = parent_of(child, zones, bars, pools)
    if parent is None:
        # WHICH KIND OF "NO PARENT" — and this branch is why `CHOCH_FAKE_NO_SWEEP` still exists.
        #
        # The sweep moved INSIDE the definition of an extreme zone on 2026-08-25 (his rule: *"it is
        # the extreme above it where price HAS TO SWEEP LIQUIDITY to tap"*), so `parent_of` now
        # refuses a zone that was reached without one — and the standalone sweep test that used to
        # sit at the end of this function became unreachable. It was DELETED rather than left as a
        # branch that can never run.
        #
        # But collapsing both cases into "no extreme behind it" would lose a distinction he asked for
        # by name: *"let the system know fake CHOCH and the valid CHOCH."* A reversal off nothing and
        # a reversal off a real zone price reached without taking any stops are different mistakes.
        # So: ask again WITHOUT the extreme test. If a respected zone was there all along and the only
        # thing missing was the grab, say that.
        loose = parent_of(child, zones)
        if loose is not None and not (swept_before_tap(loose, bars, pools)
                                      or same_side_zone_broken_before(loose, zones)):
            return CHOCH_FAKE_NO_SWEEP
        return CHOCH_FAKE_NO_PARENT
    if not choch_complete(child):
        return CHOCH_FAKE_NO_BREAK
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


def same_side_zone_broken_before(parent: MarkedZone, zones: list[MarkedZone]) -> bool:
    """Did price close through a zone on the SAME side before it reached this one?

    His rule: a zone IS liquidity, so breaking one is a liquidity grab in its own right. Same side,
    because those are the zones price fought through on this approach — the stack in his diagram.
    Bounded to breaks that happened BEFORE this zone was tapped: a break afterwards belongs to what
    came next, not to the approach.
    """
    tap = parent.mitigated_at
    if tap is None:
        return False
    return any(o is not parent and o.direction == parent.direction
               and o.broken_at is not None and o.broken_at < tap
               for o in zones)


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
    # THE VALIDITY GATE (2026-08-22). A structure break with no liquidity swept on the way to the
    # extreme is a FAKE CHoCH by his rule and his document, and a fake one is a decisional one.
    #
    # `choch_verdict` IS ASKED FIRST, and that ordering matters (2026-08-25). A bare
    # `parent_of(...) is None` check used to sit above this and return its own sentence. Once the
    # liquidity sweep moved inside the definition of an extreme zone, that check started catching the
    # UNSWEPT case too — and reported it as "no parent zone", hiding the real reason behind a generic
    # one. The verdict already distinguishes the two, so it is the only thing that should answer.
    if bars is not None and pools is not None:
        _v = choch_verdict(mz, zones, bars, pools)
        if _v != CHOCH_VALID:
            return _v
    else:
        # Degraded: no bars or pools, so neither the extreme test nor the sweep can be judged.
        if parent_of(mz, zones) is None:
            return "no parent zone — it was not born of a reaction, so it is not an entry candidate"
        if not choch_complete(mz):
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
