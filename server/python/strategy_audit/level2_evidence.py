"""
strategy_audit/level2_evidence.py
────────────────────────────────────────────────────────────────────────────
Level 2 — Evidence & Proof: Statistical validation of the edge

Full implementation using scipy.stats for distribution shape.
All output keys match the StrategyAuditResult.level2 TypeScript type.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timezone

from ._utils import (
    check_minimum_sample,
    safe_mean,
    safe_std,
    win_rate,
    profit_factor,
)


# ── Try importing scipy ───────────────────────────────────────────────────────

try:
    from scipy import stats as _scipy_stats
    _SCIPY = True
except ImportError:
    _SCIPY = False


# ── Distribution helpers ──────────────────────────────────────────────────────

def _skewness(values: list[float]) -> float:
    """Population skewness. Falls back to manual calc if scipy unavailable."""
    clean = [v for v in values if v is not None and not math.isnan(v)]
    if len(clean) < 4:
        return 0.0
    if _SCIPY:
        try:
            return float(_scipy_stats.skew(clean))
        except Exception:
            pass
    # Manual Pearson skewness approximation
    m = safe_mean(clean)
    s = safe_std(clean)
    if s == 0:
        return 0.0
    n = len(clean)
    return (n / ((n - 1) * (n - 2))) * sum(((x - m) / s) ** 3 for x in clean)


def _kurtosis(values: list[float]) -> float:
    """Excess kurtosis (Fisher). Falls back to manual calc if scipy unavailable."""
    clean = [v for v in values if v is not None and not math.isnan(v)]
    if len(clean) < 4:
        return 0.0
    if _SCIPY:
        try:
            return float(_scipy_stats.kurtosis(clean, fisher=True))
        except Exception:
            pass
    # Manual excess kurtosis
    m = safe_mean(clean)
    s = safe_std(clean)
    if s == 0:
        return 0.0
    n = len(clean)
    k = sum(((x - m) / s) ** 4 for x in clean) / n
    return k - 3.0


# ── Drawdown calculations ─────────────────────────────────────────────────────

def _build_equity_curve(trades: list[dict], starting_balance: float) -> list[float]:
    """
    Build equity curve sorted by exit_dt (then created_dt as fallback).
    Returns list of balance values at each trade exit.
    """
    # Sort by date
    dated = sorted(
        [t for t in trades if t.get("pnl") is not None],
        key=lambda t: (
            t.get("exit_dt") or t.get("entry_dt") or t.get("created_dt") or
            datetime(2000, 1, 1, tzinfo=timezone.utc)
        )
    )

    curve: list[float] = []
    balance = starting_balance
    for t in dated:
        balance += t["pnl"]
        curve.append(balance)
    return curve


def _max_drawdown(equity_curve: list[float]) -> tuple[float, float]:
    """
    Returns (max_drawdown_pct, avg_drawdown_pct).
    Drawdown is expressed as a negative percentage of the peak equity.
    """
    if len(equity_curve) < 2:
        return 0.0, 0.0

    peak = equity_curve[0]
    max_dd = 0.0
    drawdowns: list[float] = []

    for val in equity_curve:
        if val > peak:
            peak = val
        if peak > 0:
            dd = (val - peak) / peak * 100  # negative number
            drawdowns.append(dd)
            if dd < max_dd:
                max_dd = dd

    avg_dd = safe_mean(drawdowns) if drawdowns else 0.0
    return round(max_dd, 2), round(avg_dd, 2)


def _ulcer_index(equity_curve: list[float]) -> float:
    """
    Ulcer Index = sqrt(mean(d_i^2)) where d_i is the % drawdown from peak at point i.
    """
    if len(equity_curve) < 2:
        return 0.0

    peak = equity_curve[0]
    squared_dds: list[float] = []

    for val in equity_curve:
        if val > peak:
            peak = val
        if peak > 0:
            dd = (val - peak) / peak * 100
            squared_dds.append(dd ** 2)

    if not squared_dds:
        return 0.0
    return round(math.sqrt(safe_mean(squared_dds)), 3)


def _calmar_ratio(
    trades: list[dict],
    starting_balance: float,
    max_dd_pct: float,
) -> float:
    """
    Calmar = (annualised return %) / abs(maxDrawdown %).
    """
    if abs(max_dd_pct) < 0.001:
        return 0.0

    pnls = [t["pnl"] for t in trades if t.get("pnl") is not None]
    if not pnls or starting_balance <= 0:
        return 0.0

    net_pnl_pct = (sum(pnls) / starting_balance) * 100

    # Estimate years spanned
    dates = sorted([
        t.get("exit_dt") or t.get("entry_dt") or t.get("created_dt")
        for t in trades
        if (t.get("exit_dt") or t.get("entry_dt") or t.get("created_dt"))
    ])
    if len(dates) >= 2:
        span_days = (dates[-1] - dates[0]).days
        years = max(span_days / 365.25, 1 / 12)  # at least 1 month
    else:
        return 0.0  # cannot compute Calmar without date data

    annualised_return = net_pnl_pct / years
    return round(annualised_return / abs(max_dd_pct), 3)


def _recovery_factor(trades: list[dict], starting_balance: float, max_dd_pct: float) -> float:
    if abs(max_dd_pct) < 0.001 or starting_balance <= 0:
        return 0.0
    pnls = [t["pnl"] for t in trades if t.get("pnl") is not None]
    net_pnl_pct = (sum(pnls) / starting_balance) * 100
    return round(net_pnl_pct / abs(max_dd_pct), 3)


# ── Monthly equity variance ───────────────────────────────────────────────────

def _monthly_equity_variance(trades: list[dict]) -> dict:
    """
    Group P&L by YYYY-MM, compute monthly stats and consistency score.
    """
    monthly: dict[str, float] = defaultdict(float)

    for t in trades:
        if t.get("pnl") is None:
            continue
        dt = t.get("exit_dt") or t.get("entry_dt") or t.get("created_dt")
        if dt is None:
            continue
        key = dt.strftime("%Y-%m")
        monthly[key] += t["pnl"]

    if not monthly:
        return {
            "bestMonth": 0.0, "worstMonth": 0.0,
            "monthlyStdDev": 0.0, "consistencyScore": 0.0,
            "mcBars": [],
        }

    values = list(monthly.values())
    mean_monthly = safe_mean(values)
    std_monthly  = safe_std(values)

    if abs(mean_monthly) > 0.001:
        raw_score = 100 - (std_monthly / abs(mean_monthly) * 100)
        consistency = round(max(0.0, min(100.0, raw_score)), 1)
    else:
        consistency = 0.0

    # Real distribution bars: normalize each monthly P&L to 0-100 scale
    # relative to the absolute peak value so bars reflect actual outcomes.
    peak = max(abs(v) for v in values) or 1.0
    mc_bars = [max(0, min(100, round((v / peak) * 100))) for v in values]

    return {
        "bestMonth":        round(max(values), 2),
        "worstMonth":       round(min(values), 2),
        "monthlyStdDev":    round(std_monthly, 2),
        "consistencyScore": consistency,
        "mcBars":           mc_bars,
    }


# ── Trade quality ─────────────────────────────────────────────────────────────

def _trade_quality(trades: list[dict]) -> dict:
    conf_scores  = []
    entry_quals  = []
    plan_exec    = []

    for t in trades:
        c = t.get("confluence_score")
        if c is not None:
            try: conf_scores.append(float(c))
            except: pass

        eq = t.get("entry_quality")
        if eq is not None:
            try: entry_quals.append(float(eq))
            except: pass

        pe = t.get("planning_vs_execution")
        if pe is not None:
            try: plan_exec.append(float(pe))
            except: pass

    # Primary bucketing: use explicit trade_grade field (A / B / C) set by the user.
    # The field may be stored as "A", "A - Textbook", "a", etc. — match on first char.
    # Fallback: bucket by confluence_score thresholds for trades without a grade.
    def _grade(t: dict) -> str | None:
        raw = t.get("trade_grade")
        if raw is not None:
            first = str(raw).strip().upper()[:1]
            if first in ("A", "B", "C"):
                return first
        # Fallback — confluence score
        cs = t.get("confluence_score")
        if cs is not None:
            try:
                v = float(cs)
                if v >= 70:
                    return "A"
                if v >= 40:
                    return "B"
                return "C"
            except (TypeError, ValueError):
                pass
        return None

    high_quality = [t for t in trades if _grade(t) == "A"]
    mid_quality  = [t for t in trades if _grade(t) == "B"]
    low_quality  = [t for t in trades if _grade(t) == "C"]

    return {
        "avgConfluenceScore":     round(safe_mean(conf_scores), 1),
        "avgEntryQuality":        round(safe_mean(entry_quals), 1),
        "avgPlanningVsExecution": round(safe_mean(plan_exec), 1),
        "highQualityWinRate":     round(win_rate(high_quality), 1) if len(high_quality) >= 5 else None,
        "highQualityCount":       len(high_quality),
        "lowQualityWinRate":      round(win_rate(low_quality), 1)  if len(low_quality)  >= 5 else None,
        "lowQualityCount":        len(low_quality),
        "midQualityWinRate":      round(win_rate(mid_quality), 1)  if len(mid_quality)  >= 5 else None,
        "midQualityCount":        len(mid_quality),
    }


# ── Conditional edge ──────────────────────────────────────────────────────────

def _conditional_edge(trades: list[dict]) -> dict:
    """
    Win rate / profit factor broken down by session and setup tag.
    """
    # By session
    by_session: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        lbl = t.get("session_label") or "Unknown"
        by_session[lbl].append(t)

    session_edge: dict[str, dict] = {}
    for session, st in by_session.items():
        if len(st) < 3:
            continue
        rr_values = [t["rr_float"] for t in st if t.get("rr_float") is not None and t["rr_float"] > 0]
        pf_raw = profit_factor(st)
        # Cap profit_factor at 20 to avoid the 999 sentinel when there are no losses
        pf_capped = min(round(pf_raw, 3), 20.0)
        session_edge[session] = {
            "trades":       len(st),
            "winRate":      round(win_rate(st), 1),
            "profitFactor": pf_capped,
            "avgRR":        round(safe_mean(rr_values), 2) if rr_values else None,
        }

    # By setup tag (from manual_fields.setup_tags array)
    by_tag: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        tags = t.get("setup_tags")
        if isinstance(tags, list):
            for tag in tags:
                by_tag[str(tag)].append(t)
        elif isinstance(tags, str) and tags:
            by_tag[tags].append(t)

    tag_edge: dict[str, dict] = {}
    for tag, tt in by_tag.items():
        if len(tt) < 3:
            continue
        rr_values = [t["rr_float"] for t in tt if t.get("rr_float")]
        tag_edge[tag] = {
            "trades":  len(tt),
            "winRate": round(win_rate(tt), 1),
            "avgRR":   round(safe_mean(rr_values), 2) if rr_values else None,
        }

    return {
        "bySetupTag": tag_edge,
        "bySession":  session_edge,
    }


# ── Heatmap profiles ──────────────────────────────────────────────────────────

def _heatmap_profiles(trades: list[dict]) -> list[dict]:
    """
    Per instrument × strategy win rate table.
    strategy is taken from manual_fields.strategy or ai_extracted.strategy.
    """
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)

    for t in trades:
        instr    = t.get("instrument") or "Unknown"
        strategy = (
            t.get("strategy") or
            (t.get("manual_fields") or {}).get("strategy") or
            (t.get("ai_extracted") or {}).get("strategy") or
            "Unknown"
        )
        groups[(instr, strategy)].append(t)

    profiles: list[dict] = []
    for (instr, strategy), group in groups.items():
        if len(group) < 3:
            continue
        profiles.append({
            "instrument": instr,
            "strategy":   strategy,
            "winRate":    round(win_rate(group), 1),
            "trades":     len(group),
        })

    # Sort by trade count descending
    profiles.sort(key=lambda x: x["trades"], reverse=True)
    return profiles


# ── Public API ────────────────────────────────────────────────────────────────

def compute_level2(trades: list[dict], starting_balance: float) -> dict:
    """
    Compute Level 2 — statistical evidence and proof.
    Input:  normalised trades, starting balance.
    Output: dict matching StrategyAuditResult.level2
    """
    ok, msg = check_minimum_sample(trades, min_trades=5)
    if not ok:
        return _empty_level2(msg)

    pnls = [t["pnl"] for t in trades if t.get("pnl") is not None]
    n    = len(pnls)

    # ── Variance / distribution ──────────────────────────────────────────────
    wr = win_rate(trades)
    win_pnls  = [t["pnl"] for t in trades if t.get("win") is True  and t.get("pnl")]
    loss_pnls = [abs(t["pnl"]) for t in trades if t.get("win") is False and t.get("pnl")]
    wlr = (safe_mean(win_pnls) / safe_mean(loss_pnls)) if (win_pnls and loss_pnls) else 0.0

    variance_block = {
        "winRate":      round(wr, 2),
        "stdDev":       round(safe_std(pnls), 4),
        "skewness":     round(_skewness(pnls), 4),
        "kurtosis":     round(_kurtosis(pnls), 4),
        "sampleSize":   n,
        "winLossRatio": round(wlr, 3),
        "positiveSkew": _skewness(pnls) > 0,
    }

    # ── Drawdown ─────────────────────────────────────────────────────────────
    sb = starting_balance if starting_balance and starting_balance > 0 else 10_000.0
    equity_curve = _build_equity_curve(trades, sb)

    max_dd, avg_dd = _max_drawdown(equity_curve)
    ui             = _ulcer_index(equity_curve)
    calmar         = _calmar_ratio(trades, sb, max_dd)
    rec_factor     = _recovery_factor(trades, sb, max_dd)

    drawdown_block = {
        "maxDrawdown":    max_dd,
        "avgDrawdown":    avg_dd,
        "recoveryFactor": rec_factor,
        "calmarRatio":    calmar,
        "ulcerIndex":     ui,
    }

    return {
        "variance":        variance_block,
        "drawdown":        drawdown_block,
        "equityVariance":  _monthly_equity_variance(trades),
        "tradeQuality":    _trade_quality(trades),
        "conditionalEdge": _conditional_edge(trades),
        "heatmapProfiles": _heatmap_profiles(trades),
    }


def _empty_level2(reason: str = "") -> dict:
    return {
        "variance":        {"note": reason},
        "drawdown":        {},
        "equityVariance":  {},
        "tradeQuality":    {},
        "conditionalEdge": {"bySetupTag": {}, "bySession": {}},
        "heatmapProfiles": [],
    }
