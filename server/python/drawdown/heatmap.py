"""
drawdown/heatmap.py
Dynamic pair × strategy loss-intensity heatmap matrix.
Rows and columns are discovered from actual trade data — nothing hardcoded.
"""
from __future__ import annotations
from collections import defaultdict
from ._utils import (
    get_instrument, get_strategy, get_outcome,
    get_pnl_pct, safe_mean
)


def compute_heatmap(trades: list) -> list:
    """
    Build the pair × strategy loss intensity matrix.

    Each cell: { strategy, avgDdPct, total, losses, lossRate }
    Rows sorted by total losses descending.
    Empty cells included with zeros so the frontend grid stays rectangular.
    """
    if not trades:
        return []

    # Discover all unique instruments and strategies dynamically
    instruments: list[str] = []
    strategies: list[str]  = []
    seen_instr: set[str]   = set()
    seen_strat: set[str]   = set()

    for t in trades:
        instr = get_instrument(t)
        strat = get_strategy(t)
        if instr not in seen_instr:
            instruments.append(instr)
            seen_instr.add(instr)
        if strat not in seen_strat:
            strategies.append(strat)
            seen_strat.add(strat)

    # Group trades by (instrument, strategy)
    # cell_data[instr][strat] = { total, losses, loss_pcts }
    cell_data: dict[str, dict[str, dict]] = {
        instr: {
            strat: {"total": 0, "losses": 0, "loss_pcts": []}
            for strat in strategies
        }
        for instr in instruments
    }

    for t in trades:
        instr   = get_instrument(t)
        strat   = get_strategy(t)
        outcome = get_outcome(t)
        pct     = get_pnl_pct(t)

        cell = cell_data[instr][strat]
        cell["total"] += 1
        if outcome == "loss":
            cell["losses"] += 1
            if pct is not None:
                cell["loss_pcts"].append(pct)

    # Build row dicts
    rows = []
    for instr in instruments:
        total_losses = sum(cell_data[instr][s]["losses"] for s in strategies)
        cells = []
        for strat in strategies:
            c       = cell_data[instr][strat]
            total   = c["total"]
            losses  = c["losses"]
            avg_dd  = round(safe_mean(c["loss_pcts"]), 2) if c["loss_pcts"] else 0.0
            lr      = round(losses / total * 100, 1) if total > 0 else 0.0
            cells.append({
                "strategy": strat,
                "avgDdPct": avg_dd,
                "total":    total,
                "losses":   losses,
                "lossRate": lr,
            })
        rows.append({
            "pair":         instr,
            "cells":        cells,
            "_totalLosses": total_losses,   # used for sort only
        })

    # Sort rows: worst instruments (most total losses) first
    rows.sort(key=lambda r: r["_totalLosses"], reverse=True)

    # Remove internal sort key before returning
    for r in rows:
        del r["_totalLosses"]

    return rows
