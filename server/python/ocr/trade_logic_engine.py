"""
trade_logic_engine.py
─────────────────────
Determines trade outcome and achieved RR using a candle-by-candle
chronological scan — the critical fix for the pre-entry contamination bug.

Algorithm
─────────────────────────────────────────────────────────────────────
1. Receive sorted candle list (left = older, right = newer).
2. Find the entry candle index.
3. Iterate ONLY candles strictly after the entry candle.
4. For each candle, check high_y against TP and low_y against SL.
5. Return the first level touched (Win / Loss).
   If neither touched → Open.
6. AchievedRR: pixel distance (entry → candle extreme) / (entry → SL).
   Scale-invariant because we use a ratio.

This ensures:
  - Pre-entry candles NEVER affect outcome.
  - First-touch is chronologically correct (left → right).
  - Partial moves are measured correctly for open trades.
"""

from dataclasses import dataclass
from typing import List, Optional
import math

from candle_detector import Candle


# ── Data ──────────────────────────────────────────────────────────────────────

@dataclass
class TradeOutcome:
    outcome:      Optional[str]   = None    # "Win" | "Loss" | "BE" | None (open)
    achieved_rr:  Optional[float] = None
    trade_is_open: bool           = True
    outcome_source: str           = "visual"
    # Debug / audit trail
    entry_candle_index:     Optional[int] = None
    candles_after_entry:    int           = 0
    first_touch_candle_idx: Optional[int] = None
    debug: dict = None

    def __post_init__(self):
        if self.debug is None:
            self.debug = {}


# ── Touch tolerance ───────────────────────────────────────────────────────────

# Tolerance in pixels for "candle touched level line".
# Scaled dynamically based on risk distance, but capped.
_MIN_TOUCH_PX = 3
_MAX_TOUCH_PX = 18


def _touch_tolerance(risk_px: int) -> int:
    """Dynamic tolerance: 6 % of risk distance, clamped [3, 18]."""
    return max(_MIN_TOUCH_PX, min(_MAX_TOUCH_PX, int(risk_px * 0.06)))


# ── Outcome detection ─────────────────────────────────────────────────────────

