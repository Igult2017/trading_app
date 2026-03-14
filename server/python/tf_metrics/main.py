"""
tf_metrics/main.py
────────────────────────────────────────────────────────────────────────────
Entry point for the timeframe metrics engine.
Spawned by server/services/tfMetricsCalculator.ts as a child process.

HOW IT WORKS:
  - Reads a JSON payload from stdin: { "trades": [...], "startingBalance": float }
  - Calls core.compute_tf_metrics() which orchestrates all sub-modules
  - Writes a single JSON result to stdout
  - Any debug/error output goes to stderr only — never stdout

CALLED BY:
  server/services/tfMetricsCalculator.ts  (Node.js bridge)
  which is called by:
  GET /api/tf-metrics/compute?sessionId=X  (server/routes.ts)
"""

import sys
import json
import os

sys.path.insert(0, os.path.dirname(__file__))

from core import compute_tf_metrics


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
        result = compute_tf_metrics(trades, starting_balance)
        result["success"] = True
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
