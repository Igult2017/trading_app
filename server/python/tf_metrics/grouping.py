"""
tf_metrics/grouping.py
────────────────────────────────────────────────────────────────────────────
Groups trades by their recorded entry timeframe.

Responsibility:
  - Read the "entryTimeframe" (or "timeframe") field from each trade.
  - If the field is absent or empty, bucket the trade under "Unknown".
  - Return a dict keyed by timeframe label, values are lists of trades.
  - Normalise timeframe strings to a consistent format:
      "1m" → "M1", "5m" → "M5", "15m" → "M15", "30m" → "M30",
      "1h" → "H1", "4h" → "H4", "1d" → "D1", "1w" → "W1"
  - Supported canonical labels: M1, M5, M15, M30, H1, H4, D1, W1, Unknown

Input:
  trades: list[dict]  — raw trade records from journal_entries table

Output:
  dict[str, list[dict]]  — e.g. { "H1": [...], "M15": [...], "Unknown": [...] }

Normalisation rules:
  - Strip whitespace and lowercase before matching.
  - Accept common aliases: "1h", "1hr", "60m", "60min" all → "H1".
  - Preserve unknown labels verbatim rather than silently dropping trades.

TODO — implement group_by_timeframe(trades):
  - Build alias → canonical label mapping
  - Walk each trade, read entryTimeframe, normalise, group
  - Trades without a recognisable TF go to "Unknown"
  - Return the grouped dict
"""

CANONICAL_MAP = {
    # M1
    "1m": "M1", "m1": "M1", "1min": "M1",
    # M5
    "5m": "M5", "m5": "M5", "5min": "M5",
    # M15
    "15m": "M15", "m15": "M15", "15min": "M15",
    # M30
    "30m": "M30", "m30": "M30", "30min": "M30",
    # H1
    "h1": "H1", "1h": "H1", "1hr": "H1", "60m": "H1", "60min": "H1",
    # H4
    "h4": "H4", "4h": "H4", "4hr": "H4", "240m": "H4",
    # D1
    "d1": "D1", "1d": "D1", "daily": "D1",
    # W1
    "w1": "W1", "1w": "W1", "weekly": "W1",
}


def group_by_timeframe(trades: list) -> dict:
    """
    Groups trades by their normalised entry timeframe label.
    Returns dict[canonical_tf, list[trade_dict]].
    """
    # TODO: implement using CANONICAL_MAP
    return {}
