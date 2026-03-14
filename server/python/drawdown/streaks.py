"""
drawdown/streaks.py
────────────────────────────────────────────────────────────────────────────
Loss/win streak analysis and sequential W/L trade timeline.

Responsibility:
  Detect consecutive loss and win run patterns in the trade history.
  Also compute the "revenge trading" rate — the tendency to re-enter the
  market too quickly or emotionally after a losing streak.
  Powers the "Loss Streaks" card and the sequential timeline grid in
  DrawdownPanel.

Input:
  trades: list[dict]  — trade records sorted by entry date ASC
                        (see core.py for field schema)

Output (returned as dict, stored under "streaks" by core.py):
  {
    "maxLossStreak": {
      "length":    7,
      "startDate": "2025-04-12",
      "endDate":   "2025-04-18"
    },
    "avgLossStreak":  3.2,        # mean length of all loss streaks
    "revengeRate":    68.0,       # % of loss streaks followed by a revenge trade
    "bestWinStreak": {
      "length":    11,
      "startDate": "2025-03-03",
      "endDate":   "2025-03-14"
    },
    "timeline": [                 # last 50 trades as W/L/B markers for timeline grid
      { "result": "W", "date": "2025-01-02", "pnlPct": 1.4 },
      { "result": "L", "date": "2025-01-03", "pnlPct": -0.8 },
      ...
    ]
  }

Calculation notes:
  Streak detection:
    - Sort trades by tradeDate (or entryTime) ascending.
    - Walk through outcomes. "win" extends or starts a win streak, "loss"
      extends or starts a loss streak. "breakeven" does not extend or break
      either streak — skip it for streak purposes.
    - Record start/end date and length of each streak.

  Revenge trade detection:
    After the last loss in a streak, inspect the very next trade.
    Flag it as a revenge trade if ANY of the following are true:
      (a) Time between streak-ending loss exit and next entry < 60 minutes
      (b) Next trade has "FOMO" or "revenge" (case-insensitive) in its tags
      (c) Next trade outcome is also a loss (immediate re-entry gone wrong)
    revengeRate = streaks_with_revenge_trade / total_loss_streaks * 100

  Timeline:
    Cap at the most recent 50 trades. Include date and pnlPct per entry for
    tooltip support. Use "B" for breakeven.

TODO — implement compute_streaks(trades):
  - Sort trades by date
  - Walk outcomes to find all streak runs
  - Detect revenge trades at streak endings
  - Build timeline list from last 50 trades
  - Return the dict matching the output schema above
"""


def compute_streaks(trades: list) -> dict:
    """
    Compute loss/win streak statistics and build the sequential timeline.
    Returns a dict matching the output schema above.
    """
    # TODO: implement
    return {
        "maxLossStreak": {"length": 0, "startDate": None, "endDate": None},
        "avgLossStreak": 0.0,
        "revengeRate":   0.0,
        "bestWinStreak": {"length": 0, "startDate": None, "endDate": None},
        "timeline":      [],
    }
