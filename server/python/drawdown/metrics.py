"""
drawdown/metrics.py
────────────────────────────────────────────────────────────────────────────
Core summary KPIs for the DrawdownPanel header banner.

Responsibility:
  Compute the four headline stats shown at the top of DrawdownPanel:
    1. Max Drawdown    — largest peak-to-trough equity decline (%)
    2. Avg. Drawdown   — mean depth of all individual drawdown episodes (%)
    3. Recovery Factor — net profit / abs(max drawdown)
    4. Trend Alignment — % of trades taken in the HTF bias direction

Input:
  trades:           list[dict]  — trade records (see core.py for field schema)
  starting_balance: float       — account starting balance for equity curve

Output (returned as dict, stored under "topStats" by core.py):
  {
    "maxDrawdown":     float,   # e.g. -8.42  (negative %)
    "avgDrawdown":     float,   # e.g. -1.25  (negative %)
    "recoveryFactor":  float,   # e.g.  3.8
    "trendAlignment":  float    # e.g. 76.0  (0–100)
  }

Calculation notes:
  Max Drawdown:
    Build a running equity curve from cumulative pnl_pct values starting at
    starting_balance. At each point: drawdown = (equity - peak) / peak * 100.
    Max Drawdown = min of all drawdown values.

  Avg Drawdown:
    Identify contiguous drawdown episodes (equity stays below the last peak).
    Avg Drawdown = mean of the deepest point within each episode.

  Recovery Factor:
    total_net_pnl_pct / abs(max_drawdown).
    Returns 0 if max_drawdown == 0.

  Trend Alignment:
    Trades where the "htfBias" field equals "with_trend" divided by total trades.
    If the field is absent on a trade, that trade is excluded from the denominator.

TODO — implement compute_metrics(trades, starting_balance):
  - Build cumulative equity curve
  - Walk the curve to find peak-to-trough episodes
  - Compute all four KPIs and return the dict
"""


def compute_metrics(trades: list, starting_balance: float) -> dict:
    """
    Compute the four headline KPIs.
    Returns a dict with keys: maxDrawdown, avgDrawdown, recoveryFactor, trendAlignment.
    """
    # TODO: implement
    return {
        "maxDrawdown":    0.0,
        "avgDrawdown":    0.0,
        "recoveryFactor": 0.0,
        "trendAlignment": 0.0,
    }
