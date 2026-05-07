"""
ai_engine/llm_client.py
Thin bridge to the Gemini API (google-genai SDK).
Receives a structured prompt dict and returns a plain-text response string.
All LLM-specific wiring is isolated here.

Requires:
    GOOGLE_API_KEY environment variable
    pip install google-genai
"""
from __future__ import annotations
import os
import json

MODEL    = "gemini-2.0-flash"     # used for analysis + strategy (deeper reasoning)
MODEL_QA = "gemini-2.0-flash"    # used for chat — fast, stable GA model

# Fallback chain tried in order when the primary model is unavailable.
_FALLBACK_CHAIN = [
    "gemini-2.0-flash",
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.5-flash",
    "gemini-2.5-pro-preview-05-06",
    "gemini-2.5-pro",
    "gemini-1.5-flash",
]


def _api_key() -> str:
    key = os.environ.get("GOOGLE_API_KEY", "")
    if not key:
        raise RuntimeError(
            "API key not found. Set GOOGLE_API_KEY in your environment before starting the server."
        )
    return key


def _client():
    """Lazy import so the rest of the engine works without google-genai installed."""
    from google import genai  # type: ignore
    return genai.Client(api_key=_api_key())


# ── System instruction ────────────────────────────────────────────────────────

SYSTEM_INSTRUCTION = (
    "You are an elite quantitative trading analyst and performance coach. "
    "You receive pre-computed statistical data from a trader's actual trade journal — "
    "profit/loss figures, win rates, drawdown metrics, edge scores, and session/instrument breakdowns. "
    "Your role is to give sharp, data-driven answers grounded exclusively in the numbers provided.\n"
    "Rules:\n"
    "1. NEVER invent patterns, strategies, or statistics not present in the supplied data.\n"
    "2. Focus on trade mechanics: entries, exits, instruments, sessions, timeframes, P&L, drawdown. "
    "Mention emotional/psychological factors only when they appear as a statistically significant driver in the data.\n"
    "3. Always cite the sample size (n=X trades) when making a claim.\n"
    "4. When asked to create a strategy, derive rules ONLY from the high-confidence patterns in the data. "
    "State the supporting win rate and sample size for each rule.\n"
    "5. When asked about drawdown, identify the specific months, instruments, or conditions that caused it.\n"
    "6. Be specific and actionable. Replace vague advice with concrete rules: "
    "'Avoid London open on GBPUSD (42% WR, 24 trades)' not 'be careful in volatile sessions'.\n"
    "7. If data is insufficient for a reliable answer, say so clearly and state what is needed."
)


# ── Plain-English prompt builders ─────────────────────────────────────────────

def _fmt_finding(f: dict) -> str:
    conf  = f.get("confidence", "?")
    wr    = f.get("win_rate", 0)
    n     = f.get("sample_size", 0)
    dev   = f.get("deviation", 0)
    label = f.get("finding", "Unknown")
    sign  = "+" if dev >= 0 else ""
    return (
        f"  • {label}\n"
        f"    Win rate: {wr:.1%} | Sample: {n} trades | "
        f"vs baseline: {sign}{dev:.1%} | Confidence: {conf}"
    )


def _fmt_condition(c: dict) -> str:
    wr   = c.get("win_rate", 0)
    n    = c.get("sample_size", 0)
    conf = c.get("confidence", "?")
    lbl  = c.get("label", "Unknown")
    return f"  • {lbl}: {wr:.1%} WR, {n} trades ({conf})"


