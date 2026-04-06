"""
ai_engine/strategy.py
Strategy builder with guardrails.
Derives entry conditions, avoidance rules, and risk parameters
purely from measured trade data — refuses to speculate.
"""
from __future__ import annotations
from collections import defaultdict

from ._models import StrategyOutput, StrategyCondition, ProofedFinding
from ._utils import (
    extract_manual, is_win, win_rate as global_win_rate,
    coerce_str, confidence_level, is_sufficient,
)
from .proof import build_finding, data_warnings, filter_sufficient

# ── Guardrail thresholds ──────────────────────────────────────────────────────

MIN_EDGE_WR    = 0.55   # below this: not an entry condition
MAX_DRAIN_WR   = 0.45   # above this: not an avoidance condition
MIN_DEVIATION  = 0.05   # must beat baseline by at least 5 pp to qualify as an edge

# ── Dimension extractors ──────────────────────────────────────────────────────

def _get_dimension(trade: dict, col: str, source: str = "root") -> str:
    if source == "root":
        return coerce_str(trade.get(col)).strip().lower()
    return coerce_str(extract_manual(trade).get(col)).strip().lower()


DIMENSIONS: list[tuple[str, str, str]] = [
    ("session",        "Session",       "root"),
    ("setup",          "Setup",         "root"),
    ("direction",      "Direction",     "root"),
    ("htfBias",        "HTF Bias",      "manual"),
    ("marketRegime",   "Market Regime", "manual"),
    ("emotionalState", "Emotion",       "manual"),
]


def _group_by_dimension(
    trades: list[dict], col: str, source: str
) -> dict[str, list[dict]]:
    buckets: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        v = _get_dimension(t, col, source)
        if v:
            buckets[v].append(t)
    return dict(buckets)


# ── Condition builder ─────────────────────────────────────────────────────────

def _build_conditions(
    trades:      list[dict],
    baseline_wr: float,
    positive:    bool,
) -> list[StrategyCondition]:
    conditions: list[StrategyCondition] = []

    for col, label, source in DIMENSIONS:
        for val, group in _group_by_dimension(trades, col, source).items():
            n  = len(group)
            if not is_sufficient(n):
                continue
            wr  = global_win_rate(group)
            dev = wr - baseline_wr
            if positive and (wr < MIN_EDGE_WR or dev < MIN_DEVIATION):
                continue
            if not positive and (wr > MAX_DRAIN_WR or dev > -MIN_DEVIATION):
                continue
            conditions.append(StrategyCondition(
                label=f"{label}={val}",
                win_rate=round(wr, 4),
                sample_size=n,
                confidence=confidence_level(n),
            ))

    # Sort by win_rate: entries descending, avoids ascending
    conditions.sort(key=lambda c: c.win_rate, reverse=positive)
    return conditions


# ── Risk parameter extraction ─────────────────────────────────────────────────

def _build_risk_rules(trades: list[dict]) -> dict[str, str]:
    rules: dict[str, str] = {}

    rr_vals = [
        float(t["riskRewardRatio"])
        for t in trades
        if t.get("riskRewardRatio") is not None
    ]
    wins = [t for t in trades if is_win(t)]
    win_rr = [
        float(t["riskRewardRatio"])
        for t in wins
        if t.get("riskRewardRatio") is not None
    ]

    if rr_vals:
        avg_rr = sum(rr_vals) / len(rr_vals)
        rules["avg_rr_all"] = f"{avg_rr:.2f}R"
    if win_rr:
        avg_win_rr = sum(win_rr) / len(win_rr)
        rules["avg_rr_wins"] = f"{avg_win_rr:.2f}R"

    # Rule: only trade when projected edge is positive
    rules["minimum_sample"] = (
        f"Do not act on a pattern until ≥ {30} trades confirm it (HIGH confidence)."
    )
    return rules


# ── Projected edge ────────────────────────────────────────────────────────────

def _projected_edge(
    conditions: list[StrategyCondition],
    trades:     list[dict],
    baseline_wr:float,
) -> ProofedFinding | None:
    if not conditions:
        return None
    # Approximate: trades matching at least one entry condition
    labels = {c.label for c in conditions}
    aligned: list[dict] = []
    for t in trades:
        for col, label, source in DIMENSIONS:
            v = _get_dimension(t, col, source)
            if f"{label}={v}" in labels:
                aligned.append(t)
                break
    return build_finding(
        "Projected edge when all entry conditions align",
        aligned,
        baseline_wr,
    )


# ── Main pipeline ─────────────────────────────────────────────────────────────

def build_strategy(trades: list[dict], name: str = "Data-Derived Strategy") -> StrategyOutput:
    baseline_wr = global_win_rate(trades)
    entry_conds = _build_conditions(trades, baseline_wr, positive=True)
    avoid_conds = _build_conditions(trades, baseline_wr, positive=False)
    risk_rules  = _build_risk_rules(trades)
    edge        = _projected_edge(entry_conds, trades, baseline_wr)

    all_findings: list[ProofedFinding] = []
    if edge:
        all_findings.append(edge)

    warnings = data_warnings(
        [ProofedFinding(
            finding=c.label,
            sample_size=c.sample_size,
            win_rate=c.win_rate,
            baseline_wr=baseline_wr,
            deviation=c.win_rate - baseline_wr,
            confidence=c.confidence,
        ) for c in entry_conds + avoid_conds]
    )

    return StrategyOutput(
        name=name,
        entry_conditions=entry_conds,
        avoid_conditions=avoid_conds,
        risk_rules=risk_rules,
        projected_edge=edge,
        data_warnings=warnings,
    )
