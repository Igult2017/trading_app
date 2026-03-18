"""
tf_metrics/core.py
Orchestrator for all timeframe metrics calculations.
"""
from __future__ import annotations

from .grouping     import group_by_timeframe, sorted_timeframes
from .per_tf_stats import compute_per_tf_stats
from .breakdowns   import compute_breakdowns
from .equity       import compute_equity_curve
from .summary      import compute_summary


def compute_tf_metrics(trades: list, starting_balance: float) -> dict:
    """
    Main orchestrator. Returns a fully merged dict ready for JSON serialisation.

    Output shape (matches TFMetricsResult in tfMetricsCalculator.ts):
    {
      "timeframes":  ["M15", "H1", "H4", ...],   # sorted M1→W1
      "byTimeframe": {
        "H1": {
          # per_tf_stats
          "trades", "wins", "losses", "winRate", "avgRR",
          "profitFactor", "netPnl", "avgWin", "avgLoss",
          "expectancy", "avgEntryQuality",
          # equity
          "equityCurve": [float, ...],
          # breakdowns
          "bestInstrument", "worstInstrument",
          "byInstrument", "byDirection", "bySession"
        },
        ...
      },
      "summary": {
        "bestTimeframe", "worstTimeframe", "mostTradedTimeframe",
        "htfBiasAlignmentRate", "mtfConfluenceWinBoost"
      }
    }
    """
    if not trades:
        return {
            "timeframes": [],
            "byTimeframe": {},
            "summary": {
                "bestTimeframe":         "N/A",
                "worstTimeframe":        "N/A",
                "mostTradedTimeframe":   "N/A",
                "htfBiasAlignmentRate":  0.0,
                "mtfConfluenceWinBoost": 0.0,
            },
        }

    sb = float(starting_balance) if starting_balance else 10_000.0

    # 1. Group all trades by their entry timeframe
    groups = group_by_timeframe(trades)

    # 2. For each TF group, compute and merge all sub-module outputs
    by_tf: dict[str, dict] = {}

    for tf, group in groups.items():
        stats      = compute_per_tf_stats(group)
        breakdowns = compute_breakdowns(group)
        equity     = compute_equity_curve(group, sb)

        by_tf[tf] = {
            **stats,
            **breakdowns,
            "equityCurve": equity,
        }

    # 3. Cross-TF summary (needs raw trades for htfBias / confluence scan)
    summary = compute_summary(by_tf, trades)

    return {
        "timeframes":  sorted_timeframes(list(groups.keys())),
        "byTimeframe": by_tf,
        "summary":     summary,
    }
