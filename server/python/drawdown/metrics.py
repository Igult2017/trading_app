"""
drawdown/metrics.py
Four headline KPIs: maxDrawdown, avgDrawdown, recoveryFactor, trendAlignment.
"""
from __future__ import annotations
from ._utils import (
    get_pnl, get_pnl_pct, get_outcome, sort_by_date,
    blob_field, safe_mean, _f
)


def compute_metrics(trades: list, starting_balance: float) -> dict:
    """
    Compute the four headline KPIs for the DrawdownPanel header.

    maxDrawdown:    most negative peak-to-trough equity % decline
    avgDrawdown:    mean depth of all individual drawdown episodes
    recoveryFactor: net_pnl_pct / abs(maxDrawdown)
    trendAlignment: % of trades marked "Trend Alignment: Yes" (manualFields.trendAlignment)
    """
    empty = {"maxDrawdown": 0.0, "avgDrawdown": 0.0,
             "recoveryFactor": 0.0, "trendAlignment": 0.0}

    if not trades:
        return empty

    sb = float(starting_balance) if starting_balance else 10_000.0
    sorted_trades = sort_by_date(trades)

    # ── Build equity curve (pnl-based, fall back to pct-based) ───────────────
    balance = sb
    equity: list[float] = []
    for t in sorted_trades:
        pl = get_pnl(t)
        if pl is not None:
            balance += pl
        else:
            pct = get_pnl_pct(t)
            if pct is not None:
                balance = balance * (1 + pct / 100)
        equity.append(balance)

    if not equity:
        return empty

    # ── Max drawdown and episodes ─────────────────────────────────────────────
    # Peak starts at the session starting balance — NOT equity[0] — so that
    # a loss on the very first trade is correctly counted as a drawdown episode.
    peak = sb
    max_dd = 0.0
    episode_depths: list[float] = []
    in_dd = False
    episode_low = 0.0

    for val in equity:
        if val > peak:
            if in_dd:
                episode_depths.append(episode_low)
                in_dd = False
            peak = val
        if peak > 0:
            dd = (val - peak) / peak * 100  # negative
            if dd < 0:
                if not in_dd:
                    in_dd = True
                    episode_low = dd
                else:
                    episode_low = min(episode_low, dd)
                if dd < max_dd:
                    max_dd = dd

    if in_dd:
        episode_depths.append(episode_low)

    avg_dd = safe_mean(episode_depths) if episode_depths else 0.0

    # ── Recovery factor ───────────────────────────────────────────────────────
    net_pnl = equity[-1] - sb
    net_pnl_pct = (net_pnl / sb * 100) if sb > 0 else 0.0
    recovery_factor = (net_pnl_pct / abs(max_dd)) if abs(max_dd) > 0.001 else 0.0

    # ── Trend alignment ───────────────────────────────────────────────────────
    # Trend alignment = % of trades the journal explicitly marked as trend-aligned
    # (the "Trend Alignment: Yes/No" field, stored in manualFields). The old version
    # derived this from htfBias (Bull/Bear/Range) and only matched "bull", so it was
    # really "% of bullish-bias trades" — not trend alignment at all.
    ALIGNED_YES = frozenset({"yes", "y", "true", "1", "aligned", "with_trend", "with trend"})
    ALIGNED_NO  = frozenset({"no", "n", "false", "0", "counter_trend", "counter trend", "against"})
    align_total = 0
    align_yes   = 0
    for t in trades:
        raw = (
            t.get("trendAlignment") or t.get("trend_alignment") or
            blob_field(t, "trendAlignment") or blob_field(t, "trend_alignment")
        )
        if raw is None:
            continue
        s = str(raw).strip().lower()
        if s in ALIGNED_YES:
            align_total += 1
            align_yes   += 1
        elif s in ALIGNED_NO:
            align_total += 1
        # blank / unrecognised values are ignored (not in the denominator)

    trend_alignment = round(align_yes / align_total * 100, 1) if align_total > 0 else 0.0

    return {
        "maxDrawdown":    round(max_dd, 2),
        "avgDrawdown":    round(avg_dd, 2),
        "recoveryFactor": round(recovery_factor, 2),
        "trendAlignment": trend_alignment,
    }
