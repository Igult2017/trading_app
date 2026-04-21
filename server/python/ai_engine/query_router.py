"""
ai_engine/query_router.py
Intent-to-data mapping for Q&A mode.
Maps natural-language questions to a resolver function that
extracts the answer directly from trade data — no hallucination possible.
"""
from __future__ import annotations
import re
from collections import defaultdict

from collections import Counter
from datetime import datetime

from ._utils import (
    extract_manual, is_win, is_loss, win_rate as global_win_rate,
    coerce_str, safe_div, safe_mean,
)
from .proof import build_finding

# ── Intent patterns ───────────────────────────────────────────────────────────
# Each entry: (regex, handler_key)
# First match wins — order matters for specificity.

_INTENTS: list[tuple[re.Pattern, str]] = [
    # Session / time of day
    (re.compile(r"\bbest (session|time)\b",                  re.I), "best_session"),
    (re.compile(r"\bworst (session|time)\b",                 re.I), "worst_session"),
    (re.compile(r"\b(specific|which|what) sessions?\b",      re.I), "best_session"),
    (re.compile(r"\btrade better in\b",                      re.I), "best_session"),
    # Setup
    (re.compile(r"\bbest setup\b",                           re.I), "best_setup"),
    (re.compile(r"\bworst setup\b",                          re.I), "worst_setup"),
    (re.compile(r"\b(setup|playbook) tags?\b",               re.I), "best_setup"),
    (re.compile(r"\bwhich setups?\b",                        re.I), "best_setup"),
    # Behavioral flags
    (re.compile(r"\bfomo\b",                                 re.I), "fomo_impact"),
    (re.compile(r"\brevenge\b",                              re.I), "revenge_impact"),
    (re.compile(r"\brule.?broken\b",                         re.I), "rule_broken"),
    (re.compile(r"\b(risk management|risk rules?|following.*rules?)\b", re.I), "risk_rules"),
    # Emotions
    (re.compile(r"\bemotion(al)?\s*(state|impact)?\b",       re.I), "emotion_summary"),
    (re.compile(r"\bmood\b",                                 re.I), "emotion_summary"),
    # Win / loss profile
    (re.compile(r"\b(win|winning).*(pattern|profile|trade)\b", re.I), "win_profile"),
    (re.compile(r"\bpatterns?.*(losing|losses)\b",            re.I), "loss_profile"),
    (re.compile(r"\b(loss|losing).*(pattern|profile|trade)\b", re.I), "loss_profile"),
    # R:R
    (re.compile(r"\b(r\s*[:/]\s*r|risk[\s-]*reward|risk[\s/]reward)\b", re.I), "rr_compare"),
    (re.compile(r"\baverage.*(rr|reward)\b",                 re.I), "rr_compare"),
    # Instruments
    (re.compile(r"\b(instrument|symbol|pair|ticker)s?\b",    re.I), "best_instrument"),
    (re.compile(r"\bwhich (instrument|symbol|pair)s?\b",     re.I), "best_instrument"),
    # Day of week / over-trading
    (re.compile(r"\bover.?trad(e|ing)\b",                    re.I), "over_trading"),
    (re.compile(r"\b(particular |which )?(day|days) of (the )?week\b", re.I), "by_day"),
    (re.compile(r"\btrades? per (day|week)\b",               re.I), "over_trading"),
    # Direction
    (re.compile(r"\b(long|short|direction|bias).*(better|worse|win|perform)\b", re.I), "direction_bias"),
    # Streaks / consistency
    (re.compile(r"\b(streak|consecutive)\b",                 re.I), "streaks"),
    # Misc legacy
    (re.compile(r"\bsample size\b",                          re.I), "sample_size"),
    (re.compile(r"\bhtf bias\b",                             re.I), "htf_bias"),
    (re.compile(r"\bmarket regime\b",                        re.I), "market_regime"),
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
    if key == "rr_compare":
        return _rr_compare(trades)
    if key == "best_instrument":
        groups = _group_by(trades, "symbol")
        if not groups:
            groups = _group_by(trades, "instrument")
        return "Instruments by win rate:\n" + _rank_groups(groups, top=5)
    if key == "over_trading":
        return _over_trading(trades)
    if key == "by_day":
        return _by_day_of_week(trades)
    if key == "direction_bias":
        groups = _group_by(trades, "direction")
        return "Direction → win rate:\n" + _rank_groups(groups, top=5)
    if key == "streaks":
        return _streaks(trades)
    if key == "risk_rules":
        # Risk-rule discipline: combine ruleBroken / fomo / revenge into one view
        parts = []
        for field, label in [
            ("ruleBroken", "Rule-broken"),
            ("fomoTrade",  "FOMO"),
            ("revengeTrade", "Revenge"),
        ]:
            flagged = [t for t in trades if extract_manual(t).get(field) is True]
            if len(flagged) >= 3:
                wr = global_win_rate(flagged)
                parts.append(f"  • {label}: {wr:.0%} WR over {len(flagged)} trades")
        if not parts:
            return "Not enough rule-violation data to evaluate discipline (need ≥ 3 flagged trades)."
        baseline = global_win_rate(trades)
        return (
            f"Baseline WR: {baseline:.0%}. Discipline metrics:\n"
            + "\n".join(parts)
        )
    return "Query understood but not yet implemented."


# ── Numeric / structural helpers ──────────────────────────────────────────────

def _to_float(v) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _rr_compare(trades: list[dict]) -> str:
    """Average R:R on winners vs losers."""
    win_rrs, loss_rrs = [], []
    for t in trades:
        rr = _to_float(
            t.get("riskReward") or t.get("rr") or t.get("rRMultiple")
            or extract_manual(t).get("rr")
        )
        if rr is None:
            continue
        if is_win(t):
            win_rrs.append(rr)
        elif is_loss(t):
            loss_rrs.append(rr)
    if not win_rrs and not loss_rrs:
        return "No R:R values recorded on your trades — log R:R to enable this analysis."
    win_avg  = safe_mean(win_rrs)
    loss_avg = safe_mean(loss_rrs)
    parts = []
    if win_avg is not None:
        parts.append(f"  • Winners: avg R:R = {win_avg:.2f} across {len(win_rrs)} trades")
    if loss_avg is not None:
        parts.append(f"  • Losers:  avg R:R = {loss_avg:.2f} across {len(loss_rrs)} trades")
    return "Average R:R by outcome:\n" + "\n".join(parts)


def _parse_date(t: dict) -> datetime | None:
    raw = (t.get("date") or t.get("entryDate") or t.get("createdAt")
           or t.get("entryTime"))
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw
    s = str(raw)
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:len(fmt) if "T" not in fmt else 19], fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _over_trading(trades: list[dict]) -> str:
    counts: Counter = Counter()
    for t in trades:
        d = _parse_date(t)
        if d:
            counts[d.date().isoformat()] += 1
    if not counts:
        return "No trade dates available to evaluate over-trading."
    total_days = len(counts)
    total = sum(counts.values())
    avg = total / total_days
    over = [(d, c) for d, c in counts.items() if c >= max(5, avg * 2)]
    over.sort(key=lambda x: x[1], reverse=True)
    lines = [
        f"You traded {total} trades across {total_days} days "
        f"(avg {avg:.1f} per active day)."
    ]
    if over:
        lines.append("Days with potential over-trading (≥5 and ≥2× your average):")
        for d, c in over[:5]:
            lines.append(f"  • {d}: {c} trades")
    else:
        lines.append("No clear over-trading days detected.")
    return "\n".join(lines)


def _by_day_of_week(trades: list[dict]) -> str:
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    buckets: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        d = _parse_date(t)
        if d:
            buckets[names[d.weekday()]].append(t)
    if not buckets:
        return "No trade dates available to evaluate day-of-week performance."
    return "Day of week → win rate:\n" + _rank_groups(buckets, top=7)


def _streaks(trades: list[dict]) -> str:
    ordered = [t for t in trades if _parse_date(t)]
    ordered.sort(key=lambda t: _parse_date(t))
    if not ordered:
        ordered = trades
    max_w = max_l = cur_w = cur_l = 0
    for t in ordered:
        if is_win(t):
            cur_w += 1; cur_l = 0
            max_w = max(max_w, cur_w)
        elif is_loss(t):
            cur_l += 1; cur_w = 0
            max_l = max(max_l, cur_l)
        else:
            cur_w = cur_l = 0
    return (
        f"Longest winning streak: {max_w} trades. "
        f"Longest losing streak: {max_l} trades."
    )


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
