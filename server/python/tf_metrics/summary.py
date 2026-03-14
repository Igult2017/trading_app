"""
tf_metrics/summary.py
────────────────────────────────────────────────────────────────────────────
Cross-timeframe summary stats for the TFMetricsPanel header section.

Responsibility:
  Given the fully assembled byTimeframe dict (after per_tf_stats, breakdowns,
  and equity have been merged for every TF), derive the cross-TF headline
  stats that appear in the TFMetricsPanel summary bar at the top:
    - bestTimeframe          (TF with highest winRate, min 5 trades)
    - worstTimeframe         (TF with lowest winRate, min 5 trades)
    - mostTradedTimeframe    (TF with highest trade count)
    - htfBiasAlignmentRate   (% of trades taken in the HTF bias direction)
    - mtfConfluenceWinBoost  (win rate uplift when 2+ TF confluence exists)

Input:
  by_tf: dict[str, dict]  — the fully assembled byTimeframe dict from core.py
  trades: list[dict]      — all raw trades (needed for htfBias and confluence)

Output (returned as dict, stored under "summary" by core.py):
  {
    "bestTimeframe":         str,    # e.g. "H4"
    "worstTimeframe":        str,    # e.g. "M1"
    "mostTradedTimeframe":   str,    # e.g. "H1"
    "htfBiasAlignmentRate":  float,  # 0–100
    "mtfConfluenceWinBoost": float   # percentage point uplift, e.g. 12.4
  }

Calculation notes:
  - bestTimeframe / worstTimeframe: only consider TFs with >= 5 trades to
    avoid noise. Return "N/A" if no TF meets the threshold.
  - htfBiasAlignmentRate: count trades where htfBias == "with_trend" / total.
  - mtfConfluenceWinBoost:
      Multi-TF confluence trades: where the trade has confluenceScore >= 70
      (or where 2+ timeframe confirmations are noted in the tags).
      Boost = winRate(confluence trades) - winRate(all trades).
      Return 0.0 if insufficient data.

TODO — implement compute_summary(by_tf, trades):
  - Walk by_tf to find best/worst/most-traded TF
  - Walk raw trades for htfBias alignment rate
  - Compute mtfConfluenceWinBoost from confluenceScore field
  - Return the summary dict
"""


def compute_summary(by_tf: dict, trades: list) -> dict:
    """
    Compute cross-timeframe summary statistics.
    Returns a dict matching the output schema above.
    """
    # TODO: implement
    return {
        "bestTimeframe":         "N/A",
        "worstTimeframe":        "N/A",
        "mostTradedTimeframe":   "N/A",
        "htfBiasAlignmentRate":  0.0,
        "mtfConfluenceWinBoost": 0.0,
    }
