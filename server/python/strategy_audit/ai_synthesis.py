"""
strategy_audit/ai_synthesis.py
────────────────────────────────────────────────────────────────────────────
Gemini-powered executive synthesis for the strategy audit.

After the four statistical levels are computed and shaped into the frontend
schema, this module passes the complete structured result to Gemini and
receives back:

  • executiveSummary    — 2-3 sentence expert narrative of what the strategy
                          is, what drives its edge, and the single biggest
                          mechanical risk (replaces the template string).
  • aiPolicySuggestions — 4-6 data-backed, priority-ranked action items
                          derived from all four audit levels simultaneously.
  • strengthsNarrative  — One sentence on the strongest mechanical advantage.
  • riskNarrative       — One sentence on the most critical mechanical risk.

FALLBACK BEHAVIOUR
  Returns empty strings / empty lists on any failure:
  - GOOGLE_API_KEY missing
  - Gemini call times out or errors
  - JSON response is malformed
  Caller (main.py) merges the result and the audit always succeeds.

CALLED BY
  strategy_audit/main.py — after shape_output() completes.
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any


# ── Prompt builder ─────────────────────────────────────────────────────────────

def _build_prompt(result: dict) -> str:
    audit_summary = result.get("auditSummary", {})
    edge_verdict  = result.get("edgeVerdict", {})
    edge_drivers  = result.get("edgeDrivers", [])
    weaknesses    = result.get("weaknesses", [])
    exec_asym     = result.get("executionAsymmetry", {})
    session_edge  = result.get("sessionEdge", {})
    regime        = result.get("regimeTransition", {})
    capital       = result.get("capitalHeat", {})
    loss_cluster  = result.get("lossCluster", {})
    drawdown      = result.get("drawdown", {})
    tq            = result.get("tradeQuality", {})
    edge_decay    = result.get("edgeDecay", {})
    rr_eff        = result.get("rrEfficiency", {})
    direction     = result.get("directionAnalysis", {})
    mae_mfe       = result.get("maeMfeAnalysis", {})

    n       = audit_summary.get("sampleSize", 0)
    wr      = audit_summary.get("winRate", 0)
    grade   = audit_summary.get("grade", "N/A")
    verdict = audit_summary.get("edgeVerdict", "Unconfirmed")
    pf      = edge_verdict.get("profitFactor", 0)
    exp_val = edge_verdict.get("expectancy", 0)

    L: list[str] = [
        "STRATEGY AUDIT — EXECUTIVE SYNTHESIS REQUEST",
        "=" * 54,
        f"Trades: {n}  |  Grade: {grade}  |  Edge Verdict: {verdict}",
        f"Win Rate: {wr}%  |  Profit Factor: {pf}  |  Expectancy: {exp_val}",
        (f"Max Drawdown: {drawdown.get('maxPeakToValley', 0):.1f}%  |  "
         f"Calmar: {drawdown.get('calmarRatio', 0):.2f}"),
        "",
    ]

    # ── Edge drivers ─────────────────────────────────────────────────────────
    if edge_drivers:
        L.append("TOP EDGE DRIVERS (conditions that lift win rate):")
        for d in edge_drivers[:5]:
            L.append(
                f"  • {d.get('factor','')}: "
                f"+{d.get('lift',0):.1f}pp lift  "
                f"({d.get('winRateWithFactor',0):.0f}% with  vs  "
                f"{d.get('winRateWithout',0):.0f}% without)"
            )
        L.append("")

    # ── Weaknesses ───────────────────────────────────────────────────────────
    if weaknesses:
        L.append("TOP WEAKNESSES (conditions that drain win rate):")
        for w in weaknesses[:4]:
            L.append(
                f"  • {w.get('factor','')}: "
                f"-{w.get('impact',0):.1f}pp impact  "
                f"({w.get('winRateWithFactor',0):.0f}% WR when present)"
            )
        L.append("")

    # ── Session breakdown ────────────────────────────────────────────────────
    if session_edge:
        L.append("SESSION PERFORMANCE:")
        for sess, data in sorted(
            session_edge.items(),
            key=lambda kv: kv[1].get("winRate", 0),
            reverse=True,
        )[:6]:
            L.append(
                f"  • {sess}: {data.get('winRate', 0):.0f}% WR, "
                f"{data.get('trades', 0)} trades, PF {data.get('profitFactor', 0):.2f}"
            )
        L.append("")

    # ── Execution metrics ────────────────────────────────────────────────────
    L.append("EXECUTION METRICS:")
    L.append(f"  • Early exit rate: {exec_asym.get('earlyExitRate', 0):.0f}%")
    L.append(
        f"  • Avg Win RR: {exec_asym.get('avgWinRR', 0):.2f}R  |  "
        f"Avg Loss RR: {exec_asym.get('avgLossRR', 0):.2f}R"
    )
    L.append(f"  • Asymmetry score: {exec_asym.get('asymmetryScore', 0):.2f}×")
    L.append(f"  • Late entry rate: {exec_asym.get('lateEntryRate', 0):.0f}%")
    L.append("")

    # ── RR Efficiency ────────────────────────────────────────────────────────
    if rr_eff and rr_eff.get("hasData"):
        L.append("RR EFFICIENCY (planned vs achieved):")
        L.append(
            f"  • Avg planned RR: {rr_eff.get('avgPlannedRR', 0):.2f}R  |  "
            f"Avg achieved RR: {rr_eff.get('avgAchievedRR', 0):.2f}R"
        )
        L.append(f"  • RR capture rate: {rr_eff.get('rrCaptureRate', 0):.0f}%")
        L.append(
            f"  • Under-perform rate (<50% of planned RR): "
            f"{rr_eff.get('underPerformRate', 0):.0f}%"
        )
        L.append("")

    # ── MAE / MFE ────────────────────────────────────────────────────────────
    if mae_mfe and mae_mfe.get("hasData"):
        L.append("MAE / MFE ANALYSIS (stop & target efficiency):")
        if mae_mfe.get("maeSlRatio") is not None:
            L.append(
                f"  • MAE/SL ratio: {mae_mfe['maeSlRatio']:.2f}  "
                "(>1.0 means price often breaches stop before reversing)"
            )
        if mae_mfe.get("mfeTpRatio") is not None:
            L.append(
                f"  • MFE/TP ratio: {mae_mfe['mfeTpRatio']:.2f}  "
                "(>1.0 means price regularly exceeds TP — money left on table)"
            )
        L.append("")

    # ── Direction bias ───────────────────────────────────────────────────────
    if direction and direction.get("hasData"):
        L.append("DIRECTION ANALYSIS:")
        L.append(
            f"  • Long:  {direction.get('longWinRate', 0):.0f}% WR, "
            f"{direction.get('longTrades', 0)} trades, PF {direction.get('longPF', 0):.2f}, "
            f"avg P&L {direction.get('longAvgPnl', 0):.2f}"
        )
        L.append(
            f"  • Short: {direction.get('shortWinRate', 0):.0f}% WR, "
            f"{direction.get('shortTrades', 0)} trades, PF {direction.get('shortPF', 0):.2f}, "
            f"avg P&L {direction.get('shortAvgPnl', 0):.2f}"
        )
        L.append(f"  • Direction edge: {direction.get('directionEdge', 'Neutral')}")
        L.append("")

    # ── Regime ───────────────────────────────────────────────────────────────
    trending_wr = regime.get("trendingWinRate", 0)
    ranging_wr  = regime.get("rangingWinRate", 0)
    breakout_wr = regime.get("breakoutWinRate", 0)
    if trending_wr or ranging_wr or breakout_wr:
        L.append("REGIME PERFORMANCE:")
        if trending_wr: L.append(f"  • Trending:  {trending_wr:.0f}% WR")
        if ranging_wr:  L.append(f"  • Ranging:   {ranging_wr:.0f}% WR")
        if breakout_wr: L.append(f"  • Breakout:  {breakout_wr:.0f}% WR")
        L.append("")

    # ── Risk & capital ───────────────────────────────────────────────────────
    L.append("RISK & CAPITAL:")
    L.append(
        f"  • Avg risk/trade: {capital.get('avgRiskPerTrade', 0):.2f}%  |  "
        f"Max: {capital.get('maxRiskPerTrade', 0):.2f}%"
    )
    L.append(f"  • Risk consistency: {capital.get('riskConsistencyScore', 0):.0f}/100")
    L.append(
        f"  • Loss cluster frequency: "
        f"{loss_cluster.get('clusterFrequency', 0):.1f} per 100 trades  |  "
        f"Avg cluster size: {loss_cluster.get('avgLength', 0):.1f}"
    )
    L.append("")

    # ── Trade quality ────────────────────────────────────────────────────────
    a_tr = tq.get("aTrades", {})
    b_tr = tq.get("bTrades", {})
    c_tr = tq.get("cTrades", {})
    if a_tr.get("count") or b_tr.get("count") or c_tr.get("count"):
        L.append("TRADE QUALITY BREAKDOWN:")
        if a_tr.get("count"):
            L.append(f"  • A-grade: {a_tr['count']} trades, {a_tr.get('profit') or 0:.0f}% WR")
        if b_tr.get("count"):
            L.append(f"  • B-grade: {b_tr['count']} trades, {b_tr.get('profit') or 0:.0f}% WR")
        if c_tr.get("count"):
            L.append(f"  • C-grade: {c_tr['count']} trades, {c_tr.get('profit') or 0:.0f}% WR")
        L.append("")

    # ── Edge decay ───────────────────────────────────────────────────────────
    if edge_decay.get("detected"):
        L.append(
            f"EDGE DECAY DETECTED: {edge_decay.get('recommendation', '')}"
        )
        L.append("")

    # ── Combination breakdown ─────────────────────────────────────────────────
    combo = result.get("comboAnalysis", {})
    if combo and combo.get("hasData"):
        L.append("COMBINATION BREAKDOWN (mechanical cross-analysis):")

        by_instr = combo.get("byInstrument", [])
        if by_instr:
            L.append("  Per instrument (ranked by win rate):")
            for row in by_instr[:5]:
                L.append(
                    f"    • {row['instrument']}: {row['winRate']:.0f}% WR, "
                    f"{row['trades']} trades, PF {row['pf']:.2f}"
                )

        by_tf = combo.get("byTimeframe", [])
        if by_tf:
            L.append("  Per timeframe (ranked by win rate):")
            for row in by_tf[:4]:
                L.append(
                    f"    • {row['timeframe']}: {row['winRate']:.0f}% WR, "
                    f"{row['trades']} trades, PF {row['pf']:.2f}"
                )

        si = combo.get("sessInstrCombos", [])
        if si:
            L.append("  Best session × instrument combos:")
            for row in si[:5]:
                L.append(
                    f"    • {row['session']} + {row['instrument']}: "
                    f"{row['winRate']:.0f}% WR, {row['trades']} trades, PF {row['pf']:.2f}"
                )

        fc = combo.get("fullCombos", [])
        if fc:
            L.append("  Best session × instrument × direction combos:")
            for row in fc[:5]:
                L.append(
                    f"    • {row['session']} + {row['instrument']} + {row['direction']}: "
                    f"{row['winRate']:.0f}% WR, {row['trades']} trades, PF {row['pf']:.2f}"
                )

        L.append("")

    # ── Output instruction ───────────────────────────────────────────────────
    L += [
        "=" * 54,
        "INSTRUCTIONS: You are an elite quantitative trading analyst.",
        "Return ONLY valid JSON — no markdown, no code fences, no explanation.",
        "Required JSON schema:",
        "{",
        '  "executiveSummary": "<2-3 sentences: what this strategy IS, what drives the',
        '    edge, and the single most critical mechanical risk to address.',
        '    Cite specific numbers: win rate, profit factor, top driver, key weakness.>",',
        '  "aiPolicySuggestions": [',
        '    {',
        '      "rule": "<One-sentence concrete rule>",',
        '      "rationale": "<Data-backed reason — MUST cite a specific number from above>",',
        '      "expectedImpact": "<Quantified or directional expected change>",',
        '      "priority": <1-6, 1=highest>',
        '    }',
        "  ],",
        '  "strengthsNarrative": "<One sentence on the strongest mechanical advantage>",',
        '  "riskNarrative": "<One sentence on the most critical mechanical risk>",',
        '  "aiStrategyBlueprint": {',
        '    "title": "<Short, specific strategy name derived from the best combo e.g. \'London EURUSD Long Scalp\'>",',
        '    "rules": [',
        '      "<Rule 1 — Session: trade only the session(s) with highest WR, cite the WR>",',
        '      "<Rule 2 — Instruments: focus on the 1-3 instruments with highest WR in that session>",',
        '      "<Rule 3 — Timeframe: use the timeframe with highest WR, cite the WR>",',
        '      "<Rule 4 — Direction: Long only / Short only / directional preference, cite the WR gap>",',
        '      "<Rule 5 — Entry: one-sentence mechanical entry condition from top edge driver if available>",',
        '      "<Rule 6 — Risk: one risk rule if data supports it (optional, omit if no data)"',
        '    ],',
        '    "expectedWinRate": "<WR% from the best supported combo e.g. ~74%>",',
        '    "sampleBasis": "<number of trades backing this blueprint e.g. 22 trades>"',
        '  }',
        "}",
        "",
        "Rules:",
        "  - 4 to 6 aiPolicySuggestions, ordered by priority (1 = most important).",
        "  - Every rationale MUST cite a specific number from the data above.",
        "  - Focus exclusively on trade mechanics: entry, exit, RR, session, instrument,",
        "    direction, timeframe, position sizing. No psychology or mindset content.",
        "  - aiStrategyBlueprint: build from the highest-WR combination that has real sample",
        "    support. Order rules strictly: Session → Instruments → Timeframe → Direction →",
        "    Entry → Risk. 4-6 rules max. Each rule is ONE short sentence. Cite actual numbers.",
        "    If combo data is missing, fall back to session + direction individually.",
        "    Write in imperative tense ('Trade London only', not 'You should trade London').",
        "  - If sample size is small (<20 trades), acknowledge it but still give",
        "    actionable suggestions based on available patterns.",
        "  - Do NOT invent data. Every claim must trace to a number in the brief above.",
    ]

    return "\n".join(L)


# ── Public API ─────────────────────────────────────────────────────────────────

def synthesize_audit(shaped_result: dict) -> dict:
    """
    Call Gemini to synthesize the fully-computed strategy audit into an AI
    executive narrative and priority-ranked policy suggestions.

    Always returns a dict — never raises. Falls back to empty values on any
    failure so the audit result is never blocked by an AI error.
    """
    fallback: dict[str, Any] = {
        "aiExecutiveSummary":   "",
        "aiPolicySuggestions":  [],
        "aiStrengthsNarrative": "",
        "aiRiskNarrative":      "",
        "aiStrategyBlueprint":  None,
        "aiError":              None,
    }

    # Require API key
    if not os.environ.get("GOOGLE_API_KEY", ""):
        fallback["aiError"] = "GOOGLE_API_KEY is not set — add it to your server environment variables."
        return fallback

    # Require minimum sample to be meaningful
    n = shaped_result.get("auditSummary", {}).get("sampleSize", 0)
    if n < 5:
        return fallback

    try:
        # Make ai_engine importable (both live under server/python/)
        _parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if _parent not in sys.path:
            sys.path.insert(0, _parent)

        from ai_engine.llm_client import call_llm  # type: ignore

        prompt = _build_prompt(shaped_result)
        raw = call_llm(
            mode="audit_synthesis",
            payload={"_raw_prompt": prompt},
        )

        # Strip markdown code fences if the model adds them
        clean = raw.strip()
        if clean.startswith("```"):
            parts = clean.split("```")
            clean = parts[1] if len(parts) > 1 else clean
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip()

        parsed = json.loads(clean)

        ai_suggestions = parsed.get("aiPolicySuggestions") or []
        # Normalise: ensure each item has the expected keys
        normalised = []
        for item in ai_suggestions[:6]:
            if isinstance(item, dict):
                normalised.append({
                    "rule":           str(item.get("rule", "")),
                    "rationale":      str(item.get("rationale", "")),
                    "expectedImpact": str(item.get("expectedImpact", "")),
                    "priority":       int(item.get("priority", 99)),
                })
        normalised.sort(key=lambda x: x["priority"])

        # ── Strategy blueprint ────────────────────────────────────────────────
        raw_bp = parsed.get("aiStrategyBlueprint")
        blueprint: dict | None = None
        if isinstance(raw_bp, dict):
            rules = raw_bp.get("rules") or []
            # Accept both a list of strings and a list of objects with a "rule" key
            clean_rules: list[str] = []
            for r in rules[:6]:
                if isinstance(r, str) and r.strip():
                    clean_rules.append(r.strip())
                elif isinstance(r, dict):
                    s = r.get("rule") or r.get("text") or ""
                    if s:
                        clean_rules.append(str(s).strip())
            if clean_rules:
                blueprint = {
                    "title":           str(raw_bp.get("title", "AI Strategy Blueprint")),
                    "rules":           clean_rules,
                    "expectedWinRate": str(raw_bp.get("expectedWinRate", "")),
                    "sampleBasis":     str(raw_bp.get("sampleBasis", "")),
                }

        return {
            "aiExecutiveSummary":   str(parsed.get("executiveSummary", "")),
            "aiPolicySuggestions":  normalised,
            "aiStrengthsNarrative": str(parsed.get("strengthsNarrative", "")),
            "aiRiskNarrative":      str(parsed.get("riskNarrative", "")),
            "aiStrategyBlueprint":  blueprint,
        }

    except Exception as exc:
        msg = str(exc)
        print(f"[AuditSynthesis] Gemini call failed — {msg}", file=sys.stderr)
        if "api_key" in msg.lower() or "api key" in msg.lower() or "invalid" in msg.lower():
            fallback["aiError"] = f"Invalid API key — {msg}"
        elif "quota" in msg.lower() or "429" in msg:
            fallback["aiError"] = f"API quota exceeded — {msg}"
        elif "importerror" in type(exc).__name__.lower() or "modulenotfounderror" in type(exc).__name__.lower():
            fallback["aiError"] = "google-genai package not installed — run: pip install google-genai"
        elif "network" in msg.lower() or "connect" in msg.lower() or "timeout" in msg.lower():
            fallback["aiError"] = f"Network error reaching Gemini API — {msg}"
        else:
            fallback["aiError"] = f"Gemini call failed — {msg}"
        return fallback
