"""
tf_metrics/per_tf_stats.py
────────────────────────────────────────────────────────────────────────────
Computes base performance statistics for a single timeframe's trade group.

Responsibility:
  Given the list of trades for one timeframe, produce the core KPIs that
  appear in TFMetricsPanel for that TF row:
    - wins, losses, winRate, avgRR, profitFactor, netPnl
    - avgWin, avgLoss, expectancy, avgEntryQuality

Input:
  group: list[dict]  — trades belonging to a single timeframe
                       (see core.py / schema.ts for field names)

Output (returned as dict, merged into byTimeframe[TF] by core.py):
  {
    "trades":         int,
    "wins":           int,
    "losses":         int,
    "winRate":        float,   # 0–100
    "avgRR":          float,   # mean riskRewardRatio on winning trades
    "profitFactor":   float,   # gross wins / gross losses (abs values)
    "netPnl":         float,   # sum of profitLoss across all trades in group
    "avgWin":         float,   # mean profitLoss of winning trades
    "avgLoss":        float,   # mean profitLoss of losing trades (negative)
    "expectancy":     float,   # (winRate/100 * avgWin) + (lossRate/100 * avgLoss)
    "avgEntryQuality":float    # mean confluenceScore if available, else 0
  }

Calculation notes:
  - winRate  = wins / total * 100
  - profitFactor = sum of positive profitLoss / abs(sum of negative profitLoss)
                   Returns 0 if there are no losses.
  - expectancy measures average expected value per trade in account currency.
  - avgEntryQuality uses the "confluenceScore" field (0–100). If absent, use 0.
  - All floats rounded to 2 decimal places before returning.

TODO — implement compute_per_tf_stats(group):
  - Count wins, losses, breakevens
  - Compute profitFactor from gross P&L sums
  - Compute expectancy from winRate × avgWin and lossRate × avgLoss
  - Return the stats dict above
"""


def compute_per_tf_stats(group: list) -> dict:
    """
    Compute base KPIs for a single timeframe group.
    Returns a dict matching the output schema above.
    """
    # TODO: implement
    return {
        "trades":          len(group),
        "wins":            0,
        "losses":          0,
        "winRate":         0.0,
        "avgRR":           0.0,
        "profitFactor":    0.0,
        "netPnl":          0.0,
        "avgWin":          0.0,
        "avgLoss":         0.0,
        "expectancy":      0.0,
        "avgEntryQuality": 0.0,
    }