def evaluate_outcome_from_candles(
        candles: List[Candle],
        entry_candle_idx: Optional[int],
        tp_y: Optional[int],
        sl_y: Optional[int],
        entry_y: Optional[int],
        direction: str) -> TradeOutcome:
    """
    Core outcome evaluator.

    Parameters
    ----------
    candles           : all detected candles, sorted left→right (old→new)
    entry_candle_idx  : index of entry candle in `candles`
    tp_y              : y-pixel of TP level line  (None = unknown)
    sl_y              : y-pixel of SL level line  (None = unknown)
    entry_y           : y-pixel of entry arrow    (None = unknown)
    direction         : "Long" | "Short"

    Returns
    -------
    TradeOutcome
    """
    result = TradeOutcome()
    result.debug = {
        "tp_y": tp_y, "sl_y": sl_y,
        "entry_y": entry_y, "direction": direction,
    }

    # ── Input validation ───────────────────────────────────────────────
    if tp_y is None or sl_y is None or entry_y is None:
        result.debug["reason"] = "missing_level_or_entry_y"
        return result

    import sys
    long     = direction.lower() == "long"
    raw_risk = abs(sl_y - entry_y)
    if raw_risk <= 1:
        print(f"[OCR WARNING] risk_px={raw_risk} (SL may be at or very near entry_y). "
              "Outcome detection unreliable.", file=sys.stderr)
    risk_px  = max(raw_risk, 1)
    tol      = _touch_tolerance(risk_px)

    # ── Determine post-entry candles ───────────────────────────────────
    # If entry candle not found: use all candles that are on the correct
    # side of entry_y (i.e. their body starts after the entry arrow's y).
    # This is a fallback for when candle detection misses the entry candle
    # (e.g. trade highlighted area has different background colour).
    if entry_candle_idx is not None:
        post_entry   = candles[entry_candle_idx + 1:]
        start_offset = entry_candle_idx + 1
    else:
        # Fallback: treat ALL candles as post-entry candidates.
        # Filter out any candle whose body is entirely on the wrong side
        # (i.e. clearly a pre-entry candle based on direction).
        result.debug["reason"] = "entry_candle_not_found_using_all"
        post_entry   = candles
        start_offset = 0

    result.entry_candle_index  = entry_candle_idx
    result.candles_after_entry = len(post_entry)
    result.debug["risk_px"]   = risk_px
    result.debug["tolerance"] = tol

    if not post_entry:
        result.debug["reason"] = "no_post_entry_candles"
        return result

    # ── Price-sweep check: if the furthest candle extreme clearly passed TP,
    #    we can confirm the outcome even before the per-candle loop.
    #    Uses 2× tolerance to be confident rather than border-line.
    if long:
        best_high = min(c.high_y for c in post_entry)
        if best_high <= tp_y - tol * 2:
            result.outcome     = "Win"
            result.achieved_rr = round(abs(tp_y - entry_y) / risk_px, 2)
            result.trade_is_open = False
            result.debug["touch"] = "sweep_tp"
            return result
        worst_low = max(c.low_y for c in post_entry)
        if worst_low >= sl_y + tol * 2:
            result.outcome     = "Loss"
            result.achieved_rr = 0.0
            result.trade_is_open = False
            result.debug["touch"] = "sweep_sl"
            return result
    else:
        best_low = max(c.low_y for c in post_entry)
        if best_low >= tp_y + tol * 2:
            result.outcome     = "Win"
            result.achieved_rr = round(abs(tp_y - entry_y) / risk_px, 2)
            result.trade_is_open = False
            result.debug["touch"] = "sweep_tp"
            return result
        worst_high = min(c.high_y for c in post_entry)
        if worst_high <= sl_y - tol * 2:
            result.outcome     = "Loss"
            result.achieved_rr = 0.0
            result.trade_is_open = False
            result.debug["touch"] = "sweep_sl"
            return result

    # ── Scan candles in chronological order ───────────────────────────
    for local_idx, candle in enumerate(post_entry):
        global_idx = start_offset + local_idx

        if long:
            tp_touched = candle.high_y <= tp_y + tol   # wick goes up (lower y)
            sl_touched = candle.low_y  >= sl_y - tol   # wick goes down (higher y)
        else:
            tp_touched = candle.low_y  >= tp_y - tol   # wick goes down (higher y)
            sl_touched = candle.high_y <= sl_y + tol   # wick goes up (lower y)


        if tp_touched and sl_touched:
            # Both on same candle — use body direction as tiebreaker
            # (a candle that opens near SL but closes near TP → Win)
            if long:
                win_first = candle.body_bot <= tp_y + tol * 2
            else:
                win_first = candle.body_top >= tp_y - tol * 2

            result.first_touch_candle_idx = global_idx
            achieved_rr = round(abs(tp_y - entry_y) / risk_px, 2)
            if win_first:
                result.outcome     = "Win"
                result.achieved_rr = achieved_rr
                result.trade_is_open = False
                result.debug["touch"] = "both_tp_first"
            else:
                result.outcome     = "Loss"
                result.achieved_rr = 0.0
                result.trade_is_open = False
                result.debug["touch"] = "both_sl_first"
            return result

        if tp_touched:
            result.outcome     = "Win"
            result.achieved_rr = round(abs(tp_y - entry_y) / risk_px, 2)
            result.trade_is_open = False
            result.first_touch_candle_idx = global_idx
            result.debug["touch"] = "tp"
            return result

        if sl_touched:
            result.outcome     = "Loss"
            result.achieved_rr = 0.0
            result.trade_is_open = False
            result.first_touch_candle_idx = global_idx
            result.debug["touch"] = "sl"
            return result

    # ── Neither level touched → still open ────────────────────────────
    # Measure partial move for achieved_rr
    if long:
        best_y   = min(c.high_y for c in post_entry)
        move_px  = max(entry_y - best_y, 0)
    else:
        best_y   = max(c.low_y  for c in post_entry)
        move_px  = max(best_y  - entry_y, 0)

    result.achieved_rr = round(move_px / risk_px, 2)
    result.trade_is_open = True
    result.debug["reason"] = "open_trade"
    result.debug["partial_move_px"] = int(move_px)
    return result


# ── Text outcome override ─────────────────────────────────────────────────────

def outcome_from_closed_pl(closed_pl_usd: Optional[float]) -> Optional[str]:
    """
    When Closed P/L is available in the info panel, it overrides
    visual detection.  Open P/L is NEVER used here.

    Returns "Win" | "Loss" | "BE" | None.
    """
    if closed_pl_usd is None:
        return None
    if closed_pl_usd >  0.01: return "Win"
    if closed_pl_usd < -0.01: return "Loss"
    return "BE"


# ── Achieved RR from level pixels (when candle scan unavailable) ──────────────

def achieved_rr_from_pixels(entry_y: int,
                              tp_y: Optional[int],
                              sl_y: Optional[int],
                              direction: str) -> Optional[float]:
    """
    Fallback: compute planned RR purely from pixel distances.
    Returns None if inputs are missing or degenerate.
    """
    if entry_y is None or tp_y is None or sl_y is None:
        return None
    risk_px = max(abs(sl_y - entry_y), 1)
    reward_px = abs(tp_y - entry_y)
    if risk_px < 2:
        return None
    return round(reward_px / risk_px, 2)
