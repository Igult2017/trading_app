"""
drawdown/intelligence.py
─────────────────────────────────────────────────────────────────────────────
The "live drawdown intelligence" layer:
  • current   — are you in a drawdown RIGHT NOW? depth + trades/days since the
                last equity peak.
  • underwater— how LONG drawdowns last: longest underwater stretch (trades/days),
                average recovery, current underwater length.
  • series    — per-trade underwater % (≤0), for the underwater sparkline.
  • byStrategy / byInstrument — which group drags equity the most.

Pure, never raises. Reuses the same equity-curve logic as metrics.py.
"""
from __future__ import annotations
from ._utils import (
    get_pnl, get_pnl_pct, get_trade_dt, sort_by_date,
    get_strategy, get_instrument, get_direction, safe_mean,
)

_EMPTY_DIR = {"byStrategy": [], "byInstrument": []}
_EMPTY = {
    "current":      {"ddPct": 0.0, "inDrawdown": False, "tradesSincePeak": 0,
                     "daysSincePeak": None, "peakEquity": 0.0, "currentEquity": 0.0},
    "underwater":   {"longestTrades": 0, "longestDays": 0, "avgRecoveryTrades": 0.0,
                     "currentUnderwaterTrades": 0, "episodes": 0},
    "series":       [],
    "byStrategy":   [],
    "byInstrument": [],
    "byDirection":  {"bullish": dict(_EMPTY_DIR), "bearish": dict(_EMPTY_DIR)},
}


def _group_drawdown(trades: list, key_fn) -> list:
    """Per-group loss contribution: total negative %-PnL, loss rate, trade count.
    Sorted worst (most negative) first; capped at 8 rows."""
    groups: dict = {}
    for t in trades:
        k = key_fn(t)
        g = groups.setdefault(k, {"name": k, "trades": 0, "losses": 0,
                                  "totalLossPct": 0.0, "netPct": 0.0})
        g["trades"] += 1
        pct = get_pnl_pct(t)
        if pct is not None:
            g["netPct"] += pct
            if pct < 0:
                g["totalLossPct"] += pct
        # Loss count: prefer monetary P&L; fall back to % so percentage-only journals
        # don't silently report 0 losses (get_pnl None → (None or 0) < 0 is always False).
        loss_val = get_pnl(t)
        if loss_val is None:
            loss_val = pct
        if (loss_val or 0) < 0:
            g["losses"] += 1
    out = []
    for g in groups.values():
        g["lossRate"]     = round(g["losses"] / g["trades"] * 100, 1) if g["trades"] else 0.0
        g["totalLossPct"] = round(g["totalLossPct"], 2)
        g["netPct"]       = round(g["netPct"], 2)
        out.append(g)
    out.sort(key=lambda x: x["totalLossPct"])   # most-negative first
    return out[:8]


def compute_intelligence(trades: list, starting_balance: float) -> dict:
    if not trades:
        return _EMPTY

    sb = float(starting_balance) if starting_balance else 10_000.0
    st = sort_by_date(trades)

    # Equity curve with per-trade dates (same construction as metrics.py).
    eqs: list = []
    dts: list = []
    bal = sb
    for t in st:
        pl = get_pnl(t)
        if pl is not None:
            bal += pl
        else:
            pct = get_pnl_pct(t)
            if pct is not None:
                bal = bal * (1 + pct / 100)
        eqs.append(bal)
        dts.append(get_trade_dt(t))

    n = len(eqs)
    # Peak anchored at starting balance (a first-trade loss is a real drawdown).
    peak = sb
    peak_idx = -1                       # -1 → peak is still the starting balance
    series: list = []
    episodes: list = []
    cur = None
    for i, eq in enumerate(eqs):
        if eq > peak:   # strict, to match metrics.py + metrics_calculator (a flat re-touch of the peak must not reset peak_idx / close the episode)
            peak = eq
            peak_idx = i
            if cur is not None:
                cur["recoveredIdx"] = i
                episodes.append(cur)
                cur = None
        dd = round((eq - peak) / peak * 100, 2) if peak > 0 else 0.0
        series.append(dd)
        if dd < 0:
            if cur is None:
                cur = {"startIdx": i, "low": dd, "troughIdx": i}
            elif dd < cur["low"]:
                cur["low"] = dd
                cur["troughIdx"] = i

    last_eq = eqs[-1]
    cur_dd  = round((last_eq - peak) / peak * 100, 2) if peak > 0 else 0.0
    in_dd   = cur_dd < -0.01
    trades_since_peak = (n - 1 - peak_idx) if peak_idx >= 0 else n
    last_dt = dts[-1]
    peak_dt = dts[peak_idx] if 0 <= peak_idx < n else None
    days_since_peak = (last_dt - peak_dt).days if (last_dt and peak_dt) else None

    # Underwater durations across all episodes (include the ongoing one).
    all_eps = episodes + ([cur] if cur is not None else [])
    longest_trades = 0
    longest_days   = 0
    recovery_trades: list = []
    for ep in all_eps:
        end_idx = ep.get("recoveredIdx", n - 1)
        longest_trades = max(longest_trades, end_idx - ep["startIdx"])
        sdt, edt = dts[ep["startIdx"]], dts[end_idx]
        if sdt and edt:
            longest_days = max(longest_days, (edt - sdt).days)
        if "recoveredIdx" in ep:
            recovery_trades.append(ep["recoveredIdx"] - ep["troughIdx"])
    cur_uw_trades = (n - 1 - cur["startIdx"]) if cur is not None else 0

    bull = [t for t in trades if get_direction(t) == "bullish"]
    bear = [t for t in trades if get_direction(t) == "bearish"]

    return {
        "current": {
            "ddPct": cur_dd, "inDrawdown": in_dd,
            "tradesSincePeak": trades_since_peak, "daysSincePeak": days_since_peak,
            "peakEquity": round(peak, 2), "currentEquity": round(last_eq, 2),
        },
        "underwater": {
            "longestTrades": longest_trades, "longestDays": longest_days,
            "avgRecoveryTrades": round(safe_mean(recovery_trades), 1) if recovery_trades else 0.0,
            "currentUnderwaterTrades": cur_uw_trades, "episodes": len(all_eps),
        },
        "series":       series,
        "byStrategy":   _group_drawdown(trades, get_strategy),
        "byInstrument": _group_drawdown(trades, get_instrument),
        # Same breakdowns split by trade direction (bullish=long/buy, bearish=short/sell).
        # Trades with no direction set are simply absent from both subsets.
        "byDirection": {
            "bullish": {
                "byStrategy":   _group_drawdown(bull, get_strategy),
                "byInstrument": _group_drawdown(bull, get_instrument),
            },
            "bearish": {
                "byStrategy":   _group_drawdown(bear, get_strategy),
                "byInstrument": _group_drawdown(bear, get_instrument),
            },
        },
    }
