"""
Pullback detector.

A pullback is a corrective move against the primary trend. This module:
  1. Identifies impulsive legs using swing structure (HH/HL for uptrend, LH/LL for downtrend)
  2. Measures how far the correction retraced the impulse (retracement %)
  3. Maps the retracement to the nearest Fibonacci ratio
  4. Exposes the exact Fibonacci PRICE LEVELS (where price may find S/R)
  5. Classifies the pullback state: forming, complete, or failed

Strategies use this to answer:
  "Has price pulled back to the 61.8% Fibonacci level on H4?"
  "Is the current pullback shallow (< 38%) or deep (> 61%)?"
  "Is the pullback complete — has trend resumed?"
"""

from __future__ import annotations
from dataclasses import dataclass, field
from core.types import Candle, Direction
from shared.swing_points import find_swing_points, classify_structure


# Fibonacci ratios used for level mapping
FIB_RATIOS: list[float] = [0.0, 0.236, 0.382, 0.500, 0.618, 0.786, 1.0]

_DEPTH_THRESHOLDS = [
    (0.382, "shallow"),    # 0–38.2%
    (0.618, "moderate"),   # 38.2–61.8%
    (0.786, "deep"),       # 61.8–78.6%
    (1.000, "extreme"),    # 78.6–100%
]


def _nearest_fib(ratio: float) -> float:
    """Return the Fibonacci ratio closest to the measured retracement."""
    return min(FIB_RATIOS, key=lambda f: abs(f - ratio))


def _depth_label(ratio: float) -> str:
    for threshold, label in _DEPTH_THRESHOLDS:
        if ratio <= threshold:
            return label
    return "extreme"


# ── Data structure ─────────────────────────────────────────────────────────────

@dataclass
class FibLevels:
    """Exact price at each Fibonacci retracement level for one impulse leg."""
    impulse_start: float   # price at start of impulse leg (origin)
    impulse_end:   float   # price at end of impulse leg (the swing extreme)
    direction:     Direction
    levels: dict[float, float] = field(default_factory=dict)  # ratio → price

    def at(self, ratio: float) -> float | None:
        """Price at a specific Fibonacci ratio (e.g., 0.618)."""
        return self.levels.get(ratio)

    def between(self, low_ratio: float, high_ratio: float,
                price: float) -> bool:
        """True if `price` is within the [low_ratio, high_ratio] Fibonacci zone."""
        lo = self.levels.get(low_ratio)
        hi = self.levels.get(high_ratio)
        if lo is None or hi is None:
            return False
        if self.direction == Direction.BUY:
            # Bullish: levels count down from impulse_end
            return hi <= price <= lo
        else:
            # Bearish: levels count up from impulse_end
            return lo <= price <= hi


@dataclass
class Pullback:
    direction:       Direction     # BUY = bullish trend pulling back; SELL = bearish
    impulse_start:   float         # price where the impulse leg began
    impulse_end:     float         # price at the swing extreme of the impulse
    pullback_extreme: float        # lowest (bullish) or highest (bearish) of the correction
    retracement_pct: float         # 0.0 = no pullback, 1.0 = full retrace, >1.0 = failed
    fib_nearest:     float         # nearest standard Fibonacci ratio
    depth:           str           # shallow / moderate / deep / extreme
    state:           str           # forming / complete / failed
    fib_levels:      FibLevels     # exact price at every Fibonacci ratio
    impulse_start_idx: int
    impulse_end_idx:   int
    pullback_end_idx:  int

    def is_at_fib(self, ratio: float, tolerance: float = 0.002) -> bool:
        """
        True if the pullback extreme is within `tolerance` (in price units)
        of the specified Fibonacci level.
        Default tolerance: 2 pips (0.002 for most forex pairs).
        """
        price = self.fib_levels.at(ratio)
        if price is None:
            return False
        return abs(self.pullback_extreme - price) <= tolerance

    def price_at(self, ratio: float) -> float | None:
        """Return the exact price at a Fibonacci ratio."""
        return self.fib_levels.at(ratio)


# ── Core detection ─────────────────────────────────────────────────────────────

def _build_fib_levels(start: float, end: float,
                      direction: Direction) -> FibLevels:
    """
    Compute the price at each Fibonacci ratio for one impulse leg.
    For a bullish leg (start < end):
      0.0   = end (the high — no retracement)
      0.236 = end - (end - start) * 0.236
      ...
      1.0   = start (full retracement, back to origin)
    For a bearish leg (start > end):
      0.0   = end (the low — no retracement)
      0.236 = end + (start - end) * 0.236
      ...
      1.0   = start
    """
    leg = abs(end - start)
    levels: dict[float, float] = {}
    for ratio in FIB_RATIOS:
        if direction == Direction.BUY:
            levels[ratio] = end - leg * ratio    # counts down from high
        else:
            levels[ratio] = end + leg * ratio    # counts up from low
    return FibLevels(impulse_start=start, impulse_end=end,
                     direction=direction, levels=levels)


