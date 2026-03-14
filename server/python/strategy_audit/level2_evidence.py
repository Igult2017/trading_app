"""
strategy_audit/level2_evidence.py
────────────────────────────────────────────────────────────────────────────
Level 2 — Evidence & Proof: Statistical validation of the edge

Responsibility:
  Provide rigorous statistical evidence that supports or refutes the edge
  identified in Level 1. Answers the question "Is the edge real or lucky?"

  Covers:
    - Return distribution shape (skewness, kurtosis)
    - Drawdown structure (max DD, Calmar ratio, Ulcer Index)
    - Equity curve consistency (month-over-month variance)
    - Trade quality correlation (does higher confluence = higher win rate?)
    - Conditional edge by setup tag and market session
    - Instrument × strategy win rate heatmap profiles

Input:
  trades:           list[dict]  — all trade records
  starting_balance: float       — for equity curve and drawdown calculations

Output (returned as dict, stored under "level2" by core.py):
  {
    "variance": {
      "winRate":       float,
      "stdDev":        float,    # standard deviation of per-trade returns
      "skewness":      float,    # positive = right-skewed (good for traders)
      "kurtosis":      float,    # excess kurtosis
      "sampleSize":    int,
      "winLossRatio":  float,
      "positiveSkew":  bool
    },
    "drawdown": {
      "maxDrawdown":    float,   # worst peak-to-trough in %
      "avgDrawdown":    float,
      "recoveryFactor": float,
      "calmarRatio":    float,   # annualised return / abs(maxDrawdown)
      "ulcerIndex":     float    # RMS of drawdown series
    },
    "equityVariance": {
      "bestMonth":        float,
      "worstMonth":       float,
      "monthlyStdDev":    float,
      "consistencyScore": float  # 0–100; higher = more consistent monthly returns
    },
    "tradeQuality": {
      "avgConfluenceScore":       float,
      "avgEntryQuality":          float,
      "avgPlanningVsExecution":   float,
      "highQualityWinRate":       float,  # win rate when confluenceScore >= 70
      "lowQualityWinRate":        float   # win rate when confluenceScore < 40
    },
    "conditionalEdge": {
      "bySetupTag": {
        "<tag>": { "trades": int, "winRate": float, "avgRR": float }
      },
      "bySession": {
        "<session>": { "trades": int, "winRate": float, "profitFactor": float }
      }
    },
    "heatmapProfiles": [
      { "instrument": str, "strategy": str, "winRate": float, "trades": int }
    ]
  }

Calculation notes:
  - Use scipy.stats.skew and scipy.stats.kurtosis for distribution shape.
  - Ulcer Index = sqrt(mean(d_i^2)) where d_i is the drawdown at each trade i.
  - Calmar Ratio = (total_net_pnl_pct / abs(maxDrawdown)) / years_of_data.
  - consistencyScore = 100 - (monthlyStdDev / abs(meanMonthlyReturn) * 100),
    clamped to 0–100. Returns 0 if meanMonthlyReturn == 0.
  - highQualityWinRate: trades where confluenceScore >= 70; min 5 trades.
  - lowQualityWinRate:  trades where confluenceScore < 40; min 5 trades.

TODO — implement compute_level2(trades, starting_balance):
  - Build P&L return series; compute skewness and kurtosis via scipy.stats
  - Build equity curve; compute max drawdown, Ulcer Index, Calmar ratio
  - Group by month; compute monthly stats and consistencyScore
  - Compute trade quality scores and conditional edge by tag/session
  - Build heatmap profiles by instrument × strategy
"""


def compute_level2(trades: list, starting_balance: float) -> dict:
    """
    Compute Level 2 — statistical evidence and proof.
    Returns a dict matching the output schema above.
    """
    # TODO: implement
    return {
        "variance":         {},
        "drawdown":         {},
        "equityVariance":   {},
        "tradeQuality":     {},
        "conditionalEdge":  {"bySetupTag": {}, "bySession": {}},
        "heatmapProfiles":  [],
    }
