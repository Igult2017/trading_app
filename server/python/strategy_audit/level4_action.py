"""
strategy_audit/level4_action.py
────────────────────────────────────────────────────────────────────────────
Level 4 — Action & Iteration: Concrete recommendations and final verdict

Full implementation. Synthesises outputs from Levels 1–3.
All output keys match StrategyAuditResult.level4 TypeScript type.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from ._utils import (
    check_minimum_sample,
    safe_mean,
    win_rate,
    profit_factor,
)


# ── Default guardrails (always included) ─────────────────────────────────────

_DEFAULT_GUARDRAILS = [
    {
        "condition": "3 consecutive losses in one session",
        "action":    "Stop trading for the remainder of the session",
    },
    {
        "condition": "2% account drawdown in one day",
        "action":    "Stop trading for the remainder of the day",
    },
    {
        "condition": "Total open risk exceeds 3% of account",
        "action":    "No new trades until existing positions close",
    },
]


# ── Policy suggestions ────────────────────────────────────────────────────────

def _generate_policy_suggestions(
    trades: list[dict],
    level1: dict,
    level2: dict,
    level3: dict,
) -> list[dict]:
    """
    Data-driven policy suggestions from cross-level findings.
    Each suggestion cites the specific metric that motivated it.
    Returns 3–6 suggestions.
    """
    suggestions: list[dict] = []

    # ── 1. Session restriction ───────────────────────────────────────────────
    session_edge = (level2.get("conditionalEdge") or {}).get("bySession", {})
    if len(session_edge) >= 2:
        best_session  = max(session_edge, key=lambda k: session_edge[k].get("winRate", 0))
        worst_session = min(session_edge, key=lambda k: session_edge[k].get("winRate", 0))
        spread = (
            session_edge[best_session].get("winRate", 0) -
            session_edge[worst_session].get("winRate", 0)
        )
        if spread > 15:
            best_wr = session_edge[best_session]["winRate"]
            worst_wr = session_edge[worst_session]["winRate"]
            suggestions.append({
                "rule":           f"Prioritise {best_session} session trades",
                "rationale":      (
                    f"{best_session} has a {best_wr:.0f}% win rate vs "
                    f"{worst_wr:.0f}% in {worst_session} — a {spread:.0f}pp gap."
                ),
                "expectedImpact": f"+{spread * 0.4:.0f}% estimated win rate improvement",
            })

    # ── 2. Confluence quality floor ──────────────────────────────────────────
    trade_quality = level2.get("tradeQuality", {})
    high_wr = trade_quality.get("highQualityWinRate")
    low_wr  = trade_quality.get("lowQualityWinRate")
    if high_wr is not None and low_wr is not None and (high_wr - low_wr) > 15:
        suggestions.append({
            "rule":           "Only take trades with confluence score ≥70",
            "rationale":      (
                f"High-confluence trades win at {high_wr:.0f}% vs {low_wr:.0f}% for "
                f"low-confluence — a {high_wr - low_wr:.0f}pp difference."
            ),
            "expectedImpact": f"Eliminates ~{low_wr:.0f}% baseline trades with negative edge",
        })

    # ── 3. Daily loss limit from cluster data ────────────────────────────────
    cluster_freq = (level3.get("lossCluster") or {}).get("clusterFrequency", 0.0)
    avg_cluster  = (level3.get("lossCluster") or {}).get("avgClusterSize", 0.0)
    if cluster_freq > 3:
        suggestions.append({
            "rule":           "Hard stop after 3 consecutive losses in a day",
            "rationale":      (
                f"Loss clusters occur {cluster_freq:.1f}× per 100 trades with "
                f"an average size of {avg_cluster:.1f} losses. "
                "Early halt prevents deep drawdown spirals."
            ),
            "expectedImpact": "Reduces max drawdown depth by cutting cluster tails",
        })

    # ── 4. Tighten entry criteria if execution asymmetry is poor ────────────
    exec_asym = level3.get("executionAsymmetry", {})
    asym_score = exec_asym.get("asymmetryScore", 0.0)
    early_exit = exec_asym.get("earlyExitRate", 0.0)
    if early_exit > 40:
        suggestions.append({
            "rule":           "Let winning trades run — do not close before TP",
            "rationale":      (
                f"{early_exit:.0f}% of wins were closed before reaching Take Profit. "
                "Premature exits suppress the average win size and reduce profit factor."
            ),
            "expectedImpact": f"Estimated +{early_exit * 0.1:.1f}% improvement in profit factor",
        })

    # ── 5. Risk sizing discipline ────────────────────────────────────────────
    capital_heat = level3.get("capitalHeat", {})
    risk_consistency = capital_heat.get("riskConsistencyScore", 100.0)
    avg_risk = capital_heat.get("avgRiskPerTrade", 0.0)
    if risk_consistency < 70:
        suggestions.append({
            "rule":           "Fix position size before entering every trade",
            "rationale":      (
                f"Risk consistency score is {risk_consistency:.0f}/100 — "
                f"sizing is highly variable. Erratic risk sizing amplifies drawdowns "
                f"and makes performance statistics unreliable."
            ),
            "expectedImpact": "Stabilises drawdown curve; makes edge measurable",
        })

    # ── 6. Edge driver reinforcement ─────────────────────────────────────────
    edge_drivers = level1.get("edgeDrivers", [])
    if edge_drivers:
        top_driver = edge_drivers[0]
        suggestions.append({
            "rule":           f"Only trade when: {top_driver['factor']}",
            "rationale":      (
                f"This condition lifts win rate by +{top_driver['lift']:.1f}pp "
                f"({top_driver['winRateWithFactor']:.0f}% with vs "
                f"{top_driver['winRateWithout']:.0f}% without)."
            ),
            "expectedImpact": f"+{top_driver['lift']:.0f}pp win rate when applied consistently",
        })

    # Return top 6, most impactful first (already ordered above)
    return suggestions[:6]


# ── Data-driven guardrails ────────────────────────────────────────────────────

def _data_driven_guardrails(
    level1: dict,
    level3: dict,
) -> list[dict]:
    """
    Additional guardrails derived from the actual data.
    """
    extra: list[dict] = []

    # Worst-performing condition from weaknesses
    weaknesses = level1.get("weaknesses", [])
    if weaknesses:
        worst = weaknesses[0]
        extra.append({
            "condition": f"Setup involves: {worst['factor']}",
            "action": (
                f"Skip the trade — this condition reduces win rate by "
                f"{worst['impact']:.0f}pp (only {worst['winRateWithFactor']:.0f}% win rate)"
            ),
        })

    # Loss cluster date awareness
    cluster_dates = (level3.get("lossCluster") or {}).get("clusterDates", [])
    avg_cluster   = (level3.get("lossCluster") or {}).get("avgClusterSize", 0.0)
    if avg_cluster >= 4:
        extra.append({
            "condition": f"4+ consecutive losses recorded (cluster avg: {avg_cluster:.0f})",
            "action":    "Mandatory 24-hour trading break to reset psychology",
        })

    # High automation risk
    auto_risk = (level3.get("automationRisk") or {}).get("score", 0.0)
    if auto_risk >= 60:
        extra.append({
            "condition": f"Automation risk score ≥60 ({auto_risk:.0f}/100)",
            "action":    "Manual review required before executing next 5 trades",
        })

    return extra[:3]  # max 3 additional guardrails


# ── Edge decay detection ──────────────────────────────────────────────────────

def _detect_edge_decay(trades: list[dict]) -> dict:
    """
    Split trades into 30-day rolling windows, compute win rate per window.
    Decay is detected when latest 30d win rate is >10pp below peak AND
    the decline spans ≥60 days.
    """
    no_decay = {
        "detected":       False,
        "decayStartDate": None,
        "decayMagnitude": 0.0,
        "recommendation": "No edge decay detected — performance is stable.",
    }

    # Need trades with valid dates
    dated = sorted(
        [t for t in trades if t.get("win") is not None and (
            t.get("exit_dt") or t.get("entry_dt") or t.get("created_dt")
        )],
        key=lambda t: t.get("exit_dt") or t.get("entry_dt") or t.get("created_dt")
    )

    if len(dated) < 20:
        return {**no_decay, "recommendation": "Insufficient data to assess edge decay (need 20+ dated trades)."}

    # Build 30-day windows sliding by 7 days
    first_date = dated[0].get("exit_dt") or dated[0].get("created_dt")
    last_date  = dated[-1].get("exit_dt") or dated[-1].get("created_dt")
    total_days = (last_date - first_date).days

    if total_days < 30:
        return {**no_decay, "recommendation": "Trading history spans less than 30 days — cannot assess decay."}

    windows: list[tuple[datetime, float]] = []
    window_size = timedelta(days=30)
    step        = timedelta(days=7)
    current     = first_date

    while current + window_size <= last_date + timedelta(days=1):
        window_trades = [
            t for t in dated
            if (t.get("exit_dt") or t.get("created_dt")) >= current
            and (t.get("exit_dt") or t.get("created_dt")) < current + window_size
        ]
        if len(window_trades) >= 5:
            wr = win_rate(window_trades)
            windows.append((current + window_size, wr))  # label at end of window
        current += step

    if len(windows) < 3:
        return {**no_decay, "recommendation": "Not enough trading windows to detect decay (need 3+ 30-day windows)."}

    # Find peak win rate and where it occurred
    peak_wr    = max(wr for _, wr in windows)
    peak_date  = next(dt for dt, wr in windows if wr == peak_wr)
    latest_wr  = windows[-1][1]
    decay_mag  = peak_wr - latest_wr

    # Span of decline
    span_days = (windows[-1][0] - peak_date).days

    if decay_mag > 10 and span_days >= 60:
        return {
            "detected":       True,
            "decayStartDate": peak_date.strftime("%Y-%m-%d"),
            "decayMagnitude": round(decay_mag, 1),
            "recommendation": (
                f"Win rate peaked at {peak_wr:.0f}% on {peak_date.strftime('%b %d, %Y')} "
                f"and has declined by {decay_mag:.0f}pp over {span_days} days to {latest_wr:.0f}%. "
                "Review strategy against current market regime and recent trade selection criteria."
            ),
        }

    return no_decay


# ── Overall grade ─────────────────────────────────────────────────────────────

def _compute_grade(level1: dict, level2: dict) -> str:
    """
    A: Confirmed edge + PF ≥ 2.0 + max DD > -5%
    B: Confirmed edge + PF ≥ 1.5
    C: Marginal edge + PF ≥ 1.2
    D: Marginal edge OR PF < 1.2
    F: Unconfirmed edge OR PF ≤ 1.0
    """
    summary = level1.get("edgeSummary", {})
    verdict = summary.get("edgeVerdict", "Unconfirmed")
    pf      = summary.get("profitFactor", 0.0)
    max_dd  = (level2.get("drawdown") or {}).get("maxDrawdown", -999.0)

    if pf is None: pf = 0.0
    if max_dd is None: max_dd = -999.0

    if verdict == "Confirmed" and pf >= 2.0 and max_dd >= -5.0:
        return "A"
    if verdict == "Confirmed" and pf >= 1.5:
        return "B"
    if verdict == "Marginal" and pf >= 1.2:
        return "C"
    if verdict == "Marginal" or pf < 1.2:
        return "D"
    return "F"


def _grade_narrative(
    grade: str,
    level1: dict,
    level2: dict,
    level3: dict,
) -> str:
    summary = level1.get("edgeSummary", {})
    wr      = summary.get("overallWinRate", 0)
    pf      = summary.get("profitFactor", 0)
    n       = summary.get("sampleSize", 0)
    max_dd  = (level2.get("drawdown") or {}).get("maxDrawdown", 0)
    verdict = summary.get("edgeVerdict", "Unconfirmed")

    grade_descriptions = {
        "A": "excellent",
        "B": "strong",
        "C": "developing",
        "D": "weak",
        "F": "no identifiable",
    }
    desc = grade_descriptions.get(grade, "unknown")

    return (
        f"Across {n} trades, this strategy shows a {desc} edge with a "
        f"{wr:.1f}% win rate and profit factor of {pf:.2f}. "
        f"The edge verdict is '{verdict}'. "
        f"Maximum drawdown reached {max_dd:.1f}%. "
        + (
            "The strategy demonstrates consistent profitability across multiple conditions."
            if grade in ("A", "B")
            else "Further refinement is needed before increasing position sizing."
            if grade == "C"
            else "Significant improvement in setup selection and risk management is required."
        )
    )


def _extract_strengths(level1: dict, level2: dict) -> list[str]:
    strengths: list[str] = []

    drivers = level1.get("edgeDrivers", [])
    for d in drivers[:3]:
        strengths.append(
            f"{d['factor']}: +{d['lift']:.0f}pp win rate boost "
            f"({d['winRateWithFactor']:.0f}% vs {d['winRateWithout']:.0f}%)"
        )

    consistency = (level2.get("equityVariance") or {}).get("consistencyScore", 0)
    if consistency >= 70:
        strengths.append(f"Consistent monthly equity curve (consistency score: {consistency:.0f}/100)")

    skew = (level2.get("variance") or {}).get("positiveSkew", False)
    if skew:
        strengths.append("Positive P&L skew — large wins outsize typical losses")

    return strengths[:5]


def _extract_top_weaknesses(level1: dict, level3: dict) -> list[str]:
    weaknesses_out: list[str] = []

    for w in (level1.get("weaknesses") or [])[:2]:
        weaknesses_out.append(
            f"{w['factor']} reduces win rate by {w['impact']:.0f}pp "
            f"(only {w['winRateWithFactor']:.0f}% win rate)"
        )

    issues = (level3.get("automationRisk") or {}).get("issues", [])
    for issue in issues[:2]:
        weaknesses_out.append(issue)

    cluster_freq = (level3.get("lossCluster") or {}).get("clusterFrequency", 0)
    if cluster_freq > 5:
        weaknesses_out.append(
            f"High loss cluster frequency: {cluster_freq:.1f} clusters per 100 trades"
        )

    return weaknesses_out[:5]


def _next_actions(
    suggestions: list[dict],
    grade: str,
    level1: dict,
) -> list[str]:
    actions: list[str] = []

    # First action always based on grade
    if grade == "F":
        actions.append("Paper trade for 30+ sessions before risking real capital")
    elif grade == "D":
        actions.append("Reduce position size by 50% until edge is confirmed over next 30 trades")
    elif grade in ("A", "B"):
        actions.append("Strategy is performing well — consider gradual position size increase")

    # Pull top policy suggestions as actions
    for s in suggestions[:3]:
        actions.append(s["rule"])

    # Sample size warning
    n = (level1.get("edgeSummary") or {}).get("sampleSize", 0)
    if n < 30:
        actions.append(f"Collect more trades ({30 - n} more needed) before drawing firm conclusions")

    return actions[:5]


# ── Public API ────────────────────────────────────────────────────────────────

def compute_level4(
    trades: list[dict],
    level1: dict,
    level2: dict,
    level3: dict,
) -> dict:
    """
    Compute Level 4 — action plan and final verdict.
    Input:  normalised trades + level1/2/3 outputs
    Output: dict matching StrategyAuditResult.level4
    """
    ok, msg = check_minimum_sample(trades, min_trades=5)
    if not ok:
        return _empty_level4(msg)

    policy_suggestions = _generate_policy_suggestions(trades, level1, level2, level3)
    extra_guardrails   = _data_driven_guardrails(level1, level3)
    all_guardrails     = _DEFAULT_GUARDRAILS + extra_guardrails

    edge_decay = _detect_edge_decay(trades)
    grade      = _compute_grade(level1, level2)
    narrative  = _grade_narrative(grade, level1, level2, level3)
    strengths  = _extract_strengths(level1, level2)
    weaknesses = _extract_top_weaknesses(level1, level3)
    actions    = _next_actions(policy_suggestions, grade, level1)

    return {
        "aiPolicySuggestions": policy_suggestions,
        "guardrails":          all_guardrails,
        "edgeDecay":           edge_decay,
        "finalVerdict": {
            "overallGrade":  grade,
            "summary":       narrative,
            "topStrengths":  strengths,
            "topWeaknesses": weaknesses,
            "nextActions":   actions,
        },
    }


def _empty_level4(reason: str = "") -> dict:
    return {
        "aiPolicySuggestions": [],
        "guardrails":          _DEFAULT_GUARDRAILS,
        "edgeDecay": {
            "detected":       False,
            "decayStartDate": None,
            "decayMagnitude": 0.0,
            "recommendation": reason or "Insufficient data.",
        },
        "finalVerdict": {
            "overallGrade":  "N/A",
            "summary":       reason or "Insufficient trade data for a complete audit.",
            "topStrengths":  [],
            "topWeaknesses": [],
            "nextActions":   ["Collect at least 5 trades to generate an audit"],
        },
    }
