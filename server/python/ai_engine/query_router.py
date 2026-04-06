"""
ai_engine/query_router.py
Intent-to-data mapping for Q&A mode.
Maps natural-language questions to a resolver function that
extracts the answer directly from trade data — no hallucination possible.
"""
from __future__ import annotations
import re
from collections import defaultdict

from ._utils import (
    extract_manual, is_win, is_loss, win_rate as global_win_rate,
    coerce_str, safe_div,
)
from .proof import build_finding

# ── Intent patterns ───────────────────────────────────────────────────────────
# Each entry: (regex, handler_key)
# First match wins — order matters for specificity.

_INTENTS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bbest (session|time)\b",           re.I), "best_session"),
    (re.compile(r"\bworst (session|time)\b",           re.I), "worst_session"),
    (re.compile(r"\bbest setup\b",                     re.I), "best_setup"),
    (re.compile(r"\bworst setup\b",                    re.I), "worst_setup"),
    (re.compile(r"\bfomo\b",                           re.I), "fomo_impact"),
    (re.compile(r"\brevenge\b",                        re.I), "revenge_impact"),
    (re.compile(r"\brule.?broken\b",                   re.I), "rule_broken"),
    (re.compile(r"\bemotion|emotional\b",              re.I), "emotion_summary"),
    (re.compile(r"\b(win|winning).*(pattern|profile)\b",re.I),"win_profile"),
    (re.compile(r"\b(loss|losing).*(pattern|profile)\b",re.I),"loss_profile"),
    (re.compile(r"\bsample size\b",                    re.I), "sample_size"),
    (re.compile(r"\bhtf bias\b",                       re.I), "htf_bias"),
    (re.compile(r"\bmarket regime\b",                  re.I), "market_regime"),
]


# ── Group-by helper ───────────────────────────────────────────────────────────

def _group_by(trades: list[dict], key: str, source: str = "root") -> dict[str, list[dict]]:
    buckets: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        if source == "manual":
            v = coerce_str(extract_manual(t).get(key)).strip().lower()
        else:
            v = coerce_str(t.get(key)).strip().lower()
        if v:
            buckets[v].append(t)
    return dict(buckets)


def _rank_groups(groups: dict[str, list[dict]], top: int = 3, reverse: bool = True) -> str:
    ranked = sorted(
        [(k, len(v), global_win_rate(v)) for k, v in groups.items() if len(v) >= 3],
        key=lambda x: x[2],
        reverse=reverse,
    )[:top]
    if not ranked:
        return "Insufficient data (need ≥ 3 trades per group)."
    lines = [f"  • {k}: {wr:.0%} WR across {n} trades" for k, n, wr in ranked]
    return "\n".join(lines)


def _bool_flag_answer(trades: list[dict], field: str, label: str) -> str:
    flagged   = [t for t in trades if extract_manual(t).get(field) is True]
    unflagged = [t for t in trades if t not in flagged]
    if len(flagged) < 3:
        return f"Not enough {label} trades to analyze (need ≥ 3)."
    wr_f = global_win_rate(flagged)
    wr_u = global_win_rate(unflagged)
    delta = wr_f - wr_u
    direction = "higher" if delta > 0 else "lower"
    return (
        f"{label} trades: {wr_f:.0%} WR over {len(flagged)} trades "
        f"({abs(delta):.0%} {direction} than the {wr_u:.0%} non-{label} baseline)."
    )


# ── Handlers ──────────────────────────────────────────────────────────────────

def _handle(key: str, trades: list[dict]) -> str:
    if key == "best_session":
        return "Best sessions by win rate:\n" + _rank_groups(_group_by(trades, "session"))
    if key == "worst_session":
        return "Worst sessions by win rate:\n" + _rank_groups(_group_by(trades, "session"), reverse=False)
    if key == "best_setup":
        return "Best setups by win rate:\n" + _rank_groups(_group_by(trades, "setup"))
    if key == "worst_setup":
        return "Worst setups by win rate:\n" + _rank_groups(_group_by(trades, "setup"), reverse=False)
    if key == "fomo_impact":
        return _bool_flag_answer(trades, "fomoTrade", "FOMO")
    if key == "revenge_impact":
        return _bool_flag_answer(trades, "revengeTrade", "Revenge")
    if key == "rule_broken":
        return _bool_flag_answer(trades, "ruleBroken", "Rule-broken")
    if key == "emotion_summary":
        groups = _group_by(trades, "emotionalState", source="manual")
        return "Emotion → win rate:\n" + _rank_groups(groups, top=5)
    if key == "win_profile":
        wins = [t for t in trades if is_win(t)]
        setups  = _rank_groups(_group_by(wins, "setup"),   top=3)
        sessions= _rank_groups(_group_by(wins, "session"), top=3)
        return f"Win profile setups:\n{setups}\n\nWin profile sessions:\n{sessions}"
    if key == "loss_profile":
        losses = [t for t in trades if is_loss(t)]
        setups  = _rank_groups(_group_by(losses, "setup"),   top=3)
        sessions= _rank_groups(_group_by(losses, "session"), top=3)
        return f"Loss profile setups:\n{setups}\n\nLoss profile sessions:\n{sessions}"
    if key == "sample_size":
        return (
            f"Total trades: {len(trades)}. "
            f"Wins: {sum(1 for t in trades if is_win(t))}. "
            f"Losses: {sum(1 for t in trades if is_loss(t))}."
        )
    if key == "htf_bias":
        groups = _group_by(trades, "htfBias", source="manual")
        return "HTF Bias → win rate:\n" + _rank_groups(groups, top=5)
    if key == "market_regime":
        groups = _group_by(trades, "marketRegime", source="manual")
        return "Market Regime → win rate:\n" + _rank_groups(groups, top=5)
    return "Query understood but not yet implemented."


# ── Public entry point ────────────────────────────────────────────────────────

def route_query(question: str, trades: list[dict]) -> str:
    """
    Route a natural-language question to the appropriate data handler.
    Returns a plain-text answer grounded in actual trade data.
    Returns None when no intent matches — caller falls back to Claude.
    """
    for pattern, key in _INTENTS:
        if pattern.search(question):
            return _handle(key, trades)
    return ""   # empty string → no local match, escalate to Claude
