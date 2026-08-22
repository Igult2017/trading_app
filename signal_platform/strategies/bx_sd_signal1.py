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
from strategies.bx_sd_registry import MarkedZone, build as build_zones, to_zone
from strategies.bx_sd_setup import SetupResult
from strategies.bx_sd_ltf import LTFConfluence
from strategies.bx_sd_entry import entry_trigger
from shared.mtf_utils import closed_only


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


# ── THE PULLBACK, AND WHAT MUST BE TRUE WHERE IT LANDS ───────────────────────────────────────────

def tapped_now(zones: list[MarkedZone], live: Candle) -> list[MarkedZone]:
    """Which live zones is the FORMING bar touching right now, same-direction filtering left to the
    caller. A tap is an EVENT happening now, so it is asked of the forming bar — the same rule the
    rest of the cascade follows (`bx_sd_setup`: "the FORMING bar is in the zone RIGHT NOW")."""
    return [z for z in zones if z.live and z.tapped_by(live)]


def build_mtf_books(h1, m30, m15, pip: float) -> dict:
    """Zone books for the confluence legs — built ONCE PER SCAN, not once per zone.

    THIS IS A PERFORMANCE CONTRACT, not a tidiness preference. `find_signal1` is asked about every
    zone on the 4H book, and the first version rebuilt all three of these inside it: ~50 zones x 3
    replays = 150 zone replays per instrument per tick, against a tick that already takes ~12s.
    Building them here and passing them down makes it three, whatever the book's size.
    """
    return {"1H":  (build_zones(h1, pip)  if h1  else [], h1),
            "30M": (build_zones(m30, pip) if m30 else [], m30),
            "15M": (build_zones(m15, pip) if m15 else [], m15)}


def mtf_confluence(direction: str, live: Candle, books: dict) -> tuple[bool, list[str], list]:
    """HIS REQUIREMENT, not a score: a 1H zone AND a 15M-or-30M zone must be tapped here.

        "Also add 1HR ... and 30m or 15ms as a confluence. There has to be a zone the price is
         tapping in those confluences which confirms the confirmation entry in 1m or 5min is genuine."

    He was asked directly whether this scores or refuses and answered: *"These are a confluence for
    signal one and also a requirement. Without them the signal doesn't fire."* So it GATES.

    1H IS THE ONLY HIGHER LEG. He chose it over 2H — *"1HR is enough so lets use 1HR instead of
    2HR"* — which also avoids building a timeframe the broker does not serve natively (H1/H4/H12
    only; an H2 bar would have to be glued from two H1s).

    THE SAME `build` THE 4H BOOK USES, on a finer series. It is generic over any candle list, so the
    zone definition — imbalance + broke structure + liquidity swept before it — is identical on every
    leg. A second, looser "is there a zone here" test would drift from the 4H one, and drift between
    two copies of a rule is a failure this codebase has already paid for.
    """
    want = "demand" if direction == "buy" else "supply"
    legs: list[str] = []
    hit: list = []

    h1_zones = [z for z in tapped_now(books["1H"][0], live) if z.direction == want]
    if h1_zones:
        legs.append("1H")
        hit += h1_zones

    lower = False
    for label in ("30M", "15M"):
        zs = [z for z in tapped_now(books[label][0], live) if z.direction == want]
        if zs:
            legs.append(label)
            hit += zs
            lower = True

    return (bool(h1_zones) and lower), legs, hit


def pullback_zone(direction: str, live: Candle, books: dict):
    """The zone the pullback is landing on, and the leg it came from — nearest tapped zone to price.

    His preference, and it is a preference rather than a condition: *"if we get it tapping a zone it
    formed along the way, the better because that is a stronger confluence."* So the trigger is the
    pullback itself; which zone it lands on decides where the entry and stop sit.

    Nearest, not largest: the entry is priced INSIDE this zone, so a distant one would hang the stop
    somewhere price is not. The LEG is returned with it because `to_zone` resolves indices against
    the series the zone was built from — hand it the wrong one and it silently returns None.
    """
    ok, _legs, _hit = mtf_confluence(direction, live, books)
    if not ok:
        return None, None
    want = "demand" if direction == "buy" else "supply"
    px = live.close
    best, best_leg, best_d = None, None, None
    for label in ("1H", "30M", "15M"):
        for z in tapped_now(books[label][0], live):
            if z.direction != want:
                continue
            d = abs(((z.top + z.bottom) / 2.0) - px)
            if best_d is None or d < best_d:
                best, best_leg, best_d = z, label, d
    return best, best_leg


