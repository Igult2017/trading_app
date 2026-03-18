"""
drawdown/distribution.py
RR buckets and month-by-month drawdown timeline.
"""
from __future__ import annotations
from collections import defaultdict
from ._utils import (
    get_outcome, get_pnl_pct, get_trade_dt,
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


def compute_monthly(trades: list) -> list:
    """
    Build the month-by-month drawdown timeline.
    """
    if not trades:
        return []

    sorted_trades = sort_by_date(trades)

    # Group by (year, month)
    monthly_groups: dict[tuple, list] = defaultdict(list)
    for t in sorted_trades:
        dt = get_trade_dt(t)
        if dt:
            monthly_groups[(dt.year, dt.month)].append(t)

    result = []
    for (year, month) in sorted(monthly_groups.keys()):
        month_trades = monthly_groups[(year, month)]
        total  = len(month_trades)
        losses = sum(1 for t in month_trades if get_outcome(t) == "loss")

        # Mini equity curve for max drawdown within month
        pcts = [get_pnl_pct(t) for t in month_trades]
        balance = 100.0
        peak    = 100.0
        max_dd  = 0.0
        trough  = 100.0

        for pct in pcts:
            if pct is not None:
                balance = balance * (1 + pct / 100)
            if balance > peak:
                peak = balance
            dd = (balance - peak) / peak * 100 if peak > 0 else 0.0
            if dd < max_dd:
                max_dd = dd
                trough = balance

        # Recovery %
        month_end = balance
        if trough < peak and abs(peak - trough) > 0.001:
            recovery_pct = min(100.0, round((month_end - trough) / abs(peak - trough) * 100, 0))
        else:
            recovery_pct = 100.0

        # Dominant cause
        cause, cause_class = _dominant_cause(month_trades)

        # Avg RR
        rr_vals = []
        for t in month_trades:
            rr = _f(t.get("riskReward") or t.get("risk_reward"))
            if rr and rr > 0:
                rr_vals.append(rr)
        avg_rr_str = f"1:{safe_mean(rr_vals):.1f}" if rr_vals else "N/A"

        # Worst single trade (most negative pnl_pct)
        loss_pcts = [
            p for t in month_trades
            for p in [get_pnl_pct(t)]
            if p is not None and get_outcome(t) == "loss"
        ]
        biggest_loss_pct = round(min(loss_pcts), 2) if loss_pcts else 0.0

        result.append({
            "month":          _MONTH_NAMES[month - 1],
            "year":           year,
            "maxDdPct":       round(max_dd, 2),
            "recoveryPct":    float(recovery_pct),
            "dominantCause":  cause,
            "dominantCauseClass": cause_class,
            "avgRr":          avg_rr_str,
            "biggestLossPct": biggest_loss_pct,
            "totalTrades":    total,
            "lossCount":      losses,
        })

    return result
