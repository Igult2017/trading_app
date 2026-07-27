"""
BX-S/D — 4H setup gate (Phase 5). First assembly of Phases 1-4.

The book confirms the SETUP on the 4H only, then drops to the LTF. This answers the one
question: is there a VALID, CONFIRMED 4H setup that price is tapping RIGHT NOW — in EITHER direction?

DIRECTION IS NOT GATED BY A TREND. The book has no swing-structure "trend": it asks who is IN
CONTROL (Ch.7), and control never forbids a side — it only forbids the unconfirmed RISK entry
("We do not place a limit order here!", p38). The book itself takes the against-control trade:
"supply is in control, but we expect a Flip or CHoCH after we tapped in H4 demand" (p57). Every BX
signal is 1M/5M-confirmed (bx_sd.py STAGE 2-3), so BX always pays that price and may trade both
sides. The old `pro_trend()` gate was a foreign filter, and it discarded 70-78% of book-valid
freshly-tapped zones — measured over 27 months on five instruments, 1.2 -> ~5.0 setups/month.
Control is still computed and REPORTED (bx_sd_control), never used to reject.

ZONES ARE NOT FOUND HERE. They are marked ONCE when they qualify and kept in bx_sd_registry; this
function only asks which marked zone price is working right now. That ordering is the point: a zone
judged later, against a window that has since moved, can be validated by a break that happened BEFORE
it existed — which is exactly how a mid-waterfall candle was sold as a zone on 27 Jul 2026.

  1. registry   the zone was marked when it qualified (IFC + its impulse broke structure + fuel)
  2. mitigated  price has tapped it within the last _RECENT 4H bars and it is not broken
  3. priced     discount for buys / premium for sells                      (confluence)
  4. the 1M/5M confirmation downstream is what proves the zone was RESPECTED
"""
from dataclasses import dataclass, field

from core.types import Candle
from shared.swing_points import find_swing_points
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_zones import Zone
from strategies.bx_sd_liquidity import find_liquidity
from strategies.bx_sd_confluence import premium_discount, pricing_aligned, fib_target, rsi_divergence
from strategies.bx_sd_control import control, describe, phrase
from strategies.bx_sd_entry_type import classify, phrase as et_phrase
from strategies.bx_sd_registry import build, to_zone
from shared.mtf_utils import closed_only

_SL_BUFFER_PIPS = 6.0  # the stop sits this far BEYOND the 4H zone's distal edge — the user's
                       # "5 to 6 pips behind the 4H zone", so a wick cannot take us out.
                       # Lives here because bx_sd_entry imports from this module.
_TP_R           = 3.0  # fixed 3R target (user: "just leave TP at 3R")
_RESPECT_BUFFER = 0.25 # the confirming close must sit this fraction of the 4H zone height
                       # INSIDE the zone from the distal — the user's "moved away from it a
                       # little, not struggling to break it". One constant, tune on evidence.
_RECENT     = 6    # a live tap must be within the last N 4H bars (leaves time for the LTF to confirm)
_MIN_PIPS   = 3.0  # ignore micro-FVG zones — same noise floor the 3 report paths already apply
                   # (bx_sd_reports._MIN_PIPS); the core cascade lacked it, so a sub-3-pip candidate
                   # could drive a real channel entry the reports would have skipped as noise


@dataclass
class SetupResult:
    active:      bool = False
    direction:   str  = ""        # "buy" | "sell"
    zone:        Zone | None = None
    entry:       float = 0.0
    sl:          float = 0.0
    tp1:         float = 0.0
    tp2:         float = 0.0
    confluences: dict = field(default_factory=dict)
    reason:      str  = ""        # diagnostics — why inactive


