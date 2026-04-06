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
from .proof     import combo_to_finding, top_findings, filter_sufficient
from .strategy  import build_strategy
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

    def _conditions(group: list[dict], label: str) -> TradeProfile | None:
        if not group:
            return None
        # Use top 3 edge combos from the winning group
        sub_patterns = analyze_patterns(group)
        top = sub_patterns.top_edges[:3]
        conditions = [
            ", ".join(f"{k}={v}" for k, v in c.variables.items())
            for c in top
        ]
        n  = len(group)
        wr = global_win_rate(group)
        return TradeProfile(
            label=label,
            conditions=conditions or ["Insufficient data for profile"],
            probability=f"{wr:.0%} rate across {n} trades",
        )

    return _build_profile_obj(wins, "Winning Trade"), _build_profile_obj(losses, "Losing Trade")


def _build_profile_obj(group: list[dict], label: str) -> TradeProfile | None:
    if len(group) < 5:
        return None
    n  = len(group)
    wr = global_win_rate(group)
    return TradeProfile(
        label=label,
        conditions=[f"{n} trades in this profile"],
        probability=f"{wr:.0%} rate across {n} trades",
    )


# ── Core orchestrator ─────────────────────────────────────────────────────────

def run(mode: str, trades: list[dict], question: str = "") -> dict:
    """
    mode: "analysis" | "qa" | "strategy"
    trades: list of raw trade dicts from the database
    question: only for qa mode
    Returns a JSON-serialisable dict.
    """
    n           = len(trades)
    baseline_wr = global_win_rate(trades)

    # Always run these — they're cheap and needed by all modes
    notes    = analyze_notes(trades)
    patterns = analyze_patterns(trades)

    # Proof-gated finding list from pattern combos
    edge_findings  = [combo_to_finding(c, positive=True)  for c in patterns.top_edges[:5]]
    drain_findings = [combo_to_finding(c, positive=False) for c in patterns.top_drains[:5]]
    all_findings   = filter_sufficient(edge_findings + drain_findings)

    # ── Analysis mode ─────────────────────────────────────────────────────────
    if mode == "analysis":
        win_profile, loss_profile = _build_profiles(trades, patterns)
        checklist = [
            f"Confirm {c.variables}" for c in patterns.top_edges[:3]
        ]
        risk_alert = None
        if patterns.top_drains:
            worst = patterns.top_drains[0]
            if worst.deviation < -0.15:
                risk_alert = (
                    f"Critical drain: {worst.variables} — "
                    f"{worst.win_rate:.0%} WR over {worst.sample_size} trades "
                    f"({worst.deviation:+.0%} from baseline)"
                )

        verdict = AIVerdict(
            mode="analysis",
            trader_archetype=_archetype(baseline_wr, n),
            health_score=_health_score(baseline_wr, n),
            headline="",          # Claude fills this in
            win_profile=win_profile,
            loss_profile=loss_profile,
            findings=all_findings[:8],
            strategy=None,
            pre_trade_checklist=checklist,
            risk_alert=risk_alert,
            answer=None,
        )

        payload = {
            "total_trades":     n,
            "baseline_win_rate": round(baseline_wr, 4),
            "verdict":          _serialise(verdict),
            "notes_summary":    _serialise(notes),
            "patterns":         _serialise(patterns),
        }
        narrative = call_llm("analysis", payload)
        result    = _serialise(verdict)
        result["headline"] = narrative
        return result

    # ── Q&A mode ──────────────────────────────────────────────────────────────
    elif mode == "qa":
        local_answer = route_query(question, trades)
        payload = {
            "_local_answer":     local_answer,
            "total_trades":      n,
            "baseline_win_rate": round(baseline_wr, 4),
            "notes_coverage":    notes.coverage_pct,
        }
        answer = call_llm("qa", payload, question=question)
        return {"mode": "qa", "question": question, "answer": answer}

    # ── Strategy mode ─────────────────────────────────────────────────────────
    elif mode == "strategy":
        strategy = build_strategy(trades)
        payload  = {
            "total_trades":      n,
            "baseline_win_rate": round(baseline_wr, 4),
            "strategy":          _serialise(strategy),
        }
        narrative = call_llm("strategy", payload)
        result    = _serialise(strategy)
        result["narrative"] = narrative
        return result

    else:
        return {"error": f"Unknown mode: {mode}. Use analysis | qa | strategy."}
