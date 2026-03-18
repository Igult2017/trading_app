"""
drawdown/streaks.py
Loss/win streak analysis, revenge trade detection, and trade timeline.
"""
from __future__ import annotations
from datetime import timedelta
from ._utils import (
    get_outcome, get_pnl_pct, get_trade_dt,
    sort_by_date, blob_field, _f
)


def compute_streaks(trades: list) -> dict:
    """
    Detect consecutive win/loss streaks, compute revenge trade rate,
    and build the sequential W/L/B trade timeline (last 50 trades).
    """
    empty = {
        "maxLossStreak": {"length": 0, "startDate": None, "endDate": None},
        "avgLossStreak": 0.0,
        "revengeRate":   0.0,
        "bestWinStreak": {"length": 0, "startDate": None, "endDate": None},
        "timeline":      [],
    }

    if not trades:
        return empty

    sorted_trades = sort_by_date(trades)

    # ── Streak detection ──────────────────────────────────────────────────────
    loss_streaks: list[dict] = []
    win_streaks:  list[dict] = []

    current_streak_type: str | None = None
    streak_start_idx = 0
    streak_length    = 0

    def _date_str(t) -> str | None:
        dt = get_trade_dt(t)
        return dt.strftime("%Y-%m-%d") if dt else None

    def _close_streak(streak_type, start_idx, length, end_idx):
        if streak_type == "loss" and length >= 2:
            loss_streaks.append({
                "length":    length,
                "startDate": _date_str(sorted_trades[start_idx]),
                "endDate":   _date_str(sorted_trades[end_idx]),
                "endIdx":    end_idx,
            })
        elif streak_type == "win" and length >= 2:
            win_streaks.append({
                "length":    length,
                "startDate": _date_str(sorted_trades[start_idx]),
                "endDate":   _date_str(sorted_trades[end_idx]),
            })

    for i, t in enumerate(sorted_trades):
        outcome = get_outcome(t)
        if outcome == "breakeven":
            continue  # breakevens don't extend or break streaks

        if outcome == current_streak_type:
            streak_length += 1
        else:
            if current_streak_type is not None and streak_length >= 2:
                _close_streak(current_streak_type, streak_start_idx, streak_length, i - 1)
            current_streak_type = outcome
            streak_start_idx    = i
            streak_length       = 1

    # Close final streak
    if current_streak_type is not None and streak_length >= 2:
        _close_streak(current_streak_type, streak_start_idx, streak_length, len(sorted_trades) - 1)

    # Max and avg loss streak
    max_loss_streak = {"length": 0, "startDate": None, "endDate": None}
    if loss_streaks:
        best = max(loss_streaks, key=lambda s: s["length"])
        max_loss_streak = {
            "length":    best["length"],
            "startDate": best["startDate"],
            "endDate":   best["endDate"],
        }

    avg_loss_streak = (
        round(sum(s["length"] for s in loss_streaks) / len(loss_streaks), 1)
        if loss_streaks else 0.0
    )

    # Best win streak
    best_win_streak = {"length": 0, "startDate": None, "endDate": None}
    if win_streaks:
        best = max(win_streaks, key=lambda s: s["length"])
        best_win_streak = {
            "length":    best["length"],
            "startDate": best["startDate"],
            "endDate":   best["endDate"],
        }

    # ── Revenge trade detection ───────────────────────────────────────────────
    REVENGE_WINDOW_MINS = 60
    revenge_count = 0

    for streak in loss_streaks:
        end_idx = streak.get("endIdx")
        if end_idx is None or end_idx + 1 >= len(sorted_trades):
            continue

        last_loss  = sorted_trades[end_idx]
        next_trade = sorted_trades[end_idx + 1]
        next_outcome = get_outcome(next_trade)

        revenge = False

        # (a) Time between streak-ending loss exit and next entry < 60 minutes
        last_dt = get_trade_dt(last_loss)
        next_dt = get_trade_dt(next_trade)
        if last_dt and next_dt:
            delta_mins = (next_dt - last_dt).total_seconds() / 60
            if 0 <= delta_mins < REVENGE_WINDOW_MINS:
                revenge = True

        # (b) Next trade tagged FOMO or revenge
        if not revenge:
            tags_raw = (
                next_trade.get("tags") or
                blob_field(next_trade, "tags") or
                blob_field(next_trade, "psychology") or
                ""
            )
            tags_str = str(tags_raw).lower()
            if "fomo" in tags_str or "revenge" in tags_str:
                revenge = True

        # (c) Immediate re-entry that also lost
        if not revenge and next_outcome == "loss":
            revenge = True

        if revenge:
            revenge_count += 1

    revenge_rate = round(revenge_count / len(loss_streaks) * 100, 1) if loss_streaks else 0.0

    # ── Timeline (last 50 trades) ─────────────────────────────────────────────
    recent = sorted_trades[-50:]
    timeline = []
    for t in recent:
        outcome = get_outcome(t)
        result  = "W" if outcome == "win" else "L" if outcome == "loss" else "B"
        dt      = get_trade_dt(t)
        pct     = get_pnl_pct(t)
        timeline.append({
            "result": result,
            "date":   dt.strftime("%Y-%m-%d") if dt else None,
            "pnlPct": round(pct, 2) if pct is not None else 0.0,
        })

    return {
        "maxLossStreak": max_loss_streak,
        "avgLossStreak": avg_loss_streak,
        "revengeRate":   revenge_rate,
        "bestWinStreak": best_win_streak,
        "timeline":      timeline,
    }
