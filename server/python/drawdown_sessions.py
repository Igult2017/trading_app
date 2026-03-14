"""
drawdown_sessions.py
────────────────────
Drawdown breakdown by trading session (time-of-day analysis).

Responsibility:
  Group trades by the session they were taken in and compute per-session
  drawdown statistics, including the worst-performing instrument within
  each session.  Powers the "Session" card in DrawdownPanel.

Input:
  trades: list[dict]  — filtered trade records (see drawdown_core.py schema)
                        Each trade has a "session_time" field identifying
                        which market session it belongs to:
                          "London Open", "London/NY Overlap",
                          "NY Mid-Day", "Asian Close"
                        (Additional sessions are supported automatically.)

Output (returned as list, stored under "sessions" key by drawdown_core.py):
  [
    {
      "session":      "London Open",
      "avg_dd_pct":   -1.2,       # mean pnl_pct of all losing trades in session
      "total":        45,         # total trades taken in this session
      "losses":       15,         # losing trades count
      "loss_rate":    33.3,       # losses / total * 100
      "worst_pair":   "XAUUSD",   # instrument with the deepest avg loss in session
      "worst_dd_pct": -3.8        # avg pnl_pct of losing trades on worst_pair
    },
    ...
  ]

Calculation notes:
  - Session assignment uses the "session_time" field directly.  If that
    field is absent, derive the session from the UTC hour of "entry_time":
      00:00–07:00 UTC  → "Asian Close"
      07:00–10:00 UTC  → "London Open"
      12:00–17:00 UTC  → "London/NY Overlap"
      17:00–22:00 UTC  → "NY Mid-Day"
  - avg_dd_pct is computed from losing trades only (outcome == "loss").
  - worst_pair is the instrument with the most negative avg pnl_pct among
    losing trades within that session.
  - Sort output by avg_dd_pct ascending (worst session first).
"""


def compute_sessions(trades: list) -> list:
    """
    Compute per-session drawdown statistics.
    Returns a list of session dicts matching the output schema above.
    """
    pass
