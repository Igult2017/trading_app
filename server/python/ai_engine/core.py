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
    Extract a clean subset of computeMetrics output for the LLM.
    Avoids sending the entire metrics blob — only the fields Gemini can use.
    """
    useful: dict[str, Any] = {}

    for key in [
        "expectancy", "profitFactor", "avgWin", "avgLoss",
        "maxConsecutiveWins", "maxConsecutiveLosses",
        "avgMAE", "avgMFE",
    ]:
        val = metrics.get(key)
        if val is not None:
            useful[key] = val

    # Session breakdown (top 3 by trade count)
    session_bd = metrics.get("sessionBreakdown") or metrics.get("session_breakdown")
    if isinstance(session_bd, dict):
        top_sessions = sorted(
            [(k, v) for k, v in session_bd.items() if isinstance(v, dict)],
            key=lambda x: x[1].get("count", 0), reverse=True,
        )[:3]
        if top_sessions:
            useful["topSessions"] = {
                k: {"wr": round(v.get("winRate", 0), 3), "n": v.get("count", 0)}
                for k, v in top_sessions
            }

    # Instrument breakdown
    inst_bd = metrics.get("instrumentBreakdown") or metrics.get("instrument_breakdown")
    if isinstance(inst_bd, dict):
        top_inst = sorted(
            [(k, v) for k, v in inst_bd.items() if isinstance(v, dict)],
            key=lambda x: x[1].get("count", 0), reverse=True,
        )[:3]
        if top_inst:
            useful["topInstruments"] = {
                k: {"wr": round(v.get("winRate", 0), 3), "n": v.get("count", 0)}
                for k, v in top_inst
            }

    # Direction bias
    dir_bias = metrics.get("directionBias") or metrics.get("direction_bias")
    if isinstance(dir_bias, dict):
        useful["directionBias"] = {
            k: {"wr": round(v.get("winRate", 0), 3), "n": v.get("count", 0)}
            for k, v in dir_bias.items()
            if isinstance(v, dict)
        }

    # Psychology
    psych = metrics.get("psychologyMetrics") or metrics.get("psychology_metrics")
    if isinstance(psych, dict):
        useful["psychology"] = psych

    return useful


# ── Q&A entry point (used by main.py and qa_worker.py) ───────────────────────

def run_qa(
    trades: list[dict],
    question: str,
    messages: list[dict] | None = None,
    metrics_context: dict | None = None,
    model_override: str | None = None,
) -> str:
    """
    Build the QA payload (router answer + supporting context) and call Gemini.
    Supports multi-turn `messages` for conversational memory.
    """
    n           = len(trades)
    baseline_wr = global_win_rate(trades)
    notes       = analyze_notes(trades)

    local_answer = route_query(question, trades)

    payload: dict[str, Any] = {
        "_local_answer":     local_answer,
        "total_trades":      n,
        "baseline_win_rate": f"{baseline_wr:.1%}",
        "notes_coverage":    f"{notes.coverage_pct:.0f}%",
    }

    if metrics_context:
        payload["metrics_summary"] = _format_metrics_context(metrics_context)

    # Always provide a small data summary so chat mode has at least as much
    # context as the dedicated panels.
    patterns = analyze_patterns(trades)
    if patterns.top_edges:
        payload["top_edges"] = _serialise([
            combo_to_finding(c, positive=True) for c in patterns.top_edges[:3]
        ])
    if patterns.top_drains:
        payload["top_drains"] = _serialise([
            combo_to_finding(c, positive=False) for c in patterns.top_drains[:3]
        ])
    if notes.emotion_correlation:
        payload["emotion_summary"] = _serialise(notes.emotion_correlation[:3])

    return call_llm("qa", payload, question=question, messages=messages, model_override=model_override)


# ── Core orchestrator ─────────────────────────────────────────────────────────

def run(
    mode:            str,
    trades:          list[dict],
    question:        str = "",
    metrics_context: dict | None = None,
) -> dict:
    """
    mode: "analysis" | "qa" | "strategy"
    trades: list of raw trade dicts from the database
    question: only for qa mode
    metrics_context: optional pre-computed metrics from computeMetrics()
    Returns a JSON-serialisable dict.
    """
    n           = len(trades)
    baseline_wr = global_win_rate(trades)

    # Always run these — cheap and needed by all modes
    notes    = analyze_notes(trades)
    patterns = analyze_patterns(trades)

    # Proof-gated findings
    edge_findings  = [combo_to_finding(c, positive=True)  for c in patterns.top_edges[:8]]
    drain_findings = [combo_to_finding(c, positive=False) for c in patterns.top_drains[:8]]
    all_findings   = filter_sufficient(edge_findings + drain_findings)

    # Split: MEDIUM+ statistically significant → LLM; LOW → UI only
    llm_findings, ui_only_findings = split_by_confidence(all_findings)

    # ── Analysis mode ─────────────────────────────────────────────────────────
    if mode == "analysis":
        win_profile, loss_profile = _build_profiles(trades, patterns)
        checklist  = _format_checklist(patterns)

        # Tilt detection
        tilt       = detect_tilt(trades)
        tilt_text  = tilt_finding_text(tilt)

        # Risk alert from drains
        risk_alert = None
        if patterns.top_drains:
            worst = patterns.top_drains[0]
            if worst.deviation < -0.15:
                risk_alert = (
                    f"Critical drain: "
                    + ", ".join(f"{k}={v}" for k, v in worst.variables.items())
                    + f" — {worst.win_rate:.0%} WR over {worst.sample_size} trades "
                    f"({worst.deviation:+.0%} vs baseline)"
                )
        if tilt_text and (risk_alert is None or "tilt" not in risk_alert.lower()):
            risk_alert = (risk_alert + " | " + tilt_text) if risk_alert else tilt_text

        # Verdict carries ALL findings (LLM + ui-only) for the UI
        verdict = AIVerdict(
            mode="analysis",
            trader_archetype=_archetype(baseline_wr, n),
            health_score=_health_score(baseline_wr, n),
            headline="",          # Gemini fills this in
            win_profile=win_profile,
            loss_profile=loss_profile,
            findings=all_findings[:10],        # full list for UI
            strategy=None,
            pre_trade_checklist=checklist,
            risk_alert=risk_alert,
            answer=None,
        )

        # Build the LLM payload — filtered, no duplicate patterns blob
        metrics_clean = _format_metrics_context(metrics_context) if metrics_context else {}

        # Session-phase × emotion: top 3 best and worst combinations
        se_matrix    = notes.session_emotion_matrix
        se_top_good  = [x.label for x in se_matrix[:3]]
        se_top_bad   = [x.label for x in reversed(se_matrix) if x.deviation < 0][:3]

        llm_payload = {
            "total_trades":      n,
            "baseline_win_rate": f"{baseline_wr:.1%}",
            "trader_archetype":  verdict.trader_archetype,
            "health_score":      verdict.health_score,
            # Only MEDIUM/HIGH significant findings go to Gemini
            "key_edges":         _serialise(llm_findings[:5]),
            "key_drains":        _serialise(
                [f for f in llm_findings if f.deviation < 0][:3]
            ),
            "behavioral_notes":  _serialise(notes.behavioral_flags),
            "emotion_summary":   _serialise(notes.emotion_correlation[:3]),
            "notes_coverage":    f"{notes.coverage_pct:.0f}%",
            "risk_alert":        risk_alert,
            "pre_trade_checklist": checklist,
            "tilt":              _serialise(tilt) if tilt.detected else None,
            # Dedicated session-phase + emotion narrative
            "session_emotion": {
                "best_combinations":  se_top_good,
                "worst_combinations": se_top_bad,
                "total_combinations": len(se_matrix),
            } if se_matrix else None,
        }
        if metrics_clean:
            llm_payload["metrics_context"] = metrics_clean

        # Data quality section
        llm_payload["data_quality"] = {
            "total_trades":    n,
            "llm_findings":    len(llm_findings),
            "ui_only_findings": len(ui_only_findings),
            "notes_coverage":  f"{notes.coverage_pct:.0f}%",
        }

        narrative = call_llm("analysis", llm_payload)
        result    = _serialise(verdict)
        result["headline"]     = narrative
        result["ui_only_findings"] = _serialise(ui_only_findings)
        return result

    # ── Q&A mode ──────────────────────────────────────────────────────────────
    elif mode == "qa":
        answer = run_qa(
            trades=trades,
            question=question,
            messages=None,
            metrics_context=metrics_context,
        )
        return {"mode": "qa", "question": question, "answer": answer}

    # ── Strategy mode ─────────────────────────────────────────────────────────
    elif mode == "strategy":
        strategy = build_strategy(trades)

        # Build LLM payload for strategy mode — plain-text friendly
        llm_payload = {
            "total_trades":      n,
            "baseline_win_rate": f"{baseline_wr:.1%}",
            "strategy":          _serialise(strategy),
        }
        if metrics_context:
            llm_payload["metrics_context"] = _format_metrics_context(metrics_context)

        narrative = call_llm("strategy", llm_payload)
        result    = _serialise(strategy)
        result["narrative"] = narrative
        return result

    else:
        return {"error": f"Unknown mode: {mode}. Use analysis | qa | strategy."}
