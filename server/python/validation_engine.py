"""
validation_engine.py
────────────────────
Validates extracted trade data before it is written to the journal.

Catches:
  - Implausible values (e.g. SL > TP on a Long trade)
  - Missing critical fields
  - OCR noise masquerading as valid data
  - Contradictory direction vs SL/TP placement
  - Outcome inconsistency (Win but P/L negative, etc.)

Returns a ValidationReport with a pass/fail list of issues.
Callers decide whether to surface warnings or hard-block the submission.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Tuple


# ── Data ──────────────────────────────────────────────────────────────────────

@dataclass
class ValidationIssue:
    field:    str
    severity: str    # "error" | "warning"
    message:  str


@dataclass
class ValidationReport:
    issues:    List[ValidationIssue] = field(default_factory=list)
    passed:    bool                  = True
    has_error: bool                  = False

    def add(self, field: str, severity: str, message: str):
        self.issues.append(ValidationIssue(field, severity, message))
        if severity == "error":
            self.has_error = True
            self.passed    = False

    def errors(self)   -> List[ValidationIssue]:
        return [i for i in self.issues if i.severity == "error"]

    def warnings(self) -> List[ValidationIssue]:
        return [i for i in self.issues if i.severity == "warning"]

    def summary(self) -> str:
        e = len(self.errors())
        w = len(self.warnings())
        if e == 0 and w == 0:
            return "OK"
        parts = []
        if e: parts.append(f"{e} error{'s' if e>1 else ''}")
        if w: parts.append(f"{w} warning{'s' if w>1 else ''}")
        return ", ".join(parts)


# ── Price plausibility ────────────────────────────────────────────────────────

_PRICE_RANGES = {
    # symbol substring → (min_price, max_price)
    "JPY":    (0.001,    1000.0),
    "XAU":    (100.0,   10000.0),
    "XAG":    (1.0,      500.0),
    "BTC":    (100.0,  200000.0),
    "ETH":    (10.0,   20000.0),
    "US30":   (1000.0, 60000.0),
    "NAS":    (100.0,  30000.0),
    "DAX":    (1000.0, 30000.0),
    "SPX":    (100.0,  10000.0),
    "IDX":    (100.0,  60000.0),
    # default forex
    "_DEFAULT": (0.00001, 200.0),
}


def _price_range(instrument: Optional[str]) -> Tuple[float, float]:
    sym = (instrument or "").upper()
    for key, rng in _PRICE_RANGES.items():
        if key in sym:
            return rng
    return _PRICE_RANGES["_DEFAULT"]


def _f(v) -> Optional[float]:
    try:
        return float(str(v).replace(',', '.'))
    except Exception:
        return None


# ── Individual checks ─────────────────────────────────────────────────────────

def _check_entry_price(report: ValidationReport,
                        entry_price_str: Optional[str],
                        instrument: Optional[str]):
    ep = _f(entry_price_str)
    if ep is None:
        report.add("entryPrice", "warning", "Entry price not extracted.")
        return
    lo, hi = _price_range(instrument)
    if not (lo <= ep <= hi):
        report.add("entryPrice", "error",
                   f"Entry price {ep} is outside expected range "
                   f"[{lo}, {hi}] for {instrument or 'unknown'}.")


def _check_sl_tp_consistency(report: ValidationReport,
                               direction: Optional[str],
                               entry_price_str: Optional[str],
                               sl_price_str: Optional[str],
                               tp_price_str: Optional[str]):
    ep  = _f(entry_price_str)
    slp = _f(sl_price_str)
    tpp = _f(tp_price_str)
    if ep is None or direction is None:
        return
    long = direction.lower() == "long"

    if slp is not None:
        if long and slp >= ep:
            report.add("stopLoss", "error",
                        f"Long trade: SL ({slp}) must be below entry ({ep}).")
        if not long and slp <= ep:
            report.add("stopLoss", "error",
                        f"Short trade: SL ({slp}) must be above entry ({ep}).")

    if tpp is not None:
        if long and tpp <= ep:
            report.add("takeProfit", "error",
                        f"Long trade: TP ({tpp}) must be above entry ({ep}).")
        if not long and tpp >= ep:
            report.add("takeProfit", "error",
                        f"Short trade: TP ({tpp}) must be below entry ({ep}).")


def _check_rr(report: ValidationReport,
               sl_pts: Optional[float],
               tp_pts: Optional[float],
               risk_reward: Optional[float]):
    if sl_pts is None or tp_pts is None:
        return
    if sl_pts <= 0:
        report.add("stopLossPoints", "error",
                    f"SL points must be positive, got {sl_pts}.")
    if tp_pts <= 0:
        report.add("takeProfitPoints", "error",
                    f"TP points must be positive, got {tp_pts}.")
    if sl_pts > 0 and tp_pts > 0:
        implied_rr = round(tp_pts / sl_pts, 2)
        if risk_reward is not None:
            rr = _f(risk_reward)
            if rr is not None and abs(implied_rr - rr) > 0.5:
                report.add("riskReward", "warning",
                            f"Stated RR ({rr}) differs from implied "
                            f"TP/SL ratio ({implied_rr}). Possible OCR error.")


def _check_outcome_vs_pl(report: ValidationReport,
                          outcome: Optional[str],
                          closed_pl_usd: Optional[float]):
    if outcome is None or closed_pl_usd is None:
        return
    if outcome == "Win"  and closed_pl_usd < 0:
        report.add("outcome", "error",
                    f"Outcome is Win but Closed P/L is negative ({closed_pl_usd}).")
    if outcome == "Loss" and closed_pl_usd > 0:
        report.add("outcome", "error",
                    f"Outcome is Loss but Closed P/L is positive ({closed_pl_usd}).")


def _check_dates(report: ValidationReport,
                  entry_time: Optional[str],
                  exit_time: Optional[str]):
    if entry_time and exit_time:
        from datetime import datetime
        fmts = ["%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d"]
        def _parse(s):
            for fmt in fmts:
                try:
                    return datetime.strptime(str(s)[:len(fmt)], fmt)
                except ValueError:
                    continue
            return None
        e = _parse(entry_time); x = _parse(exit_time)
        if e and x and x < e:
            report.add("exitTime", "error",
                        f"Exit time ({exit_time}) is before entry time ({entry_time}).")
        if e and x:
            delta_days = abs((x - e).days)
            if delta_days > 30:
                report.add("tradeDuration", "warning",
                            f"Trade duration {delta_days} days seems implausible.")


def _check_lot_size(report: ValidationReport,
                     lot_size: Optional[float],
                     instrument: Optional[str]):
    if lot_size is None:
        return
    sym = (instrument or "").upper()
    is_index = any(x in sym for x in
                   ['IDX','US30','NAS','SPX','DAX','FTSE','CAC','DOW','USA500'])
    max_lots = 100.0 if is_index else 10.0
    if lot_size > max_lots:
        report.add("lotSize", "warning",
                    f"Lot size {lot_size} seems very large for {instrument}.")
    if lot_size <= 0:
        report.add("lotSize", "error", f"Lot size must be positive, got {lot_size}.")


def _check_pixel_levels(report: ValidationReport,
                         entry_arrow_y: Optional[int],
                         tp_y: Optional[int],
                         sl_y: Optional[int],
                         direction: Optional[str]):
    """Cross-check pixel level positions match the stated direction."""
    if entry_arrow_y is None or tp_y is None or sl_y is None:
        return
    long = (direction or "Long").lower() == "long"
    if long:
        if tp_y >= entry_arrow_y:
            report.add("tpLineY", "warning",
                        "TP pixel position is below (or at) entry on a Long trade. "
                        "Level line detection may be incorrect.")
        if sl_y <= entry_arrow_y:
            report.add("slLineY", "warning",
                        "SL pixel position is above (or at) entry on a Long trade. "
                        "Level line detection may be incorrect.")
    else:
        if tp_y <= entry_arrow_y:
            report.add("tpLineY", "warning",
                        "TP pixel position is above (or at) entry on a Short trade. "
                        "Level line detection may be incorrect.")
        if sl_y >= entry_arrow_y:
            report.add("slLineY", "warning",
                        "SL pixel position is below (or at) entry on a Short trade. "
                        "Level line detection may be incorrect.")


def _check_confidence(report: ValidationReport,
                       confidence: str,
                       candles_detected: int,
                       level_lines_detected: int):
    if confidence == "low":
        report.add("confidence", "warning",
                    "Overall extraction confidence is low. "
                    "Review fields manually before saving.")
    if candles_detected < 3:
        report.add("candles", "warning",
                    f"Only {candles_detected} candle(s) detected. "
                    "Outcome detection may be unreliable.")
    if level_lines_detected < 2:
        report.add("levelLines", "warning",
                    f"Only {level_lines_detected} level line(s) detected. "
                    "TP/SL assignment may be incorrect.")


# ── Public API ────────────────────────────────────────────────────────────────

def validate(
    instrument:           Optional[str]   = None,
    direction:            Optional[str]   = None,
    entry_price_str:      Optional[str]   = None,
    sl_price_str:         Optional[str]   = None,
    tp_price_str:         Optional[str]   = None,
    sl_pts:               Optional[float] = None,
    tp_pts:               Optional[float] = None,
    lot_size:             Optional[float] = None,
    risk_reward:          Optional[float] = None,
    outcome:              Optional[str]   = None,
    closed_pl_usd:        Optional[float] = None,
    entry_time:           Optional[str]   = None,
    exit_time:            Optional[str]   = None,
    confidence:           str             = "low",
    entry_arrow_y:        Optional[int]   = None,
    tp_line_y:            Optional[int]   = None,
    sl_line_y:            Optional[int]   = None,
    candles_detected:     int             = 0,
    level_lines_detected: int             = 0,
) -> ValidationReport:
    """
    Run all validation checks and return a ValidationReport.
    """
    report = ValidationReport()

    _check_entry_price(report, entry_price_str, instrument)
    _check_sl_tp_consistency(report, direction, entry_price_str,
                              sl_price_str, tp_price_str)
    _check_rr(report, sl_pts, tp_pts, risk_reward)
    _check_outcome_vs_pl(report, outcome, closed_pl_usd)
    _check_dates(report, entry_time, exit_time)
    _check_lot_size(report, lot_size, instrument)
    _check_pixel_levels(report, entry_arrow_y, tp_line_y, sl_line_y, direction)
    _check_confidence(report, confidence, candles_detected, level_lines_detected)

    return report
