"""
strategy_audit/level1_edge.py
────────────────────────────────────────────────────────────────────────────
Level 1 — Strategy Audit: Edge Detection

Full implementation. All output keys match the TypeScript StrategyAuditResult
type exactly so no frontend changes are needed.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from .normalise import (
    normalise_trades,
    check_minimum_sample,
    safe_mean,
    safe_std,
    win_rate,
    profit_factor,
    expectancy,
)


# ── Constants ─────────────────────────────────────────────────────────────────

# Thresholds for edge verdict
_CONFIRMED_PF   = 1.5
_CONFIRMED_WR   = 50.0
_CONFIRMED_N    = 30
_MARGINAL_PF    = 1.0
_MARGINAL_N     = 15

# Minimum trades in a condition group to include it
_MIN_CONDITION_TRADES = 5   # relaxed from 10 to work with smaller datasets
_MIN_LIFT_PP          = 5.0  # minimum lift in percentage points to call a driver


# ── Condition predicates ──────────────────────────────────────────────────────

def _conditions() -> list[tuple[str, Any]]:
    """
    Each entry: (label, predicate_fn(trade) -> bool | None)
    Returns None when the condition cannot be evaluated (field missing).
    """
    def _htf_bias(t):
        v = t.get("htf_bias")
        if v is None: return None
        return str(v).lower() in ("with_trend", "with trend", "bullish", "bearish_short",
                                   "long", "buy", "aligned")

    def _high_confluence(t):
        v = t.get("confluence_score")
        if v is None: return None
        try: return float(v) >= 70
        except: return None

    def _confirmed_entry(t):
        v = t.get("entry_type")
        if v is None: return None
        return str(v).lower() in ("confirmed", "confirmation", "valid")

    def _ob_valid(t):
        v = t.get("ob_valid")
        if v is None: return None
        if isinstance(v, bool): return v
        return str(v).lower() in ("true", "yes", "1")

    def _choch_valid(t):
        v = t.get("choch_valid")
        if v is None: return None
        if isinstance(v, bool): return v
        return str(v).lower() in ("true", "yes", "1")

    def _prime_session(t):
        label = (t.get("session_label") or "").lower()
        return "london" in label or "new york" in label or "overlap" in label or None

    def _good_psychology(t):
        v = t.get("psychology_score")
        if v is None: return None
        try: return float(v) >= 80
        except: return None

    def _good_risk_sizing(t):
        v = t.get("risk_percent")
        if v is None: return None
        try:
            rp = float(v)
            return 0.5 <= rp <= 1.5
        except: return None

    return [
        ("HTF bias aligned",         _htf_bias),
        ("High confluence (≥70)",    _high_confluence),
        ("Confirmed entry type",      _confirmed_entry),
        ("Valid order block",         _ob_valid),
        ("Valid CHoCH",               _choch_valid),
        ("Prime session",             _prime_session),
        ("Psychology score ≥80",      _good_psychology),
        ("Risk 0.5–1.5%",            _good_risk_sizing),
    ]


# ── Edge drivers ──────────────────────────────────────────────────────────────

def _compute_edge_drivers(trades: list[dict]) -> tuple[list[dict], list[dict], list[str]]:
    """
    Returns (edge_drivers, weaknesses, monitor_items).
    """
    drivers: list[dict] = []
    weaknesses: list[dict] = []
    monitor_items: list[str] = []

    overall_wr = win_rate(trades)

    for label, predicate in _conditions():
        with_factor = []
        without_factor = []

        for t in trades:
            result = predicate(t)
            if result is None:
                continue
            if result:
                with_factor.append(t)
            else:
                without_factor.append(t)

        # Not enough data to evaluate this condition
        if len(with_factor) < _MIN_CONDITION_TRADES:
            continue

        wr_with    = win_rate(with_factor)
        wr_without = win_rate(without_factor) if without_factor else overall_wr
        lift       = wr_with - wr_without

        if lift > _MIN_LIFT_PP:
            drivers.append({
                "factor":             label,
                "winRateWithFactor":  round(wr_with, 1),
                "winRateWithout":     round(wr_without, 1),
                "lift":               round(lift, 1),
            })
        elif lift < -_MIN_LIFT_PP:
            weaknesses.append({
                "factor":             label,
                "winRateWithFactor":  round(wr_with, 1),
                "impact":             round(abs(lift), 1),
            })
        elif abs(lift) < _MIN_LIFT_PP and len(with_factor) >= _MIN_CONDITION_TRADES:
            # Approaching threshold — worth monitoring
            monitor_items.append(f"{label}: only {lift:+.1f}pp lift (monitor)")

    # Sort drivers by lift descending
    drivers.sort(key=lambda x: x["lift"], reverse=True)
    weaknesses.sort(key=lambda x: x["impact"], reverse=True)

    return drivers, weaknesses, monitor_items


# ── Correlation matrices ──────────────────────────────────────────────────────

def _build_correlation_matrices(
    trades: list[dict],
    condition_labels: list[str],
    conditions_map: dict[str, Any],
) -> tuple[dict, dict]:
    """
    Build per-instrument correlation scores for each condition.

    win_factor_correlation[instrument] = [score_per_condition, ...]
      score = P(condition_present AND win) / P(condition_present) * 100
    loss_factor_correlation[instrument] = same but for losses
    """
    # Group trades by instrument
    by_instrument: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        instr = t.get("instrument") or "Unknown"
        by_instrument[instr].append(t)

    win_corr: dict[str, list[float]] = {}
    loss_corr: dict[str, list[float]] = {}

    for instr, itrades in by_instrument.items():
        if len(itrades) < _MIN_CONDITION_TRADES:
            continue

        win_scores: list[float] = []
        loss_scores: list[float] = []

        for label, predicate in _conditions():
            present = [t for t in itrades if predicate(t) is True]
            if not present:
                win_scores.append(0.0)
                loss_scores.append(0.0)
                continue

            wins_with   = sum(1 for t in present if t.get("win") is True)
            losses_with = sum(1 for t in present if t.get("win") is False)
            total_with  = len(present)

            win_scores.append(round(wins_with / total_with * 100, 1))
            loss_scores.append(round(losses_with / total_with * 100, 1))

        win_corr[instr]  = win_scores
        loss_corr[instr] = loss_scores

    return win_corr, loss_corr


# ── Psychology & discipline scores ───────────────────────────────────────────

def _psychology_discipline(trades: list[dict]) -> tuple[float, float]:
    psych_scores = []
    disc_scores  = []

    for t in trades:
        p = t.get("psychology_score")
        if p is not None:
            try: psych_scores.append(float(p))
            except: pass

        d = t.get("rules_adherence")
        if d is not None:
            try: disc_scores.append(float(d))
            except: pass

    return (
        round(safe_mean(psych_scores), 1),
        round(safe_mean(disc_scores), 1),
    )


# ── Kelly criterion ───────────────────────────────────────────────────────────

def _kelly_edge(trades: list[dict]) -> float:
    """
    Kelly% = W - (L / avg_RR) * 100
    Clamped to [-100, 100].
    """
    knowns = [t for t in trades if t.get("win") is not None]
    if not knowns:
        return 0.0

    W = sum(1 for t in knowns if t["win"] is True) / len(knowns)
    L = 1.0 - W

    rr_values = [t["rr_float"] for t in trades if t.get("rr_float") and t["rr_float"] > 0]
    avg_rr = safe_mean(rr_values) if rr_values else 1.0

    if avg_rr <= 0:
        avg_rr = 1.0

    kelly = (W - (L / avg_rr)) * 100
    return round(max(-100.0, min(100.0, kelly)), 2)


# ── Edge verdict ──────────────────────────────────────────────────────────────

def _edge_verdict(pf: float, wr: float, n: int) -> str:
    if pf > _CONFIRMED_PF and wr > _CONFIRMED_WR and n >= _CONFIRMED_N:
        return "Confirmed"
    if pf > _MARGINAL_PF and n >= _MARGINAL_N:
        return "Marginal"
    return "Unconfirmed"


# ── Public API ────────────────────────────────────────────────────────────────

def compute_level1(trades: list[dict]) -> dict:
    """
    Compute Level 1 — edge detection and factor analysis.

    Input:  normalised trade list (from normalise.normalise_trades)
    Output: dict matching the StrategyAuditResult.level1 TypeScript type
    """
    ok, msg = check_minimum_sample(trades, min_trades=5)
    if not ok:
        return _empty_level1(msg)

    n   = len(trades)
    pf  = profit_factor(trades)
    wr  = win_rate(trades)
    exp = expectancy(trades)

    verdict = _edge_verdict(pf, wr, n)

    edge_drivers, weaknesses, monitor_items = _compute_edge_drivers(trades)

    condition_labels = [label for label, _ in _conditions()]
    win_corr, loss_corr = _build_correlation_matrices(
        trades, condition_labels, _conditions()
    )

    psych_score, disc_score = _psychology_discipline(trades)
    kelly = _kelly_edge(trades)

    return {
        "edgeSummary": {
            "overallWinRate": round(wr, 2),
            "profitFactor":   round(pf, 3) if pf != float("inf") else 999.0,
            "expectancy":     round(exp, 2),
            "sampleSize":     n,
            "edgeVerdict":    verdict,
        },
        "edgeDrivers":           edge_drivers,
        "monitorItems":          monitor_items,
        "weaknesses":            weaknesses,
        "winFactorCorrelation":  win_corr,
        "lossFactorCorrelation": loss_corr,
        "psychologyScore":       psych_score,
        "disciplineScore":       disc_score,
        "probabilisticEdge":     kelly,
    }


def _empty_level1(reason: str = "") -> dict:
    return {
        "edgeSummary": {
            "overallWinRate": 0.0,
            "profitFactor":   0.0,
            "expectancy":     0.0,
            "sampleSize":     0,
            "edgeVerdict":    "Unconfirmed",
            "note":           reason,
        },
        "edgeDrivers":           [],
        "monitorItems":          [reason] if reason else [],
        "weaknesses":            [],
        "winFactorCorrelation":  {},
        "lossFactorCorrelation": {},
        "psychologyScore":       0.0,
        "disciplineScore":       0.0,
        "probabilisticEdge":     0.0,
    }
