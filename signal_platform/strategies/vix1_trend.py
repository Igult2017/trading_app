"""
VIX.1 — the trend rule (clear_trend) and the change-of-character rule (is_choch).

clear_trend reads the DIRECTION OF THE RECENT LEG as a slope. It does NOT compare the last two swing
highs and last two swing lows — that OLD rule looked at only the two freshest pivots, so a NORMAL
pullback/consolidation inside a trend (where the two most-recent swings sit side by side, or a pullback
prints a temporary higher low in a downtrend) made it report "no trend" and threw the whole trend away.
Measured on the user's 87 real trend trades it recognised the trend at only 47% — it was blind to
obvious downtrends the moment they paused to consolidate (user, 2026-07-20: "it ranged just a little
within the downtrend, which is normal behaviour of a trend"). A trend is a property of the whole LEG,
not the last two pivots, so we read the least-squares slope of the closes over the recent leg and
require the net drift to clear the market's own noise. That sees the trend THROUGH a consolidation and
lifts real-trade recognition to ~70% while still calling flat stretches "no trend".

is_choch (change of character) is DECOUPLED from clear_trend — this is the 2026-07-20 fix. A CHoCH
happens exactly when the trend reading is AMBIGUOUS (the market is mid-reversal), so gating it behind
"clear_trend != 0" (the old design) meant every reversal where the slope read flat ESCAPED. It is now a
pure STRUCTURE question — was the recent structure trending one way (a lower high / a higher low), and
did a close take out that swing the OTHER way? Checking it independently, on the 1HR and the 4HR, lifts
combined trend+CHoCH recognition of the user's real trades from 70% to ~89% (the rest is timezone noise
in the log). It is a BODY CLOSE, never a wick — a wick through the level is a liquidity grab
(platform-wide rule for both strategies). The 1M uses neither: a spike-and-return inside one hour never
prints the structure a trend read needs, so there the LINE answers direction (vix1_entry).
"""
from core.types import Candle
from shared.swing_points import find_swing_points

_SWING_N        = 3     # generic swing-pivot half-width (is_choch)
_TREND_LOOKBACK = 36    # bars of the recent leg the slope is read over (H1 ~1.5 days; H4 ~6 days)
_MIN_DRIFT_ATR  = 2.0   # net move across the leg must exceed this x the avg bar range to be a trend
                        # (calibrated 2026-07-20: 70% real-trade recognition at 67% coverage; 1.0-1.5
                        # pushed coverage to 75-85% = nearly always-on, no better recognition)


def clear_trend(candles: list[Candle]) -> int:
    """+1 uptrend / -1 downtrend / 0 no clear trend — the SLOPE of the recent leg, filtered by noise.

    The net move the regression implies across the leg must exceed _MIN_DRIFT_ATR x the leg's own
    average bar range, so a flat/ranging stretch (small net move relative to its noise) reads as 0 while
    a leg that has genuinely travelled — even one that paused to consolidate midway — reads as a trend.
    """
    leg = candles[-_TREND_LOOKBACK:]
    n   = len(leg)
    if n < 20:
        return 0
    closes = [c.close for c in leg]
    mx  = (n - 1) / 2
    my  = sum(closes) / n
    sxx = sum((i - mx) ** 2 for i in range(n))
    if sxx == 0:
        return 0
    slope = sum((i - mx) * (closes[i] - my) for i in range(n)) / sxx
    drift = slope * (n - 1)                          # net move the slope implies across the whole leg
    atr   = sum(c.high - c.low for c in leg) / n     # the leg's own average bar range = its noise floor
    if atr <= 0 or abs(drift) < _MIN_DRIFT_ATR * atr:
        return 0
    return 1 if slope > 0 else -1


def is_choch(candles: list[Candle], close_price: float, bullish: bool) -> bool:
    """
    CHoCH — did `close_price` reverse the recent structure? Two conditions, both required:
      1. the recent structure was trending the OTHER way — a bullish CHoCH needs the last swing HIGH to
         be a LOWER high (a down leg), a bearish one needs the last swing LOW to be a HIGHER low; and
      2. `close_price` CLOSED beyond that swing — above the last swing high (bull) / below the last swing
         low (bear).

    Condition 1 is what separates a CHoCH (a reversal) from a plain trend continuation, and it is why
    this is safe to check WITHOUT a clear_trend gate: a continuation in a live trend has an ascending
    (bull) / descending (bear) last swing and so fails condition 1. Takes an explicit close so it works
    CROSS-TF — the momentum candle is 1HR, but its close can be tested against the 1HR or the 4HR swings.
    BODY CLOSE only; a wick through the level is a liquidity grab, not a change of character.
    """
    same = [p.price for p in find_swing_points(candles, n=_SWING_N) if p.is_high == bullish]
    if len(same) < 2:
        return False
    prior_opposite = (same[-1] < same[-2]) if bullish else (same[-1] > same[-2])   # lower-high / higher-low
    broke          = (close_price > same[-1]) if bullish else (close_price < same[-1])
    return prior_opposite and broke