def find_signal1(direction: str, ext: MarkedZone, zones: list[MarkedZone], h4: list[Candle],
                 books: dict, entry_tf: list[Candle], m5: list[Candle], pip: float):
    """The whole of signal 1, in his order. Returns (setup, conf, trig, legs) or None.

        tap an unmitigated extreme -> leave its band -> first pullback -> a 1H zone AND a 15M/30M
        zone tapped there -> a 1M/5M confirmed entry.        Window dies at the first opposite break.

    ENTRY, STOP AND TARGET ARE SIGNAL 2's, UNCHANGED. `entry_trigger` is reused as-is, anchored on
    the pullback zone instead of the 4H zone: entry at the refined 5M zone's start (or its 50% when
    the book's wick/width rule applies), stop at that zone's far edge, target a fixed 3R. Not a new
    pricing rule — his existing rules applied to a different zone, which is the only change he asked
    for. A separate pricing model here would be a second definition of "entry" to keep in step.
    """
    bars = closed_only(h4)
    if not bars or not window_open(ext, zones, bars):
        return None
    live = h4[-1]                       # the FORMING bar — the pullback is an event happening now
    pz, leg = pullback_zone(direction, live, books)
    if pz is None:
        return None                     # no 1H + 15M/30M zone here: his requirement, so no signal
    _ok, legs, _hit = mtf_confluence(direction, live, books)

    z = to_zone(pz, closed_only(books[leg][1]))
    if z is None:
        return None
    setup = SetupResult(active=True, direction=direction, zone=z, entry_via="pullback")
    conf  = LTFConfluence(confirmed=True, passed=True, refined_zone=z)
    trig  = entry_trigger(conf, setup, entry_tf, h4, pip, session_candles=books["15M"][1], refine_tf=m5)
    if not trig.triggered:
        return None
    return setup, conf, trig, legs


def build_signal1(symbol: str, setup, conf, trig, legs: list[str], ext: MarkedZone,
                  pip: float, digits: int, strategy_id: str, strategy_name: str):
    """The signal-1 card. A REAL trade, tagged as the risky one.

    His ruling when asked whether signal 1 stays an alert or becomes tradeable:
    *"It should be a valid signal but carries unconfirmed/risky entry tag."*

    So unlike the old stage-1 heads-up it carries entry, stop and target — and unlike signal 2 it
    says plainly that the change of character has NOT completed yet. That is the whole difference
    between the two, and the reader has to be able to see it on the card without counting fields.
    """
    from strategies.bx_sd_signal import build_signal
    from notifications import titles

    sig = build_signal(symbol, setup, conf, trig, pip, digits, strategy_id, strategy_name)
    sig.headline = titles.UNCONFIRMED_ENTRY
    sig.stage    = "building"          # amber on the card — the CHoCH has not completed
    sig.alert_only = False             # it is a trade, so it is not an alert
    sig.to_channel = True              # his rule, 2026-08-19: both signals go to the channel
    sig.technical_reasons = [
        "⚠️ RISKY / UNCONFIRMED ENTRY — the change of character has NOT completed. "
        "This is the pullback after the extreme zone reacted, taken before the opposite zone breaks.",
        f"4H extreme {ext.direction} zone was UNMITIGATED when price tapped it "
        f"[{ext.bottom:.{digits}f}–{ext.top:.{digits}f}]",
        f"Price left the zone and pulled back into a {' + '.join(legs)} zone",
        *sig.technical_reasons,
    ]
    return sig
