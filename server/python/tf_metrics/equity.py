"""
tf_metrics/equity.py
────────────────────────────────────────────────────────────────────────────
Equity curve computation for a single timeframe's trade group.

Responsibility:
  Given the trades for one timeframe (sorted chronologically), build a
  running equity curve starting from the provided starting_balance.
  This powers the mini sparkline chart inside each TF row in TFMetricsPanel.

Input:
  group:            list[dict]  — trades for one TF, sorted by tradeDate ASC
  starting_balance: float       — account balance at the start of the session

Output (returned as list[float], stored under "equityCurve" by core.py):
  [10000.0, 10240.0, 10108.0, 10392.0, ...]
  — one value per trade, representing the running account balance after
    applying that trade's P&L.

Calculation notes:
  - Sort trades by tradeDate (or entryTime) ascending before processing.
  - If profitLoss is available in account currency, add it directly to the
    running balance.
  - If only profitLossPercent is available, apply as:
      new_balance = current_balance * (1 + profitLossPercent / 100)
  - The first value in the returned list is the balance after trade 1
    (not the starting_balance itself).
  - If the group has 0 trades, return an empty list.
  - Round each equity value to 2 decimal places.

TODO — implement compute_equity_curve(group, starting_balance):
  - Sort group by date
  - Walk trades, apply P&L to running balance
  - Return list of running balance snapshots
"""


def compute_equity_curve(group: list, starting_balance: float) -> list:
    """
    Build a running equity curve for a single timeframe's trades.
    Returns a list of floats (one per trade, chronological order).
    """
    # TODO: implement
    return []
