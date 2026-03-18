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
    trendAlignment: % of trades where htfBias == "with_trend"
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
    peak = equity[0]
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
    WITH_TREND = frozenset({
        "with_trend", "with trend", "aligned", "bullish",
        "bearish_short", "long", "buy", "bull", "yes", "true", "1",
    })
    htf_total = 0
    htf_aligned = 0
    for t in trades:
        bias = (
            t.get("htfBias") or t.get("htf_bias") or
            blob_field(t, "htf_bias") or blob_field(t, "htfBias")
        )
        if bias is not None:
            htf_total += 1
            if str(bias).lower().strip() in WITH_TREND:
                htf_aligned += 1

    trend_alignment = round(htf_aligned / htf_total * 100, 1) if htf_total > 0 else 0.0

    return {
        "maxDrawdown":    round(max_dd, 2),
        "avgDrawdown":    round(avg_dd, 2),
        "recoveryFactor": round(recovery_factor, 2),
        "trendAlignment": trend_alignment,
    }