def _build_analysis_prompt(payload: dict) -> str:
    n       = payload.get("total_trades", "?")
    wr      = payload.get("baseline_win_rate", "?")
    arch    = payload.get("trader_archetype", "Unknown")
    health  = payload.get("health_score", "Unknown")
    alert   = payload.get("risk_alert")
    checklist = payload.get("pre_trade_checklist") or []

    edges  = payload.get("key_edges",  []) or []
    drains = payload.get("key_drains", []) or []

    metrics  = payload.get("metrics")  or {}
    drawdown = payload.get("drawdown") or {}
    audit    = payload.get("audit")    or {}
    beh      = payload.get("behavioral_flags") or {}
    dq       = payload.get("data_quality") or {}

    lines: list[str] = [
        "TRADER PERFORMANCE BRIEF",
        "=" * 50,
        f"Total trades : {n}",
        f"Win rate     : {wr}",
        f"Archetype    : {arch}",
        f"Health score : {health}",
        "",
    ]

    # ── Core execution metrics ─────────────────────────────────────────────────
    if metrics:
        lines.append("EXECUTION METRICS:")
        for k, v in metrics.items():
            if v is None:
                continue
            if isinstance(v, dict):
                lines.append(f"  {k}:")
                for sk, sv in v.items():
                    if sv is not None:
                        lines.append(f"    {sk}: {sv}")
            else:
                lines.append(f"  {k}: {v}")
        lines.append("")

    # ── Statistical edge findings ──────────────────────────────────────────────
    if edges:
        lines.append("CONFIRMED EDGE CONDITIONS (MEDIUM+ confidence):")
        for f in edges:
            lines.append(_fmt_finding(f) if isinstance(f, dict) else f"  • {f}")
        lines.append("")

    if drains:
        lines.append("CONFIRMED DRAIN CONDITIONS (patterns that hurt P&L):")
        for f in drains:
            lines.append(_fmt_finding(f) if isinstance(f, dict) else f"  • {f}")
        lines.append("")

    # ── Drawdown / risk ────────────────────────────────────────────────────────
    if drawdown:
        lines.append("DRAWDOWN & RISK DATA:")
        for k, v in drawdown.items():
            if v is None:
                continue
            if isinstance(v, (list, dict)):
                lines.append(f"  {k}: {json.dumps(v)}")
            else:
                lines.append(f"  {k}: {v}")
        lines.append("")

    # ── Strategy audit ─────────────────────────────────────────────────────────
    if audit:
        lines.append("STRATEGY AUDIT RESULTS:")
        for k, v in audit.items():
            if v is None:
                continue
            if isinstance(v, (list, dict)):
                lines.append(f"  {k}: {json.dumps(v)}")
            else:
                lines.append(f"  {k}: {v}")
        lines.append("")

    # ── Behavioral discipline flags (mechanical effect only) ──────────────────
    if beh:
        lines.append("DISCIPLINE METRICS:")
        for name, pf in beh.items():
            if isinstance(pf, dict):
                lines.append(
                    f"  • {pf.get('finding', name)}: "
                    f"{pf.get('win_rate', 0):.1%} WR, "
                    f"{pf.get('sample_size', 0)} trades"
                )
        lines.append("")

    if alert:
        lines.append(f"RISK ALERT: {alert}")
        lines.append("")

    if checklist:
        lines.append("PRE-TRADE CHECKLIST (from winning trade patterns):")
        for item in checklist:
            lines.append(f"  ✓ {item}")
        lines.append("")

    if dq:
        lines.append(
            f"DATA QUALITY: {n} trades | "
            f"{dq.get('llm_findings', 0)} high-confidence findings | "
            f"{dq.get('ui_only_findings', 0)} preliminary (LOW confidence, not shown above)"
        )

    lines += [
        "",
        "Write a sharp, data-driven performance report. Cover:",
        "1. Overall health: archetype, win rate, profit factor, expectancy — cite all numbers.",
        "2. Best edge conditions: which instrument/session/timeframe/setup combinations produce the "
           "highest win rate and P&L. Include the sample size and WR for each.",
        "3. Worst drain conditions: what is losing money — which instruments, sessions, setups, or "
           "direction are underperforming. Be specific.",
        "4. Drawdown analysis: which months or periods had the worst drawdown and what caused it. "
           "If no drawdown data is present, say so.",
        "5. Strategy audit summary: edge verdict, top drivers of performance, and top weaknesses.",
        "6. A pre-trade checklist with specific, data-backed rules (e.g. 'Only trade London session "
           "on GBPUSD — 72% WR, 24 trades').",
        "7. One clear risk alert if any drain or drawdown is severe.",
        "Do NOT write about psychology, emotions, or mindset. Focus exclusively on trade mechanics: "
        "what to trade, when, in which direction, on which timeframe, and what to avoid.",
        "Do not invent any patterns. Every claim must come from the data above.",
    ]

    return "\n".join(lines)


