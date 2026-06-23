"""
drawdown/recovery.py
─────────────────────────────────────────────────────────────────────────────
Recovery-pattern (behavioral) analysis. While you're underwater (equity below
your running peak), do you trade BIGGER (revenge-recovery) or smaller
(disciplined de-risking)? Compares average position size taken while underwater
vs at/above the peak. Pure, never raises.
"""
from __future__ import annotations
from ._utils import get_pnl, get_pnl_pct, sort_by_date, safe_mean, blob_field, _f

_EMPTY = {
    "hasData": False, "underwaterAvgSize": 0.0, "baselineAvgSize": 0.0,
    "sizeRatio": 0.0, "underwaterCount": 0, "baselineCount": 0, "verdict": "",
}


def _size(t):
    """Position size proxy: lotSize, else riskPercent (top-level then JSONB blobs, so
    blob-stored size isn't missed — Metrics reads lot_size/risk_percent blob-merged)."""
    return (_f(t.get("lotSize") or t.get("lot_size") or
               blob_field(t, "lotSize") or blob_field(t, "lot_size"))
            or _f(t.get("riskPercent") or t.get("risk_percent") or
                  blob_field(t, "riskPercent") or blob_field(t, "risk_percent")))


def compute_recovery(trades: list, starting_balance: float) -> dict:
    if not trades:
        return _EMPTY

    sb = float(starting_balance) if starting_balance else 10_000.0
    bal = sb
    peak = sb
    uw_sizes, base_sizes = [], []

    for t in sort_by_date(trades):
        # Classify by the equity state BEFORE this trade was entered.
        underwater = bal < peak - 1e-9
        sz = _size(t)
        if sz is not None and sz > 0:
            (uw_sizes if underwater else base_sizes).append(sz)
        pl = get_pnl(t)
        if pl is not None:
            bal += pl
        else:
            pct = get_pnl_pct(t)
            if pct is not None:
                bal *= (1 + pct / 100)
        if bal > peak:
            peak = bal

    if not uw_sizes or not base_sizes:
        return _EMPTY

    uw = safe_mean(uw_sizes)
    base = safe_mean(base_sizes)
    ratio = round(uw / base, 2) if base > 0 else 0.0
    if ratio >= 1.15:
        verdict = "increase"     # trades bigger underwater → revenge risk
    elif ratio <= 0.85:
        verdict = "reduce"       # de-risks underwater → disciplined
    else:
        verdict = "steady"

    return {
        "hasData": True,
        "underwaterAvgSize": round(uw, 2),
        "baselineAvgSize": round(base, 2),
        "sizeRatio": ratio,
        "underwaterCount": len(uw_sizes),
        "baselineCount": len(base_sizes),
        "verdict": verdict,
    }
