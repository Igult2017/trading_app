"""
drawdown_distribution.py
────────────────────────
Risk:Reward distribution buckets and month-by-month drawdown timeline.

Responsibility:
  Two separate datasets that are displayed in the bottom half of DrawdownPanel:

  1. RR Distribution  — classifies every closed trade into four R:R buckets
     and counts how many trades fall in each.  Powers the "RR Distribution"
     card.

  2. Monthly Drawdown — for each calendar month in the selected date range,
     compute the peak drawdown, recovery percentage, dominant loss cause,
     average RR achieved, and the single largest losing trade.  Powers the
     "Monthly Drawdown · FY 2025" timeline row.

Input:
  trades: list[dict]  — filtered trade records (see drawdown_core.py schema)

Output (returned as dict, stored at root level by drawdown_core.py as
"rr_buckets" and "monthly"):
  {
    "rr_buckets": [
      {
        "label":   "< 1:1",
        "count":   48,
        "pct":     26.1,       # percentage of total trades in this bucket
        "note":    "Underperforming"
      },
      {
        "label":   "1:1 – 1:2",
        "count":   72,
        "pct":     39.1,
        "note":    "Break-even"
      },
      {
        "label":   "1:2 – 1:3",
        "count":   44,
        "pct":     23.9,
        "note":    "Target range"
      },
      {
        "label":   "> 1:3",
        "count":   20,
        "pct":     10.9,
        "note":    "Outlier winners"
      }
    ],
    "monthly": [
      {
        "month":         "Jan",      # 3-letter abbreviation
        "year":          2025,
        "max_dd_pct":    -2.1,       # deepest drawdown point during the month
        "recovery_pct":  90.0,       # how much of the DD was recovered by month-end
        "dominant_cause": "HTF OB Failed",  # most common loss tag/flag for the month
        "dominant_cause_class": "bad",      # "bad" | "ok" | "good" for colour coding
        "avg_rr":        "1:1.8",    # mean rr_achieved across all trades that month
        "biggest_loss_pct": -0.8,    # pnl_pct of the single worst trade
        "total_trades":  142,
        "loss_count":    42
      },
      ...
    ]
  }

Calculation notes:
  RR buckets:
    - Use the rr_achieved field of each trade (all outcomes, not just wins).
    - Bucket boundaries: < 1.0, 1.0–2.0, 2.0–3.0, > 3.0.
    - pct = count / total_trades * 100, rounded to 1 decimal place.
    - primary_driver note: append a text note to the output identifying the
      bucket that contains the most trades, e.g.
      "65% of trades fall below target RR — primary drawdown driver"

  Monthly timeline:
    - Group trades by calendar month of entry_time.
    - max_dd_pct: build a mini equity curve for the month and find the deepest
      drawdown within it.
    - recovery_pct: (month-end equity - month's trough) / abs(month's trough) * 100,
      capped at 100%.
    - dominant_cause: count all tags and flags (ob_valid False → "HTF OB Failed",
      choch_valid False → "CHOCH Failed", htf_bias counter_trend → "Counter-Trend",
      entry_type premature → "Premature BOS", plus any free-text tags) and return
      the most frequent one.
    - dominant_cause_class:
        "bad"  if dominant cause is a structural error (OB, CHoCH, premature)
        "ok"   if it is marginal (SL placement, timing)
        "good" if it is execution excellence (Confirmed Entry, Calm Execution)
    - avg_rr: format as "1:{ratio}" where ratio = mean(rr_achieved), rounded to 1dp.
    - Sort months chronologically.
"""


def compute_rr_buckets(trades: list) -> list:
    """
    Classify trades into R:R buckets.
    Returns the "rr_buckets" list matching the output schema above.
    """
    pass


def compute_monthly(trades: list) -> list:
    """
    Build the month-by-month drawdown timeline.
    Returns the "monthly" list matching the output schema above.
    """
    pass
