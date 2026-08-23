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

    opens   price taps the zone and RESPECTS it — closes a full zone-height away
    fires   the first pullback after that, with the required 1H + 15M/30M zones being tapped
    closes  price closes through the first OPPOSITE zone — the CHoCH, which is signal 2's ground

ONE EXTREME ZONE, SHARED WITH SIGNAL 2, AND PRICE PROVES IT (his rule, 2026-08-23):

    "Signal 1 and 2 use the same extreme/respected zone however, signal one only waits for pullback
     then it fires. The price moves away from the zone and immediately we get a pullback we look for
     confirmations and alignments and then go to entry and look for confirmation entry."

The two signals differ in ONE thing: whether the opposite zone has broken yet. Signal 1 is the phase
before the change of character completes, which is why it carries the unconfirmed/risky tag.

WHAT WAS HERE BEFORE, so it is not re-derived. The window used to open on two weaker tests — was
this the furthest-out zone one bar before price arrived (`was_extreme_at`, position), and has any
closed bar stopped touching the zone (`has_left`). Both are gone. The position test was the single
biggest refusal in BX: 15 of 19 changes of character counted BY HAND from raw EUR/USD 4H candles
(79%) died on the same test in `choch_verdict`, and nothing passed at all. `has_left` was a weaker
statement of the same idea as respect, so it bound first and respect never got asked.

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


def first_tap_at(z: MarkedZone) -> int | None:
    """When price FIRST touched this zone — which is exactly when it stopped being unmitigated.

    `mitigated_at` is stamped once, on the first tap, and never moved (a body later upgrades
    `mitigation_kind`, not this). `last_tap_at` is the LATEST visit and is the wrong one to use here:
    his window opens at the tap that spent the zone, not at a return visit weeks later.
    """
    return z.mitigated_at


def opened_window(z: MarkedZone) -> bool:
    """Did this zone open a signal-1 window — has price RESPECTED it?

    HIS RULE, 2026-08-23: *"Signal 1 and 2 use the same extreme/respected zone however, signal one
    only waits for pullback then it fires. The price moves away from the zone and immediately we get
    a pullback."* So one definition of the extreme zone serves both signals, and it is proved by
    price reaction — `respected` means price tapped the zone and then CLOSED A FULL ZONE-HEIGHT AWAY
    from it (`bx_sd_registry.REACT_MULT`, stamped once on `respected_at`).

    Signal 2 asks for exactly the same thing: `parent_of` only accepts a zone with `respected_at`
    set. The two signals differ in ONE thing — whether the opposite zone has broken yet.

    WHAT THIS REPLACED, and why. It used to ask `was_extreme_at(z, zones, tap - 1)`: was this the
    furthest-out zone in its group one bar BEFORE price arrived. That is a test on WHERE THE ZONE
    SAT, decided before the market had said anything, and it was the single biggest refusal in BX —
    15 of 19 hand-counted changes of character (79%) died on the same test in `choch_verdict`.
    Position is now an expectation only (`bx_sd_registry._label`); reaction decides.

    `has_left` WENT WITH IT. It accepted any closed bar not touching the zone, which is a weaker
    statement than respect and was therefore the binding one. A full zone-height close away is, by
    definition, having left — two tests for one idea, and the loose one won. His answer when asked
    which: *"Signal 1 waits for respect... it replaces your 'left the band' rule."*
    """
    return z.respected_at is not None


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
    """Is this zone's signal-1 window open RIGHT NOW? Both of his boundaries, in order.

    `bars` is no longer read — the reaction is answered from `respected_at`, which the registry
    stamps while replaying those same bars. It stays in the signature because `find_signal1` and the
    harnesses call this positionally, and a silent argument shift is worse than an unused one.

    THE WINDOW CLOSES FROM THE TAP, NOT FROM THE RESPECT. His rule — *"this stops when the price has
    broken the first opposite zone which is the first qualification for signal 2 after CHOCH"* — does
    not say from when, and the tap is the stricter reading already in the code. Consequence, stated
    so it can be measured: if the opposite zone breaks BEFORE the zone earns its respect, signal 1
    never opens and the setup goes straight to signal 2. That is the right outcome — there was no
    signal-1 phase to have — but how often it happens is a number, not an opinion.
    """
    tap = first_tap_at(z)
    if tap is None or not opened_window(z):
        return False                                # price has not reacted a full zone-height away
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
        # THE CARD MUST NOT CLAIM WHAT IS NO LONGER CHECKED. This said "was UNMITIGATED when price
        # tapped it" and "price left the zone" — both were the pre-2026-08-23 tests and neither is
        # asked any more. The test now is RESPECT: a close a full zone-height clear of the zone.
        f"4H extreme {ext.direction} zone [{ext.bottom:.{digits}f}–{ext.top:.{digits}f}] — price "
        f"tapped it and REACTED a full zone-height clear of it",
        f"That reaction pulled back into a {' + '.join(legs)} zone",
        *sig.technical_reasons,
    ]
    return sig
