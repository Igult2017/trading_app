"""
strategy_audit_calculator.py
──────────────────────────────────────────────────────────────────────────────
Strategy audit engine that powers the StrategyAudit panel. Spawned as a child
process by server/services/strategyAuditCalculator.ts.

This script performs deep statistical analysis on the trader's journal data to
produce an AI-grade strategy audit across 4 progressive levels:
  Level 1 – Strategy Audit     (edge detection, edge drivers, weaknesses)
  Level 2 – Evidence & Proof   (variance, drawdown analysis, equity distribution)
  Level 3 – Diagnostics        (loss clusters, execution asymmetry, regime transitions)
  Level 4 – Action & Iteration (guardrails, decay detection, final verdict)

HOW IT WORKS:
  - Receives a JSON payload via stdin: { "trades": [...], "startingBalance": float }
  - Computes all four audit levels from raw journal entries
  - Writes a single JSON result to stdout

EXPECTED INPUT (via stdin):
  {
    "trades": [
      {
        "id": int,
        "sessionId": int,
        "symbol": str,
        "strategy": str,                 // strategy tag used for the trade
        "tradeType": "long" | "short",
        "entryTimeframe": str,
        "profitLoss": float,
        "riskRewardRatio": float,
        "riskPercent": float,
        "outcome": "win" | "loss" | "breakeven",
        "entryPrice": float,
        "exitPrice": float,
        "stopLoss": float,
        "tradeDate": str,
        "exitCausation": str,            // reason trade was exited
        "setupTags": [str],              // list of SMC setup tags used
        "psychology": { "score": int, "notes": str },
        "planningVsExecution": float,    // 0-100 score
        "rulesAdherence": float,         // 0-100 score
        "confluenceScore": float,        // 0-100 entry confluence rating
        "session": str,                  // "London", "NewYork", "Asia", "Sydney"
        ... (all other journal_entries fields)
      }
    ],
    "startingBalance": float
  }

OUTPUT SHAPE (written to stdout):
{
  "success": true,

  "level1": {
    "edgeSummary": {
      "overallWinRate": float,           // 0-100
      "profitFactor": float,
      "expectancy": float,
      "sampleSize": int,
      "edgeVerdict": str                 // "Confirmed", "Marginal", "Unconfirmed"
    },
    "edgeDrivers": [                     // top 5 conditions that increase win rate
      { "factor": str, "winRateWithFactor": float, "winRateWithout": float, "lift": float }
    ],
    "monitorItems": [str],               // conditions approaching statistical edge loss
    "weaknesses": [                      // top 5 conditions that reduce win rate
      { "factor": str, "winRateWithFactor": float, "impact": float }
    ],
    "winFactorCorrelation": {            // correlation matrix: instrument × win_factor
      "<instrument>": [float]            // correlation score 0-100 per win factor
    },
    "lossFactorCorrelation": {           // correlation matrix: instrument × loss_factor
      "<instrument>": [float]
    },
    "psychologyScore": float,            // avg psychology score across all trades
    "disciplineScore": float,            // avg rules adherence score
    "probabilisticEdge": float           // Kelly criterion based edge percentage
  },

  "level2": {
    "variance": {
      "winRate": float,
      "stdDev": float,                   // standard deviation of returns
      "skewness": float,                 // positive = right-skewed (good)
      "kurtosis": float,                 // excess kurtosis of P&L distribution
      "sampleSize": int,
      "winLossRatio": float,
      "positiveSkew": bool
    },
    "drawdown": {
      "maxDrawdown": float,              // worst peak-to-trough in % terms
      "avgDrawdown": float,
      "recoveryFactor": float,
      "calmarRatio": float,              // annualized return / max drawdown
      "ulcerIndex": float                // root-mean-square of % drawdowns
    },
    "equityVariance": {
      "bestMonth": float,
      "worstMonth": float,
      "monthlyStdDev": float,
      "consistencyScore": float          // 0-100: how consistent monthly returns are
    },
    "tradeQuality": {
      "avgConfluenceScore": float,
      "avgEntryQuality": float,
      "avgPlanningVsExecution": float,
      "highQualityWinRate": float,       // win rate when confluenceScore > 70
      "lowQualityWinRate": float         // win rate when confluenceScore < 40
    },
    "conditionalEdge": {
      "bySetupTag": {                    // per setup tag stats
        "<tag>": { "trades": int, "winRate": float, "avgRR": float }
      },
      "bySession": {
        "<session>": { "trades": int, "winRate": float, "profitFactor": float }
      }
    },
    "heatmapProfiles": [                 // instrument × strategy heatmap
      { "instrument": str, "strategy": str, "winRate": float, "trades": int }
    ]
  },

  "level3": {
    "lossCluster": {
      "clusterDates": [str],            // date ranges where losses clustered
      "avgClusterSize": float,          // avg number of losses per cluster
      "clusterFrequency": float         // how often clusters occur (per 100 trades)
    },
    "executionAsymmetry": {
      "avgWinRR": float,               // avg R:R on wins
      "avgLossRR": float,              // avg R:R on losses
      "asymmetryScore": float,         // ratio (higher = more asymmetric/better)
      "plannedVsActualEntry": float,   // avg deviation from planned entry
      "earlyExitRate": float,          // % of wins exited before TP
      "lateEntryRate": float           // % of entries taken >10 pips from ideal
    },
    "regimeTransition": {
      "trendingWinRate": float,
      "rangingWinRate": float,
      "breakoutWinRate": float,
      "regimeDetectionAccuracy": float // how often the trader correctly identified regime
    },
    "capitalHeat": {
      "avgRiskPerTrade": float,        // average % of account risked per trade
      "maxRiskPerTrade": float,
      "riskConsistencyScore": float,   // 0-100: how consistent risk sizing is
      "correlatedExposure": [str]      // pairs/instruments often traded simultaneously
    },
    "automationRisk": {
      "score": float,                  // 0-100: how susceptible to automation failure
      "issues": [str]                  // list of identified automation risks
    }
  },

  "level4": {
    "aiPolicySuggestions": [           // concrete rule changes to improve edge
      { "rule": str, "rationale": str, "expectedImpact": str }
    ],
    "guardrails": [                    // hard stops to prevent catastrophic losses
      { "condition": str, "action": str }
    ],
    "edgeDecay": {
      "detected": bool,
      "decayStartDate": str,           // ISO date when decay likely began
      "decayMagnitude": float,         // % drop in win rate from peak 30-day window
      "recommendation": str
    },
    "finalVerdict": {
      "overallGrade": str,             // "A", "B", "C", "D", "F"
      "summary": str,                  // one-paragraph text summary
      "topStrengths": [str],
      "topWeaknesses": [str],
      "nextActions": [str]
    }
  },

  "error": null
}

NOTES:
  - Use numpy/scipy for all statistical calculations (skewness, kurtosis, std, correlations).
  - All percentage values are expressed as floats in 0-100 range unless stated otherwise.
  - Drawdown percentages are negative floats.
  - If fewer than 10 trades exist, return level3 and level4 with reduced confidence flags.
  - Never write anything except the final JSON to stdout (use sys.stderr for debug logs).
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

    # TODO: implement all 4 audit levels
    # Level 1: edge detection, factor correlation, psychology scoring
    # Level 2: variance/distribution, drawdown, equity variance, conditional edge
    # Level 3: loss cluster detection, execution asymmetry, regime analysis, capital heat
    # Level 4: policy suggestions, guardrails, edge decay detection, final verdict

    result = {
        "success": True,
        "level1": {},
        "level2": {},
        "level3": {},
        "level4": {},
        "error": None
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
