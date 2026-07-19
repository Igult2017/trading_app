"""
BX-S/D — 4H setup gate (Phase 5). First assembly of Phases 1-4.

The book confirms the SETUP on the 4H only, then drops to the LTF. This answers the one
question: is there a VALID, PRO-TREND, CONFIRMED 4H setup that price is tapping RIGHT NOW?

Hard gates (ALL must pass, else inactive with a diagnostic reason):
  1. 4H trend CONFIRMED + pro-trend direction              (structure)
  2. A fresh unmitigated pro-trend zone freshly TAPPED now (zones)
  3. That zone broke structure  (factor 2)                 (structure ∩ zone)
  4. Liquidity was grabbed before the zone (factor 3, fuel)(liquidity)
  5. Priced right — discount for buys / premium for sells  (confluence)
  6. Defensive-liquidity clear — we are NOT the liquidity   (liquidity)
"""
from dataclasses import dataclass, field

from core.types import Candle
from shared.swing_points import find_swing_points
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_zones import find_zones, Zone
from strategies.bx_sd_liquidity import find_liquidity
from strategies.bx_sd_validity import is_valid
from strategies.bx_sd_confluence import premium_discount, pricing_aligned, fib_target, rsi_divergence

_RECENT     = 6    # a live tap must be within the last N 4H bars (leaves time for the LTF to confirm)


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


def _first_tap(candles: list[Candle], zone: Zone) -> int | None:
    for j in range(zone.ifc_index + 1, len(candles)):
        c = candles[j]
        if zone.direction == "demand" and c.low  <= zone.top:
            return j
        if zone.direction == "supply" and c.high >= zone.bottom:
            return j
    return None


def detect_setup(h4: list[Candle], pip: float = 0.0001) -> SetupResult:
    r = SetupResult()
    if len(h4) < 30:
        r.reason = "not enough 4H history"; return r

    st  = map_structure(h4)
    pro = st.pro_trend()
    if pro is None:
        r.reason = f"no confirmed 4H trend (trend={st.trend}, confirmed={st.confirmed})"; return r
    zdir  = "demand" if pro == "up" else "supply"
    tdir  = "buy"    if pro == "up" else "sell"
    up    = pro == "up"

    pools = find_liquidity(h4, pip)
    price = h4[-1].close

    # PRE-MARK only book-VALID zones (imbalance + structure break + liquidity grab, and not already
    # closed through) — `is_valid` is the SAME definition the report paths use. A non-qualifying candle
    # beside a gap is never a candidate, so a nearer non-zone can no longer SHADOW a real zone behind
    # it. We then scan newest→oldest and take the most-recent VALID zone freshly tapped now — exactly
    # "pre-mark the zones, then wait for price to respect one". Factors 2+3 are proven by is_valid, so
    # there is no separate re-check below.
    zones = [z for z in find_zones(h4) if z.direction == zdir and is_valid(h4, z, st, pools, pip)]

    cand = None
    for z in reversed(zones):
        ft = _first_tap(h4, z)
        if ft is not None and ft >= len(h4) - _RECENT:
            cand = z; break
    if cand is None:
        r.reason = f"no fresh VALID {zdir} zone tapped in the last {_RECENT} 4H bars"; return r

    pts   = find_swing_points(h4)
    highs = [p.price for p in pts if p.is_high]
    lows  = [p.price for p in pts if not p.is_high]
    if not highs or not lows:
        r.reason = "no leg for premium/discount"; return r
    leg_low, leg_high = min(lows[-1], highs[-1]), max(lows[-1], highs[-1])
    if not pricing_aligned(leg_low, leg_high, price, tdir):
        r.reason = f"badly priced ({premium_discount(leg_low, leg_high, price)} for a {tdir})"; return r

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
    r.confluences = {"pro_trend": pro, "broke_structure": True, "liquidity_grab": True,
                     "pricing": premium_discount(leg_low, leg_high, price),
                     "rsi_divergence": rsi_divergence(h4, tdir)}
    r.reason = "active"
    return r
