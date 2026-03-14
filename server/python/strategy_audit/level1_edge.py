"""
strategy_audit/level1_edge.py
────────────────────────────────────────────────────────────────────────────
Level 1 — Strategy Audit: Edge Detection

Responsibility:
  Determine whether the trader's strategy has a statistically meaningful edge
  and identify the specific conditions that drive it.

  Answers:
    - Does a genuine edge exist? (edge verdict)
    - What factors reliably improve the win rate? (edge drivers)
    - What conditions destroy the edge? (weaknesses)
    - How does each instrument correlate with each win/loss factor?
    - What is the psychological and discipline score?
    - What is the Kelly-derived probabilistic edge %?

Input:
  trades: list[dict]  — all trade records from the session

Output (returned as dict, stored under "level1" by core.py):
  {
    "edgeSummary": {
      "overallWinRate":  float,        # 0–100
      "profitFactor":    float,
      "expectancy":      float,        # expected value per trade in account currency
      "sampleSize":      int,
      "edgeVerdict":     str           # "Confirmed" | "Marginal" | "Unconfirmed"
    },
    "edgeDrivers": [                   # top conditions that lift win rate
      {
        "factor":             str,
        "winRateWithFactor":  float,   # win rate when this condition is present
        "winRateWithout":     float,   # win rate when this condition is absent
        "lift":               float    # winRateWithFactor - winRateWithout
      }
    ],
    "monitorItems": [str],             # conditions approaching edge loss (warning flags)
    "weaknesses": [                    # conditions that reduce win rate
      {
        "factor": str,
        "winRateWithFactor": float,
        "impact": float                # absolute win rate reduction
      }
    ],
    "winFactorCorrelation": {          # instrument × win factor correlation matrix
      "XAUUSD": [float, float, ...]    # one value per factor, 0–100 correlation score
    },
    "lossFactorCorrelation": {         # instrument × loss factor correlation matrix
      "XAUUSD": [float, float, ...]
    },
    "psychologyScore":    float,       # avg psychology score 0–100
    "disciplineScore":    float,       # avg rulesAdherence score 0–100
    "probabilisticEdge":  float        # Kelly criterion: W - (L/RR) * 100
  }

Edge verdict thresholds:
  "Confirmed"   — profitFactor > 1.5 AND winRate > 50 AND sampleSize >= 30
  "Marginal"    — profitFactor > 1.0 AND sampleSize >= 15
  "Unconfirmed" — anything else

Edge drivers:
  Test each of these conditions for win rate lift:
    - HTF bias alignment (htfBias == "with_trend")
    - High confluence score (confluenceScore >= 70)
    - Confirmed entry type (entry_type == "confirmed")
    - Valid order block (ob_valid == True)
    - Valid CHoCH (choch_valid == True)
    - London/NY overlap session
    - Psychology score >= 80
    - Risk >= 0.5% and <= 1.5%
  Include a condition as a driver if lift > 5 percentage points and
  the condition is present in >= 10 trades.

Kelly probabilistic edge:
  W = winRate / 100
  L = 1 - W
  avg_rr = mean(riskRewardRatio) for all trades
  Kelly% = W - (L / avg_rr) * 100

TODO — implement compute_level1(trades):
  - Compute overall winRate, profitFactor, expectancy
  - Determine edgeVerdict from thresholds
  - Test each condition for win rate lift → build edgeDrivers list
  - Identify weaknesses (negative lift conditions)
  - Build winFactorCorrelation / lossFactorCorrelation matrices
  - Compute psychologyScore, disciplineScore, probabilisticEdge
"""


def compute_level1(trades: list) -> dict:
    """
    Compute Level 1 — edge detection and factor analysis.
    Returns a dict matching the output schema above.
    """
    # TODO: implement
    return {
        "edgeSummary":           {},
        "edgeDrivers":           [],
        "monitorItems":          [],
        "weaknesses":            [],
        "winFactorCorrelation":  {},
        "lossFactorCorrelation": {},
        "psychologyScore":       0.0,
        "disciplineScore":       0.0,
        "probabilisticEdge":     0.0,
    }
