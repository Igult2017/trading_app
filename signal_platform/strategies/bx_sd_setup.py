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

Hard gates (ALL must pass, else inactive with a diagnostic reason):
  1. A fresh unmitigated zone freshly TAPPED now, either side (zones)
  2. That zone broke structure  (factor 2)                 (structure ∩ zone)
  3. Liquidity was grabbed before the zone (factor 3, fuel)(liquidity)
  4. Priced right — discount for buys / premium for sells  (confluence)
  5. Defensive-liquidity clear — we are NOT the liquidity   (liquidity)
"""
from dataclasses import dataclass, field

from core.types import Candle
from shared.swing_points import find_swing_points
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_zones import find_zones, Zone
from strategies.bx_sd_liquidity import find_liquidity
from strategies.bx_sd_validity import is_valid
from strategies.bx_sd_confluence import premium_discount, pricing_aligned, fib_target, rsi_divergence
from strategies.bx_sd_control import control, describe, phrase
from strategies.bx_sd_entry_type import classify, phrase as et_phrase
from strategies.bx_sd_freshness import _first_tap, level_pre_mitigated

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


def detect_setup(h4: list[Candle], pip: float = 0.0001) -> SetupResult:
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

    # PRE-MARK only book-VALID zones (imbalance + structure break + liquidity grab, and not already
    # closed through) — `is_valid` is the SAME definition the report paths use. A non-qualifying candle
    # beside a gap is never a candidate, so a nearer non-zone can no longer SHADOW a real zone behind
    # it. We then scan newest→oldest and take the most-recent VALID zone freshly tapped now — exactly
    # "pre-mark the zones, then wait for price to respect one". Factors 2+3 are proven by is_valid, so
    # there is no separate re-check below.
    all_c = find_zones(h4)
    zones = [z for z in all_c if (z.top - z.bottom) >= _MIN_PIPS * pip
             and is_valid(h4, z, st, pools, pip)]

    # BOTH directions are candidates. Pricing is tested INSIDE the loop, not after selection: with two
    # sides live, a badly-priced demand zone must not veto the whole bar and hide a well-priced supply
    # zone behind it. (Pre-change there was only ever one direction, so testing after was equivalent.)
    cand, priced_out = None, 0
    for z in reversed(zones):
        ft = _first_tap(h4, z)
        # FRESH = tapped now AND its level was not already mitigated by an overlapping older zone.
        if ft is None or ft < len(h4) - _RECENT or level_pre_mitigated(h4, z, all_c):
            continue
        if not pricing_aligned(leg_low, leg_high, price, z.direction):
            priced_out += 1
            continue
        cand = z; break
    if cand is None:
        r.reason = (f"{priced_out} fresh VALID zone(s) tapped but badly priced "
                    f"({premium_discount(leg_low, leg_high, price)})" if priced_out else
                    f"no fresh VALID zone tapped in the last {_RECENT} 4H bars")
        return r

    tdir = "buy" if cand.direction == "demand" else "sell"
    up   = cand.direction == "demand"

    # These are the WIDE 4H zone's levels — informational only. We never trade them: the real entry/SL
    # come from the entry-TF refinement in entry_trigger, and bx_sd_confirm.confirm_grade runs the
    # defensive-liquidity guard on THOSE final levels (every entry-confirming path goes through it).
    # The guard used to run here too, on these wide levels, which only produced FALSE REJECTS — a pool
    # sitting on the 4H distal killed setups whose real SL is nowhere near it.
    entry = cand.proximal
    sl    = cand.distal - 2 * pip if up else cand.distal + 2 * pip

    r.active, r.direction, r.zone = True, tdir, cand
    r.entry, r.sl = entry, sl
    r.tp1 = fib_target(leg_low, leg_high, tdir, 0.272)
    r.tp2 = fib_target(leg_low, leg_high, tdir, 0.618)
    side = control(h4, all_c)
    etype = classify(st, side, cand.direction)      # Ch.2 naming — classification only, never a gate
    r.confluences = {"control": describe(side, cand.direction), "control_phrase": phrase(side, cand.direction),
                     "entry_type": etype, "entry_type_phrase": et_phrase(etype),
                     "broke_structure": True, "liquidity_grab": True,
                     "pricing": premium_discount(leg_low, leg_high, price),
                     "rsi_divergence": rsi_divergence(h4, tdir)}
    r.reason = "active"
    return r
