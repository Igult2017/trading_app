"""
drawdown/distribution.py
RR buckets and month-by-month drawdown timeline.
"""
from __future__ import annotations
from collections import defaultdict
from ._utils import (
    get_outcome, get_pnl, get_pnl_pct, get_trade_dt,
    blob_field, safe_mean, _f, _s, sort_by_date
)


# ── RR Buckets ────────────────────────────────────────────────────────────────

def compute_rr_buckets(trades: list) -> list:
    """
    Classify trades into 4 R:R bands.
    Returns rrBuckets list matching frontend shape.
    """
    buckets = [
        {"label": "< 1:1",     "min": None, "max": 1.0,  "count": 0, "note": "Underperforming"},
        {"label": "1:1 – 1:2", "min": 1.0,  "max": 2.0,  "count": 0, "note": "Break-even"},
        {"label": "1:2 – 1:3", "min": 2.0,  "max": 3.0,  "count": 0, "note": "Target range"},
        {"label": "> 1:3",     "min": 3.0,  "max": None, "count": 0, "note": "Outlier winners"},
    ]

    total_with_rr = 0

    for t in trades:
        rr = _f(t.get("riskReward") or t.get("risk_reward"))
        if rr is None:
            # Try achievedRR e.g. "1:2.5"
            achieved = _s(t.get("achievedRR") or t.get("achieved_rr") or "")
            if achieved and ":" in achieved:
                parts = achieved.split(":")
                try:
                    rr = float(parts[-1])
                except ValueError:
                    pass
        if rr is None:
            continue

        rr = abs(rr)  # ensure positive
        total_with_rr += 1

        for b in buckets:
            lo = b["min"]
            hi = b["max"]
            if (lo is None or rr >= lo) and (hi is None or rr < hi):
                b["count"] += 1
                break

    # Compute percentages
    result = []
    for b in buckets:
        pct = round(b["count"] / total_with_rr * 100, 1) if total_with_rr > 0 else 0.0
        result.append({
            "label": b["label"],
            "count": b["count"],
            "pct":   pct,
            "note":  b["note"],
        })

    return result


# ── Monthly Timeline ──────────────────────────────────────────────────────────

_MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun",
                "Jul","Aug","Sep","Oct","Nov","Dec"]

_BAD_CAUSES  = {"HTF OB Failed", "CHOCH Failed", "Premature BOS", "Counter-Trend Entry"}
_GOOD_CAUSES = {"Confirmed Entry", "Calm Execution"}


def _dominant_cause(month_trades: list) -> tuple[str, str]:
    """
    Find the most frequent loss cause tag in the month.
    Returns (cause_label, cause_class) where class is "bad" | "ok" | "good".
    """
    from collections import Counter
    cause_counts: Counter = Counter()

    for t in month_trades:
        if get_outcome(t) != "loss":
            continue

        ob_valid    = blob_field(t, "ob_valid")
        choch_valid = blob_field(t, "choch_valid")
        htf_bias    = str(
            t.get("htfBias") or t.get("htf_bias") or
            blob_field(t, "htf_bias") or ""
        ).lower()
        entry_type  = str(
            t.get("entryType") or t.get("entry_type") or
            blob_field(t, "entry_type") or ""
        ).lower()
        tags_raw    = blob_field(t, "tags") or t.get("tags") or []
        tags        = [str(x).lower() for x in (tags_raw if isinstance(tags_raw, list) else [tags_raw])]

        if ob_valid is not None and str(ob_valid).lower() in ("false", "0", "no"):
            cause_counts["HTF OB Failed"] += 1
        if choch_valid is not None and str(choch_valid).lower() in ("false", "0", "no"):
            cause_counts["CHOCH Failed"] += 1
        if htf_bias in ("counter_trend", "counter trend", "against"):
            cause_counts["Counter-Trend Entry"] += 1
        if entry_type in ("premature", "early"):
            cause_counts["Premature BOS"] += 1
        if entry_type == "confirmed":
            cause_counts["Confirmed Entry"] += 1
        for tag in tags:
            if "fomo" in tag:
                cause_counts["FOMO Trigger"] += 1
            if "revenge" in tag:
                cause_counts["Revenge Trade"] += 1
            if any(x in tag for x in ("calm", "disciplined")):
                cause_counts["Calm Execution"] += 1

    if not cause_counts:
        return "Mixed", "ok"

    cause = cause_counts.most_common(1)[0][0]
    if cause in _BAD_CAUSES:
        cause_class = "bad"
    elif cause in _GOOD_CAUSES:
        cause_class = "good"
    else:
        cause_class = "ok"

    return cause, cause_class


