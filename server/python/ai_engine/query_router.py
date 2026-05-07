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
    # ── Drawdown / capital protection ─────────────────────────────────────────
    (re.compile(r"\b(avoid|reduce|prevent|cut|limit|fix|improve).*(drawdown|dd)\b", re.I), "drawdown_avoid"),
    (re.compile(r"\b(drawdown|dd)\b",                        re.I), "drawdown_summary"),
    (re.compile(r"\bworst (month|period|week)\b",            re.I), "worst_month"),
    (re.compile(r"\bbest (month|period)\b",                  re.I), "best_month"),
    (re.compile(r"\bmonthly (performance|breakdown|stats)\b", re.I), "monthly_breakdown"),
    (re.compile(r"\bloss streak\b",                          re.I), "streaks"),
    # ── Strategy / playbook ───────────────────────────────────────────────────
    (re.compile(r"\b(create|build|generate|design|write).*(strategy|playbook|rules?|plan)\b", re.I), "strategy_create"),
    (re.compile(r"\bwhat.*(strategy|approach|playbook|system).*(use|take|follow)\b", re.I), "strategy_create"),
    (re.compile(r"\b(strategy|playbook|trading plan|rules)\b", re.I), "strategy_summary"),
    # ── Metrics / edge quality ────────────────────────────────────────────────
    (re.compile(r"\b(profit factor|profitfactor)\b",         re.I), "profit_factor"),
    (re.compile(r"\bexpectanc(y|ies)\b",                     re.I), "expectancy_stat"),
    (re.compile(r"\b(total|net|overall)\s*(pnl|profit|loss|return)\b", re.I), "pnl_summary"),
    (re.compile(r"\b(average|avg)\s*(win|loss|pnl)\b",       re.I), "avg_pnl"),
    (re.compile(r"\bhow (much|well).*(mak|earn|profit|win)\b", re.I), "pnl_summary"),
    # ── Session / time of day ─────────────────────────────────────────────────
    (re.compile(r"\bbest (session|time)\b",                  re.I), "best_session"),
    (re.compile(r"\bworst (session|time)\b",                 re.I), "worst_session"),
    (re.compile(r"\b(specific|which|what) sessions?\b",      re.I), "best_session"),
    (re.compile(r"\btrade better in\b",                      re.I), "best_session"),
    # ── Timeframe ─────────────────────────────────────────────────────────────
    (re.compile(r"\b(best|worst|which|what).*(timeframe|tf|time.?frame)\b", re.I), "best_timeframe"),
    (re.compile(r"\btimeframe\b",                            re.I), "best_timeframe"),
    # ── Setup ─────────────────────────────────────────────────────────────────
    (re.compile(r"\bbest setup\b",                           re.I), "best_setup"),
    (re.compile(r"\bworst setup\b",                          re.I), "worst_setup"),
    (re.compile(r"\b(setup|playbook) tags?\b",               re.I), "best_setup"),
    (re.compile(r"\bwhich setups?\b",                        re.I), "best_setup"),
    # ── Behavioral / discipline ───────────────────────────────────────────────
    (re.compile(r"\bfomo\b",                                 re.I), "fomo_impact"),
    (re.compile(r"\brevenge\b",                              re.I), "revenge_impact"),
    (re.compile(r"\brule.?broken\b",                         re.I), "rule_broken"),
    (re.compile(r"\b(risk management|risk rules?|following.*rules?)\b", re.I), "risk_rules"),
    # ── Win / loss profile ────────────────────────────────────────────────────
    (re.compile(r"\b(win|winning).*(pattern|profile|trade)\b", re.I), "win_profile"),
    (re.compile(r"\bpatterns?.*(losing|losses)\b",            re.I), "loss_profile"),
    (re.compile(r"\b(loss|losing).*(pattern|profile|trade)\b", re.I), "loss_profile"),
    # ── R:R ───────────────────────────────────────────────────────────────────
    (re.compile(r"\b(r\s*[:/]\s*r|risk[\s-]*reward|risk[\s/]reward)\b", re.I), "rr_compare"),
    (re.compile(r"\baverage.*(rr|reward)\b",                 re.I), "rr_compare"),
    # ── Instruments ───────────────────────────────────────────────────────────
    (re.compile(r"\bbest.*(instrument|symbol|pair|currency)\b", re.I), "best_instrument"),
    (re.compile(r"\b(most|least).*(profitable|winning|losing).*(pair|instrument|symbol)\b", re.I), "best_instrument"),
    (re.compile(r"\b(instrument|symbol|pair|ticker)s?\b",    re.I), "best_instrument"),
    # ── Day of week / over-trading ────────────────────────────────────────────
    (re.compile(r"\bover.?trad(e|ing)\b",                    re.I), "over_trading"),
    (re.compile(r"\b(particular |which )?(day|days) of (the )?week\b", re.I), "by_day"),
    (re.compile(r"\btrades? per (day|week)\b",               re.I), "over_trading"),
    # ── Direction ─────────────────────────────────────────────────────────────
    (re.compile(r"\b(long|short|direction|bias).*(better|worse|win|perform)\b", re.I), "direction_bias"),
    # ── Streaks / consistency ─────────────────────────────────────────────────
    (re.compile(r"\b(streak|consecutive)\b",                 re.I), "streaks"),
    # ── Misc ──────────────────────────────────────────────────────────────────
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

