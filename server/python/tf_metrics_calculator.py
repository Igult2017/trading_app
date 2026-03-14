"""
tf_metrics_calculator.py
──────────────────────────────────────────────────────────────────────────────
Timeframe-specific performance metrics engine. Spawned as a child process by
server/services/tfMetricsCalculator.ts.

HOW IT WORKS:
  - Receives a JSON payload via stdin: { "trades": [...], "startingBalance": float }
  - Groups trades by the timeframes recorded in the journal (e.g. M1, M5, M15, M30, H1, H4, D1)
  - For each timeframe computes a full performance breakdown
  - Writes a single JSON result to stdout

EXPECTED INPUT (via stdin):
  {
    "trades": [
      {
        "id": int,
        "sessionId": int,
        "symbol": str,
        "tradeType": "long" | "short",
        "entryTimeframe": str,           // e.g. "H1", "M15", "H4"
        "htfBias": str,                  // higher-timeframe directional bias
        "entryPrice": float,
        "exitPrice": float,
        "stopLoss": float,
        "takeProfit": float,
        "profitLoss": float,
        "riskRewardRatio": float,
        "outcome": "win" | "loss" | "breakeven",
        "tradeDate": str,                // ISO date string
        "psychology": { "score": int },  // discipline/psychology composite score
        "riskPercent": float,
        ... (other journal_entries fields from shared/schema.ts)
      }
    ],
    "startingBalance": float             // optional, used for equity curve per TF
  }

OUTPUT SHAPE (written to stdout):
{
  "success": true,
  "timeframes": ["M1", "M5", "M15", "M30", "H1", "H4", "D1"],
  "byTimeframe": {
    "H1": {
      "trades": int,                    // total trades on this TF
      "wins": int,
      "losses": int,
      "winRate": float,                 // 0-100
      "avgRR": float,                   // average risk:reward on winning trades
      "profitFactor": float,            // gross wins / gross losses
      "netPnl": float,                  // cumulative P&L in this TF
      "avgWin": float,
      "avgLoss": float,
      "expectancy": float,              // (winRate * avgWin) - (lossRate * avgLoss)
      "avgEntryQuality": float,         // 0-100 from quality scores if available
      "equityCurve": [float],           // running balance after each trade on this TF
      "bestInstrument": str,            // instrument with highest win rate on this TF
      "worstInstrument": str,           // instrument with lowest win rate on this TF
      "byInstrument": {
        "XAUUSD": { "trades": int, "wins": int, "winRate": float, "netPnl": float }
      },
      "byDirection": {
        "long":  { "trades": int, "winRate": float, "avgRR": float },
        "short": { "trades": int, "winRate": float, "avgRR": float }
      },
      "bySession": {
        "London": { "trades": int, "winRate": float },
        "NewYork": { "trades": int, "winRate": float },
        "Asia": { "trades": int, "winRate": float }
      }
    },
    "H4": { ... },
    ...
  },
  "summary": {
    "bestTimeframe": str,               // TF with highest win rate (min 5 trades)
    "worstTimeframe": str,
    "mostTradedTimeframe": str,
    "htfBiasAlignmentRate": float,      // % of trades taken in HTF bias direction
    "mtfConfluenceWinBoost": float      // win rate uplift when 2+ TF confluence exists
  },
  "error": null
}

NOTES:
  - Timeframes are read from the `entryTimeframe` field on each trade.
  - If a trade has no timeframe recorded, bucket it under "Unknown".
  - Minimum 3 trades on a timeframe to include it in the output to avoid noise.
  - Use numpy for all statistical calculations (mean, std, etc.).
  - Never write anything except the JSON result to stdout.
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

    # TODO: implement timeframe grouping and per-TF metrics computation
    # Steps:
    # 1. Extract unique timeframes from trades["entryTimeframe"]
    # 2. Group trades by timeframe
    # 3. For each group: compute wins, losses, winRate, avgRR, profitFactor, netPnl, expectancy
    # 4. Build byInstrument, byDirection, bySession sub-breakdowns per TF
    # 5. Compute equityCurve per TF using starting_balance as base
    # 6. Find bestTimeframe, worstTimeframe, mostTradedTimeframe
    # 7. Compute htfBiasAlignmentRate and mtfConfluenceWinBoost for summary

    result = {
        "success": True,
        "timeframes": [],
        "byTimeframe": {},
        "summary": {},
        "error": None
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
