"""
Post-entry trade management state machine.

Phases (from spec):
  initial   — original SL active
  breakeven — SL moved to entry after price reaches 1R
  trailing  — price passed 2R; SL trails on H1 structure
  closed    — trade exited (TP, BE, SL, or trail stop)
"""
from dataclasses import dataclass
from core.types import Candle
from shared.swing_points import find_swing_points

_PIP = 0.00010


@dataclass
class TradeState:
    symbol:     str
    direction:  str       # "BUY" or "SELL"
    entry:      float
    initial_sl: float
    tp:         float
    current_sl: float
    phase:      str       # "initial" | "breakeven" | "trailing" | "closed"
    result:     str | None = None   # "TP" | "BE" | "SL" | "TRAIL"

    @property
    def risk(self) -> float:
        return abs(self.entry - self.initial_sl)

    @property
    def bullish(self) -> bool:
        return self.direction == "BUY"


def update(
    state: TradeState,
    current_price: float,
    h1_recent: list[Candle] | None = None,
) -> TradeState:
    """
    Advance trade state for the current price tick.
    Mutates state in place and returns it.

    h1_recent: latest H1 candles — used only in trailing phase.
    """
    if state.phase == "closed":
        return state

    buy = state.bullish

    # TP check
    if (buy and current_price >= state.tp) or (not buy and current_price <= state.tp):
        state.phase  = "closed"
        state.result = "TP"
        return state

    # SL check
    if (buy and current_price <= state.current_sl) or (not buy and current_price >= state.current_sl):
        state.phase  = "closed"
        state.result = "BE" if state.phase == "breakeven" else "SL"
        return state

    if state.phase == "initial":
        target_1r = state.entry + state.risk if buy else state.entry - state.risk
        if (buy and current_price >= target_1r) or (not buy and current_price <= target_1r):
            state.current_sl = state.entry
            state.phase      = "breakeven"

    elif state.phase == "breakeven":
        target_2r = state.entry + 2 * state.risk if buy else state.entry - 2 * state.risk
        if (buy and current_price >= target_2r) or (not buy and current_price <= target_2r):
            state.phase = "trailing"

    elif state.phase == "trailing" and h1_recent:
        _trail(state, h1_recent)

    return state


def _trail(state: TradeState, h1: list[Candle]) -> None:
    """
    Advance trailing SL to the most recent structural swing.
    BUY: trail up to the highest recent swing LOW.
    SELL: trail down to the lowest recent swing HIGH.
    SL can only move in the direction of the trade, never against it.
    """
    swings = find_swing_points(h1[-20:], n=3)
    if not swings:
        return

    if state.bullish:
        lows = [s.price for s in swings if not s.is_high and s.price > state.current_sl]
        if lows:
            state.current_sl = max(lows)
    else:
        highs = [s.price for s in swings if s.is_high and s.price < state.current_sl]
        if highs:
            state.current_sl = min(highs)