def detect_pullbacks(candles: list[Candle],
                     swing_n: int = 3,
                     min_impulse_bars: int = 3) -> list[Pullback]:
    """
    Detect all pullbacks in the candle series.

    Returns all identified pullbacks, most recent last.
    Each pullback describes one corrective move against one impulsive leg.

    swing_n: bar window for swing point detection (larger = fewer, more significant swings)
    min_impulse_bars: minimum bars the impulse leg must span
    """
    if len(candles) < (swing_n * 2 + min_impulse_bars):
        return []

    swing_pts = find_swing_points(candles, n=swing_n)
    if len(swing_pts) < 3:
        return []

    labelled  = classify_structure(swing_pts)
    pullbacks: list[Pullback] = []

    highs = [(label, sp) for label, sp in labelled if sp.is_high]
    lows  = [(label, sp) for label, sp in labelled if not sp.is_high]

    # ── Bullish pullbacks (uptrend retracements) ───────────────────────────────
    # Pattern: a HL (impulse origin) → HH (impulse end) → pullback below HH
    for i in range(1, len(highs)):
        prev_label, prev_high = highs[i - 1]
        curr_label, curr_high = highs[i]

        if curr_label != "HH":
            continue

        # Find the HL that preceded this HH (impulse origin)
        # The HL is the last low before the HH with index > prev_high.index
        impulse_origin_low = None
        for label, sp in lows:
            if sp.index > prev_high.index and sp.index < curr_high.index:
                if label in ("HL", "LL"):
                    impulse_origin_low = sp

        if impulse_origin_low is None:
            continue

        start_price = impulse_origin_low.price
        end_price   = curr_high.price
        leg_size    = end_price - start_price
        if leg_size <= 0:
            continue

        # Find the deepest low AFTER the HH (that's the pullback extreme)
        post_highs_lows = [sp for _, sp in lows if sp.index > curr_high.index]
        if not post_highs_lows:
            # Pullback hasn't started yet — not enough data
            continue

        pb_extreme = min(post_highs_lows, key=lambda s: s.price)
        retracement = (end_price - pb_extreme.price) / leg_size

        # Has it resumed? Check if a new high was made after the pullback low
        new_highs_after_pb = [sp for _, sp in highs
                               if sp.index > pb_extreme.index and sp.price > end_price]
        if retracement > 1.0:
            state = "failed"
        elif new_highs_after_pb:
            state = "complete"
        else:
            state = "forming"

        fib_levels = _build_fib_levels(start_price, end_price, Direction.BUY)
        pullbacks.append(Pullback(
            direction=Direction.BUY,
            impulse_start=start_price,
            impulse_end=end_price,
            pullback_extreme=pb_extreme.price,
            retracement_pct=round(retracement, 4),
            fib_nearest=_nearest_fib(retracement),
            depth=_depth_label(retracement),
            state=state,
            fib_levels=fib_levels,
            impulse_start_idx=impulse_origin_low.index,
            impulse_end_idx=curr_high.index,
            pullback_end_idx=pb_extreme.index,
        ))

    # ── Bearish pullbacks (downtrend retracements) ─────────────────────────────
    # Pattern: a LH (impulse origin) → LL (impulse end) → pullback above LL
    for i in range(1, len(lows)):
        prev_label, prev_low = lows[i - 1]
        curr_label, curr_low = lows[i]

        if curr_label != "LL":
            continue

        impulse_origin_high = None
        for label, sp in highs:
            if sp.index > prev_low.index and sp.index < curr_low.index:
                if label in ("LH", "HH"):
                    impulse_origin_high = sp

        if impulse_origin_high is None:
            continue

        start_price = impulse_origin_high.price
        end_price   = curr_low.price
        leg_size    = start_price - end_price
        if leg_size <= 0:
            continue

        post_lows_highs = [sp for _, sp in highs if sp.index > curr_low.index]
        if not post_lows_highs:
            continue

        pb_extreme  = max(post_lows_highs, key=lambda s: s.price)
        retracement = (pb_extreme.price - end_price) / leg_size

        new_lows_after_pb = [sp for _, sp in lows
                             if sp.index > pb_extreme.index and sp.price < end_price]
        if retracement > 1.0:
            state = "failed"
        elif new_lows_after_pb:
            state = "complete"
        else:
            state = "forming"

        fib_levels = _build_fib_levels(start_price, end_price, Direction.SELL)
        pullbacks.append(Pullback(
            direction=Direction.SELL,
            impulse_start=start_price,
            impulse_end=end_price,
            pullback_extreme=pb_extreme.price,
            retracement_pct=round(retracement, 4),
            fib_nearest=_nearest_fib(retracement),
            depth=_depth_label(retracement),
            state=state,
            fib_levels=fib_levels,
            impulse_start_idx=impulse_origin_high.index,
            impulse_end_idx=curr_low.index,
            pullback_end_idx=pb_extreme.index,
        ))

    return sorted(pullbacks, key=lambda p: p.pullback_end_idx)


def latest_pullback(candles: list[Candle],
                    direction: Direction | None = None,
                    swing_n: int = 3) -> Pullback | None:
    """
    Return the most recent pullback, optionally filtered by direction.
    Convenience wrapper for strategies that only need the last one.
    """
    all_pb = detect_pullbacks(candles, swing_n=swing_n)
    if direction is not None:
        all_pb = [p for p in all_pb if p.direction == direction]
    return all_pb[-1] if all_pb else None
