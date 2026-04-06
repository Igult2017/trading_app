"""
ai_engine/patterns.py
Multi-variable pattern detection.
Finds 2-variable combinations (session+emotion, setup+prior, etc.)
and ranks them by edge above/below baseline win rate.
"""
from __future__ import annotations
from collections import defaultdict
from itertools import combinations

from ._models import PatternSummary, VariableCombo
from ._utils import (
    extract_manual, is_win, win_rate as global_win_rate,
    confidence_level, is_sufficient, safe_div, coerce_str,
)

# ── Variables to cross ────────────────────────────────────────────────────────
# Each entry: (column_name_on_trade_row, label, source)
# source = "root" means top-level trade field; "manual" means inside manualFields
VARIABLES: list[tuple[str, str, str]] = [
    ("session",       "Session",        "root"),
    ("setup",         "Setup",          "root"),
    ("direction",     "Direction",      "root"),
    ("marketRegime",  "Market Regime",  "manual"),
    ("htfBias",       "HTF Bias",       "manual"),
    ("emotionalState","Emotion",        "manual"),
    ("entryTFContext","Entry TF",       "manual"),
]

# How many top/bottom combos to return
TOP_N = 8


# ── Value extraction ──────────────────────────────────────────────────────────

def _get_value(trade: dict, col: str, source: str) -> str | None:
    if source == "root":
        v = coerce_str(trade.get(col)).strip().lower()
    else:
        m = extract_manual(trade)
        v = coerce_str(m.get(col)).strip().lower()
    return v if v else None


# ── Core combinator ───────────────────────────────────────────────────────────

def _build_combos(trades: list[dict], baseline_wr: float) -> list[VariableCombo]:
    """
    For every pair of VARIABLES, group trades by their combined values
    and measure win rate per group.
    """
    combos: list[VariableCombo] = []

    for (col_a, label_a, src_a), (col_b, label_b, src_b) in combinations(VARIABLES, 2):
        # Bucket: (val_a, val_b) → list of trades
        buckets: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for t in trades:
            val_a = _get_value(t, col_a, src_a)
            val_b = _get_value(t, col_b, src_b)
            if val_a and val_b:
                buckets[(val_a, val_b)].append(t)

        for (val_a, val_b), group in buckets.items():
            n = len(group)
            if not is_sufficient(n):
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


# ── Main pipeline ─────────────────────────────────────────────────────────────

def analyze_patterns(trades: list[dict]) -> PatternSummary:
    baseline_wr = global_win_rate(trades)
    combos      = _build_combos(trades, baseline_wr)

    # Sort by win rate descending for edges; ascending for drains
    by_wr  = sorted(combos, key=lambda c: c.win_rate, reverse=True)
    by_dev = sorted(combos, key=lambda c: abs(c.deviation), reverse=True)

    top_edges  = by_wr[:TOP_N]
    top_drains = sorted(combos, key=lambda c: c.win_rate)[:TOP_N]

    # Hidden drivers: large deviation from baseline but may not be top/bottom WR
    seen = {id(c) for c in top_edges + top_drains}
    hidden = [c for c in by_dev if id(c) not in seen][:TOP_N]

    return PatternSummary(
        baseline_win_rate=round(baseline_wr, 4),
        top_edges=top_edges,
        top_drains=top_drains,
        hidden_drivers=hidden,
    )