def _pnl_by_group(trades: list[dict], key: str, source: str = "root") -> str:
    groups = _group_by(trades, key, source)
    if not groups:
        return f"No {key} data recorded."
    rows = []
    for grp, ts in groups.items():
        if len(ts) < 3:
            continue
        pnls = [_to_float(t.get("pnl") or t.get("profitLoss") or t.get("profit_loss")) for t in ts]
        pnls = [p for p in pnls if p is not None]
        total = sum(pnls) if pnls else None
        wr = global_win_rate(ts)
        rows.append((grp, len(ts), wr, total))
    rows.sort(key=lambda x: (x[3] or 0), reverse=True)
    lines = []
    for grp, n, wr, total in rows[:6]:
        pnl_str = f"  total P&L: {total:+.2f}" if total is not None else ""
        lines.append(f"  • {grp}: {wr:.0%} WR, {n} trades{pnl_str}")
    return "\n".join(lines) if lines else "Insufficient data (need ≥3 trades per group)."


def _monthly_summary(trades: list[dict]) -> str:
    by_month: dict[str, list[dict]] = defaultdict(list)
    months_order: list[str] = []
    for t in trades:
        d = _parse_date(t)
        if d:
            key = f"{d.year}-{d.month:02d}"
            if key not in by_month:
                months_order.append(key)
            by_month[key].append(t)
    if not by_month:
        return "No dated trades to summarise."
    rows = []
    for key in months_order:
        ts = by_month[key]
        wr = global_win_rate(ts)
        wins   = sum(1 for t in ts if is_win(t))
        losses = sum(1 for t in ts if is_loss(t))
        pnls   = [_to_float(t.get("pnl") or t.get("profitLoss")) for t in ts]
        pnls   = [p for p in pnls if p is not None]
        total  = sum(pnls) if pnls else None
        pnl_str = f"  P&L: {total:+.2f}" if total is not None else ""
        rows.append(f"  • {key}: {wr:.0%} WR — {wins}W/{losses}L of {len(ts)} trades{pnl_str}")
    return "Monthly performance:\n" + "\n".join(rows)


