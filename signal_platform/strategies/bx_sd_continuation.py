"""
BX-S/D — CONTINUATION entry (the book's continuation method).

Price often just TAPS the 4H FVG (imbalance) and CONTINUES the trend instead of fully retesting the
zone — a fresh mitigated zone frequently never returns. This fires that entry, confirmed on 1M/5M by
a trend-direction BOS (the continuation itself) or an S/D flip — NOT the reversal CHoCH the retest
needs. Entry off the FVG (or 50% equilibrium), SL ~<=2 pip beyond it, TP = opposite zone / fib, >=2R.
"""
from core.types import Candle
from strategies.bx_sd_zones import Zone
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_ltf import LTFConfluence
from strategies.bx_sd_entry import _flip_ok, _rr, _tp_candidates, EntryTrigger
from strategies.bx_sd_retest import _setup_for_zone


def _continues(entry_tf: list[Candle], want_dir: str) -> bool:
    """Continuation confirmation: the entry TF's last structure break is a BOS in the trend
    direction, OR an S/D flip in that direction."""
    last = map_structure(entry_tf).last_bos
    return (last is not None and last.direction == want_dir) or _flip_ok(entry_tf, want_dir)


def confirm_continuation(fvg: Zone, h4: list[Candle], m5: list[Candle], m1: list[Candle],
                         pip: float = 0.0001, min_rr: float = 2.0):
    """Run the continuation confirm on 5M AND 1M off the FVG; return the CLEARER (higher-RR) entry as
    (trigger, confluence, tf_label, setup), else None. Pro-trend + confirmed still required."""
    want = "up" if fvg.direction == "demand" else "down"
    if map_structure(h4).pro_trend() != want:
        return None
    buy   = fvg.direction == "demand"
    setup = _setup_for_zone(h4, fvg, pip)
    best = None
    for entry_tf, label in ((m5, "5M"), (m1, "1M")):
        if len(entry_tf) < 20 or not _continues(entry_tf, want):
            continue
        use_eq50 = (fvg.top - fvg.bottom) / pip > 2.0
        entry = fvg.eq50 if use_eq50 else fvg.proximal
        sl    = fvg.distal - 2 * pip if buy else fvg.distal + 2 * pip
        tp = next((c for c in _tp_candidates(setup, h4, entry, buy) if _rr(entry, sl, c, buy) >= min_rr), None)
        if tp is None:
            continue
        rr = round(_rr(entry, sl, tp, buy), 2)
        if best is None or rr > best[0].rr:
            risk = round(abs(entry - sl) / pip, 1)
            t = EntryTrigger(triggered=True, direction="buy" if buy else "sell",
                             entry=entry, sl=sl, tp=tp, rr=rr,
                             details={"risk_pips": risk, "entry_mode": "eq50" if use_eq50 else "proximal",
                                      "method": "Continuation (BOS/flip)",
                                      "tp_source": "opposite_zone" if tp not in (setup.tp1, setup.tp2) else "fib_extension"})
            c = LTFConfluence(confirmed=True, passed=True, refined_zone=fvg, entry=entry, sl=sl,
                              risk_pips=risk, score=70, grade="B",
                              details={"ltf_divergence": False, "refined": True, "risk_pips": risk},
                              reason="continuation")
            best = (t, c, label, setup)
    return best
