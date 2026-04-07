"""
ai_engine/patterns.py
Multi-variable pattern detection.
Finds 2-variable and 3-variable combinations and ranks them by edge
above/below the baseline win rate.
"""
from __future__ import annotations
from collections import defaultdict
from itertools import combinations

from ._models import PatternSummary, VariableCombo
from ._utils import (
    extract_manual, is_win, win_rate as global_win_rate,
    confidence_level, is_sufficient, safe_div, coerce_str, bucket_duration,
)

# ── Variables to cross ────────────────────────────────────────────────────────
# Each entry: (column_name, display_label, source)
# source = "root"   → top-level trade field (set by remapJournalEntry / remap_trade)
# source = "manual" → inside manualFields JSONB blob
VARIABLES: list[tuple[str, str, str]] = [
    # ── Core dimensions (root fields) ─────────────────────────────────────────
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
    ("tradeDuration",     "Duration",         "root"),   # bucketed
    # ── Qualitative fields (manualFields JSONB) ───────────────────────────────
    ("setupTag",          "Setup",            "manual"),
    ("marketRegime",      "Market Regime",    "manual"),
    ("htfBias",           "HTF Bias",         "manual"),
    ("emotionalState",    "Emotion",          "manual"),
    ("candlePattern",     "Candle Pattern",   "manual"),
    ("confluence",        "Confluence",       "manual"),
]

# Minimum samples for 2-var and 3-var combos
MIN_SAMPLE_2VAR = 5    # same as MIN_TRADES_LOW
MIN_SAMPLE_3VAR = 8

# How many top/bottom combos to return
TOP_N = 10


# ── Value extraction ──────────────────────────────────────────────────────────

def _get_value(trade: dict, col: str, source: str) -> str | None:
    """Extract and normalise a variable's value from a trade dict."""
    if source == "root":
        raw = trade.get(col)
        if raw is None:
            return None
        v = coerce_str(raw).strip().lower()
        # Special: bucket tradeDuration into readable labels
        if col == "tradeDuration":
            return bucket_duration(v)
        return v if v else None
    else:
        m = extract_manual(trade)
        v = coerce_str(m.get(col)).strip().lower()
        return v if v else None


# ── 2-variable combinator ─────────────────────────────────────────────────────

def _build_2var_combos(trades: list[dict], baseline_wr: float) -> list[VariableCombo]:
    """Group trades by every pair of VARIABLES and measure win rate per group."""
    combos: list[VariableCombo] = []

    for (col_a, label_a, src_a), (col_b, label_b, src_b) in combinations(VARIABLES, 2):
        buckets: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for t in trades:
            val_a = _get_value(t, col_a, src_a)
            val_b = _get_value(t, col_b, src_b)
            if val_a and val_b:
                buckets[(val_a, val_b)].append(t)

        for (val_a, val_b), group in buckets.items():
            n = len(group)
            if n < MIN_SAMPLE_2VAR:
                continue
            wr  = global_win_rate(group)
            dev = wr - baseline_wr
            combos.append(VariableCombo(
                variables={label_a: val_a, label_b: val_b},
                sample_size=n,
                win_rate=round(wr, 4),
                baseline_wr=round(baseline_wr, 4),
                deviation=round(dev, 4),
                confidence=confidence_level(n),
            ))

    return combos


# ── 3-variable combinator ─────────────────────────────────────────────────────

def _build_3var_combos(trades: list[dict], baseline_wr: float) -> list[VariableCombo]:
    """
    Generate 3-variable combinations with a lower minimum sample threshold.
    These produce more specific (but noisier) insights.
    """
    combos: list[VariableCombo] = []

    for vars_3 in combinations(VARIABLES, 3):
        buckets: dict[tuple, list[dict]] = defaultdict(list)
        for t in trades:
            vals = tuple(_get_value(t, col, src) for col, _, src in vars_3)
            if all(v for v in vals):
                buckets[vals].append(t)

        for vals, group in buckets.items():
            n = len(group)
            if n < MIN_SAMPLE_3VAR:
                continue
            wr  = global_win_rate(group)
            dev = wr - baseline_wr
            labels = {var[1]: val for var, val in zip(vars_3, vals)}
            combos.append(VariableCombo(
                variables=labels,
                sample_size=n,
                win_rate=round(wr, 4),
                baseline_wr=round(baseline_wr, 4),
                deviation=round(dev, 4),
                confidence=confidence_level(n),
            ))

    return combos


# ── Main pipeline ─────────────────────────────────────────────────────────────

def analyze_patterns(trades: list[dict]) -> PatternSummary:
    baseline_wr = global_win_rate(trades)
    combos_2    = _build_2var_combos(trades, baseline_wr)
    combos_3    = _build_3var_combos(trades, baseline_wr)
    all_combos  = combos_2 + combos_3

    # Sort by win rate descending for edges; ascending for drains
    by_wr  = sorted(all_combos, key=lambda c: c.win_rate, reverse=True)
    by_dev = sorted(all_combos, key=lambda c: abs(c.deviation), reverse=True)

    top_edges  = by_wr[:TOP_N]
    top_drains = sorted(all_combos, key=lambda c: c.win_rate)[:TOP_N]

    # Hidden drivers: large deviation from baseline but not in top/bottom WR lists
    seen    = {id(c) for c in top_edges + top_drains}
    hidden  = [c for c in by_dev if id(c) not in seen][:TOP_N]

    return PatternSummary(
        baseline_win_rate=round(baseline_wr, 4),
        top_edges=top_edges,
        top_drains=top_drains,
        hidden_drivers=hidden,
    )
