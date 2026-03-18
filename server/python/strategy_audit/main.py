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


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    trades = payload.get("trades", [])
    starting_balance = payload.get("startingBalance", 10000.0)

    try:
        result = compute_strategy_audit(trades, starting_balance)
        result["success"] = True
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