def detect_setup(h4: list[Candle], pip: float = 0.0001, book=None) -> SetupResult:
    r = SetupResult()
    if len(h4) < 30:
        r.reason = "not enough 4H history"; return r

    # `st` is still needed — is_valid -> broke_structure reads st.events, and that check derives its
    # required direction from the ZONE's own direction, so it was always direction-agnostic. Only
    # st.pro_trend() is gone: it decided WHICH SIDE to hunt, which is what cost 70-78% of setups.
    st    = map_structure(h4)
    pools = find_liquidity(h4, pip)
    price = h4[-1].close

    # The leg is needed INSIDE the selection loop now (see below), so it is computed up front.
    pts   = find_swing_points(h4)
    highs = [p.price for p in pts if p.is_high]
    lows  = [p.price for p in pts if not p.is_high]
    if not highs or not lows:
        r.reason = "no leg for premium/discount"; return r
    leg_low, leg_high = min(lows[-1], highs[-1]), max(lows[-1], highs[-1])

    # ZONES COME FROM THE REGISTRY — marked once when they qualified, and kept. Nothing is re-derived
    # here. The registry decided each zone's validity from the bars available AT ITS FORMATION, which
    # is what stops a break that PREDATES a zone from validating it (the 27 Jul defect: a mid-waterfall
    # candle marked as a zone off a BOS at lag -1). This function's job is only to ask which marked
    # zone price is working right now.
    bars   = closed_only(h4)
    # The book is built ONCE per scan by bx_sd.analyze and passed in; building it here would
    # duplicate the replay and risk two paths disagreeing. The fallback keeps this callable
    # standalone (tests, harnesses) without forcing every caller to know about the registry.
    marked = build(h4, pip) if book is None else book
    recent_cut = bars[-_RECENT].time if len(bars) >= _RECENT else bars[0].time

    # A zone is a candidate once price has MITIGATED it (tapped it) recently and it is still alive.
    # The 1M/5M confirmation downstream is what proves it was RESPECTED.
    cand, priced_out, live = None, 0, 0
    for mz in sorted(marked, key=lambda m: m.ifc_time, reverse=True):
        # state == "mitigated", NOT `live`. `live` also covers "respected", which is the RETEST
        # path's job (bx_sd_reports, min_grade="B"). Accepting it here let one zone fire BOTH —
        # a duplicate signal, and the fresh cascade fires at C+, bypassing the B/A bar the retest
        # deliberately requires of a zone that has already been worked.
        if mz.state != "mitigated" or mz.mitigated_at is None or mz.mitigated_at < recent_cut:
            continue
        if (mz.top - mz.bottom) < _MIN_PIPS * pip:
            continue
        live += 1
        if not pricing_aligned(leg_low, leg_high, price, mz.direction):
            priced_out += 1
            continue
        z = to_zone(mz, bars)
        if z is None:
            continue                      # older than this window — cannot resolve indices
        cand = z; break
    if cand is None:
        r.reason = (f"{priced_out} marked zone(s) mitigated but badly priced "
                    f"({premium_discount(leg_low, leg_high, price)})" if priced_out else
                    f"no marked zone mitigated in the last {_RECENT} 4H bars "
                    f"({sum(1 for m in marked if m.live)} live zones on the book)")
        return r

    tdir = "buy" if cand.direction == "demand" else "sell"
    up   = cand.direction == "demand"

    # These are the WIDE 4H zone's levels — informational only. We never trade them: the real entry/SL
    # come from the entry-TF refinement in entry_trigger, and bx_sd_confirm.confirm_grade runs the
    # defensive-liquidity guard on THOSE final levels (every entry-confirming path goes through it).
    # The guard used to run here too, on these wide levels, which only produced FALSE REJECTS — a pool
    # sitting on the 4H distal killed setups whose real SL is nowhere near it.
    entry = cand.proximal
    # same buffer the entry uses — one definition of where the stop goes (bx_sd_entry)
    sl    = cand.distal - _SL_BUFFER_PIPS * pip if up else cand.distal + _SL_BUFFER_PIPS * pip

    r.active, r.direction, r.zone = True, tdir, cand
    r.entry, r.sl = entry, sl
    r.tp1 = fib_target(leg_low, leg_high, tdir, 0.272)
    r.tp2 = fib_target(leg_low, leg_high, tdir, 0.618)
    side = control(marked)          # control reads the SAME book — one set of zones, never re-derived
    etype = classify(st, side, cand.direction)      # Ch.2 naming — classification only, never a gate
    r.confluences = {"control": describe(side, cand.direction), "control_phrase": phrase(side, cand.direction),
                     "entry_type": etype, "entry_type_phrase": et_phrase(etype),
                     "broke_structure": True, "liquidity_grab": True,
                     "pricing": premium_discount(leg_low, leg_high, price),
                     "rsi_divergence": rsi_divergence(h4, tdir)}
    r.reason = "active"
    return r
