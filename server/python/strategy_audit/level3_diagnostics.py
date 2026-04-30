"""
strategy_audit/level3_diagnostics.py
────────────────────────────────────────────────────────────────────────────
Level 3 — Diagnostics: Identifying failure patterns and structural risks

Full implementation. Pure Python — no scipy dependency.
All output keys match StrategyAuditResult.level3 TypeScript type.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import timezone

from ._utils import (
    check_minimum_sample,
    safe_mean,
    safe_std,
    win_rate,
)


# ── Loss cluster detection ────────────────────────────────────────────────────

def _detect_loss_clusters(trades: list[dict], starting_balance: float) -> dict:
    """
    A cluster = 3+ consecutive losses.
    Returns: clusterDates, avgClusterSize, clusterFrequency (per 100 trades), worstDD (%)
    worstDD = largest cumulative loss during any single cluster as % of starting_balance.
    """
    # Sort by date
    dated = sorted(
        [t for t in trades if t.get("win") is not None],
        key=lambda t: (
            t.get("exit_dt") or t.get("entry_dt") or t.get("created_dt") or
            __import__("datetime").datetime(2000, 1, 1, tzinfo=timezone.utc)
        )
    )

    if len(dated) < 3:
        return {"clusterDates": [], "avgClusterSize": 0.0, "clusterFrequency": 0.0, "worstDD": None}

    cluster_dates: list[str] = []
    cluster_sizes: list[int] = []
    cluster_drawdowns: list[float] = []
    in_cluster = False
    cluster_start_idx = 0
    consecutive_losses = 0

    def _record_cluster(start_idx: int, end_idx_exclusive: int) -> None:
        """Record a completed cluster [start_idx, end_idx_exclusive)."""
        size = consecutive_losses
        cluster_sizes.append(size)

        # Worst drawdown: sum of PnL losses in the cluster as % of starting balance
        cluster_trades = dated[start_idx:end_idx_exclusive]
        cluster_pnl = sum(t["pnl"] for t in cluster_trades if t.get("pnl") is not None)
        if starting_balance > 0 and cluster_pnl < 0:
            cluster_drawdowns.append(abs(cluster_pnl) / starting_balance * 100)

        start_dt = (
            dated[start_idx].get("exit_dt") or
            dated[start_idx].get("created_dt")
        )
        end_dt = (
            dated[end_idx_exclusive - 1].get("exit_dt") or
            dated[end_idx_exclusive - 1].get("created_dt")
        )
        if start_dt and end_dt:
            cluster_dates.append(
                f"{start_dt.strftime('%Y-%m-%d')} to {end_dt.strftime('%Y-%m-%d')}"
            )
        elif start_dt:
            cluster_dates.append(start_dt.strftime("%Y-%m-%d"))

    for i, t in enumerate(dated):
        if t.get("win") is False:
            if not in_cluster:
                consecutive_losses += 1
                if consecutive_losses >= 3:
                    in_cluster = True
                    cluster_start_idx = i - 2
            else:
                consecutive_losses += 1
        else:
            if in_cluster:
                _record_cluster(cluster_start_idx, i)
            in_cluster = False
            consecutive_losses = 0

    # Handle cluster that runs to the end
    if in_cluster and consecutive_losses >= 3:
        _record_cluster(cluster_start_idx, len(dated))

    n = len(dated)
    worst_dd = round(max(cluster_drawdowns), 2) if cluster_drawdowns else None

    return {
        "clusterDates":     cluster_dates,
        "avgClusterSize":   round(safe_mean(cluster_sizes), 1) if cluster_sizes else 0.0,
        "clusterFrequency": round(len(cluster_dates) / n * 100, 2) if n > 0 else 0.0,
        "worstDD":          worst_dd,
    }


# ── Execution asymmetry ───────────────────────────────────────────────────────

def _execution_asymmetry(trades: list[dict]) -> dict:
    """
    Compare structural RR, early exits, and entry deviations
    between winning and losing trades.
    """
    wins   = [t for t in trades if t.get("win") is True]
    losses = [t for t in trades if t.get("win") is False]

    # ── Avg Win in R ─────────────────────────────────────────────────────────
    # Prefer pnl / monetary_risk (true realised R). Fall back to the structural
    # achieved-RR ("rr_float") if dollar risk isn't recorded.
    win_r_realised = []
    for t in wins:
        pnl = t.get("pnl")
        risk = t.get("monetary_risk")
        if pnl is not None and risk and risk > 0:
            win_r_realised.append(pnl / risk)
    if not win_r_realised:
        win_r_realised = [t["rr_float"] for t in wins if t.get("rr_float") and t["rr_float"] > 0]
    avg_win_rr = safe_mean(win_r_realised) if win_r_realised else 0.0

    # ── Avg Loss in R ────────────────────────────────────────────────────────
    # Same approach for losses (use abs so it's reported as a positive R figure).
    # If no risk data is present at all, default to 1.0R — the conventional
    # "stop hit = 1R lost" assumption — rather than 0, which would be
    # misleadingly absent.
    loss_r_realised = []
    for t in losses:
        pnl = t.get("pnl")
        risk = t.get("monetary_risk")
        if pnl is not None and risk and risk > 0:
            loss_r_realised.append(abs(pnl) / risk)
    if not loss_r_realised:
        loss_r_realised = [t["rr_float"] for t in losses if t.get("rr_float") and t["rr_float"] > 0]
    avg_loss_rr = safe_mean(loss_r_realised) if loss_r_realised else (1.0 if losses else 0.0)

    asymmetry_score = (avg_win_rr / max(avg_loss_rr, 0.01)) if avg_win_rr > 0 else 0.0

    # Early exit rate: wins where take_profit was NOT reached
    # (exit_price didn't reach take_profit within 0.1% tolerance)
    early_exits = 0
    early_exit_eligible = 0
    for t in wins:
        ep = t.get("entry_price")
        tp = t.get("take_profit")
        lot = float(t.get("lot_size") or 1.0)
        xp = t.get("exit_price") or ((t.get("entry_price") or 0.0) + ((t.get("pnl") or 0.0) / max(lot, 0.001)))
        if ep and tp and xp:
            tolerance = abs(tp - ep) * 0.05  # 5% of the TP distance
            early_exit_eligible += 1
            if abs(xp - tp) > tolerance and (
                (tp > ep and xp < tp) or (tp < ep and xp > tp)
            ):
                early_exits += 1

    early_exit_rate = (early_exits / early_exit_eligible * 100) if early_exit_eligible > 0 else 0.0

    # Entry deviation (planned vs actual, in pips / points)
    deviations = []
    for t in trades:
        dev = t.get("entry_deviation")
        if dev is not None:
            try: deviations.append(float(dev))
            except: pass

    planned_vs_actual = safe_mean(deviations) if deviations else 0.0

    # Late entry rate (from manual_fields.late_entry flag)
    late_entries = sum(1 for t in trades if str(t.get("late_entry", "")).lower() in ("true", "yes", "1"))
    late_entry_rate = (late_entries / len(trades) * 100) if trades else 0.0

    return {
        "avgWinRR":             round(avg_win_rr, 3),
        "avgLossRR":            round(avg_loss_rr, 3),
        "asymmetryScore":       round(asymmetry_score, 3),
        "plannedVsActualEntry": round(planned_vs_actual, 2),
        "earlyExitRate":        round(early_exit_rate, 1),
        "lateEntryRate":        round(late_entry_rate, 1),
    }


# ── Regime transition ─────────────────────────────────────────────────────────

def _regime_transition(trades: list[dict]) -> dict:
    """
    Group win rates by market regime tag (trending / ranging / breakout).
    regime field lives in manual_fields.regime or directly on the trade.
    """
    by_regime: dict[str, list[dict]] = defaultdict(list)

    for t in trades:
        regime = (
            t.get("regime") or
            (t.get("manual_fields") or {}).get("regime") or
            (t.get("ai_extracted") or {}).get("regime")
        )
        if regime:
            by_regime[str(regime).lower()].append(t)

    result: dict[str, float] = {
        "trendingWinRate":         0.0,
        "rangingWinRate":          0.0,
        "breakoutWinRate":         0.0,
        "regimeDetectionAccuracy": 0.0,
    }

    trending = by_regime.get("trending") or by_regime.get("trend") or []
    ranging  = by_regime.get("ranging") or by_regime.get("range") or []
    breakout = by_regime.get("breakout") or []

    if len(trending) >= 3:
        result["trendingWinRate"] = round(win_rate(trending), 1)
    if len(ranging) >= 3:
        result["rangingWinRate"]  = round(win_rate(ranging), 1)
    if len(breakout) >= 3:
        result["breakoutWinRate"] = round(win_rate(breakout), 1)

    # Regime detection accuracy:
    # A trade's regime was "correct" if it's tagged trending/ranging/breakout
    # and outcome matches what we'd expect:
    #   - Trending + win = correct
    #   - Ranging + breakeven-ish = harder to score; skip
    # Simplified: % of tagged trades that resulted in wins
    tagged = trending + ranging + breakout
    if tagged:
        result["regimeDetectionAccuracy"] = round(win_rate(tagged), 1)

    return result


# ── Capital heat ──────────────────────────────────────────────────────────────

def _capital_heat(trades: list[dict]) -> dict:
    """
    Analyse risk sizing consistency and correlated exposure.
    """
    risk_pcts = [t["risk_percent"] for t in trades
                 if t.get("risk_percent") is not None and t["risk_percent"] > 0]

    avg_risk = round(safe_mean(risk_pcts), 3) if risk_pcts else 0.0
    max_risk = round(max(risk_pcts), 3) if risk_pcts else 0.0
    std_risk = safe_std(risk_pcts) if risk_pcts else 0.0

    # riskConsistencyScore: 100 - stdDev*10, clamped 0–100
    consistency = round(max(0.0, min(100.0, 100.0 - std_risk * 10)), 1)

    # Correlated exposure: find instrument pairs traded within 1 hour
    # (open trades overlapping in time)
    dated_trades = sorted(
        [t for t in trades if t.get("entry_dt") and t.get("exit_dt")],
        key=lambda t: t["entry_dt"]
    )

    overlap_pairs: dict[str, int] = defaultdict(int)
    for i, t1 in enumerate(dated_trades):
        instr1 = t1.get("instrument") or "?"
        for t2 in dated_trades[i + 1:]:
            instr2 = t2.get("instrument") or "?"
            if instr1 == instr2:
                continue
            # Check overlap
            if t2["entry_dt"] >= t1["exit_dt"]:
                break  # sorted, no more overlaps possible
            pair = "/".join(sorted([instr1, instr2]))
            overlap_pairs[pair] += 1

    # Return most frequent overlapping pairs
    top_pairs = sorted(overlap_pairs.items(), key=lambda x: x[1], reverse=True)[:5]
    correlated_exposure = [f"{pair} ({count}x)" for pair, count in top_pairs if count >= 2]

    return {
        "avgRiskPerTrade":      avg_risk,
        "maxRiskPerTrade":      max_risk,
        "riskConsistencyScore": consistency,
        "correlatedExposure":   correlated_exposure,
    }


# ── Automation risk ───────────────────────────────────────────────────────────

def _automation_risk(
    trades: list[dict],
    cluster_data: dict,
    capital_data: dict,
) -> dict:
    """
    Composite automation risk score 0–100.
    Higher = more prone to systematic failure.
    """
    score = 0.0
    issues: list[str] = []

    # 1. High loss cluster frequency (> 5 per 100 trades)
    cluster_freq = cluster_data.get("clusterFrequency", 0.0)
    if cluster_freq > 5:
        score += 25
        issues.append(f"High loss cluster frequency ({cluster_freq:.1f} per 100 trades)")

    # 2. Inconsistent risk sizing (riskConsistencyScore < 60)
    risk_consistency = capital_data.get("riskConsistencyScore", 100.0)
    if risk_consistency < 60:
        score += 20
        issues.append(f"Inconsistent risk sizing (consistency score: {risk_consistency:.0f}/100)")

    # 3. Correlated exposure (multiple pairs open simultaneously)
    corr_exposure = capital_data.get("correlatedExposure", [])
    if len(corr_exposure) >= 2:
        score += 15
        issues.append(f"Frequent correlated exposure detected: {', '.join(corr_exposure[:2])}")

    # 4. Average risk per trade too high (> 2%)
    avg_risk = capital_data.get("avgRiskPerTrade", 0.0)
    if avg_risk > 2.0:
        score += 20
        issues.append(f"Average risk per trade is elevated ({avg_risk:.2f}%)")

    # 5. Max risk per trade too high (> 3%)
    max_risk = capital_data.get("maxRiskPerTrade", 0.0)
    if max_risk > 3.0:
        score += 20
        issues.append(f"Maximum single-trade risk of {max_risk:.2f}% recorded")

    # Cap at 100
    score = min(100.0, score)

    return {
        "score":  round(score, 1),
        "issues": issues,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def compute_level3(trades: list[dict], starting_balance: float = 10_000.0) -> dict:
    """
    Compute Level 3 — diagnostics and failure pattern detection.
    Input:  normalised trades list, starting_balance for drawdown % calculations
    Output: dict matching StrategyAuditResult.level3
    """
    ok, msg = check_minimum_sample(trades, min_trades=5)
    if not ok:
        return _empty_level3(msg)

    cluster_data = _detect_loss_clusters(trades, starting_balance)
    capital_data = _capital_heat(trades)

    return {
        "lossCluster":        cluster_data,
        "executionAsymmetry": _execution_asymmetry(trades),
        "regimeTransition":   _regime_transition(trades),
        "capitalHeat":        capital_data,
        "automationRisk":     _automation_risk(trades, cluster_data, capital_data),
    }


def _empty_level3(reason: str = "") -> dict:
    return {
        "lossCluster":        {"clusterDates": [], "avgClusterSize": 0.0, "clusterFrequency": 0.0, "worstDD": None},
        "executionAsymmetry": {},
        "regimeTransition":   {},
        "capitalHeat":        {"avgRiskPerTrade": 0.0, "maxRiskPerTrade": 0.0,
                                "riskConsistencyScore": 0.0, "correlatedExposure": []},
        "automationRisk":     {"score": 0.0, "issues": [reason] if reason else []},
    }
