"""
tf_metrics/main.py
Entry point for the timeframe metrics engine.
Spawned by server/services/tfMetricsCalculator.ts as a child process.
"""
import sys
import json
import os

# Insert parent directory so the tf_metrics package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tf_metrics.core import compute_tf_metrics
from tf_metrics.matrix import compute_tf_combo_matrix


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    trades = payload.get("trades", [])
    mode   = payload.get("mode", "standard")

    try:
        if mode == "matrix":
            rows = compute_tf_combo_matrix(trades)
            result = {"success": True, "rows": rows}
        else:
            starting_balance = payload.get("startingBalance", 10000.0)
            result = compute_tf_metrics(trades, starting_balance)
            result["success"] = True
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
