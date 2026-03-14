"""
drawdown_streaks.py
───────────────────
Loss streak analysis and the sequential W/L trade timeline.

Responsibility:
  Detect and quantify consecutive loss run patterns in the trade history.
  Also compute the "revenge trading" rate — the tendency to over-trade
  or break rules immediately after a losing streak ends.
  Powers the "Loss Streaks" card and the trade timeline grid in DrawdownPanel.

Input:
  trades: list[dict]  — filtered trade records sorted by entry_time ASC
                        (see drawdown_core.py schema)

Output (returned as dict, stored under "streaks" key by drawdown_core.py):
  {
    "max_loss_streak": {
      "length":     7,
      "start_date": "2025-04-12",   # ISO date of first loss in streak
      "end_date":   "2025-04-18"    # ISO date of last loss in streak
    },
    "avg_loss_streak":   3.2,       # mean length of all loss streaks
    "revenge_rate":      68.0,      # % of loss streaks followed by a revenge trade
                                    # (revenge = next trade taken < 1 hour after
                                    #  streak-ending loss, or tagged "FOMO")
    "best_win_streak": {
      "length":     11,
      "start_date": "2025-03-03",
      "end_date":   "2025-03-14"
    },
    "timeline": [                   # sequential W/L list for the timeline grid
      { "result": "W", "date": "2025-01-02", "pnl_pct": 1.4 },
      { "result": "L", "date": "2025-01-03", "pnl_pct": -0.8 },
      ...
    ]
  }

Calculation notes:
  - Sort trades by entry_time before processing.
  - A streak is a consecutive run of the same outcome ("win" or "loss").
    Breakeven trades do not break a streak but do not extend it either.
  - Revenge trade detection:
      After the last loss in a streak, inspect the immediately following
      trade.  Flag it as revenge if:
        (a) time gap between streak-ending loss exit and next entry < 60 min, OR
        (b) next trade has "FOMO" or "revenge" in its tags list.
  - revenge_rate = (streaks where next trade is flagged revenge) /
                   total_loss_streaks * 100
  - The timeline list should be capped at the most recent 50 trades to keep
    the frontend grid manageable; include the date and pnl_pct per entry for
    tooltip support.
"""


def compute_streaks(trades: list) -> dict:
    """
    Compute loss/win streak statistics and build the sequential timeline.
    Returns a dict matching the output schema above.
    """
    pass
