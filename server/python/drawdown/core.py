"""
drawdown/core.py
Orchestrator — calls all sub-modules and assembles the result dict.
"""
from __future__ import annotations

from .metrics      import compute_metrics
from .heatmap      import compute_heatmap
from .frequency    import compute_frequency
from .structural   import compute_structural
from .sessions     import compute_sessions
from .streaks      import compute_streaks
from .distribution import compute_rr_buckets, compute_monthly


def compute_drawdown(trades: list, starting_balance: float) -> dict:
    """
    Main orchestrator. Calls all sub-modules and returns a single merged dict
    that maps 1-to-1 with DrawdownPanel.tsx data shape.

    Output keys:
      topStats    → header KPIs (maxDrawdown, avgDrawdown, recoveryFactor, trendAlignment)
      heatmap     → pair × strategy loss matrix
      frequency   → attr and instr loss frequency groups
      structural  → context and entry SMC diagnostics
      sessions    → per-session breakdown
      streaks     → loss/win streaks + revenge rate + timeline
      rrBuckets   → R:R distribution (4 buckets)
      monthly     → month-by-month drawdown timeline
    """
    if not trades:
        return {
            "topStats":   {"maxDrawdown": 0.0, "avgDrawdown": 0.0, "recoveryFactor": 0.0, "trendAlignment": 0.0},
            "heatmap":    [],
            "frequency":  {"attr": [], "instr": []},
            "structural": {"context": [], "entry": []},
            "sessions":   [],
            "streaks":    {"maxLossStreak": {"length": 0, "startDate": None, "endDate": None},
                           "avgLossStreak": 0.0, "revengeRate": 0.0,
                           "bestWinStreak": {"length": 0, "startDate": None, "endDate": None},
                           "timeline": []},
            "rrBuckets":  [],
            "monthly":    [],
        }

    sb = float(starting_balance) if starting_balance else 10_000.0

    top_stats  = compute_metrics(trades, sb)
    heatmap    = compute_heatmap(trades)
    frequency  = compute_frequency(trades)
    structural = compute_structural(trades)
    sessions   = compute_sessions(trades)
    streaks    = compute_streaks(trades)
    rr_buckets = compute_rr_buckets(trades)
    monthly    = compute_monthly(trades)

    return {
        "topStats":   top_stats,
        "heatmap":    heatmap,
        "frequency":  frequency,
        "structural": structural,
        "sessions":   sessions,
        "streaks":    streaks,
        "rrBuckets":  rr_buckets,
        "monthly":    monthly,
    }
