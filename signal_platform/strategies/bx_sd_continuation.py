"""
BX-S/D — CONTINUATION entry (the book's continuation method).

Price often just TAPS the 4H FVG (imbalance) and CONTINUES the trend instead of fully retesting the
zone — a fresh mitigated zone frequently never returns. This fires that entry, confirmed on 1M/5M by
a trend-direction BOS (the continuation itself) or an S/D flip — NOT the reversal CHoCH the retest
needs. Entry off the FVG (or 50% equilibrium), SL ~<=2 pip beyond it, TP = opposite zone / fib, >=2R.
"""
from core.types import Candle
from strategies.bx_sd_zones import wick_dominant, Zone
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_ltf import LTFConfluence
from strategies.bx_sd_entry import _flip_ok, _rr, _tp_candidates, EntryTrigger
from strategies.bx_sd_liquidity import find_liquidity, defensive_ok
from strategies.bx_sd_analysis import analysis_refine
from strategies.bx_sd_htf import htf_backing
from strategies.bx_sd_confirm import grade_of
from strategies.bx_sd_retest import _setup_for_zone


def _continues(entry_tf: list[Candle], want_dir: str) -> bool:
    """Continuation confirmation: the entry TF's last structure break is a BOS in the trend
    direction, OR an S/D flip in that direction."""
    last = map_structure(entry_tf).last_bos
    return (last is not None and last.direction == want_dir) or _flip_ok(entry_tf, want_dir)


def confirm_continuation(fvg: Zone, zone: Zone, h4: list[Candle], m5: list[Candle], m1: list[Candle],
                         analysis_tfs: list, htf_map: dict, pip: float = 0.0001, min_rr: float = 2.0):
    """Continuation confirm on 5M AND 1M off the FVG; return the CLEARER (higher-RR) entry as
    (trigger, confluence, tf_label, setup), else None. GRADED on the same C/B/A ladder as the rest of
    BX (analysis-TF alignment + HTF backing). A fresh-FVG continuation may fire at any grade (C+)."""
    want = "up" if fvg.direction == "demand" else "down"
    if map_structure(h4).pro_trend() != want:
        return None
    buy   = fvg.direction == "demand"
    setup = _setup_for_zone(h4, fvg, pip)
    finer = next((cs for cs, _ in analysis_tfs if len(cs) >= 20), None)   # M15/M30/1H — session-H/L feed
    pools = find_liquidity(h4, pip, session_candles=finer)   # for the defensive-liquidity guard below
    # grade once (analysis-TF alignment + HTF backing on the ORIGIN zone) — independent of the entry TF
    arc     = analysis_refine(setup, analysis_tfs, pip)
    backing = htf_backing(zone, htf_map)
    grade   = grade_of(arc.confirmed, backing)
    score   = {"A": 85, "B": 72, "C": 66}[grade]
    best = None
    for entry_tf, label in ((m5, "5M"), (m1, "1M")):
        if len(entry_tf) < 20 or not _continues(entry_tf, want):
            continue
        # Same book rule as the main entry (p50-51): the zone CANDLE'S shape decides, not size.
        use_eq50 = wick_dominant(h4[fvg.origin_index]) if 0 <= fvg.origin_index < len(h4) else False
        entry = fvg.eq50 if use_eq50 else fvg.proximal
        sl    = fvg.distal - 2 * pip if buy else fvg.distal + 2 * pip
        tp = next((c for c in _tp_candidates(setup, h4, entry, buy, pip, session_candles=finer)
                   if _rr(entry, sl, c, buy) >= min_rr), None)
        if tp is None:
            continue
        # DEFENSE — locked "liquidity-aware both ways" rule (was only enforced in the core cascade):
        # never enter with an unswept opposing pool between entry and SL, nor park the SL on a pool.
        ok, _ = defensive_ok(pools, h4, fvg.direction, entry, sl, pip, exclude=fvg.distal)
        if not ok:
            continue
        rr = round(_rr(entry, sl, tp, buy), 2)
        if best is None or rr > best[0].rr:
            risk = round(abs(entry - sl) / pip, 1)
            t = EntryTrigger(triggered=True, direction="buy" if buy else "sell",
                             entry=entry, sl=sl, tp=tp, rr=rr,
                             details={"risk_pips": risk, "entry_mode": "eq50" if use_eq50 else "proximal",
                                      "method": "Continuation (BOS/flip)",
                                      "tp_source": "opposite_zone" if tp not in (setup.tp1, setup.tp2) else "fib_extension"})
            c = LTFConfluence(confirmed=arc.confirmed, passed=True, refined_zone=fvg, entry=entry, sl=sl,
                              risk_pips=risk, score=score, grade=grade,
                              details={"ltf_divergence": arc.details["ltf_divergence"], "refined": True,
                                       "risk_pips": risk, "aligned_tfs": arc.details["aligned_tfs"],
                                       "backing": backing},
                              reason="continuation")
            best = (t, c, label, setup)
    return best