def compute_monthly(trades: list, starting_balance: float = 10_000.0) -> list:
    """
    Build the month-by-month drawdown timeline.

    EQUITY GROWTH:
      Total month P&L / session starting_balance × 100.
      Profits are assumed withdrawn each month — always relative to sb.

    BIG L:
      Largest intra-month peak-to-trough drawdown as % of starting_balance.

    RECOVERY %  (cross-month):
      Profits are WITHDRAWN each month — next month always starts at sb.
      Losses cannot be withdrawn, so they become a carried deficit (in % of sb).

      Rules:
        Losing month  → loss % added to carried_deficit_pct. Recovery = 0%.
        Profitable month, no prior deficit → profit withdrawn in full. Recovery = 100%.
        Profitable month, deficit exists:
          - Profit first repays the deficit.
          - If profit >= deficit: fully recovered, excess withdrawn. Recovery = 100%.
          - If profit < deficit: partial. Recovery = profit% / deficit% × 100. Remainder carries.

    outstandingDeficitPct:
      Carried deficit remaining at month-end as % of starting_balance (0 = clear).
    """
    if not trades:
        return []

    sb = float(starting_balance) if starting_balance and starting_balance > 0 else 10_000.0
    sorted_trades = sort_by_date(trades)

    # Group by (year, month)
    monthly_groups: dict[tuple, list] = defaultdict(list)
    for t in sorted_trades:
        dt = get_trade_dt(t)
        if dt:
            monthly_groups[(dt.year, dt.month)].append(t)

    # Cross-month deficit tracker (pure % of sb)
    # Profits are withdrawn; losses accumulate as a carried deficit.
    carried_deficit_pct: float = 0.0

    result = []
    for (year, month) in sorted(monthly_groups.keys()):
        month_trades = monthly_groups[(year, month)]
        total  = len(month_trades)
        losses = sum(1 for t in month_trades if get_outcome(t) == "loss")

        # ── Monthly absolute P&L ─────────────────────────────────────────────
        monthly_pnl_abs = 0.0
        has_abs = False
        for t in month_trades:
            pl = get_pnl(t)
            if pl is not None:
                monthly_pnl_abs += pl
                has_abs = True

        if has_abs:
            equity_growth_pct = round(monthly_pnl_abs / sb * 100, 2)
            month_pnl_dollars  = monthly_pnl_abs
        else:
            # Fallback: sum pct values directly (each treated as % of sb)
            pct_sum = sum(p for t in month_trades for p in [get_pnl_pct(t)] if p is not None)
            equity_growth_pct  = round(pct_sum, 2)
            month_pnl_dollars  = pct_sum / 100.0 * sb

        # ── Intra-month equity curve (BIG L / maxDdPct) ──────────────────────
        # Balance resets to sb every month (profits-withdrawn model).
        balance    = sb
        peak       = sb
        trough     = sb
        max_dd_pct = 0.0

        for t in month_trades:
            pl = get_pnl(t)
            if pl is not None:
                balance += pl
            else:
                pct = get_pnl_pct(t)
                if pct is not None:
                    balance += pct / 100.0 * sb

            if balance > peak:
                peak = balance
            if balance < trough:
                trough = balance
            dd = (balance - peak) / sb * 100 if sb > 0 else 0.0
            if dd < max_dd_pct:
                max_dd_pct = dd

        biggest_loss_pct = round(max_dd_pct, 2)

        # ── Cross-month recovery tracking (pure % of sb) ─────────────────────
        # equity_growth_pct is this month's net result as % of sb.
        # Profits are withdrawn; only losses persist as a carried deficit.

        deficit_entering = carried_deficit_pct   # % still owed from prior months

        if equity_growth_pct < 0:
            # Losing month — deepen the deficit, nothing recovered.
            carried_deficit_pct = round(deficit_entering + abs(equity_growth_pct), 4)
            recovery_pct = 0.0

        elif equity_growth_pct == 0:
            # Break-even — no change to deficit, no recovery progress.
            recovery_pct = 100.0 if deficit_entering < 0.001 else 0.0

        else:
            # Profitable month — profit repays deficit first, excess is withdrawn.
            if deficit_entering < 0.001:
                # No deficit to clear — full profit withdrawn, clean month.
                carried_deficit_pct = 0.0
                recovery_pct = 100.0
            elif equity_growth_pct >= deficit_entering:
                # Profit covers the entire deficit → fully recovered.
                carried_deficit_pct = 0.0
                recovery_pct = 100.0
            else:
                # Partial recovery — profit chips away at deficit.
                recovery_pct = min(100.0, round(equity_growth_pct / deficit_entering * 100, 0))
                carried_deficit_pct = round(deficit_entering - equity_growth_pct, 4)

        outstanding_deficit_pct = round(carried_deficit_pct, 2)

        # Dominant cause
        cause, cause_class = _dominant_cause(month_trades)

        # Avg RR
        rr_vals = []
        for t in month_trades:
            rr = _f(t.get("riskReward") or t.get("risk_reward"))
            if rr and rr > 0:
                rr_vals.append(rr)
        avg_rr_str = f"1:{safe_mean(rr_vals):.1f}" if rr_vals else "N/A"

        result.append({
            "month":                _MONTH_NAMES[month - 1],
            "year":                 year,
            "maxDdPct":             round(max_dd_pct, 2),
            "recoveryPct":          float(recovery_pct),
            "outstandingDeficitPct": outstanding_deficit_pct,
            "dominantCause":        cause,
            "dominantCauseClass":   cause_class,
            "avgRr":                avg_rr_str,
            "biggestLossPct":       biggest_loss_pct,
            "totalTrades":          total,
            "lossCount":            losses,
            "equityGrowthPct":      equity_growth_pct,
        })

    return result