def _fmt_section(title: str, data: dict | list | None) -> list[str]:
    """Format a context section cleanly for the LLM prompt."""
    if not data:
        return []
    lines = [f"{title}:"]
    if isinstance(data, dict):
        for k, v in data.items():
            if v is None:
                continue
            if isinstance(v, dict):
                lines.append(f"  {k}:")
                for sk, sv in v.items():
                    if sv is not None:
                        lines.append(f"    {sk}: {sv}")
            elif isinstance(v, list):
                if v:
                    lines.append(f"  {k}: {', '.join(str(i) for i in v[:5])}")
            else:
                lines.append(f"  {k}: {v}")
    elif isinstance(data, list):
        for item in data[:8]:
            lines.append(f"  • {item}" if not isinstance(item, dict) else f"  • {json.dumps(item)}")
    lines.append("")
    return lines


def _build_qa_prompt(question: str, local_answer: str, payload: dict) -> str:
    lines: list[str] = [
        "TRADER DATA CONTEXT",
        "=" * 50,
        f"Total trades    : {payload.get('total_trades', '?')}",
        f"Baseline win rate: {payload.get('baseline_win_rate', '?')}",
        "",
    ]

    # Metrics — execution quality, P&L, session/instrument/TF breakdown
    metrics = payload.get("metrics") or {}
    if metrics:
        lines.append("PERFORMANCE METRICS:")
        for k, v in metrics.items():
            if v is None:
                continue
            if isinstance(v, dict):
                lines.append(f"  {k}:")
                for sk, sv in v.items():
                    if sv is not None:
                        lines.append(f"    {sk}: {sv}")
            else:
                lines.append(f"  {k}: {v}")
        lines.append("")

    # Drawdown — monthly equity, loss streaks
    dd = payload.get("drawdown") or {}
    if dd:
        lines.append("DRAWDOWN & RISK:")
        for k, v in dd.items():
            if v is None:
                continue
            if isinstance(v, (list, dict)):
                lines.append(f"  {k}: {json.dumps(v)}")
            else:
                lines.append(f"  {k}: {v}")
        lines.append("")

    # Audit — edge verdict, drivers, weaknesses
    audit = payload.get("audit") or {}
    if audit:
        lines.append("STRATEGY AUDIT:")
        for k, v in audit.items():
            if v is None:
                continue
            if isinstance(v, (list, dict)):
                lines.append(f"  {k}: {json.dumps(v)}")
            else:
                lines.append(f"  {k}: {v}")
        lines.append("")

    # Statistical edge findings from raw trade patterns
    edges  = payload.get("top_edges")  or []
    drains = payload.get("top_drains") or []
    if edges:
        lines.append("CONFIRMED EDGE CONDITIONS (from trade patterns):")
        for f in edges:
            if isinstance(f, dict):
                lines.append(_fmt_finding(f))
        lines.append("")
    if drains:
        lines.append("PERFORMANCE DRAINS (patterns that hurt results):")
        for f in drains:
            if isinstance(f, dict):
                lines.append(_fmt_finding(f))
        lines.append("")

    # Pre-computed answer from the fast query router
    if local_answer:
        lines += [
            "PRE-COMPUTED DATA ANSWER:",
            local_answer,
            "",
        ]

    lines += [
        "=" * 50,
        f"TRADER'S QUESTION: {question}",
        "",
        "Instructions: Answer using only the data above. Be specific — cite win rates, "
        "sample sizes, and P&L figures. If asked to create a strategy or playbook, "
        "derive rules directly from the edge conditions and instrument/session data. "
        "If asked about drawdown, point to the specific months, instruments, or "
        "conditions in the data. If data is insufficient, say so and explain what is needed.",
    ]

    return "\n".join(lines)


