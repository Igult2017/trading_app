"""
tf_metrics/equity.py
Running equity curve for a single timeframe's trade group.
"""
from __future__ import annotations
from datetime import datetime, timezone


def _f(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _parse_dt(v) -> datetime | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    s = str(v).strip()
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M", "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def compute_equity_curve(group: list, starting_balance: float) -> list:
    """
    Build a running equity curve for a single timeframe's trades.

    Sort order: exitTime → entryTime → createdAt (ascending).
    Each point is the running account balance AFTER applying that trade's P&L.

    Uses profitLoss (account currency) from schema.ts journalEntries.
    Falls back to pnlPercent if profitLoss absent.
    Returns [] for empty groups.
    """
    if not group:
        return []

    def _sort_key(t: dict) -> datetime:
        return (
            _parse_dt(t.get("exitTime")   or t.get("exit_time")) or
            _parse_dt(t.get("entryTime")  or t.get("entry_time")) or
            _parse_dt(t.get("createdAt")  or t.get("created_at")) or
            datetime(2000, 1, 1, tzinfo=timezone.utc)
        )

    sorted_group = sorted(group, key=_sort_key)

    balance = float(starting_balance) if starting_balance else 10_000.0
    curve: list[float] = []

    for t in sorted_group:
        pl = _f(t.get("profitLoss") or t.get("profit_loss"))

        if pl is not None:
            balance += pl
        else:
            # Fallback: percentage-based P&L (pnlPercent from schema trades table)
            pl_pct = _f(t.get("pnlPercent") or t.get("pnl_percent") or t.get("profitLossPercent"))
            if pl_pct is not None:
                balance = balance * (1.0 + pl_pct / 100.0)
            # If neither field available, balance unchanged (breakeven assumed)

        curve.append(round(balance, 2))

    return curve
