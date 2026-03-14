"""
drawdown/distribution.py
────────────────────────────────────────────────────────────────────────────
R:R distribution buckets and month-by-month drawdown timeline.

Responsibility:
  Two datasets displayed in the lower half of DrawdownPanel:

  1. RR Buckets  — classifies every closed trade into four R:R bands and
     counts how many trades fall in each. Powers the "RR Distribution" card.

  2. Monthly Drawdown — for each calendar month in the data range, computes
     the peak drawdown, recovery %, dominant loss cause, avg RR, and worst
     single trade. Powers the "Monthly Drawdown" timeline row.

Input:
  trades: list[dict]  — trade records (see core.py for field schema)

Output (returned as dict with two keys, stored at root level by core.py):
  {
    "rrBuckets": [
      { "label": "< 1:1",    "count": 48, "pct": 26.1, "note": "Underperforming" },
      { "label": "1:1 – 1:2","count": 72, "pct": 39.1, "note": "Break-even" },
      { "label": "1:2 – 1:3","count": 44, "pct": 23.9, "note": "Target range" },
      { "label": "> 1:3",    "count": 20, "pct": 10.9, "note": "Outlier winners" }
    ],
    "monthly": [
      {
        "month":          "Jan",
        "year":           2025,
        "maxDdPct":       -2.1,
        "recoveryPct":    90.0,
        "dominantCause":  "HTF OB Failed",
        "dominantCauseClass": "bad",    # "bad" | "ok" | "good"
        "avgRr":          "1:1.8",
        "biggestLossPct": -0.8,
        "totalTrades":    142,
        "lossCount":      42
      },
      ...
    ]
  }

Calculation notes — RR Buckets:
  - Use the riskRewardRatio (or riskReward) field of every trade.
  - Buckets: < 1.0, 1.0–2.0, 2.0–3.0, > 3.0.
  - pct = count / total_trades * 100, rounded to 1 dp.
  - note strings are fixed per bucket label as shown above.

Calculation notes — Monthly timeline:
  - Group trades by (year, month) of their tradeDate.
  - maxDdPct: build a mini equity curve within the month; find its deepest dip.
  - recoveryPct: (month-end equity − month trough) / abs(trough − peak) * 100,
    capped at 100%.
  - dominantCause: count all tags and derive labels from boolean fields:
      ob_valid=False  → "HTF OB Failed"
      choch_valid=False → "CHOCH Failed"
      htfBias="counter_trend" → "Counter-Trend"
      entry_type="premature"  → "Premature BOS"
      plus any free-text tags
    Return the most frequent one.
  - dominantCauseClass:
      "bad"  → structural error (OB, CHoCH, premature BOS)
      "ok"   → marginal issue (SL placement, timing)
      "good" → good execution (Confirmed Entry, Calm Execution)
  - avgRr: format as "1:{mean(riskReward):.1f}" across all trades in the month.
  - biggestLossPct: pnlPct of the single worst (most negative) trade in the month.
  - Sort months chronologically.

TODO — implement both functions below.
"""


def compute_rr_buckets(trades: list) -> list:
    """
    Classify trades into R:R buckets.
    Returns the rrBuckets list matching the output schema above.
    """
    # TODO: implement
    return [
        {"label": "< 1:1",     "count": 0, "pct": 0.0, "note": "Underperforming"},
        {"label": "1:1 – 1:2", "count": 0, "pct": 0.0, "note": "Break-even"},
        {"label": "1:2 – 1:3", "count": 0, "pct": 0.0, "note": "Target range"},
        {"label": "> 1:3",     "count": 0, "pct": 0.0, "note": "Outlier winners"},
    ]


def compute_monthly(trades: list) -> list:
    """
    Build the month-by-month drawdown timeline.
    Returns the monthly list matching the output schema above.
    """
    # TODO: implement
    return []