def _build_strategy_prompt(payload: dict) -> str:
    n       = payload.get("total_trades", "?")
    wr      = payload.get("baseline_win_rate", "?")
    strat   = payload.get("strategy") or {}
    metrics  = payload.get("metrics")  or {}
    drawdown = payload.get("drawdown") or {}
    audit    = payload.get("audit")    or {}

    entry_conds = strat.get("entry_conditions") or []
    avoid_conds = strat.get("avoid_conditions") or []
    risk_rules  = strat.get("risk_rules") or {}
    edge        = strat.get("projected_edge")
    warnings    = strat.get("data_warnings") or []

    lines: list[str] = [
        "STRATEGY DATA BRIEF",
        "=" * 50,
        f"Total trades : {n}",
        f"Baseline WR  : {wr}",
        "",
    ]

    # ── Entry conditions from pattern engine ──────────────────────────────────
    if entry_conds:
        lines.append(
            "CONFIRMED ENTRY CONDITIONS "
            "(≥55% WR, ≥5pp above baseline, min 5 trades):"
        )
        for c in entry_conds:
            lines.append(_fmt_condition(c) if isinstance(c, dict) else f"  • {c}")
        lines.append("")
    else:
        lines.append(
            "ENTRY CONDITIONS: No condition meets the ≥55% WR + ≥5pp threshold yet. "
            "More trades needed.\n"
        )

    if avoid_conds:
        lines.append(
            "CONDITIONS TO AVOID "
            "(≤45% WR, ≥5pp below baseline, min 5 trades):"
        )
        for c in avoid_conds:
            lines.append(_fmt_condition(c) if isinstance(c, dict) else f"  • {c}")
        lines.append("")

    if edge and isinstance(edge, dict):
        ew   = edge.get("win_rate", 0)
        en   = edge.get("sample_size", 0)
        conf = edge.get("confidence", "?")
        lines.append(
            f"PROJECTED EDGE (all entry conditions aligned): "
            f"{ew:.1%} WR across {en} qualifying trades ({conf})"
        )
        lines.append("")

    if risk_rules:
        lines.append("RISK PARAMETERS:")
        for k, v in risk_rules.items():
            lines.append(f"  {k}: {v}")
        lines.append("")

    # ── Performance metrics context ───────────────────────────────────────────
    if metrics:
        lines.append("PERFORMANCE METRICS:")
        for k, v in metrics.items():
            if v is None:
                continue
            if isinstance(v, dict):
                lines.append(f"  {k}:")
                for sk, sv in v.items():
                    if sv is not None:
                        lines.append(f"    {sk}: {sv}")
            else:
                lines.append(f"  {k}: {v}")
        lines.append("")

    # ── Drawdown context ──────────────────────────────────────────────────────
    if drawdown:
        lines.append("DRAWDOWN DATA (informs risk rules):")
        for k, v in drawdown.items():
            if v is None:
                continue
            if isinstance(v, (list, dict)):
                lines.append(f"  {k}: {json.dumps(v)}")
            else:
                lines.append(f"  {k}: {v}")
        lines.append("")

    # ── Strategy audit ────────────────────────────────────────────────────────
    if audit:
        lines.append("STRATEGY AUDIT RESULTS:")
        for k, v in audit.items():
            if v is None:
                continue
            if isinstance(v, (list, dict)):
                lines.append(f"  {k}: {json.dumps(v)}")
            else:
                lines.append(f"  {k}: {v}")
        lines.append("")

    if warnings:
        lines.append("DATA WARNINGS:")
        for w in warnings:
            lines.append(f"  ⚠ {w}")
        lines.append("")

    lines += [
        "Write a complete, rules-based trading strategy playbook using ONLY the data above. "
        "Structure it as follows:",
        "",
        "1. STRATEGY NAME — derive a name from the dominant conditions (e.g. 'London Long Bias SMC').",
        "2. ENTRY RULES — list each confirmed entry condition as a specific, actionable rule with its "
           "supporting WR and sample size. Format: 'Only enter when [condition] — [X]% WR, [N] trades'.",
        "3. AVOID RULES — list each avoidance condition as a hard rule. "
           "Format: 'Never trade when [condition] — [X]% WR, [N] trades'.",
        "4. RISK MANAGEMENT — derive position sizing and stop rules from the average R:R, "
           "max drawdown data, and loss streak data. Be specific.",
        "5. EDGE PROJECTION — state the projected win rate when all entry rules align, "
           "with sample size and confidence level.",
        "6. DATA CAVEATS — note any conditions where sample size is too small to rely on. "
           "State how many more trades are needed to reach HIGH confidence (≥30).",
        "",
        "Do NOT write about psychology, emotions, or mindset. "
        "Do NOT add conditions not present in the data. "
        "Every rule must cite its supporting win rate and sample size.",
    ]

    return "\n".join(lines)


