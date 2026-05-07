"""
ai_engine/strategy.py
Strategy builder with guardrails.
Derives entry conditions, avoidance rules, and risk parameters
purely from measured trade data — refuses to speculate.
Generates 2-variable combo conditions for higher specificity.
"""
from __future__ import annotations
from collections import defaultdict
from itertools import combinations

from ._models import StrategyOutput, StrategyCondition, ProofedFinding
from ._utils import (
    extract_manual, is_win, win_rate as global_win_rate,
    coerce_str, confidence_level, is_sufficient, bucket_duration,
)
from .proof import build_finding, data_warnings, filter_sufficient

# ── Guardrail thresholds ──────────────────────────────────────────────────────

MIN_EDGE_WR    = 0.55   # below this: not an entry condition
MAX_DRAIN_WR   = 0.45   # above this: not an avoidance condition
MIN_DEVIATION  = 0.05   # must beat baseline by at least 5 pp to qualify as an edge

# ── Dimension list ────────────────────────────────────────────────────────────
# Mirrors patterns.VARIABLES — same source of truth for field names
DIMENSIONS: list[tuple[str, str, str]] = [
    ("session",           "Session",          "root"),
    ("direction",         "Direction",        "root"),
    ("instrument",        "Instrument",       "root"),
    ("pairCategory",      "Pair Category",    "root"),
    ("dayOfWeek",         "Day of Week",      "root"),
    ("entryTF",           "Entry TF",         "root"),
    ("analysisTF",        "Analysis TF",      "root"),
    ("sessionPhase",      "Session Phase",    "root"),
    ("orderType",         "Order Type",       "root"),
    ("primaryExitReason", "Exit Reason",      "root"),
    ("tradeDuration",     "Duration",         "root"),
    ("setupTag",          "Setup",            "manual"),
    ("marketRegime",      "Market Regime",    "manual"),
    ("htfBias",           "HTF Bias",         "manual"),
    ("candlePattern",     "Candle Pattern",   "manual"),
    ("confluence",        "Confluence",       "manual"),
]


# ── Value extractor ───────────────────────────────────────────────────────────

def _get_dimension(trade: dict, col: str, source: str = "root") -> str:
    if source == "root":
        raw = trade.get(col)
        if raw is None:
            return ""
        v = coerce_str(raw).strip().lower()
        if col == "tradeDuration":
            return bucket_duration(v) or ""
        return v
    return coerce_str(extract_manual(trade).get(col)).strip().lower()


def _group_by_dimension(
    trades: list[dict], col: str, source: str
) -> dict[str, list[dict]]:
    buckets: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        v = _get_dimension(t, col, source)
        if v:
            buckets[v].append(t)
    return dict(buckets)


# ── Condition builders ────────────────────────────────────────────────────────

def _build_single_conditions(
    trades:      list[dict],
    baseline_wr: float,
    positive:    bool,
) -> list[StrategyCondition]:
    """Single-dimension conditions as a fallback when combos are thin."""
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

    conditions.sort(key=lambda c: c.win_rate, reverse=positive)
    return conditions


def _build_combo_conditions(
    trades:      list[dict],
    baseline_wr: float,
    positive:    bool,
) -> list[StrategyCondition]:
    """
    2-variable combo conditions — more specific than single-dimension.
    e.g. "Session=London + Direction=Long: 72% WR, 18 trades"
    """
    conditions: list[StrategyCondition] = []

    for (col_a, label_a, src_a), (col_b, label_b, src_b) in combinations(DIMENSIONS, 2):
        buckets: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for t in trades:
            va = _get_dimension(t, col_a, src_a)
            vb = _get_dimension(t, col_b, src_b)
            if va and vb:
                buckets[(va, vb)].append(t)

        for (va, vb), group in buckets.items():
            n  = len(group)
            if not is_sufficient(n):
                continue
            wr  = global_win_rate(group)
            dev = wr - baseline_wr
            if positive and (wr < MIN_EDGE_WR or dev < MIN_DEVIATION):
                continue
            if not positive and (wr > MAX_DRAIN_WR or dev > -MIN_DEVIATION):
                continue
            label = f"{label_a}={va} + {label_b}={vb}"
            conditions.append(StrategyCondition(
                label=label,
                win_rate=round(wr, 4),
                sample_size=n,
                confidence=confidence_level(n),
            ))

    conditions.sort(key=lambda c: c.win_rate, reverse=positive)
    return conditions


def _build_conditions(
    trades:      list[dict],
    baseline_wr: float,
    positive:    bool,
) -> list[StrategyCondition]:
    """
    Prefer 2-variable combo conditions; fall back to single-dimension
    if fewer than 3 combos qualify.
    """
    combo_conds  = _build_combo_conditions(trades, baseline_wr, positive)
    if len(combo_conds) >= 3:
        return combo_conds[:10]
    # Merge: combo first, then any single-dim not already covered
    single_conds = _build_single_conditions(trades, baseline_wr, positive)
    seen_labels  = {c.label for c in combo_conds}
    extra        = [c for c in single_conds if c.label not in seen_labels]
    merged       = combo_conds + extra
    merged.sort(key=lambda c: c.win_rate, reverse=positive)
    return merged[:10]


# ── Risk parameter extraction ─────────────────────────────────────────────────

def _build_risk_rules(trades: list[dict]) -> dict[str, str]:
    rules: dict[str, str] = {}

    # Try both field names (remapped and original)
    def _rr(t: dict) -> float | None:
        v = t.get("rrRatio") or t.get("riskRewardRatio") or t.get("riskReward")
        try:
            return float(v) if v is not None else None
        except (ValueError, TypeError):
            return None

    rr_vals = [v for t in trades for v in [_rr(t)] if v is not None]
    wins    = [t for t in trades if is_win(t)]
    win_rr  = [v for t in wins for v in [_rr(t)] if v is not None]

    if rr_vals:
        rules["avg_rr_all"]  = f"{sum(rr_vals)/len(rr_vals):.2f}R"
    if win_rr:
        rules["avg_rr_wins"] = f"{sum(win_rr)/len(win_rr):.2f}R"

    rules["minimum_sample"] = (
        "Do not act on a pattern until ≥30 trades confirm it (HIGH confidence)."
    )
    return rules


# ── Projected edge ────────────────────────────────────────────────────────────

def _projected_edge(
    conditions:  list[StrategyCondition],
    trades:      list[dict],
    baseline_wr: float,
) -> ProofedFinding | None:
    if not conditions:
        return None
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
