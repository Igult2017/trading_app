"""
BX-S/D — shared confirm + grade: analysis-TF refine -> mandatory 1M/5M confirmation entry -> C/B/A.

ONE definition, used by the cascade (bx_sd.analyze). It took a `min_grade` because a second caller —
the RETEST path — required B/A while the fresh cascade fired at C. **Both of those are gone as of
2026-08-01**: there is no fresh-zone path (the zone must be RESPECTED first) and no separate retest
path (it became the same trade). The parameter stays because it is the natural place to raise the
bar if that is ever wanted, but today there is exactly one caller and it passes the default.

Grade ladder (each tier adds one MTF layer):
  C = 4H zone + entry TF (1M/5M)
  B = 4H zone + analysis-TF (15M/30M/1H) alignment + entry TF
  A = B + HTF (D1/W1/MN) backing
"""
from core.types import Candle
from strategies.bx_sd_setup import SetupResult, _SL_BUFFER_PIPS
from strategies.bx_sd_analysis import analysis_refine
from strategies.bx_sd_entry import entry_trigger
from strategies.bx_sd_liquidity import find_liquidity, defensive_ok
from strategies.bx_sd_htf import htf_backing

_SCORE = {"A": 85, "B": 72, "C": 66}
_RANK  = {"C": 0, "B": 1, "A": 2}


def grade_of(analysis_aligned: bool, backing: list) -> str:
    return "A" if (analysis_aligned and backing) else "B" if analysis_aligned else "C"


def confirm_grade(setup: SetupResult, h4: list[Candle],
                  analysis_tfs: list[tuple[list[Candle], str]], entry_tf: list[Candle],
                  htf_map: dict, pip: float = 0.0001, min_grade: str = "C"):
    """Refine on the analysis TFs, require a 1M/5M confirmation entry, grade the stack.
    Returns (conf, trig, grade) or None when there is no entry trigger or grade < min_grade."""
    conf  = analysis_refine(setup, analysis_tfs, pip)
    finer = next((cs for cs, _ in analysis_tfs if len(cs) >= 20), None)   # M15/M30/1H — session-H/L feed
    trig  = entry_trigger(conf, setup, entry_tf, h4, pip, session_candles=finer)
    if not trig.triggered:
        return None
    # DEFENSE — "don't be the liquidity" (locked constraint), on the FINAL entry/SL. Every path that
    # confirms an entry goes through here (fresh cascade + retest), so the guard can't be skipped again.
    # Exclude the zone's own distal — the SL is tucked _SL_BUFFER_PIPS beyond it by design
    # (bx_sd_entry: sl = zone4h.distal -/+ _SL_BUFFER_PIPS * pip), so inverting the SL recovers it.
    # This read "+ 2 * pip" until 2026-07-30, a leftover from when the buffer was 2; it excluded a
    # price 4 pips off the real distal, so the distal's own liquidity was never actually exempted.
    buy    = setup.direction == "buy"
    distal = trig.sl + _SL_BUFFER_PIPS * pip if buy else trig.sl - _SL_BUFFER_PIPS * pip
    zdir   = "demand" if buy else "supply"
    ok, _  = defensive_ok(find_liquidity(h4, pip, session_candles=finer), h4, zdir,
                          trig.entry, trig.sl, pip, exclude=distal)
    if not ok:
        return None
    backing = htf_backing(setup.zone, htf_map)
    grade   = grade_of(conf.confirmed, backing)
    if _RANK[grade] < _RANK[min_grade]:
        return None
    conf.grade, conf.score = grade, _SCORE[grade]
    conf.risk_pips = trig.details["risk_pips"]     # the FINAL entry-TF-refined POI, not the analysis one
    conf.details["backing"] = backing
    return conf, trig, grade
