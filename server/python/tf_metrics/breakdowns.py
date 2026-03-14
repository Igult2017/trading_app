"""
tf_metrics/breakdowns.py
────────────────────────────────────────────────────────────────────────────
Sub-breakdowns within a single timeframe: by instrument, direction, session.

Responsibility:
  For a group of trades belonging to one timeframe, produce three nested
  breakdowns that TFMetricsPanel can display in its detail rows:
    byInstrument — win rate and net P&L per trading instrument
    byDirection  — win rate and avg R:R per direction (long / short)
    bySession    — win rate per market session (London, NewYork, Asia, Sydney)

Input:
  group: list[dict]  — trades belonging to a single timeframe

Output (returned as dict, merged into byTimeframe[TF] by core.py):
  {
    "bestInstrument":  str,    # symbol with highest win rate (min 3 trades)
    "worstInstrument": str,    # symbol with lowest win rate  (min 3 trades)
    "byInstrument": {
      "XAUUSD": { "trades": int, "wins": int, "winRate": float, "netPnl": float },
      ...
    },
    "byDirection": {
      "long":  { "trades": int, "winRate": float, "avgRR": float },
      "short": { "trades": int, "winRate": float, "avgRR": float }
    },
    "bySession": {
      "London":  { "trades": int, "winRate": float },
      "NewYork": { "trades": int, "winRate": float },
      "Asia":    { "trades": int, "winRate": float },
      "Sydney":  { "trades": int, "winRate": float }
    }
  }

Calculation notes:
  - byInstrument uses the "symbol" field; byDirection uses "tradeType"
    ("long"/"short"); bySession uses "session" or derives from entryTime UTC.
  - bestInstrument / worstInstrument require >= 3 trades on that instrument
    within the TF group; if no instrument meets the threshold, return "N/A".
  - Instruments with zero trades are excluded from byInstrument.
  - Sessions with zero trades are included with zeros so the frontend always
    renders all four session rows.

TODO — implement compute_breakdowns(group):
  - Group by symbol, compute wins/lossses/winRate/netPnl per instrument
  - Group by tradeType, compute trades/winRate/avgRR per direction
  - Group by session, compute trades/winRate per session
  - Find best/worst instrument by winRate (min 3 trades threshold)
  - Return the merged dict
"""


def compute_breakdowns(group: list) -> dict:
    """
    Compute instrument, direction, and session breakdowns for one TF group.
    Returns a dict matching the output schema above.
    """
    # TODO: implement
    return {
        "bestInstrument":  "N/A",
        "worstInstrument": "N/A",
        "byInstrument":    {},
        "byDirection":     {
            "long":  {"trades": 0, "winRate": 0.0, "avgRR": 0.0},
            "short": {"trades": 0, "winRate": 0.0, "avgRR": 0.0},
        },
        "bySession": {
            "London":  {"trades": 0, "winRate": 0.0},
            "NewYork": {"trades": 0, "winRate": 0.0},
            "Asia":    {"trades": 0, "winRate": 0.0},
            "Sydney":  {"trades": 0, "winRate": 0.0},
        },
    }
