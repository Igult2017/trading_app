"""BX-S/D SIGNAL 1 — the window between leaving the extreme zone and the CHoCH completing.

HIS RULE, in his own words (2026-08-22):

    "The price should tap this zone, then move away and immediately it pulls back to tap a zone it
     formed along the way, we look for a confirmed continuation entry in 1m or 5m."

    "Immediately means any pullback that comes after the price has left the extreme zone it tapped...
     So we dont use time we just keep track of price action."

    "However, this stops when the price has broken the first opposite zone which is the first
     qualification for signal 2 after CHOCH."

    "It must be unmitigated and extreme zones, not just any zone."

So the window is bounded by PRICE ACTION at both ends, never a clock:

    opens   price leaves the band of an extreme zone it tapped while that zone was unmitigated
    fires   the first pullback after that, with the required 1H + 15M/30M zones being tapped
    closes  price closes through the first OPPOSITE zone — the CHoCH, which is signal 2's ground

WHY EVERY CHECK HERE IS "AS OF THE TAP", NOT "NOW". Both labels his rule names are destroyed by the
very tap that opens the window: a tapped zone is no longer `unmitigated`, and `classify_roles` only
lets an unmitigated zone hold `extreme` (`fresh = [z for z in group if z.state == "unmitigated"]`,
bx_sd_registry:304), so it is relabelled `decisional` the moment the tapping bar closes. Asking
"is this zone unmitigated and extreme?" at entry time therefore always answers NO — which is exactly
the contradiction that has had signal 2 dead since 14 Aug 2026. The question has to be asked of the
moment price arrived.

Nothing here mutates a zone. The registry stamps every transition with a timestamp
(`marked_at`, `mitigated_at`, `respected_at`, `broken_at`), and those are enough to reconstruct what
the book looked like at any earlier bar — so this module READS history rather than storing more of it.
"""
from core.types import Candle
from strategies.bx_sd_registry import MarkedZone


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


def first_tap_at(z: MarkedZone) -> int | None:
    """When price FIRST touched this zone — which is exactly when it stopped being unmitigated.

    `mitigated_at` is stamped once, on the first tap, and never moved (a body later upgrades
    `mitigation_kind`, not this). `last_tap_at` is the LATEST visit and is the wrong one to use here:
    his window opens at the tap that spent the zone, not at a return visit weeks later.
    """
    return z.mitigated_at


def opened_window(z: MarkedZone, zones: list[MarkedZone]) -> bool:
    """Did this zone open a signal-1 window — i.e. was it unmitigated AND extreme when price arrived?"""
    tap = first_tap_at(z)
    return tap is not None and was_extreme_at(z, zones, tap - 1)


def has_left(z: MarkedZone, bars: list[Candle]) -> bool:
    """Has price left the zone's band since the tap that opened the window?

    HIS DEFINITION, and it is deliberately NOT the `respected` one: *"any pullback that comes after
    the price has left the extreme zone it tapped."* `respected` means a close a FULL zone-height
    away (registry.REACT_MULT) — a much later, much rarer event. Leaving the band is simply a closed
    bar that is not touching the zone any more, which is what he described and fires far earlier.
    """
    tap = first_tap_at(z)
    if tap is None:
        return False
    return any(c.time > tap and not z.tapped_by(c) for c in bars)


def opposite_broken_since(z: MarkedZone, zones: list[MarkedZone], since: int) -> bool:
    """Has an OPPOSITE zone been closed through since `since`? That ends the window.

    His rule: *"this stops when the price has broken the first opposite zone which is the first
    qualification for signal 2 after CHOCH."*

    NOT `broke_through`. That counter looks forward from a zone's `marked_at` and stops at the first
    structure event the other way (registry:244-272), so on an extreme zone it measures the ORIGINAL
    impulse that left the zone behind — possibly months before price ever came back to tap it. It is
    the right measurement for signal 2, where the child zone is created BY the reaction, and the
    wrong one here. `broken_at` is stamped per zone, so the question can be asked directly.
    """
    opp = "demand" if z.direction == "supply" else "supply"
    return any(o.direction == opp and o.broken_at is not None and o.broken_at > since
               for o in zones)


def window_open(z: MarkedZone, zones: list[MarkedZone], bars: list[Candle]) -> bool:
    """Is this zone's signal-1 window open RIGHT NOW? All three of his boundaries, in order."""
    tap = first_tap_at(z)
    if tap is None or not opened_window(z, zones):
        return False                                # never qualified to open one
    if not has_left(z, bars):
        return False                                # price has not left the band yet
    if opposite_broken_since(z, zones, tap):
        return False                                # CHoCH began — signal 2's ground from here
    return True
