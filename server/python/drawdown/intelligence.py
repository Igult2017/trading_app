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
    equity_curve, get_outcome, get_pnl, get_pnl_pct, get_trade_dt,
    get_strategy, get_instrument, get_direction, safe_mean,
)

# Reuse the Metrics page's EXACT trade parser so the strategy / instrument / direction
# breakdowns below group IDENTICALLY to the Metrics page (real strategy from
# strategyVersionId, normalised instrument, long/short direction, win/loss outcome).
# Guarded import: if it ever fails we fall back to the _utils extractors (which already
# mirror the same logic).
import os as _os, sys as _sys
try:
    _sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
    from metrics_calculator import normalise_trade as _metrics_normalise
except Exception:
    _metrics_normalise = None

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
        g = groups.setdefault(k, {"name": k, "trades": 0, "losses": 0, "wins": 0,
                                  "breakevens": 0, "totalLossPct": 0.0, "netPct": 0.0})
        g["trades"] += 1
        # wins / breakevens carried so the row shows a coloured W/L/B split rather than the old
        # "8L" letter notation (2026-08-29).
        _oc = get_outcome(t)
        if _oc == "win":
            g["wins"] += 1
        elif _oc == "breakeven":
            g["breakevens"] += 1
        pct = get_pnl_pct(t)
        if pct is not None:
            g["netPct"] += pct
            if pct < 0:
                g["totalLossPct"] += pct
        # LOSSES COME FROM THE LABEL, like wins and breakevens two lines up. They used to come
        # from the P&L SIGN alone, which is a second definition of "loss" inside one function —
        # and a break-even is almost always a few cents down once commission is taken out, so
        # every one of them was counted TWICE: once as a breakeven, once as a loss.
        #
        # Measured on the real function, 2026-09-05, with one win, one loss and one break-even
        # closing at -0.40: wins 1, breakevens 1, losses 2 — four outcomes from three trades,
        # and a loss rate of 66.7% where one trade in three actually lost. That is what inflates
        # the "N trades · X% loss" line he asked about.
        #
        # THE P&L FALLBACK IS KEPT, because it was there for a real reason: a percentage-only
        # journal carries no monetary P&L and no outcome label, and without this it would report
        # zero losses for ever. It now applies ONLY when there is no label to trust.
        if _oc == "loss":
            g["losses"] += 1
        elif _oc == "":
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
    # Tie-break by name so two rows on an identical value cannot swap places depending on the
    # order the trades happened to arrive in (2026-08-29).
    out.sort(key=lambda x: (x["totalLossPct"], x["name"]))   # most-negative first
    return out[:8]


def _group_metrics(records: list, attr: str, sb: float) -> list:
    """Loss-contribution breakdown over Metrics-normalised TradeRecords, so the grouping
    key (strategy / instrument) and win/loss are IDENTICAL to the Metrics page. % uses
    the fixed starting-balance denominator (pnl/sb), matching Metrics' returns. Empty
    strategy → 'Unclassified' (as Metrics); empty instrument → skipped (as Metrics)."""
    groups: dict = {}
    for r in records:
        k = getattr(r, attr, None)
        if not k:
            if attr == "strategy":
                k = "Unclassified"
            else:
                continue   # Metrics omits trades with no instrument
        g = groups.setdefault(k, {"name": k, "trades": 0, "losses": 0, "wins": 0,
                                  "breakevens": 0, "totalLossPct": 0.0, "netPct": 0.0})
        g["trades"] += 1
        if r.outcome == "win":
            g["wins"] += 1
        elif r.outcome == "breakeven":
            g["breakevens"] += 1
        pnl = r.pnl
        if pnl is not None and sb > 0:
            pct = pnl / sb * 100
            g["netPct"] += pct
            if pnl < 0:
                g["totalLossPct"] += pct
        if r.outcome == "loss":
            g["losses"] += 1
    out = []
    for g in groups.values():
        g["lossRate"]     = round(g["losses"] / g["trades"] * 100, 1) if g["trades"] else 0.0
        g["totalLossPct"] = round(g["totalLossPct"], 2)
        g["netPct"]       = round(g["netPct"], 2)
        out.append(g)
    # Tie-break by name so two rows on an identical value cannot swap places depending on the
    # order the trades happened to arrive in (2026-08-29). This is the list the panel actually
    # shows — the sibling `_group_drawdown` above is only the fallback when the Metrics parser
    # is unavailable, and BOTH needed it.
    out.sort(key=lambda x: (x["totalLossPct"], x["name"]))
    return out[:8]


def compute_intelligence(trades: list, starting_balance: float) -> dict:
    if not trades:
        return _EMPTY

    sb = float(starting_balance) if starting_balance else 10_000.0

    # The equity curve comes from `_utils` — the ONE definition this page shares (2026-08-29). It
    # returns the sorted trades alongside the balances, so the dates line up with the curve without
    # sorting a second time and risking a different order.
    st, eqs = equity_curve(trades, sb)
    dts: list = [get_trade_dt(t) for t in st]

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

    # ── Strategy / instrument / direction breakdowns — REUSE the Metrics parser ──────
    # Parse every trade with metrics_calculator.normalise_trade so strategy (from
    # strategyVersionId, NOT the entry timeframe), instrument (normalised), direction
    # (long/short) and win/loss are computed EXACTLY as on the Metrics page.
    if _metrics_normalise is not None:
        recs   = [r for r in (_metrics_normalise(t) for t in trades) if r is not None]
        bull_r = [r for r in recs if r.direction == "long"]
        bear_r = [r for r in recs if r.direction == "short"]
        by_strategy   = _group_metrics(recs, "strategy", sb)
        by_instrument = _group_metrics(recs, "instrument", sb)
        by_direction  = {
            "bullish": {"byStrategy":   _group_metrics(bull_r, "strategy", sb),
                        "byInstrument": _group_metrics(bull_r, "instrument", sb)},
            "bearish": {"byStrategy":   _group_metrics(bear_r, "strategy", sb),
                        "byInstrument": _group_metrics(bear_r, "instrument", sb)},
        }
    else:
        # Fallback (metrics engine unavailable): drawdown's own extractors, already
        # aligned to the same field logic.
        bull = [t for t in trades if get_direction(t) == "bullish"]
        bear = [t for t in trades if get_direction(t) == "bearish"]
        by_strategy   = _group_drawdown(trades, get_strategy)
        by_instrument = _group_drawdown(trades, get_instrument)
        by_direction  = {
            "bullish": {"byStrategy":   _group_drawdown(bull, get_strategy),
                        "byInstrument": _group_drawdown(bull, get_instrument)},
            "bearish": {"byStrategy":   _group_drawdown(bear, get_strategy),
                        "byInstrument": _group_drawdown(bear, get_instrument)},
        }

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
        "byStrategy":   by_strategy,
        "byInstrument": by_instrument,
        # Breakdowns split by trade direction (bullish=long, bearish=short), computed
        # from the Metrics parser above. Trades with no direction are absent from both.
        "byDirection":  by_direction,
    }
