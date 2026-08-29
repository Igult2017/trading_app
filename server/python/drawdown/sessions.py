"""
drawdown/sessions.py
Drawdown breakdown by trading session.
"""
from __future__ import annotations
from collections import defaultdict
from ._utils import (
    get_session, get_outcome, get_pnl_pct,
    get_instrument, safe_mean
)


def compute_sessions(trades: list) -> list:
    """
    Compute per-session drawdown statistics.
    Sessions with zero trades are omitted.
    Output sorted by avgDdPct ascending (worst session first).
    """
    if not trades:
        return []

    # Group by session
    session_groups: dict[str, list] = defaultdict(list)
    for t in trades:
        session = get_session(t)
        session_groups[session].append(t)

    result = []
    for session, group in session_groups.items():
        if not group:
            continue

        total  = len(group)
        losses = [t for t in group if get_outcome(t) == "loss"]
        loss_count = len(losses)

        loss_pcts = [
            p for t in losses
            for p in [get_pnl_pct(t)]
            if p is not None
        ]
        avg_dd = round(safe_mean(loss_pcts), 2) if loss_pcts else 0.0
        loss_rate = round(loss_count / total * 100, 1) if total > 0 else 0.0
        bar_width = f"{round(loss_rate)}%"

        # Worst pair: instrument with most negative avg pnl_pct among losses
        instr_groups: dict[str, list] = defaultdict(list)
        for t in losses:
            instr = get_instrument(t)
            pct   = get_pnl_pct(t)
            if pct is not None:
                instr_groups[instr].append(pct)

        worst_pair = "N/A"
        worst_dd   = 0.0
        if instr_groups:
            # TIE-BREAK BY NAME (2026-08-29). Two instruments on an identical average is common, and
            # `min` keeps whichever it met first — so the page could name a different "worst pair"
            # from the very same trades, purely because they arrived in a different order.
            worst_pair = min(instr_groups, key=lambda k: (safe_mean(instr_groups[k]), k))
            worst_dd   = round(safe_mean(instr_groups[worst_pair]), 2)

        result.append({
            "session":    session,
            "avgDdPct":   avg_dd,
            "total":      total,
            "losses":     loss_count,
            "lossRate":   loss_rate,
            "barWidthPct": loss_rate,   # frontend uses this as CSS width %
            "worstPair":  worst_pair,
            "worstDdPct": worst_dd,
        })

    # Sort: worst session (most negative avgDdPct) first, then by name so an exact tie cannot
    # swap places depending on the order the trades happened to arrive in.
    result.sort(key=lambda x: (x["avgDdPct"], x["session"]))
    return result
