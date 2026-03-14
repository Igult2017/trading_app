"""
drawdown_heatmap.py
───────────────────
Pair × Strategy loss-intensity heatmap data.

Responsibility:
  Build a 2-D matrix where rows = instruments (e.g. EURUSD, XAUUSD) and
  columns = strategies (e.g. Trend, Range, Break, Scalp, News).
  Each cell contains the aggregated loss data for that combination so the
  frontend can colour-code it by loss severity.

Input:
  trades: list[dict]  — filtered trade records (see drawdown_core.py schema)

Output (returned as list, stored under "heatmap" key by drawdown_core.py):
  [
    {
      "pair": "EURUSD",
      "cells": [
        {
          "strategy":    "Trend",
          "avg_dd_pct":  -2.3,   # average drawdown contribution (negative %)
          "total":       18,     # total trades in this cell
          "losses":      7,      # number of losing trades
          "loss_rate":   38.9    # losses / total * 100
        },
        ...   # one entry per strategy column
      ]
    },
    ...  # one entry per instrument row
  ]

Calculation notes:
  - Group trades by (instrument, strategy).
  - For each group compute:
      avg_dd_pct  = mean of pnl_pct for losing trades only (will be negative)
      total       = len(group)
      losses      = count where outcome == "loss"
      loss_rate   = losses / total * 100
  - Rows with zero trades for all strategies are still included so the
    frontend grid remains rectangular; use zeroes for empty cells.
  - Instruments and strategies lists should be driven by what is actually
    present in the trade data, not hard-coded, so the heatmap grows
    automatically as new instruments/strategies are used.
"""


def compute_heatmap(trades: list) -> list:
    """
    Build the pair × strategy loss matrix.
    Returns a list matching the output schema above.
    """
    pass
