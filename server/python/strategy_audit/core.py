"""
strategy_audit/core.py
────────────────────────────────────────────────────────────────────────────
Orchestrator for all 4 strategy audit levels.

Calls normalise → level1 → level2 → level3 → level4 in sequence,
passing each level's output as context to the next.
Returns a single dict: { "level1": ..., "level2": ..., "level3": ..., "level4": ... }
"""

from .normalise     import normalise_trades
from .level1_edge   import compute_level1
from .level2_evidence   import compute_level2
from .level3_diagnostics import compute_level3
from .level4_action import compute_level4


def compute_strategy_audit(trades: list, starting_balance: float) -> dict:
    """
    Main orchestrator for all 4 audit levels.
    Returns a fully merged dict ready for JSON serialisation.

    Args:
        trades:           Raw journal entry rows from the database (camelCase keys)
        starting_balance: Session starting balance for drawdown / equity calculations
    """
    # ── Phase 0: Normalise ──────────────────────────────────────────────────
    normalised = normalise_trades(trades)

    sb = float(starting_balance) if starting_balance else 10_000.0

    # ── Level 1: Edge detection ──────────────────────────────────────────────
    level1 = compute_level1(normalised)

    # ── Level 2: Statistical proof ───────────────────────────────────────────
    level2 = compute_level2(normalised, sb)

    # ── Level 3: Diagnostics ─────────────────────────────────────────────────
    level3 = compute_level3(normalised)

    # ── Level 4: Action plan (uses all previous levels) ──────────────────────
    level4 = compute_level4(normalised, level1, level2, level3)

    return {
        "level1": level1,
        "level2": level2,
        "level3": level3,
        "level4": level4,
    }
