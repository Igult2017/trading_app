"""
drawdown_calculator.py
──────────────────────────────────────────────────────────────────────────────
Main entry point for the drawdown analysis engine. This script is spawned by
the Node.js bridge (server/services/drawdownCalculator.ts) as a child process.

HOW IT WORKS:
  - Receives a JSON payload via stdin: { "trades": [...], "startingBalance": float }
  - Orchestrates all individual drawdown sub-modules:
      drawdown_core.py         → peak/trough/recovery periods, max drawdown %
      drawdown_streaks.py      → consecutive loss streaks, streak depth analysis
      drawdown_heatmap.py      → pair×strategy heatmap matrix of loss severity
      drawdown_distribution.py → histogram distribution of drawdown sizes
      drawdown_frequency.py    → frequency breakdown by attribute (session, strategy, psychology)
      drawdown_metrics.py      → summary KPIs: avg drawdown, recovery factor, trend alignment
      drawdown_structural.py   → structural failure analysis (context, session, risk)
      drawdown_sessions.py     → per-session drawdown comparison
  - Aggregates results into a single JSON object and writes it to stdout
  - Writes any errors to stderr and exits with code 1

OUTPUT SHAPE (written to stdout):
{
  "success": true,
  "topStats": {
    "maxDrawdown": float,          // e.g. -8.42 (percentage)
    "avgDrawdown": float,          // average drawdown % across all drawdown periods
    "recoveryFactor": float,       // net profit / max drawdown
    "trendAlignment": float        // % of trades taken in trend direction
  },
  "streaks": {
    "longestLossStreak": int,
    "worstStreakDepth": float,     // cumulative % lost in worst streak
    "avgRecoveryTrades": float,    // avg trades needed to recover after streak
    "streakHistory": [             // list of all losing streaks found
      { "start": int, "end": int, "length": int, "depth": float }
    ]
  },
  "heatmap": [                     // pair × strategy loss severity matrix
    {
      "pair": str,
      "cells": [
        { "strategy": str, "val": float, "trades": int, "losses": int }
      ]
    }
  ],
  "distribution": {                // histogram of drawdown sizes
    "buckets": [str],              // e.g. ["0-1%", "1-2%", ...]
    "counts": [int]
  },
  "frequency": {                   // loss frequency by attribute category
    "attr": [
      { "cat": str, "name": str, "total": int, "losses": int }
    ],
    "instr": [...],
    "session": [...]
  },
  "structural": {                  // structural failure context breakdown
    "context": [...],
    "session": [...],
    "risk": [...]
  },
  "sessionComparison": [           // per-session drawdown comparison
    { "sessionId": int, "sessionName": str, "maxDrawdown": float, "recoveryFactor": float }
  ],
  "error": null
}

NOTES:
  - All percentage values are expressed as negative floats (e.g. -8.42 means -8.42%)
  - Trade rows use the same camelCase schema as journal_entries table in shared/schema.ts
  - If fewer than 2 trades exist, return success=true with zeroed/empty stats
  - Never print anything other than the final JSON to stdout (use sys.stderr for logs)
"""

import sys
import json

def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    trades = payload.get("trades", [])
    starting_balance = payload.get("startingBalance")

    # TODO: import and call each sub-module, then aggregate results:
    # from drawdown_core import compute_core_drawdown
    # from drawdown_streaks import compute_streaks
    # from drawdown_heatmap import compute_heatmap
    # from drawdown_distribution import compute_distribution
    # from drawdown_frequency import compute_frequency
    # from drawdown_metrics import compute_summary_metrics
    # from drawdown_structural import compute_structural
    # from drawdown_sessions import compute_session_comparison

    result = {
        "success": True,
        "topStats": {},
        "streaks": {},
        "heatmap": [],
        "distribution": {},
        "frequency": {},
        "structural": {},
        "sessionComparison": [],
        "error": None
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