# ── Main entry point ──────────────────────────────────────────────────────────

def call_llm(
    mode: str,
    payload: dict,
    question: str = "",
    messages: list[dict] | None = None,
    model_override: str | None = None,
) -> str:
    """
    Call Gemini and return the response as a plain string.
    mode: "analysis" | "qa" | "strategy"
    payload: serialisable dict of pre-computed findings
    question: only used in qa mode
    messages: optional multi-turn history (qa mode only) —
              [{"role": "user"|"model", "content": "..."}]
    """
    from google.genai import types  # type: ignore

    # model_override wins; then env var; then per-mode default
    env_override = os.environ.get("GEMINI_MODEL_OVERRIDE", "")
    model = model_override or env_override or MODEL
    if mode == "analysis":
        user_content: object = _build_analysis_prompt(payload)
    elif mode == "qa":
        if not model_override and not env_override:
            model = MODEL_QA
        local_answer = payload.pop("_local_answer", "")
        primer = _build_qa_prompt(question, local_answer, payload)

        if messages and len(messages) > 1:
            # Multi-turn: stitch the data primer in front of the most recent
            # user message so Gemini sees both the conversation history and
            # the freshly computed trade context.
            history = list(messages[:-1])
            last_user = messages[-1].get("content", question) or question
            contents = []
            for m in history:
                role = "user" if m.get("role") == "user" else "model"
                txt  = m.get("content") or ""
                if not txt:
                    continue
                contents.append({"role": role, "parts": [{"text": txt}]})
            contents.append({
                "role":  "user",
                "parts": [{"text": f"{primer}\n\nMy current question: {last_user}"}],
            })
            user_content = contents
        else:
            user_content = primer
    elif mode == "strategy":
        user_content = _build_strategy_prompt(payload)
    else:
        return f"Unknown mode: {mode}"

    client = _client()

    # Build the ordered list of models to try: explicit override first,
    # then the fallback chain (deduped, preserving order).
    if model_override or env_override:
        candidates = [model]          # honour explicit choice, no fallback
    else:
        seen: set[str] = set()
        candidates = []
        for m in [model] + _FALLBACK_CHAIN:
            if m not in seen:
                seen.add(m)
                candidates.append(m)

    last_err: Exception | None = None
    for candidate in candidates:
        try:
            response = client.models.generate_content(
                model=candidate,
                contents=user_content,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    temperature=0.3,
                ),
            )
            return response.text or ""
        except Exception as exc:
            msg = str(exc)
            if any(kw in msg for kw in ("not found", "deprecated", "not supported", "404", "NOT_FOUND")):
                last_err = exc
                continue   # try the next model in the chain
            raise          # unexpected error — surface immediately

    raise RuntimeError(
        f"ai_engine: runtime error: {last_err}"
    ) from last_err
