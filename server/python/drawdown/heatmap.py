"""
drawdown/heatmap.py
────────────────────────────────────────────────────────────────────────────
Pair × Strategy loss-intensity heatmap matrix.

Responsibility:
  Build a 2-D matrix where rows = trading instruments (e.g. EURUSD, XAUUSD)
  and columns = strategies (e.g. Trend, Range, Break, Scalp, News).
  Each cell contains aggregated loss data so DrawdownPanel can colour-code by
  loss severity.

Input:
  trades: list[dict]  — trade records (see core.py for field schema)

Output (returned as list, stored under "heatmap" by core.py):
  [
    {
      "pair": "EURUSD",
      "cells": [
        {
          "strategy":   "Trend",
          "avgDdPct":   -2.3,    # mean pnl_pct for losing trades in this cell
          "total":      18,
          "losses":     7,
          "lossRate":   38.9     # losses / total * 100
        },
        ...                      # one entry per strategy column
      ]
    },
    ...                          # one entry per instrument row
  ]

Calculation notes:
  - Dynamically discover instruments from trades["symbol"] and strategies
    from trades["strategy"] — do not hardcode either list.
  - Group trades by (symbol, strategy) pair.
  - For each group:
      avgDdPct = mean of profitLoss/profitLossPercent for losses only (negative)
      total    = len(group)
      losses   = count where outcome == "loss"
      lossRate = losses / total * 100
  - Empty cells (zero trades) should still appear in the matrix with zeros
    so the frontend grid stays rectangular.
  - Sort rows by total losses descending so the worst instruments appear first.

TODO — implement compute_heatmap(trades):
  - Extract unique instruments and strategies
  - Build (instrument, strategy) → trades grouping
  - For each cell compute the stats above
  - Assemble into the list-of-rows format and return
"""


def compute_heatmap(trades: list) -> list:
    """
    Build the pair × strategy loss intensity matrix.
    Returns a list of row dicts matching the output schema above.
    """
    # TODO: implement
    return []
