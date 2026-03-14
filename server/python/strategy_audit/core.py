"""
strategy_audit/core.py
────────────────────────────────────────────────────────────────────────────
Orchestrator for all 4 strategy audit levels.

Responsibility:
  - Accept trade records and a starting balance.
  - Call each audit-level module in sequence and assemble the result
    into a single dict that maps 1-to-1 with StrategyAudit.tsx.

Expected output (returned as dict, serialised to JSON by main.py):
  {
    "level1": { ... },   # from level1_edge.py
    "level2": { ... },   # from level2_evidence.py
    "level3": { ... },   # from level3_diagnostics.py
    "level4": { ... }    # from level4_action.py
  }

Dependency order:
  level1 → level2 → level3 → level4
  Each level may receive outputs from the previous level as context.
  level4 in particular needs the edge verdict from level1 and the drawdown
  data from level2 to generate guardrails and the final verdict.

NOTE: This computation is heavier than the other panels.
  The Node.js bridge (strategyAuditCalculator.ts) sets a 45s timeout.
  Use scipy.stats only where necessary; avoid redundant passes over the data.

TODO — implement compute_strategy_audit(trades, starting_balance):
  1. Call level1_edge.compute_level1(trades)
  2. Call level2_evidence.compute_level2(trades, starting_balance)
  3. Call level3_diagnostics.compute_level3(trades)
  4. Call level4_action.compute_level4(trades, level1, level2, level3)
  5. Return the assembled dict
"""

from .level1_edge       import compute_level1
from .level2_evidence   import compute_level2
from .level3_diagnostics import compute_level3
from .level4_action     import compute_level4


def compute_strategy_audit(trades: list, starting_balance: float) -> dict:
    """
    Main orchestrator for all 4 audit levels.
    Returns a fully merged dict ready for JSON serialisation.
    """
    # TODO: implement
    # level1 = compute_level1(trades)
    # level2 = compute_level2(trades, starting_balance)
    # level3 = compute_level3(trades)
    # level4 = compute_level4(trades, level1, level2, level3)
    # return { "level1": level1, "level2": level2, "level3": level3, "level4": level4 }
    return {"level1": {}, "level2": {}, "level3": {}, "level4": {}}
