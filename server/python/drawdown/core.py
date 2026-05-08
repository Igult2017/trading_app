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
from ._utils       import get_pnl, sort_by_date


def _annotate_pnl_pct(trades: list, starting_balance: float) -> None:
    """
    Pre-compute _pnlPct for every trade that lacks an explicit pnlPercent.
    Uses a running balance so each trade's % is relative to the equity at
    the time it was taken — the correct denominator for drawdown analysis.
    Mutates in place; sub-modules read this via get_pnl_pct().
    """
    sb = float(starting_balance) if starting_balance else 10_000.0
    bal = sb
    for t in sort_by_date(trades):
        if t.get("pnlPercent") is None and t.get("pnl_percent") is None:
            pl = get_pnl(t)
            if pl is not None and bal > 0:
                t["_pnlPct"] = round(pl / bal * 100, 4)
                bal += pl
            else:
                t["_pnlPct"] = None


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

    # Annotate each trade with _pnlPct so sub-modules get real % values
    # even when the journal entry has no explicit pnlPercent field.
    _annotate_pnl_pct(trades, sb)

    top_stats  = compute_metrics(trades, sb)
    heatmap    = compute_heatmap(trades)
    frequency  = compute_frequency(trades)
    structural = compute_structural(trades)
    sessions   = compute_sessions(trades)
    streaks    = compute_streaks(trades)
    rr_buckets = compute_rr_buckets(trades)
    monthly    = compute_monthly(trades, sb)

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
