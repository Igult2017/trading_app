"""
tf_metrics/core.py
────────────────────────────────────────────────────────────────────────────
Orchestrator for all timeframe metrics calculations.

Responsibility:
  - Accept trade records and a starting balance.
  - Call every sub-module in the correct order and assemble a single result
    dict that maps 1-to-1 with the shape expected by TFMetricsPanel.tsx.

Expected output (returned as dict, serialised to JSON by main.py):
  {
    "timeframes":   [str],          # sorted list of TFs found in the data
    "byTimeframe":  { TF: {...} },  # from per_tf_stats.py + breakdowns.py + equity.py
    "summary":      { ... }         # from summary.py
  }

Sub-modules called:
  grouping.py       → group_by_timeframe(trades) → dict[tf, list[trade]]
  per_tf_stats.py   → compute_per_tf_stats(group) → base stats per TF
  breakdowns.py     → compute_breakdowns(group) → instrument/direction/session splits
  equity.py         → compute_equity_curve(group, starting_balance) → equity curve
  summary.py        → compute_summary(by_tf_dict) → cross-TF summary stats

TODO — implement compute_tf_metrics(trades, starting_balance):
  1. Call grouping.group_by_timeframe(trades)
  2. For each TF group call per_tf_stats, breakdowns, equity and merge
  3. Call summary.compute_summary on the fully assembled byTimeframe dict
  4. Return the complete result dict
"""

from .grouping      import group_by_timeframe
from .per_tf_stats  import compute_per_tf_stats
from .breakdowns    import compute_breakdowns
from .equity        import compute_equity_curve
from .summary       import compute_summary


def compute_tf_metrics(trades: list, starting_balance: float) -> dict:
    """
    Main orchestrator. Returns a fully merged dict ready for JSON serialisation.
    """
    # TODO: implement
    # groups     = group_by_timeframe(trades)
    # by_tf      = {}
    # for tf, group in groups.items():
    #     stats      = compute_per_tf_stats(group)
    #     breakdowns = compute_breakdowns(group)
    #     equity     = compute_equity_curve(group, starting_balance)
    #     by_tf[tf]  = { **stats, **breakdowns, "equityCurve": equity }
    # summary = compute_summary(by_tf, trades)
    # return { "timeframes": sorted(groups.keys()), "byTimeframe": by_tf, "summary": summary }
    return {"timeframes": [], "byTimeframe": {}, "summary": {}}
