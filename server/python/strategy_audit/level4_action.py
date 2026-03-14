"""
strategy_audit/level4_action.py
────────────────────────────────────────────────────────────────────────────
Level 4 — Action & Iteration: Concrete recommendations and final verdict

Responsibility:
  Synthesise the findings from Levels 1–3 into actionable output that the
  trader can immediately apply. This is the "so what do I do about it?" layer.

  Covers:
    - AI policy suggestions (concrete rule changes)
    - Hard guardrails (conditions that should trigger a trading halt)
    - Edge decay detection (is performance trending downward over time?)
    - Final audit verdict (grade, summary, strengths, weaknesses, next steps)

Input:
  trades: list[dict]  — all trade records
  level1: dict        — output from level1_edge.compute_level1()
  level2: dict        — output from level2_evidence.compute_level2()
  level3: dict        — output from level3_diagnostics.compute_level3()

Output (returned as dict, stored under "level4" by core.py):
  {
    "aiPolicySuggestions": [
      {
        "rule":           str,   # e.g. "Only trade London/NY overlap sessions"
        "rationale":      str,   # why this rule would help, based on the data
        "expectedImpact": str    # e.g. "+12% win rate based on session data"
      }
    ],
    "guardrails": [
      {
        "condition": str,        # e.g. "3 consecutive losses in one day"
        "action":    str         # e.g. "Stop trading for the remainder of the session"
      }
    ],
    "edgeDecay": {
      "detected":         bool,
      "decayStartDate":   str,   # ISO date when the rolling win rate started dropping
      "decayMagnitude":   float, # % drop from peak 30-day win rate to current
      "recommendation":   str    # e.g. "Review strategy against current market regime"
    },
    "finalVerdict": {
      "overallGrade":   str,     # "A" | "B" | "C" | "D" | "F"
      "summary":        str,     # one-paragraph plain-text narrative
      "topStrengths":   [str],   # 3–5 bullet points
      "topWeaknesses":  [str],   # 3–5 bullet points
      "nextActions":    [str]    # 3–5 prioritised immediate next steps
    }
  }

Calculation notes:
  Policy suggestions (derive from level1/level2/level3 findings):
    - If session win rate spread > 15pp: suggest session restriction to top session
    - If low-quality trades have significantly lower win rate: suggest quality floor
    - If loss cluster frequency is high: suggest max daily loss rule
    - If execution asymmetry score > 2: suggest tightening entry criteria
    - If revenge trade rate > 30%: suggest mandatory cool-down period rule
  Include 3–6 suggestions. Each must cite the specific metric that motivated it.

  Guardrails (hard stop conditions):
    Always include:
      - 3 consecutive losses in one session → stop for the day
      - 2% account drawdown in one day → stop for the day
      - Max daily risk: sum of all open riskPercent > 3% → no new trades
    Add data-driven guardrails based on worst-performing conditions found in
    level1 weaknesses and level3 lossCluster.

  Edge decay detection:
    Split trades into rolling 30-day windows (sorted by date).
    Compute win rate for each 30-day window.
    Detected if the last 30-day win rate is more than 10pp below the peak
    30-day win rate AND the decline spans at least 60 days.
    decayStartDate = date of the last win-rate peak before the decline began.
    decayMagnitude = peak_win_rate - current_win_rate (in percentage points).

  Overall grade:
    A: edgeVerdict=="Confirmed" AND profitFactor>=2 AND maxDrawdown>=-5
    B: edgeVerdict=="Confirmed" AND profitFactor>=1.5
    C: edgeVerdict=="Marginal"  AND profitFactor>=1.2
    D: edgeVerdict=="Marginal"  OR profitFactor<1.2
    F: edgeVerdict=="Unconfirmed" OR profitFactor<=1.0

TODO — implement compute_level4(trades, level1, level2, level3):
  - Generate policy suggestions from cross-level findings
  - Build guardrails list (always-on + data-driven)
  - Run edge decay detection on rolling 30-day windows
  - Assign final grade and compose summary narrative
  - Extract top strengths, weaknesses, next actions from the evidence
"""


def compute_level4(trades: list, level1: dict, level2: dict, level3: dict) -> dict:
    """
    Compute Level 4 — action plan and final verdict.
    Returns a dict matching the output schema above.
    """
    # TODO: implement
    return {
        "aiPolicySuggestions": [],
        "guardrails": [
            {
                "condition": "3 consecutive losses in one session",
                "action":    "Stop trading for the remainder of the session"
            },
            {
                "condition": "2% account drawdown in one day",
                "action":    "Stop trading for the remainder of the day"
            },
            {
                "condition": "Total open risk exceeds 3% of account",
                "action":    "No new trades until existing positions close"
            },
        ],
        "edgeDecay": {
            "detected":       False,
            "decayStartDate": None,
            "decayMagnitude": 0.0,
            "recommendation": "Insufficient data to detect edge decay.",
        },
        "finalVerdict": {
            "overallGrade":  "N/A",
            "summary":       "Insufficient trade data for a complete audit.",
            "topStrengths":  [],
            "topWeaknesses": [],
            "nextActions":   [],
        },
    }
