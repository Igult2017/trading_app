"""
BX-S/D — shared confirm + grade: analysis-TF refine -> mandatory 1M/5M confirmation entry -> C/B/A.

ONE definition used by BOTH the fresh-zone cascade (bx_sd.analyze) and the retest path
(bx_sd_reports), so the confirmation method and the grade ladder cannot drift between them.

Grade ladder (each tier adds one MTF layer):
  C = 4H zone + entry TF (1M/5M)
  B = 4H zone + analysis-TF (15M/30M/1H) alignment + entry TF
  A = B + HTF (D1/W1/MN) backing
The fresh cascade fires at any grade (min_grade="C"); the retest requires B/A (min_grade="B") so a
mitigated major zone must EARN its re-entry with confluence.
"""
from core.types import Candle
from strategies.bx_sd_setup import SetupResult
from strategies.bx_sd_analysis import analysis_refine
from strategies.bx_sd_entry import entry_trigger
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
    conf = analysis_refine(setup, analysis_tfs, pip)
    trig = entry_trigger(conf, setup, entry_tf, h4, pip)
    if not trig.triggered:
        return None
    backing = htf_backing(setup.zone, htf_map)
    grade   = grade_of(conf.confirmed, backing)
    if _RANK[grade] < _RANK[min_grade]:
        return None
    conf.grade, conf.score = grade, _SCORE[grade]
    conf.risk_pips = trig.details["risk_pips"]     # the FINAL entry-TF-refined POI, not the analysis one
    conf.details["backing"] = backing
    return conf, trig, grade
