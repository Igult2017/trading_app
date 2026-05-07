"""
ai_engine/core.py
Mode orchestrator — the single entry point for all three AI modes.
Runs the appropriate pipelines, serialises findings, and delegates
natural-language synthesis to llm_client.
"""
from __future__ import annotations
import dataclasses
import json
from typing import Any

from ._models   import AIVerdict, TradeProfile, ProofedFinding
from ._utils    import win_rate as global_win_rate, is_win, is_loss, confidence_level
from .notes     import analyze_notes
from .patterns  import analyze_patterns
from .proof     import combo_to_finding, top_findings, filter_sufficient, split_by_confidence
from .strategy  import build_strategy
from .tilt      import detect_tilt, tilt_finding_text
from .query_router import route_query
from .llm_client import call_llm


# ── Serialisation ─────────────────────────────────────────────────────────────

def _serialise(obj: Any) -> Any:
    """Recursively convert dataclasses / nested structures to plain dicts."""
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {k: _serialise(v) for k, v in dataclasses.asdict(obj).items()}
    if isinstance(obj, list):
        return [_serialise(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _serialise(v) for k, v in obj.items()}
    return obj


# ── Archetype classifier ──────────────────────────────────────────────────────

def _archetype(wr: float, n: int) -> str:
    if n < 20:
        return "Developing — build your sample size"
    if wr >= 0.65:
        return "High-probability trader"
    if wr >= 0.50:
        return "Consistent edge trader"
    if wr >= 0.40:
        return "Inconsistent — tighten the playbook"
    return "High-risk profile — review entries urgently"


def _health_score(wr: float, n: int) -> str:
    if n < 20:
        return "Developing"
    if wr >= 0.60:
        return "Advanced"
    if wr >= 0.45:
        return "Consistent"
    return "Developing"


# ── Profile builder ───────────────────────────────────────────────────────────

def _build_profiles(trades: list[dict], patterns) -> tuple:
    wins   = [t for t in trades if is_win(t)]
    losses = [t for t in trades if is_loss(t)]

    def _make_profile(group: list[dict], label: str) -> TradeProfile | None:
        if len(group) < 5:
            return None
        # Re-run pattern analysis on the sub-group to find what characterises them
        sub = analyze_patterns(group)
        top = sub.top_edges[:3]
        conditions = [
            ", ".join(f"{k}={v}" for k, v in c.variables.items())
            for c in top
            if c.sample_size >= 3
        ]
        n  = len(group)
        wr = global_win_rate(group)
        return TradeProfile(
            label=label,
            conditions=conditions or ["Insufficient pattern data for this profile"],
            probability=f"{wr:.0%} rate across {n} trades",
        )

    return _make_profile(wins, "Winning Trade"), _make_profile(losses, "Losing Trade")


# ── Checklist formatter ───────────────────────────────────────────────────────

def _format_checklist(patterns) -> list[str]:
    """Format pre-trade checklist items from top edge combos."""
    items = []
    for c in patterns.top_edges[:5]:
        conditions_str = ", ".join(f"{k}={v}" for k, v in c.variables.items())
        items.append(
            f"Confirm: {conditions_str} "
            f"({c.win_rate:.0%} WR, {c.sample_size} trades)"
        )
    return items


# ── Metrics context formatter ─────────────────────────────────────────────────

def _format_metrics_context(metrics: dict) -> dict:
    """
    Extract the most useful subset of computeMetrics output for the LLM.
    Focus on hard trade statistics — execution quality, P&L, instrument/session edge.
    """
    useful: dict[str, Any] = {}

    for key in [
        "expectancy", "profitFactor", "avgWin", "avgLoss",
        "maxConsecutiveWins", "maxConsecutiveLosses",
        "avgMAE", "avgMFE", "totalPnl", "totalTrades",
        "winRate", "lossRate", "breakEvenRate",
        "avgHoldingTime", "avgRiskReward",
    ]:
        val = metrics.get(key)
        if val is not None:
            useful[key] = val

    # Session breakdown — win rate + profit factor by session
    session_bd = metrics.get("sessionBreakdown") or metrics.get("session_breakdown")
    if isinstance(session_bd, dict):
        sessions_clean = {}
        for k, v in session_bd.items():
            if isinstance(v, dict) and v.get("count", 0) >= 3:
                sessions_clean[k] = {
                    "wr":    round(v.get("winRate", 0), 3),
                    "n":     v.get("count", 0),
                    "pnl":   round(v.get("totalPnl", 0), 2) if v.get("totalPnl") is not None else None,
                    "pf":    round(v.get("profitFactor", 0), 2) if v.get("profitFactor") is not None else None,
                }
        if sessions_clean:
            useful["sessionBreakdown"] = sessions_clean

    # Instrument breakdown — win rate + total P&L per instrument
    inst_bd = metrics.get("instrumentBreakdown") or metrics.get("instrument_breakdown")
    if isinstance(inst_bd, dict):
        instr_clean = {}
        for k, v in inst_bd.items():
            if isinstance(v, dict) and v.get("count", 0) >= 3:
                instr_clean[k] = {
                    "wr":   round(v.get("winRate", 0), 3),
                    "n":    v.get("count", 0),
                    "pnl":  round(v.get("totalPnl", 0), 2) if v.get("totalPnl") is not None else None,
                }
        if instr_clean:
            useful["instrumentBreakdown"] = instr_clean

    # Timeframe breakdown
    tf_bd = metrics.get("timeframeBreakdown") or metrics.get("tfBreakdown")
    if isinstance(tf_bd, dict):
        tf_clean = {}
        for k, v in tf_bd.items():
            if isinstance(v, dict) and v.get("count", 0) >= 3:
                tf_clean[k] = {
                    "wr":  round(v.get("winRate", 0), 3),
                    "n":   v.get("count", 0),
                    "pf":  round(v.get("profitFactor", 0), 2) if v.get("profitFactor") is not None else None,
                }
        if tf_clean:
            useful["timeframeBreakdown"] = tf_clean

    # Direction bias
    dir_bias = metrics.get("directionBias") or metrics.get("direction_bias")
    if isinstance(dir_bias, dict):
        useful["directionBias"] = {
            k: {"wr": round(v.get("winRate", 0), 3), "n": v.get("count", 0)}
            for k, v in dir_bias.items()
            if isinstance(v, dict) and v.get("count", 0) >= 3
        }

    # Day of week performance
    dow = metrics.get("dayOfWeekBreakdown") or metrics.get("dayBreakdown")
    if isinstance(dow, dict):
        useful["dayOfWeek"] = {
            k: {"wr": round(v.get("winRate", 0), 3), "n": v.get("count", 0)}
            for k, v in dow.items()
            if isinstance(v, dict) and v.get("count", 0) >= 3
        }

    return useful


def _format_drawdown_context(dd: dict) -> dict:
    """Extract the key drawdown metrics for LLM context."""
    if not dd or not dd.get("success"):
        return {}
    top = dd.get("topStats") or {}
    monthly = dd.get("monthly") or []
    streaks = dd.get("streaks") or {}

    result: dict[str, Any] = {}

    # Top-level stats
    for key in ("maxDrawdown", "avgDrawdown", "recoveryFactor", "trendAlignment"):
        val = top.get(key)
        if val is not None:
            result[key] = round(float(val), 2) if isinstance(val, (int, float)) else val

    # Monthly summary — worst and best months
    if monthly:
        worst_months = sorted(monthly, key=lambda m: m.get("maxDdPct", 0))[:3]
        best_equity  = sorted(monthly, key=lambda m: m.get("equityGrowthPct", 0), reverse=True)[:3]
        result["worstDrawdownMonths"] = [
            {
                "period":  f"{m.get('month')} {m.get('year')}",
                "maxDd":   m.get("maxDdPct"),
                "cause":   m.get("dominantCause"),
                "losses":  m.get("lossCount"),
                "trades":  m.get("totalTrades"),
                "equity":  m.get("equityGrowthPct"),
            }
            for m in worst_months if m.get("maxDdPct", 0) < -0.1
        ]
        result["bestEquityMonths"] = [
            {
                "period": f"{m.get('month')} {m.get('year')}",
                "equity": m.get("equityGrowthPct"),
                "dd":     m.get("maxDdPct"),
            }
            for m in best_equity if (m.get("equityGrowthPct") or 0) > 0
        ]

    # Loss streaks
    max_ls = (streaks.get("maxLossStreak") or {})
    if max_ls.get("length", 0) > 0:
        result["maxLossStreak"] = {
            "length":    max_ls.get("length"),
            "startDate": max_ls.get("startDate"),
            "endDate":   max_ls.get("endDate"),
        }
    result["revengeRate"] = streaks.get("revengeRate")

    # Session losses
    sessions = dd.get("sessions") or []
    if sessions:
        result["sessionDrawdown"] = [
            {"session": s.get("session"), "avgDd": s.get("avgDd"), "lossCount": s.get("lossCount")}
            for s in sessions if s.get("lossCount", 0) > 0
        ][:5]

    return result


def _format_audit_context(audit: dict) -> dict:
    """Extract the key strategy audit metrics for LLM context."""
    if not audit or not audit.get("success"):
        return {}

    result: dict[str, Any] = {}

    summary = audit.get("auditSummary") or {}
    result["edgeVerdict"]    = summary.get("edgeVerdict")
    result["aiConfidence"]   = summary.get("aiConfidence")
    result["edgePersistence"]= summary.get("edgePersistence")
    result["grade"]          = summary.get("grade")

    ev = audit.get("edgeVerdict") or {}
    result["profitFactor"]   = ev.get("profitFactor")
    result["expectancy"]     = ev.get("expectancy")
    result["sampleSize"]     = ev.get("sampleSize")

    # Top edge drivers (what conditions boost win rate)
    drivers = audit.get("edgeDrivers") or []
    if drivers:
        result["topEdgeDrivers"] = [
            {
                "factor": d.get("factor"),
                "wrWith": d.get("winRateWithFactor"),
                "wrWithout": d.get("winRateWithout"),
                "lift": d.get("lift"),
            }
            for d in drivers[:5]
        ]

    # Weaknesses
    weaknesses = audit.get("weaknesses") or []
    if weaknesses:
        result["topWeaknesses"] = [
            {"factor": w.get("factor"), "wrWith": w.get("winRateWithFactor"), "impact": w.get("impact")}
            for w in weaknesses[:4]
        ]

    # Session edge
    sess_edge = audit.get("sessionEdge") or {}
    if sess_edge:
        result["sessionEdge"] = {
            k: {"wr": round(v.get("winRate", 0), 1), "n": v.get("trades", 0), "pf": round(v.get("profitFactor", 0), 2)}
            for k, v in sess_edge.items()
            if v.get("trades", 0) >= 3
        }

    # Final verdict strengths + weaknesses
    fv = audit.get("finalVerdict") or {}
    result["strengths"]   = fv.get("strengths") or []
    result["weaknesses_text"] = fv.get("weaknesses") or []

    # Core robustness
    rob = audit.get("coreRobustness") or {}
    if rob:
        result["ruleStability"]       = rob.get("ruleStability")
        result["executionAdherence"]  = rob.get("executionAdherence")

    return result


# ── Q&A entry point (used by main.py and qa_worker.py) ───────────────────────

def run_qa(
    trades: list[dict],
    question: str,
    messages: list[dict] | None = None,
    metrics_context:  dict | None = None,
    drawdown_context: dict | None = None,
    audit_context:    dict | None = None,
    model_override:   str  | None = None,
) -> str:
    """
    Build the QA payload (router answer + supporting context) and call Gemini.
    Supports multi-turn `messages` for conversational memory.
    Context priority: real trade data → metrics → drawdown → audit → patterns.
    """
    n           = len(trades)
    baseline_wr = global_win_rate(trades)

    local_answer = route_query(question, trades)

    payload: dict[str, Any] = {
        "_local_answer":     local_answer,
        "total_trades":      n,
        "baseline_win_rate": f"{baseline_wr:.1%}",
    }

    # Rich metrics context — execution quality, P&L by instrument/session/TF
    if metrics_context:
        payload["metrics"] = _format_metrics_context(metrics_context)

    # Drawdown context — monthly equity, loss streaks, worst periods
    if drawdown_context:
        dd_clean = _format_drawdown_context(drawdown_context)
        if dd_clean:
            payload["drawdown"] = dd_clean

    # Strategy audit context — edge verdict, top drivers, weaknesses
    if audit_context:
        audit_clean = _format_audit_context(audit_context)
        if audit_clean:
            payload["audit"] = audit_clean

    # Pattern edges from raw trades (trade-level statistical findings)
    patterns = analyze_patterns(trades)
    if patterns.top_edges:
        payload["top_edges"] = _serialise([
            combo_to_finding(c, positive=True) for c in patterns.top_edges[:4]
        ])
    if patterns.top_drains:
        payload["top_drains"] = _serialise([
            combo_to_finding(c, positive=False) for c in patterns.top_drains[:4]
        ])

    return call_llm("qa", payload, question=question, messages=messages, model_override=model_override)


# ── Core orchestrator ─────────────────────────────────────────────────────────

def run(
    mode:             str,
    trades:           list[dict],
    question:         str = "",
    metrics_context:  dict | None = None,
    drawdown_context: dict | None = None,
    audit_context:    dict | None = None,
) -> dict:
    """
    mode: "analysis" | "qa" | "strategy"
    trades: list of raw trade dicts from the database
    question: only for qa mode
    metrics_context: optional pre-computed metrics from computeMetrics()
    drawdown_context: optional pre-computed drawdown data
    audit_context: optional pre-computed strategy audit data
    Returns a JSON-serialisable dict.
    """
    n           = len(trades)
    baseline_wr = global_win_rate(trades)

    # Always run these — cheap and needed by all modes
    patterns = analyze_patterns(trades)

    # Proof-gated findings
    edge_findings  = [combo_to_finding(c, positive=True)  for c in patterns.top_edges[:8]]
    drain_findings = [combo_to_finding(c, positive=False) for c in patterns.top_drains[:8]]
    all_findings   = filter_sufficient(edge_findings + drain_findings)

    # Split: MEDIUM+ statistically significant → LLM; LOW → UI only
    llm_findings, ui_only_findings = split_by_confidence(all_findings)

    # ── Shared: clean context blocks ──────────────────────────────────────────
    metrics_clean  = _format_metrics_context(metrics_context)  if metrics_context  else {}
    drawdown_clean = _format_drawdown_context(drawdown_context) if drawdown_context else {}
    audit_clean    = _format_audit_context(audit_context)       if audit_context    else {}

    # ── Analysis mode ─────────────────────────────────────────────────────────
    if mode == "analysis":
        notes      = analyze_notes(trades)
        win_profile, loss_profile = _build_profiles(trades, patterns)
        checklist  = _format_checklist(patterns)

        # Tilt detection (mechanical — consecutive losses, not emotions)
        tilt       = detect_tilt(trades)
        tilt_text  = tilt_finding_text(tilt)

        # Risk alert from worst drain pattern
        risk_alert = None
        if patterns.top_drains:
            worst = patterns.top_drains[0]
            if worst.deviation < -0.15:
                risk_alert = (
                    "Critical drain: "
                    + ", ".join(f"{k}={v}" for k, v in worst.variables.items())
                    + f" — {worst.win_rate:.0%} WR over {worst.sample_size} trades "
                    f"({worst.deviation:+.0%} vs baseline)"
                )
        if tilt_text and (risk_alert is None or "tilt" not in risk_alert.lower()):
            risk_alert = (risk_alert + " | " + tilt_text) if risk_alert else tilt_text

        verdict = AIVerdict(
            mode="analysis",
            trader_archetype=_archetype(baseline_wr, n),
            health_score=_health_score(baseline_wr, n),
            headline="",
            win_profile=win_profile,
            loss_profile=loss_profile,
            findings=all_findings[:10],
            strategy=None,
            pre_trade_checklist=checklist,
            risk_alert=risk_alert,
            answer=None,
        )

        llm_payload: dict[str, Any] = {
            "total_trades":      n,
            "baseline_win_rate": f"{baseline_wr:.1%}",
            "trader_archetype":  verdict.trader_archetype,
            "health_score":      verdict.health_score,
            "key_edges":         _serialise(llm_findings[:5]),
            "key_drains":        _serialise([f for f in llm_findings if f.deviation < 0][:3]),
            "risk_alert":        risk_alert,
            "pre_trade_checklist": checklist,
        }
        if metrics_clean:
            llm_payload["metrics"] = metrics_clean
        if drawdown_clean:
            llm_payload["drawdown"] = drawdown_clean
        if audit_clean:
            llm_payload["audit"] = audit_clean

        # Behavioral flags only if they show a mechanical effect (FOMO/revenge/rule-broken)
        beh = {k: v for k, v in _serialise(notes.behavioral_flags).items()
               if isinstance(v, dict) and v.get("sample_size", 0) >= 5}
        if beh:
            llm_payload["behavioral_flags"] = beh

        llm_payload["data_quality"] = {
            "total_trades":     n,
            "llm_findings":     len(llm_findings),
            "ui_only_findings": len(ui_only_findings),
        }

        narrative = call_llm("analysis", llm_payload)
        result    = _serialise(verdict)
        result["headline"]          = narrative
        result["ui_only_findings"]  = _serialise(ui_only_findings)
        return result

    # ── Q&A mode ──────────────────────────────────────────────────────────────
    elif mode == "qa":
        answer = run_qa(
            trades=trades,
            question=question,
            messages=None,
            metrics_context=metrics_context,
            drawdown_context=drawdown_context,
            audit_context=audit_context,
        )
        return {"mode": "qa", "question": question, "answer": answer}

    # ── Strategy mode ─────────────────────────────────────────────────────────
    elif mode == "strategy":
        strategy = build_strategy(trades)

        llm_payload = {
            "total_trades":      n,
            "baseline_win_rate": f"{baseline_wr:.1%}",
            "strategy":          _serialise(strategy),
        }
        if metrics_clean:
            llm_payload["metrics"] = metrics_clean
        if drawdown_clean:
            llm_payload["drawdown"] = drawdown_clean
        if audit_clean:
            llm_payload["audit"] = audit_clean

        narrative = call_llm("strategy", llm_payload)
        result    = _serialise(strategy)
        result["narrative"] = narrative
        return result

    else:
        return {"error": f"Unknown mode: {mode}. Use analysis | qa | strategy."}
