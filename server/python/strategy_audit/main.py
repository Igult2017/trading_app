"""
strategy_audit/main.py
────────────────────────────────────────────────────────────────────────────
Entry point for the strategy audit engine.
Spawned by server/services/strategyAuditCalculator.ts as a child process.

HOW IT WORKS:
  - Reads a JSON payload from stdin: { "trades": [...], "startingBalance": float }
  - Calls core.compute_strategy_audit() which orchestrates all 4 audit levels
  - Writes a single JSON result to stdout
  - Any debug/error output goes to stderr only — never stdout

NOTE: This computation is heavier than metrics or drawdown (uses scipy for
statistical tests). The Node.js bridge sets a 45s timeout for this script.

CALLED BY:
  server/services/strategyAuditCalculator.ts  (Node.js bridge)
  which is called by:
  GET /api/strategy-audit/compute?sessionId=X  (server/routes.ts)
"""

import sys
import json
import os

# Insert the parent of strategy_audit/ so we can import it as a package,
# which is required for the relative imports inside core.py to work.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from strategy_audit.core import compute_strategy_audit
from strategy_audit.ai_synthesis import synthesize_audit


def main():
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    trades = payload.get("trades", [])
    starting_balance = payload.get("startingBalance", 10000.0)

    try:
        result = compute_strategy_audit(trades, starting_balance)
        result["success"] = True

        # ── Gemini AI synthesis ───────────────────────────────────────────────
        # Pass the fully shaped result to Gemini for an executive narrative and
        # AI-powered policy suggestions.  synthesize_audit() always returns a
        # dict — it never raises, so failures here are silent and non-blocking.
        ai = synthesize_audit(result)

        # Overwrite executiveSummary with the AI narrative when Gemini returned
        # a non-empty string; keep the rule-based fallback otherwise.
        if ai.get("aiExecutiveSummary"):
            result["executiveSummary"]             = ai["aiExecutiveSummary"]
            result["auditSummary"]["gradeSummary"] = ai["aiExecutiveSummary"]
            result["finalVerdict"]["summary"]      = ai["aiExecutiveSummary"]

        # Replace rule-based policy suggestions with AI-generated ones when
        # Gemini returned at least one suggestion.
        if ai.get("aiPolicySuggestions"):
            result["aiPolicySuggestions"] = [
                {
                    "rule":           s.get("rule", ""),
                    "rationale":      s.get("rationale", ""),
                    "expectedImpact": s.get("expectedImpact", ""),
                }
                for s in ai["aiPolicySuggestions"]
            ]

        # Expose AI narratives and blueprint as top-level keys
        result["aiStrengthsNarrative"] = ai.get("aiStrengthsNarrative", "")
        result["aiRiskNarrative"]      = ai.get("aiRiskNarrative", "")
        result["aiStrategyBlueprint"]  = ai.get("aiStrategyBlueprint", None)

        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
