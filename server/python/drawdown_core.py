"""
drawdown_core.py
────────────────
Orchestrator for all drawdown intelligence calculations.

Responsibility:
  - Accept a list of trade records (from the DB) and optional filters
    (session_id, date_range, instruments, strategies).
  - Call every sub-module (metrics, heatmap, frequency, structural,
    sessions, streaks, distribution, monthly) in the correct order.
  - Assemble and return a single JSON-serialisable dict that maps 1-to-1
    with the shape expected by DrawdownPanel.tsx on the frontend.

Expected input schema (passed as a Python dict or parsed from JSON):
  {
    "trades": [
      {
        "id":            str,
        "session_id":    str,
        "instrument":    str,       # e.g. "EURUSD"
        "strategy":      str,       # e.g. "Trend"
        "session_time":  str,       # e.g. "London Open"
        "entry_time":    str,       # ISO-8601
        "exit_time":     str,       # ISO-8601
        "direction":     str,       # "long" | "short"
        "entry_price":   float,
        "exit_price":    float,
        "stop_loss":     float,
        "take_profit":   float,
        "lot_size":      float,
        "pnl":           float,     # realised P&L in account currency
        "pnl_pct":       float,     # P&L as % of account balance at entry
        "rr_achieved":   float,     # actual risk:reward realised
        "outcome":       str,       # "win" | "loss" | "breakeven"
        "tags":          list[str], # psychology / structural tags
        "htf_bias":      str,       # "with_trend" | "counter_trend"
        "entry_type":    str,       # "confirmed" | "premature" | ...
        "sl_placement":  str,       # "above_below_wick" | "inside_structure" | ...
        "choch_valid":   bool,
        "ob_valid":      bool,
        "fvg_trap":      bool
      },
      ...
    ],
    "account_balance": float,       # starting balance for the period
    "filters": {
      "date_from": str | None,      # ISO-8601 date
      "date_to":   str | None,
      "instruments": list[str] | None,
      "strategies":  list[str] | None
    }
  }

Expected output schema (returned as a dict, serialised to JSON by the
Express route that calls this script via child_process or python-shell):
  {
    "top_stats":    { ... },   # see drawdown_metrics.py
    "heatmap":      [ ... ],   # see drawdown_heatmap.py
    "frequency":    { ... },   # see drawdown_frequency.py
    "structural":   { ... },   # see drawdown_structural.py
    "sessions":     [ ... ],   # see drawdown_sessions.py
    "streaks":      { ... },   # see drawdown_streaks.py
    "rr_buckets":   [ ... ],   # see drawdown_distribution.py
    "monthly":      [ ... ]    # see drawdown_distribution.py
  }

Usage (called from Express via python-shell or child_process):
  python3 server/python/drawdown_core.py < payload.json
  OR imported as a module: from drawdown_core import compute_drawdown
"""


def compute_drawdown(payload: dict) -> dict:
    """
    Main entry point.  Import and call each sub-module then merge results.
    Returns a fully assembled dict ready to be JSON-serialised and sent
    to the frontend.
    """
    pass
