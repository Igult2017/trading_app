"""
strategy_audit/level1_edge.py
────────────────────────────────────────────────────────────────────────────
Level 1 — Strategy Audit: Edge Detection

Full implementation. All output keys match the TypeScript StrategyAuditResult
type exactly so no frontend changes are needed.
"""

from __future__ import annotations

from collections import defaultdict, Counter
from typing import Any

from datetime import datetime, timezone as _tz

from ._utils import (
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


# ── Scannable fields for dynamic factor discovery ─────────────────────────────

_FREQ_THRESHOLD = 0.50   # factor must appear in >50% of wins or losses
_MAX_FACTORS    = 8      # max columns per heatmap


def _val(t: dict, key: str) -> str | None:
    """Return a clean string value or None."""
    v = t.get(key)
    if v is None or v == "" or v == "Unknown":
        return None
    return str(v).strip()


def _bool_label(t: dict, key: str) -> str | None:
    """Convert a boolean field to 'Yes'/'No' or None if missing."""
    v = t.get(key)
    if v is True:  return "Yes"
    if v is False: return "No"
    if isinstance(v, str):
        if v.lower() in ("true", "yes", "1"):  return "Yes"
        if v.lower() in ("false", "no", "0"): return "No"
    return None


def _confluence_bucket(t: dict) -> str | None:
    v = t.get("confluence_score")
    if v is None:
        return None
    try:
        f = float(v)
        return "High (≥4)" if f >= 4 else "Low (<4)"
    except (TypeError, ValueError):
        return None


def _scannable_fields() -> list[tuple[str, Any]]:
    """
    Each entry: (column_label_prefix, getter(trade) -> str | None)
    getter returns the discrete value for this trade, or None if not available.
    """
    return [
        ("Session",           lambda t: _val(t, "session_label")),
        ("Phase",             lambda t: _val(t, "session_phase")),
        ("Direction",         lambda t: _val(t, "direction")),
        ("Day",               lambda t: _val(t, "day_of_week")),
        ("HTF Bias",          lambda t: _val(t, "htf_bias")),
        ("Confluence",        _confluence_bucket),
        ("Emotional State",   lambda t: _val(t, "emotional_state")),
        ("Focus",             lambda t: _val(t, "focus_level")),
        ("Confidence",        lambda t: _val(t, "confidence_level")),
        ("Energy",            lambda t: _val(t, "energy_level")),
        ("Confidence@Entry",  lambda t: _val(t, "confidence_at_entry")),
        ("Rules Followed",    lambda t: _val(t, "rules_followed")),
        ("Risk Heat",         lambda t: _val(t, "risk_heat")),
        ("Trade Grade",       lambda t: _val(t, "trade_grade")),
        ("Setup Tag",         lambda t: _val(t, "setup_tag")),
        ("Market Regime",     lambda t: _val(t, "market_regime")),
        ("Volatility",        lambda t: _val(t, "volatility_state")),
        ("Order Type",        lambda t: _val(t, "order_type")),
        ("News",              lambda t: _val(t, "news_environment")),
        ("Candle Pattern",    lambda t: _val(t, "candle_pattern")),
        ("Management",        lambda t: _val(t, "management_type")),
        ("Post-Trade Feel",   lambda t: _val(t, "post_trade_emotion")),
        ("Setup Valid",       lambda t: _bool_label(t, "setup_fully_valid")),
        ("MTF Aligned",       lambda t: _bool_label(t, "mtf_alignment")),
        ("Trend Aligned",     lambda t: _bool_label(t, "trend_alignment")),
        ("HTF Level Present", lambda t: _bool_label(t, "htf_key_level")),
        ("Key Level Respect", lambda t: _bool_label(t, "key_level_respected")),
        ("FOMO Trade",        lambda t: _bool_label(t, "fomo_trade")),
        ("Revenge Trade",     lambda t: _bool_label(t, "revenge_trade")),
        ("Emotional Trade",   lambda t: _bool_label(t, "emotional_trade")),
    ]


def _discover_factors(
    wins: list[dict],
    losses: list[dict],
    threshold: float = _FREQ_THRESHOLD,
    max_factors: int = _MAX_FACTORS,
) -> tuple[list[tuple[str, Any]], list[tuple[str, Any]]]:
    """
    Discover win factors (appear in >50% of wins) and decay factors
    (appear in >50% of losses).

    Returns:
        win_factors  — list of (label, predicate) for heatmap columns
        decay_factors — list of (label, predicate) for heatmap columns
    """
    n_wins   = len(wins)
    n_losses = len(losses)

    win_candidates:   list[tuple[str, Any, float]] = []
    decay_candidates: list[tuple[str, Any, float]] = []
    win_seen:   set[str] = set()
    decay_seen: set[str] = set()

    for prefix, getter in _scannable_fields():
        win_counts   = Counter(getter(t) for t in wins   if getter(t) is not None)
        loss_counts  = Counter(getter(t) for t in losses if getter(t) is not None)

        for val in (set(win_counts) | set(loss_counts)):
            label     = f"{prefix}: {val}"
            win_freq  = win_counts.get(val, 0)  / n_wins   if n_wins   else 0.0
            loss_freq = loss_counts.get(val, 0) / n_losses if n_losses else 0.0

            predicate = (lambda g, v: lambda t: g(t) == v)(getter, val)

            if win_freq > threshold and label not in win_seen:
                win_seen.add(label)
                win_candidates.append((label, predicate, win_freq))

            if loss_freq > threshold and label not in decay_seen:
                decay_seen.add(label)
                decay_candidates.append((label, predicate, loss_freq))

    win_candidates.sort(key=lambda x: x[2], reverse=True)
    decay_candidates.sort(key=lambda x: x[2], reverse=True)

    return (
        [(l, p) for l, p, _ in win_candidates[:max_factors]],
        [(l, p) for l, p, _ in decay_candidates[:max_factors]],
    )


# ── Edge drivers ──────────────────────────────────────────────────────────────

def _compute_edge_drivers(
    trades: list[dict],
    win_factors: list[tuple[str, Any]],
    decay_factors: list[tuple[str, Any]],
) -> tuple[list[dict], list[dict], list[str]]:
    """
    Returns (edge_drivers, weaknesses, monitor_items).
    Uses dynamically discovered win/decay factors.
    """
    drivers: list[dict] = []
    weaknesses: list[dict] = []
    monitor_items: list[str] = []

    overall_wr = win_rate(trades)

    # Drivers come from win factors; weaknesses from decay factors
    all_conditions = win_factors + decay_factors

    for label, predicate in all_conditions:
        with_factor    = [t for t in trades if predicate(t) is True]
        without_factor = [t for t in trades if predicate(t) is False]

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
) -> tuple[dict, dict, list[str], list[str]]:
    """
    Discover win/decay factors from trade data (>50% frequency threshold),
    then build per-instrument win-rate scores for each discovered factor.

    Returns:
        win_corr   — {instrument: [win_rate_% per win_factor]}
        loss_corr  — {instrument: [win_rate_% per decay_factor]}
        win_labels — column labels for the win heatmap
        decay_labels — column labels for the decay heatmap
    """
    all_wins   = [t for t in trades if t.get("win") is True]
    all_losses = [t for t in trades if t.get("win") is False]

    win_factors, decay_factors = _discover_factors(all_wins, all_losses)

    win_labels   = [label for label, _ in win_factors]
    decay_labels = [label for label, _ in decay_factors]

    by_instrument: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        instr = t.get("instrument") or "Unknown"
        by_instrument[instr].append(t)

    win_corr:  dict[str, list[float]] = {}
    loss_corr: dict[str, list[float]] = {}

    for instr, itrades in by_instrument.items():
        if len(itrades) < _MIN_CONDITION_TRADES:
            continue

        # Win heatmap: for each win factor, what % of that instrument's trades
        # with this factor were wins?
        w_scores: list[float] = []
        for _, predicate in win_factors:
            present = [t for t in itrades if predicate(t) is True]
            if not present:
                w_scores.append(0.0)
            else:
                wins_with = sum(1 for t in present if t.get("win") is True)
                w_scores.append(round(wins_with / len(present) * 100, 1))
        win_corr[instr] = w_scores

        # Decay heatmap: for each decay factor, what % were losses?
        d_scores: list[float] = []
        for _, predicate in decay_factors:
            present = [t for t in itrades if predicate(t) is True]
            if not present:
                d_scores.append(0.0)
            else:
                losses_with = sum(1 for t in present if t.get("win") is False)
                d_scores.append(round(losses_with / len(present) * 100, 1))
        loss_corr[instr] = d_scores

    return win_corr, loss_corr, win_labels, decay_labels


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

    Uses actual average win / average loss P&L as the R:R ratio when both
    are available (more accurate than planned RR). Falls back to the logged
    rr_float when actual P&L data is insufficient.
    """
    knowns = [t for t in trades if t.get("win") is not None]
    if not knowns:
        return 0.0

    wins_only   = [t for t in knowns if t["win"] is True]
    losses_only = [t for t in knowns if t["win"] is False]
    W = len(wins_only) / len(knowns)
    L = 1.0 - W

    # Prefer actual P&L ratio over planned RR
    win_pnls  = [t["pnl"] for t in wins_only  if t.get("pnl") and t["pnl"] > 0]
    loss_pnls = [abs(t["pnl"]) for t in losses_only if t.get("pnl") and t["pnl"] < 0]

    if win_pnls and loss_pnls:
        avg_rr = safe_mean(win_pnls) / max(safe_mean(loss_pnls), 0.0001)
    else:
        rr_values = [t["rr_float"] for t in trades if t.get("rr_float") and t["rr_float"] > 0]
        avg_rr = safe_mean(rr_values) if rr_values else 1.0

    if avg_rr <= 0:
        avg_rr = 1.0

    kelly = (W - (L / avg_rr)) * 100
    return round(max(-100.0, min(100.0, kelly)), 2)


# ── Edge persistence ─────────────────────────────────────────────────────────

def _edge_persistence(trades: list[dict]) -> float:
    """
    Measures how consistently the edge holds across time.

    Method: sort trades chronologically, split into first-half / second-half,
    compute profit factor in each half.

    persistence = min(pf_first, pf_second) / max(pf_first, pf_second)
      → 1.0  means the edge is rock-solid across both periods
      → 0.5  means one period is twice as strong as the other
      → 0.0  means one period lost money (no persistent edge)

    Returns 0.0 when there are fewer than 10 trades with P&L (not enough to split).
    Falls back to list order when trades lack date fields.
    """
    # Keep only trades that have P&L; sort by date where available
    with_pnl = [t for t in trades if t.get("pnl") is not None]
    if len(with_pnl) < 10:
        return 0.0

    def _sort_key(t):
        dt = t.get("exit_dt") or t.get("entry_dt") or t.get("created_dt")
        return dt if dt is not None else datetime(2000, 1, 1, tzinfo=_tz.utc)

    sorted_trades = sorted(with_pnl, key=_sort_key)

    mid         = len(sorted_trades) // 2
    first_half  = sorted_trades[:mid]
    second_half = sorted_trades[mid:]

    pf1 = profit_factor(first_half)
    pf2 = profit_factor(second_half)

    # Either half being unprofitable means the edge does not persist
    if pf1 <= 0 or pf2 <= 0:
        return 0.0

    ratio = min(pf1, pf2) / max(pf1, pf2)
    return round(min(1.0, max(0.0, ratio)), 2)


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

    win_corr, loss_corr, win_labels, decay_labels = _build_correlation_matrices(trades)

    # Rebuild factor predicates for edge-driver computation
    all_wins   = [t for t in trades if t.get("win") is True]
    all_losses = [t for t in trades if t.get("win") is False]
    win_factors, decay_factors = _discover_factors(all_wins, all_losses)

    edge_drivers, weaknesses, monitor_items = _compute_edge_drivers(
        trades, win_factors, decay_factors
    )

    psych_score, disc_score = _psychology_discipline(trades)
    kelly       = _kelly_edge(trades)
    persistence = _edge_persistence(trades)

    wins_pnl  = [t["pnl"] for t in trades if t.get("win") is True  and t.get("pnl") is not None]
    losses_pnl= [t["pnl"] for t in trades if t.get("win") is False and t.get("pnl") is not None]
    avg_win_dollar  = round(safe_mean(wins_pnl),  2) if wins_pnl  else None
    avg_loss_dollar = round(abs(safe_mean(losses_pnl)), 2) if losses_pnl else None

    return {
        "edgeSummary": {
            "overallWinRate": round(wr, 2),
            "profitFactor":   round(pf, 3) if pf != float("inf") else 999.0,
            "expectancy":     round(exp, 2),
            "sampleSize":     n,
            "edgeVerdict":    verdict,
            "avgWin":         avg_win_dollar,
            "avgLoss":        avg_loss_dollar,
        },
        "conditionLabels":       win_labels,   # legacy key — kept for compatibility
        "winConditionLabels":    win_labels,
        "decayConditionLabels":  decay_labels,
        "edgeDrivers":           edge_drivers,
        "monitorItems":          monitor_items,
        "weaknesses":            weaknesses,
        "winFactorCorrelation":  win_corr,
        "lossFactorCorrelation": loss_corr,
        "psychologyScore":       psych_score,
        "disciplineScore":       disc_score,
        "probabilisticEdge":     kelly,
        "edgePersistence":       persistence,
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
        "conditionLabels":       [label for label, _ in _conditions()],
        "edgeDrivers":           [],
        "monitorItems":          [reason] if reason else [],
        "weaknesses":            [],
        "winFactorCorrelation":  {},
        "lossFactorCorrelation": {},
        "psychologyScore":       0.0,
        "disciplineScore":       0.0,
        "probabilisticEdge":     0.0,
        "edgePersistence":       0.0,
    }