def _handle(key: str, trades: list[dict]) -> str:
    # ── Drawdown ───────────────────────────────────────────────────────────────
    if key in ("drawdown_summary", "drawdown_avoid"):
        # Compute a basic drawdown summary directly from trade data
        ordered = sorted(
            [t for t in trades if _parse_date(t)],
            key=lambda t: _parse_date(t),  # type: ignore[arg-type]
        )
        balance = 100.0
        peak    = 100.0
        max_dd  = 0.0
        worst_streak = 0
        cur_streak   = 0
        for t in ordered:
            pnl_pct = _to_float(
                t.get("pnlPercent") or t.get("pnl_percent") or
                t.get("profitLossPercent")
            )
            if pnl_pct is not None:
                balance = balance * (1 + pnl_pct / 100)
            elif is_loss(t):
                cur_streak += 1
                worst_streak = max(worst_streak, cur_streak)
            else:
                cur_streak = 0
            if balance > peak:
                peak = balance
            dd = (balance - peak) / peak * 100 if peak > 0 else 0.0
            if dd < max_dd:
                max_dd = dd
        total_losses = sum(1 for t in trades if is_loss(t))
        total_wins   = sum(1 for t in trades if is_win(t))
        wr = global_win_rate(trades)
        lines = [
            f"Drawdown overview ({len(trades)} trades):",
            f"  • Win rate: {wr:.0%}  ({total_wins}W / {total_losses}L)",
        ]
        if max_dd < -0.01:
            lines.append(f"  • Estimated max drawdown: {max_dd:.2f}%")
        if worst_streak > 0:
            lines.append(f"  • Longest loss streak (by outcome): {worst_streak} trades")
        if key == "drawdown_avoid":
            lines.append("")
            lines.append("To reduce drawdown: the AI will analyse your loss patterns and monthly data for specific recommendations.")
        return "\n".join(lines)

    # ── Monthly ────────────────────────────────────────────────────────────────
    if key in ("worst_month", "best_month", "monthly_breakdown"):
        return _monthly_summary(trades)

    # ── Strategy ──────────────────────────────────────────────────────────────
    if key in ("strategy_create", "strategy_summary"):
        wr = global_win_rate(trades)
        n  = len(trades)
        best_sess  = _rank_groups(_group_by(trades, "session"), top=3)
        best_setup = _rank_groups(_group_by(trades, "setup"),   top=3)
        best_instr = _rank_groups(_group_by(trades, "symbol") or _group_by(trades, "instrument"), top=3)
        best_dir   = _rank_groups(_group_by(trades, "direction"), top=3)
        return (
            f"Strategy data ({n} trades, {wr:.0%} baseline WR):\n"
            f"Best sessions:\n{best_sess}\n\n"
            f"Best setups:\n{best_setup}\n\n"
            f"Best instruments:\n{best_instr}\n\n"
            f"Best direction:\n{best_dir}"
        )

    # ── Metrics ───────────────────────────────────────────────────────────────
    if key == "profit_factor":
        wins_pnl  = [abs(_to_float(t.get("pnl") or t.get("profitLoss")) or 0) for t in trades if is_win(t) and (_to_float(t.get("pnl") or t.get("profitLoss")) or 0) > 0]
        loss_pnl  = [abs(_to_float(t.get("pnl") or t.get("profitLoss")) or 0) for t in trades if is_loss(t) and (_to_float(t.get("pnl") or t.get("profitLoss")) or 0) > 0]
        if not wins_pnl or not loss_pnl:
            return "Not enough P&L data to compute profit factor."
        pf = sum(wins_pnl) / sum(loss_pnl)
        return f"Profit factor: {pf:.2f} (gross wins {sum(wins_pnl):.2f} / gross losses {sum(loss_pnl):.2f} over {len(trades)} trades)."

    if key == "expectancy_stat":
        knowns = [(is_win(t), _to_float(t.get("pnl") or t.get("profitLoss"))) for t in trades]
        knowns = [(w, p) for w, p in knowns if p is not None]
        if not knowns:
            return "No P&L data recorded to compute expectancy."
        win_pnls  = [p for w, p in knowns if w]
        loss_pnls = [p for w, p in knowns if not w]
        wr = len(win_pnls) / len(knowns)
        avg_w = safe_mean(win_pnls) or 0
        avg_l = abs(safe_mean(loss_pnls) or 0)
        exp = wr * avg_w - (1 - wr) * avg_l
        return f"Expectancy: {exp:+.2f} per trade. (WR {wr:.0%}, avg win {avg_w:.2f}, avg loss {avg_l:.2f}, {len(knowns)} trades with P&L)"

    if key in ("pnl_summary", "avg_pnl"):
        pnls = [_to_float(t.get("pnl") or t.get("profitLoss")) for t in trades]
        pnls = [p for p in pnls if p is not None]
        if not pnls:
            return "No P&L data recorded."
        win_p  = [p for p in pnls if p > 0]
        loss_p = [p for p in pnls if p < 0]
        lines = [
            f"P&L summary ({len(pnls)} trades with data):",
            f"  • Total net P&L: {sum(pnls):+.2f}",
            f"  • Avg win:  {safe_mean(win_p):+.2f} across {len(win_p)} winners" if win_p else "",
            f"  • Avg loss: {safe_mean(loss_p):+.2f} across {len(loss_p)} losers" if loss_p else "",
            f"  • Largest win: {max(pnls):+.2f}" if pnls else "",
            f"  • Largest loss: {min(pnls):+.2f}" if pnls else "",
        ]
        return "\n".join(l for l in lines if l)

    # ── Timeframe ──────────────────────────────────────────────────────────────
    if key == "best_timeframe":
        groups = _group_by(trades, "entryTF") or _group_by(trades, "timeframe")
        if not groups:
            return "No timeframe data recorded on your trades."
        return "Timeframe performance by win rate:\n" + _rank_groups(groups, top=7)

    # ── Session ────────────────────────────────────────────────────────────────
    if key == "best_session":
        return "Best sessions by win rate:\n" + _rank_groups(_group_by(trades, "session"))
    if key == "worst_session":
        return "Worst sessions by win rate:\n" + _rank_groups(_group_by(trades, "session"), reverse=False)

    # ── Setup ─────────────────────────────────────────────────────────────────
    if key == "best_setup":
        return "Best setups by win rate:\n" + _rank_groups(_group_by(trades, "setup"))
    if key == "worst_setup":
        return "Worst setups by win rate:\n" + _rank_groups(_group_by(trades, "setup"), reverse=False)

    # ── Behavioral ────────────────────────────────────────────────────────────
    if key == "fomo_impact":
        return _bool_flag_answer(trades, "fomoTrade", "FOMO")
    if key == "revenge_impact":
        return _bool_flag_answer(trades, "revengeTrade", "Revenge")
    if key == "rule_broken":
        return _bool_flag_answer(trades, "ruleBroken", "Rule-broken")

    # ── Win / loss profile ────────────────────────────────────────────────────
    if key == "win_profile":
        wins = [t for t in trades if is_win(t)]
        setups   = _rank_groups(_group_by(wins, "setup"),   top=3)
        sessions = _rank_groups(_group_by(wins, "session"), top=3)
        instrs   = _pnl_by_group(wins, "instrument")
        return f"Winning trades — setups:\n{setups}\n\nSessions:\n{sessions}\n\nInstruments:\n{instrs}"
    if key == "loss_profile":
        losses = [t for t in trades if is_loss(t)]
        setups   = _rank_groups(_group_by(losses, "setup"),   top=3)
        sessions = _rank_groups(_group_by(losses, "session"), top=3)
        instrs   = _pnl_by_group(losses, "instrument")
        return f"Losing trades — setups:\n{setups}\n\nSessions:\n{sessions}\n\nInstruments:\n{instrs}"

    # ── R:R ───────────────────────────────────────────────────────────────────
    if key == "rr_compare":
        return _rr_compare(trades)

    # ── Instruments ───────────────────────────────────────────────────────────
    if key == "best_instrument":
        groups = _group_by(trades, "symbol") or _group_by(trades, "instrument")
        return "Instruments by win rate:\n" + _rank_groups(groups, top=6)

    # ── Day / over-trading ────────────────────────────────────────────────────
    if key == "over_trading":
        return _over_trading(trades)
    if key == "by_day":
        return _by_day_of_week(trades)

    # ── Direction ─────────────────────────────────────────────────────────────
    if key == "direction_bias":
        groups = _group_by(trades, "direction")
        return "Direction → win rate:\n" + _rank_groups(groups, top=5)

    # ── Streaks ───────────────────────────────────────────────────────────────
    if key == "streaks":
        return _streaks(trades)

    # ── Risk rules ────────────────────────────────────────────────────────────
    if key == "risk_rules":
        parts = []
        for field, label in [("ruleBroken", "Rule-broken"), ("fomoTrade", "FOMO"), ("revengeTrade", "Revenge")]:
            flagged = [t for t in trades if extract_manual(t).get(field) is True]
            if len(flagged) >= 3:
                wr = global_win_rate(flagged)
                parts.append(f"  • {label}: {wr:.0%} WR over {len(flagged)} trades")
        if not parts:
            return "Not enough rule-violation data to evaluate discipline (need ≥ 3 flagged trades)."
        baseline = global_win_rate(trades)
        return f"Baseline WR: {baseline:.0%}. Discipline metrics:\n" + "\n".join(parts)

    # ── Misc ──────────────────────────────────────────────────────────────────
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

    return ""


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
