"""
drawdown_metrics.py
───────────────────
Core summary statistics for the drawdown intelligence page.

Responsibility:
  Compute the four headline KPIs shown in the DrawdownPanel header banner:
    1. Max Drawdown      — largest peak-to-trough equity decline (%)
    2. Avg. Drawdown     — average of all individual drawdown episodes (%)
    3. Recovery Factor   — net profit divided by max drawdown (dimensionless)
    4. Trend Alignment   — % of trades taken in the direction of the HTF bias

All calculations are performed on the list of trade dicts produced by
drawdown_core.py after applying any active filters.

Input:
  trades: list[dict]   — filtered trade records (see drawdown_core.py schema)
  account_balance: float — starting account balance for the period

Output (returned as dict, merged into top-level payload by drawdown_core.py):
  {
    "max_drawdown":      float,   # e.g. -8.42  (percentage, negative)
    "avg_drawdown":      float,   # e.g. -1.25
    "recovery_factor":   float,   # e.g.  3.8
    "trend_alignment":   float    # e.g. 76.0  (percentage, 0–100)
  }

Calculation notes:
  - Max Drawdown:
      Build a running equity curve from cumulative pnl_pct values.
      For each point on the curve find the preceding peak; the drawdown at
      that point is (current_equity - peak) / peak * 100.
      Max Drawdown = minimum value across all drawdown points.

  - Avg. Drawdown:
      Identify separate drawdown episodes (periods where equity stays below
      the previous peak).  Avg Drawdown = mean of the deepest point of each
      episode.

  - Recovery Factor:
      total_net_pnl_pct / abs(max_drawdown).
      A value > 1 means the account has more than recovered its worst loss.

  - Trend Alignment:
      Count trades where htf_bias == "with_trend" divided by total trades.
"""


def compute_metrics(trades: list, account_balance: float) -> dict:
    """
    Compute the four headline KPIs.
    Returns a dict matching the output schema above.
    """
    pass
