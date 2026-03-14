"""
strategy_audit/level3_diagnostics.py
────────────────────────────────────────────────────────────────────────────
Level 3 — Diagnostics: Identifying failure patterns and structural risks

Responsibility:
  Go deeper than statistics and identify the specific structural failure modes
  that are damaging the trader's performance. Answers "Where exactly is the
  edge leaking?"

  Covers:
    - Loss clusters (when do losses bunch together in time?)
    - Execution asymmetry (are wins and losses structurally different?)
    - Regime transitions (does performance change between market regimes?)
    - Capital heat (is risk sizing consistent and controlled?)
    - Automation risk (is the strategy susceptible to systematic failure?)

Input:
  trades: list[dict]  — all trade records (see core.py for field schema)

Output (returned as dict, stored under "level3" by core.py):
  {
    "lossCluster": {
      "clusterDates":    [str],      # date ranges where 3+ consecutive losses occurred
      "avgClusterSize":  float,      # avg number of losses per cluster
      "clusterFrequency":float       # clusters per 100 trades
    },
    "executionAsymmetry": {
      "avgWinRR":             float, # avg R:R on winning trades
      "avgLossRR":            float, # avg R:R on losing trades (should be < 1)
      "asymmetryScore":       float, # avgWinRR / max(avgLossRR, 0.01)
      "plannedVsActualEntry": float, # mean deviation in pips/pts from planned entry
      "earlyExitRate":        float, # % of wins closed before reaching TP
      "lateEntryRate":        float  # % of entries taken beyond ideal zone
    },
    "regimeTransition": {
      "trendingWinRate":           float,
      "rangingWinRate":            float,
      "breakoutWinRate":           float,
      "regimeDetectionAccuracy":   float  # % of trades where regime was correctly identified
    },
    "capitalHeat": {
      "avgRiskPerTrade":       float,  # average riskPercent per trade
      "maxRiskPerTrade":       float,
      "riskConsistencyScore":  float,  # 100 - stdDev(riskPercent) * 10, clamped 0–100
      "correlatedExposure":    [str]   # instrument pairs often traded within 1 hour
    },
    "automationRisk": {
      "score":  float,    # composite risk score 0–100 (higher = more risky)
      "issues": [str]     # list of identified risk flags
    }
  }

Calculation notes:
  Loss clusters:
    A cluster = 3 or more losses within any 5-trade window.
    clusterDates: list of "YYYY-MM-DD to YYYY-MM-DD" strings for each cluster.

  Execution asymmetry:
    earlyExitRate: % of winning trades where exitPrice was reached before TP
    (requires knowing whether TP was pre-set — use takeProfit field vs exitPrice).
    lateEntryRate: requires entryDeviation field or similar; skip if absent.

  Regime detection:
    Trades tagged with "trending", "ranging", or "breakout" in their tags array.
    Detect accuracy by checking whether the actual market movement matched
    the regime (this requires the outcome and direction to be consistent with
    regime expectations).

  Capital heat correlatedExposure:
    Find pairs of instruments where 2+ open trades overlapped in time (check
    entryTime/exitTime overlap). Return the most frequent co-occurring pairs.

  Automation risk score:
    Add risk points for:
      - High loss cluster frequency (> 5 per 100 trades): +25
      - Low regimeDetectionAccuracy (< 50%): +20
      - High revenge trade rate from streaks module: +20
      - Inconsistent risk sizing (riskConsistencyScore < 60): +20
      - Low rulesAdherence average (< 70): +15

TODO — implement compute_level3(trades):
  - Detect loss clusters using sliding window
  - Compute execution asymmetry metrics
  - Group by regime tag for regimeTransition
  - Analyse riskPercent for capitalHeat
  - Score automationRisk from composite flags
"""


def compute_level3(trades: list) -> dict:
    """
    Compute Level 3 — diagnostics and failure pattern detection.
    Returns a dict matching the output schema above.
    """
    # TODO: implement
    return {
        "lossCluster":         {"clusterDates": [], "avgClusterSize": 0.0, "clusterFrequency": 0.0},
        "executionAsymmetry":  {},
        "regimeTransition":    {},
        "capitalHeat":         {"avgRiskPerTrade": 0.0, "maxRiskPerTrade": 0.0,
                                 "riskConsistencyScore": 0.0, "correlatedExposure": []},
        "automationRisk":      {"score": 0.0, "issues": []},
    }
