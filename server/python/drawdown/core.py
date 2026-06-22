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
from .intelligence import compute_intelligence
from .risk_model   import compute_risk_model
from .montecarlo   import compute_montecarlo
from .recovery     import compute_recovery
from ._utils       import get_pnl, get_pnl_pct, sort_by_date


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
        has_pct = t.get("pnlPercent") is not None or t.get("pnl_percent") is not None
        pl = get_pnl(t)
        if not has_pct:
            t["_pnlPct"] = round(pl / bal * 100, 4) if (pl is not None and bal > 0) else None
        # Advance the running balance for EVERY trade so later %-denominators stay
        # correct in mixed pnl/pct journals (previously only pct-less trades advanced
        # it, drifting the denominator after any explicit-pct trade).
        if pl is not None:
            bal += pl
        else:
            pct = get_pnl_pct(t)
            if pct is not None and bal > 0:
                bal *= (1 + pct / 100)


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
            "intelligence": {
                "current":      {"ddPct": 0.0, "inDrawdown": False, "tradesSincePeak": 0,
                                 "daysSincePeak": None, "peakEquity": 0.0, "currentEquity": 0.0},
                "underwater":   {"longestTrades": 0, "longestDays": 0, "avgRecoveryTrades": 0.0,
                                 "currentUnderwaterTrades": 0, "episodes": 0},
                "series":       [],
                "byStrategy":   [],
                "byInstrument": [],
                "byDirection":  {"bullish": {"byStrategy": [], "byInstrument": []},
                                 "bearish": {"byStrategy": [], "byInstrument": []}},
            },
            "riskModel": {"winRate": 0.0, "payoff": 0.0, "kellyPct": 0.0,
                          "expectedMaxLossStreak": 0, "actualMaxLossStreak": 0, "streakWithinExpectation": True,
                          "mae": {"hasData": False, "avgWinnerMae": 0.0, "avgLoserMae": 0.0, "ratio": 0.0, "count": 0}},
            "monteCarlo": {"hasData": False, "runs": 0, "actualMaxDd": 0.0, "expectedMaxDd": 0.0,
                           "worstCase95": 0.0, "worstCase99": 0.0, "actualPercentile": 0.0,
                           "riskOfRuinPct": 0.0, "ruinThreshold": -50.0, "breach20Pct": 0.0},
            "recovery": {"hasData": False, "underwaterAvgSize": 0.0, "baselineAvgSize": 0.0,
                         "sizeRatio": 0.0, "underwaterCount": 0, "baselineCount": 0, "verdict": ""},
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
    intelligence = compute_intelligence(trades, sb)
    risk_model   = compute_risk_model(trades)
    monte_carlo  = compute_montecarlo(trades, sb)
    recovery     = compute_recovery(trades, sb)

    return {
        "topStats":   top_stats,
        "heatmap":    heatmap,
        "frequency":  frequency,
        "structural": structural,
        "sessions":   sessions,
        "streaks":    streaks,
        "rrBuckets":  rr_buckets,
        "monthly":    monthly,
        "intelligence": intelligence,
        "riskModel":  risk_model,
        "monteCarlo": monte_carlo,
        "recovery":   recovery,
    }
