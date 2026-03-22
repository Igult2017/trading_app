"""
strategy_audit/core.py
Orchestrator. Imports normalise_trades from _utils to avoid circular imports.
After computing all four levels, passes the raw results through output_shaper
so the frontend always receives data in the exact mock-data schema shape.
"""
from ._utils          import normalise_trades
from .level1_edge        import compute_level1
from .level2_evidence    import compute_level2
from .level3_diagnostics import compute_level3
from .level4_action      import compute_level4
from .output_shaper      import shape_output


def compute_strategy_audit(trades: list, starting_balance: float) -> dict:
    normalised = normalise_trades(trades)
    sb = float(starting_balance) if starting_balance else 10_000.0
    level1 = compute_level1(normalised)
    level2 = compute_level2(normalised, sb)
    level3 = compute_level3(normalised)
    level4 = compute_level4(normalised, level1, level2, level3)

    # Shape output to match frontend mock-data schema exactly
    shaped = shape_output(level1, level2, level3, level4)
    return shaped
