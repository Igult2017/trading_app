"""
strategy_audit/core.py
Orchestrator. Imports normalise_trades from _utils to avoid circular imports.
"""
from ._utils import normalise_trades
from .level1_edge        import compute_level1
from .level2_evidence    import compute_level2
from .level3_diagnostics import compute_level3
from .level4_action      import compute_level4


def compute_strategy_audit(trades: list, starting_balance: float) -> dict:
    normalised = normalise_trades(trades)
    sb = float(starting_balance) if starting_balance else 10_000.0
    level1 = compute_level1(normalised)
    level2 = compute_level2(normalised, sb)
    level3 = compute_level3(normalised)
    level4 = compute_level4(normalised, level1, level2, level3)
    return {"level1": level1, "level2": level2, "level3": level3, "level4": level4}
