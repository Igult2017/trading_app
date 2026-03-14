"""
drawdown/main.py
────────────────────────────────────────────────────────────────────────────
Entry point for the drawdown analysis engine.
Spawned by server/services/drawdownCalculator.ts as a child process.

HOW IT WORKS:
  - Reads a JSON payload from stdin: { "trades": [...], "startingBalance": float }
  - Calls core.compute_drawdown() which orchestrates all sub-modules
  - Writes a single JSON result to stdout
  - Any debug/error output goes to stderr only — never stdout

CALLED BY:
  server/services/drawdownCalculator.ts  (Node.js bridge)
  which is called by:
  GET /api/drawdown/compute?sessionId=X  (server/routes.ts)
"""

import sys
import json
import os

sys.path.insert(0, os.path.dirname(__file__))

from core import compute_drawdown


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
        result = compute_drawdown(trades, starting_balance)
        result["success"] = True
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
