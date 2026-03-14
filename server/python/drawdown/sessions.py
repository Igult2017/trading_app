"""
drawdown/sessions.py
────────────────────────────────────────────────────────────────────────────
Drawdown breakdown by trading session (time-of-day analysis).

Responsibility:
  Group trades by the market session they were taken in and compute
  per-session drawdown statistics, including the worst-performing instrument
  within each session.
  Powers the "Session" breakdown card in DrawdownPanel.

Input:
  trades: list[dict]  — trade records (see core.py for field schema)
                        Each trade should have a "sessionTime" field.
                        If absent, derive session from UTC hour of entryTime:
                          00:00–07:00 UTC  → "Asian Close"
                          07:00–10:00 UTC  → "London Open"
                          12:00–17:00 UTC  → "London/NY Overlap"
                          17:00–22:00 UTC  → "NY Mid-Day"
                          Otherwise        → "Off-Hours"

Output (returned as list, stored under "sessions" by core.py):
  [
    {
      "session":    "London Open",
      "avgDdPct":   -1.2,        # mean pnlPct of losing trades in this session
      "total":      45,
      "losses":     15,
      "lossRate":   33.3,        # losses / total * 100
      "worstPair":  "XAUUSD",    # instrument with the deepest avg loss in session
      "worstDdPct": -3.8         # avg pnlPct of losing trades on worstPair in session
    },
    ...
  ]

Calculation notes:
  - avgDdPct is computed from losing trades only (outcome == "loss").
  - worstPair: among losing trades in the session, find the instrument whose
    mean pnlPct is most negative.
  - Sort output by avgDdPct ascending so the worst session appears first.
  - Sessions with zero trades are omitted from the output.

TODO — implement compute_sessions(trades):
  - Assign session labels (from field or UTC hour derivation)
  - Group trades by session label
  - For each session: compute avgDdPct, lossRate, worstPair, worstDdPct
  - Sort by avgDdPct ascending
  - Return the list matching the output schema above
"""


def compute_sessions(trades: list) -> list:
    """
    Compute per-session drawdown statistics.
    Returns a list of session dicts matching the output schema above.
    """
    # TODO: implement
    return []
