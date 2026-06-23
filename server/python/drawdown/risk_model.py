"""
drawdown/risk_model.py
─────────────────────────────────────────────────────────────────────────────
Edge & ruin model:
  • win rate, payoff (avg win / avg loss), Kelly-optimal risk fraction
  • consecutive-loss: actual longest losing streak vs the statistically expected
    longest run, with an "out of expectation" flag
  • MAE (max adverse excursion): how much deeper losers run against you than
    winners do before resolving (relative, unit-agnostic)

Pure, never raises.
"""
from __future__ import annotations
import math
from ._utils import get_pnl_pct, get_outcome, get_pnl, sort_by_date, safe_mean, blob_field, _f

_EMPTY = {
    "winRate": 0.0, "payoff": 0.0, "kellyPct": 0.0,
    "expectedMaxLossStreak": 0, "actualMaxLossStreak": 0, "streakWithinExpectation": True,
    "mae": {"hasData": False, "avgWinnerMae": 0.0, "avgLoserMae": 0.0, "ratio": 0.0, "count": 0},
}


def _is_win(t) -> bool:
    oc = get_outcome(t)
    return oc == "win" or (oc == "" and (get_pnl(t) or 0) > 0)


def _is_loss(t) -> bool:
    oc = get_outcome(t)
    return oc == "loss" or (oc == "" and (get_pnl(t) or 0) < 0)


def compute_risk_model(trades: list) -> dict:
    if not trades:
        return _EMPTY

    # Win rate over ALL decisive trades (win/loss by outcome), like Metrics — NOT only
    # those carrying a signed %, which previously dropped decisive trades from the count.
    wins   = [t for t in trades if _is_win(t)]
    losses = [t for t in trades if _is_loss(t)]
    decided = len(wins) + len(losses)
    if decided == 0:
        return _EMPTY

    win_rate = len(wins) / decided
    # payoff from signed %; with the fixed starting-balance denominator this equals the $ ratio
    wins_pct = [p for t in wins   for p in (get_pnl_pct(t),) if p is not None and p > 0]
    loss_pct = [abs(p) for t in losses for p in (get_pnl_pct(t),) if p is not None and p < 0]
    avg_win  = safe_mean(wins_pct)
    avg_loss = safe_mean(loss_pct)
    payoff   = (avg_win / avg_loss) if avg_loss > 0 else 0.0
    # Kelly: f* = W - (1-W)/R ; clamp to [0,1].
    kelly = (win_rate - (1 - win_rate) / payoff) if payoff > 0 else 0.0
    kelly = max(0.0, min(1.0, kelly))

    # Consecutive-loss: actual longest losing streak.
    actual_streak, cur = 0, 0
    for t in sort_by_date(trades):
        if _is_loss(t):
            cur += 1
            actual_streak = max(actual_streak, cur)
        else:                       # win OR breakeven/unknown both end a losing run (metrics parity)
            cur = 0
    # Expected longest run of length-q events in n trials ≈ log(n)/log(1/q).
    q = 1 - win_rate
    n = decided
    expected_streak = round(math.log(n) / math.log(1 / q)) if 0 < q < 1 and n > 1 else 0
    within = actual_streak <= expected_streak + 1

    # MAE winner vs loser (absolute, relative comparison is unit-agnostic).
    win_maes, loss_maes = [], []
    for t in trades:
        m = _f(t.get("mae"))
        if m is None:
            m = _f(blob_field(t, "mae"))
        if m is None:
            continue
        if _is_win(t):
            win_maes.append(abs(m))
        elif _is_loss(t):
            loss_maes.append(abs(m))
    avg_win_mae  = round(safe_mean(win_maes), 2) if win_maes else 0.0
    avg_loss_mae = round(safe_mean(loss_maes), 2) if loss_maes else 0.0
    mae_ratio    = round(avg_loss_mae / avg_win_mae, 2) if avg_win_mae > 0 else 0.0

    return {
        "winRate": round(win_rate * 100, 1),
        "payoff": round(payoff, 2),
        "kellyPct": round(kelly * 100, 1),
        "expectedMaxLossStreak": expected_streak,
        "actualMaxLossStreak": actual_streak,
        "streakWithinExpectation": within,
        "mae": {
            "hasData": (len(win_maes) + len(loss_maes)) > 0,
            "avgWinnerMae": avg_win_mae,
            "avgLoserMae": avg_loss_mae,
            "ratio": mae_ratio,
            "count": len(win_maes) + len(loss_maes),
        },
    }
