"""
drawdown/core.py
────────────────────────────────────────────────────────────────────────────
Orchestrator for all drawdown intelligence calculations.

Responsibility:
  - Accept a list of trade records and an account starting balance.
  - Call every sub-module in the correct order and assemble the results
    into a single dict that maps 1-to-1 with the shape expected by
    DrawdownPanel.tsx on the frontend.

Expected input (passed as Python args, not JSON — main.py handles parsing):
  trades:           list[dict]   — trade records from journal_entries table
  starting_balance: float        — account starting balance for the period

Expected output (returned as dict, serialised to JSON by main.py):
  {
    "topStats":    { ... },   # from metrics.py
    "heatmap":     [ ... ],   # from heatmap.py
    "frequency":   { ... },   # from frequency.py
    "structural":  { ... },   # from structural.py
    "sessions":    [ ... ],   # from sessions.py
    "streaks":     { ... },   # from streaks.py
    "distribution":{ ... },   # from distribution.py  (rr_buckets + monthly)
  }

TODO — implement compute_drawdown:
  1. Import each sub-module function
  2. Apply any filters if passed (date range, instrument, strategy)
  3. Call each sub-module and collect its output
  4. Merge all outputs into a single result dict and return it
"""

from .metrics      import compute_metrics
from .heatmap      import compute_heatmap
from .frequency    import compute_frequency
from .structural   import compute_structural
from .sessions     import compute_sessions
from .streaks      import compute_streaks
from .distribution import compute_rr_buckets, compute_monthly


def compute_drawdown(trades: list, starting_balance: float) -> dict:
    """
    Main orchestrator. Calls all sub-modules and assembles the result.
    Returns a fully merged dict ready to be JSON-serialised by main.py.
    """
    # TODO: implement — call each sub-module and merge results:
    # top_stats  = compute_metrics(trades, starting_balance)
    # heatmap    = compute_heatmap(trades)
    # frequency  = compute_frequency(trades)
    # structural = compute_structural(trades)
    # sessions   = compute_sessions(trades)
    # streaks    = compute_streaks(trades)
    # rr_buckets = compute_rr_buckets(trades)
    # monthly    = compute_monthly(trades)
    # return { "topStats": top_stats, "heatmap": heatmap, ... }
    return {}
