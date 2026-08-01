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
  2. tapped     the FORMING bar is in the zone RIGHT NOW, and the zone is not broken. Not "within
                the last N bars" — that window existed, was 24 hours wide, and fired signals for
                taps that had already come and gone
  3. priced     discount for buys / premium for sells                      (confluence)
  4. the 1M/5M confirmation downstream is what proves the zone was RESPECTED
"""
from dataclasses import dataclass, field

from core.types import Candle, Trend
from shared.swing_points import find_swing_points
from shared.trend_detector import detect
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_zones import Zone
from strategies.bx_sd_liquidity import find_liquidity
from strategies.bx_sd_confluence import premium_discount, pricing_aligned, fib_target, rsi_divergence
from strategies.bx_sd_control import control, describe, phrase
from strategies.bx_sd_entry_type import classify, phrase as et_phrase
from strategies.bx_sd_registry import build, to_zone
from strategies.bx_sd_strength import mitigation_note, score as zone_strength
from shared.mtf_utils import closed_only

_SL_BUFFER_PIPS = 6.0  # the stop sits this far BEYOND the 4H zone's distal edge — the user's
                       # "5 to 6 pips behind the 4H zone", so a wick cannot take us out.
                       # Lives here because bx_sd_entry imports from this module.
_TP_R           = 3.0  # fixed 3R target (user: "just leave TP at 3R")
_RESPECT_BUFFER = 0.25 # the confirming close must sit this fraction of the 4H zone height
                       # INSIDE the zone from the distal — the user's "moved away from it a
                       # little, not struggling to break it". One constant, tune on evidence.
# NOTE: no `_RECENT` window here. It was 6 bars and became dead when the tap rule moved to the
# FORMING bar; it sat unread for three days while the docstring above still described it as the rule.
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


def regime(h4: list[Candle], d1: list[Candle] | None = None) -> int:
    """+1 uptrend, -1 downtrend, 0 ranging — READ FROM THE 4H, AND ONLY THE 4H.

    The book takes direction from who is in control — *"demand is in control now, so we can look for
    long entries"* (p58) — and names the main vs counter trend explicitly (p57). Gating on it is the
    book applied, not abandoned.

    THE DAILY IS THE POINT. A 4H uptrend inside a 1D downtrend is itself a pullback, and treating it
    as a trend is how BX came to buy GBP/JPY demand five times across 30-31 Jul while it fell ~580
    pips. All five failed. Requiring agreement makes that case RANGING, which lifts the gate and
    lets both directions through on a respected zone — deliberately permissive, because a
    disagreement is genuinely ambiguous and not a licence to pick a side.

    THE HIGHER TIMEFRAMES DO NOT VOTE ON TREND. User's rule, 2026-08-01: pro-trend and ranging are
    BOTH decided on the 4H. D1/W1/MN earn their place through ZONE CONFLUENCE — a higher-timeframe
    zone sitting over the 4H zone is what makes an A-grade setup (`bx_sd_htf.htf_backing`, applied
    in `bx_sd_confirm.grade_of`), and one sitting against it is a conflict worth reporting. That is
    a different question from which way the market is trending, and mixing the two made both worse.

    Two earlier attempts are recorded so neither returns:
      * requiring 4H and 1D to AGREE gated NOTHING — replayed against the six real GBP/JPY signals,
        all six read ranging and every one was still taken. Mid-decline, detect(H4) was correctly
        DOWNTREND while detect(D1) read RANGING (and UPTREND at an 80-bar lookback), because over
        50 DAYS the pair was net HIGHER: a three-day, 580-pip fall is invisible at daily scale.
      * the Daily as a VETO worked on that case but was doing far too much elsewhere — measured
        over 293 sampled H4 points it cut DOWNTREND readings from 20.5% to 5.1%, suppressing three
        quarters of them for one confirmed catch.

    `d1` is kept in the signature, unused, so callers do not all have to change and so the next
    reader sees deliberately-ignored rather than forgotten.
    """
    t4 = detect(closed_only(h4))
    if t4 == Trend.UPTREND:
        return 1
    if t4 == Trend.DOWNTREND:
        return -1
    return 0


def detect_setup(h4: list[Candle], pip: float = 0.0001, book=None,
                 htf_map: dict | None = None, d1: list[Candle] | None = None) -> SetupResult:
    """`htf_map` is the D1/W1/MN zone map (bx_sd_htf.htf_zone_map). It is only used to SCORE the
    zone's strength, never to gate it. It must be passed: HTF confluence is the user's first-named
    and highest-weighted strength input (`_W_HTF = 3` per timeframe), and omitting it silently
    scored 0 of 196 zones as HTF-backed and capped every score at 6 — see the fix log."""
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
    live_bar = h4[-1]      # the FORMING bar — 'is price at this zone RIGHT NOW?'
                           # NOT named `live`: the counter below shadowed it and
                           # tapped_by() got an int. Caught by bx_live_tap_test.

    # A zone is a candidate once price has MITIGATED it (tapped it) recently and it is still alive.
    # The 1M/5M confirmation downstream is what proves it was RESPECTED.
    # REGIME. In a trend take only zones on the trend's side; in a range take either.
    reg = regime(h4, d1)
    # These MUST be initialised here. An edit that added the regime lines replaced this
    # initialisation instead of preceding it, and `detect_setup` then raised UnboundLocalError on
    # every scan where the loop below found no candidate — the common case. The unit tests passed
    # (they exercise `regime` directly) and a single e2e run passed (it happened to find one), so
    # only a walk-forward replay over hundreds of bars surfaced it.
    cand, cand_mz, priced_out, n_live, off_trend = None, None, 0, 0, 0
    for mz in sorted(marked, key=lambda m: m.ifc_time, reverse=True):
        # NOT `respected` — that is the RETEST path's job (bx_sd_reports, min_grade="B"). Accepting
        # it here let one zone fire BOTH: a duplicate signal, and the fresh cascade firing at C+,
        # bypassing the B/A bar the retest deliberately requires of a zone already worked.
        #
        # It must include `unmitigated`: the registry is built from CLOSED bars, so a tap by the
        # FORMING bar is not in the book yet and the zone still reads unmitigated. Demanding a
        # mitigated state AND a live tap can never both hold at the same instant — by the time the
        # state flips at bar close, the live bar has moved on. That would have silenced the cascade.
        #
        # `wick_mitigated` and `body_mitigated` replaced the single `mitigated` (2026-07-30). BOTH
        # trade: the user's rule is that a wick tap signals AND its later retap signals again, and a
        # body-mitigated zone still signals on a retap, carrying a caution on the card.
        if mz.state not in ("unmitigated", "wick_mitigated", "body_mitigated"):
            continue
        # THE TAP MUST BE HAPPENING NOW — live price, not "sometime in the last 6 bars".
        # This used to accept any mitigation inside a 24-HOUR window, so a zone tapped 20 hours ago
        # still fired today: a signal for an event that had already come and gone. A tap is an EVENT
        # HAPPENING NOW, so it reads the LIVE forming bar (the settled rule: a LEVEL comes from a
        # CLOSED candle, a TRIGGER or current price stays LIVE).
        if not mz.tapped_by(live_bar):
            continue
        if (mz.top - mz.bottom) < _MIN_PIPS * pip:
            continue
        # PRO-TREND ONLY WHILE TRENDING. A supply zone in an uptrend produces a PULLBACK, not a
        # move: its upside is capped by the prevailing trend while its stop is sized for a real
        # one — structurally poor even when it wins. In a range (reg == 0) this does nothing and
        # both directions run exactly as before.
        if reg:
            want = "demand" if reg > 0 else "supply"
            if mz.direction != want:
                off_trend += 1
                continue
        n_live += 1
        if not pricing_aligned(leg_low, leg_high, price, mz.direction):
            priced_out += 1
            continue
        z = to_zone(mz, bars)
        if z is None:
            continue                      # older than this window — cannot resolve indices
        cand, cand_mz = z, mz; break     # keep the MarkedZone too — it carries state/retaps
    if cand is None:
        if off_trend:
            r.reason = (f"{off_trend} zone(s) tapped but COUNTER-TREND — 4H and 1D both "
                        f"{'up' if reg > 0 else 'down'}, so only "
                        f"{'demand' if reg > 0 else 'supply'} zones are taken")
            return r
        if priced_out:
            r.reason = (f"{priced_out} marked zone(s) mitigated but badly priced "
                        f"({premium_discount(leg_low, leg_high, price)})")
            return r
        # HOW FAR IS PRICE FROM THE NEAREST LIVE ZONE? This is the one number that answers "why no
        # signal" during a quiet stretch — the cascade fires on a tap, so the distance to the closest
        # zone IS the distance to a possible setup. It was computed nowhere and the reason line said
        # only how many zones exist, which cannot distinguish "price is 2 pips away, watch closely"
        # from "price is 200 pips away, nothing is going to happen today".
        live_zones = [m for m in marked if m.live]
        near = min((abs(m.proximal - price) for m in live_zones), default=None)
        gap = f", nearest {near / pip:.0f} pips away" if near is not None else ""
        r.reason = (f"no marked zone being tapped right now "
                    f"({len(live_zones)} live zones on the book{gap})")
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
    # HOW it was mitigated and HOW STRONG it is — both read off the zone book, both previously
    # invisible on the card. A wick-only tap and a full body mitigation used to look identical.
    if cand_mz is not None:
        _s = zone_strength(cand_mz, marked, bars, htf_map=htf_map, as_zone=cand)
        r.confluences["mitigation_note"] = mitigation_note(cand_mz)
        r.confluences["strength_phrase"] = (f"Zone strength {_s.label} ({_s.score}) — "
                                            f"{', '.join(_s.reasons())}")
        r.confluences["zone_state"] = cand_mz.state
        r.confluences["zone_retaps"] = cand_mz.retaps
    r.reason = "active"
    return r
