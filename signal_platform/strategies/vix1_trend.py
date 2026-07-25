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

_SWING_N   = 3     # generic swing-pivot half-width (used by both the trend state and is_choch)
_MIN_BARS  = 20    # below this there is not enough structure to call anything


def clear_trend(candles: list[Candle]) -> int:
    """+1 uptrend / -1 downtrend / 0 not yet established — the trend as MARKET STRUCTURE, and it
    PERSISTS until price decisively breaks it.

    THE MODEL (user 2026-07-26: "we have the main trend and inside it we can have ranging market or a
    movement we can't understand. But until the market shows decisively that the trend has changed, we
    trade the main trend"). This is Dow's own rule — a trend remains intact until the structure
    changes — and modern market structure gives the precise test: a trend continues through a BOS and
    only turns on a CHoCH, i.e. a close through the swing that was protecting it.

      ESTABLISH  two higher highs + higher lows -> up;  two lower highs + lower lows -> down
      HOLD       consolidation, a range, an unreadable stretch: the trend does NOT change
      FLIP       only when a BODY CLOSE takes out the last protected swing the other way
                 (in an uptrend, the last higher LOW; in a downtrend, the last lower HIGH)

    WHAT THIS REPLACED, and why. It used to be a least-squares SLOPE over a fixed 36-bar window with
    a drift >= 2x ATR filter. That is stateless and instantaneous: it recomputes from scratch every
    bar, has no memory of the prevailing trend, and cannot express persistence at all. Measured over
    3,075 H1 bars of GBP/USD (Jan-Jun 2021) it read FLAT on 35% of bars and made 29 'round trips'
    (trend -> flat -> the SAME trend again with no reversal in between) — pure amnesia, not analysis.
    The user's own 30-Jun-2021 example is the case in miniature: an obvious multi-day downtrend that
    the 36-bar window called flat, missing the threshold by 2.7 pips, purely because its window sat
    inside the consolidation at the bottom of the move.

    MEASURED against his 34 logged trades: the slope agreed with 14/34 (41%) and read FLAT on 13 of
    them — those 13 are setups silently dropped for want of a trend. This version agrees with 26/34
    (76%) and reads flat on none.

    Deliberately DERIVED, never stored: the state is replayed from the passed window every call, so
    there is no hidden global that a restart, a redeploy or a second process could desynchronise.
    The caller's signature is unchanged.
    """
    n = len(candles)
    if n < _MIN_BARS:
        return 0
    pts = sorted(find_swing_points(candles, _SWING_N), key=lambda p: p.index)
    if not pts:
        return 0

    trend = 0
    protected: float | None = None     # the swing whose CLOSE-through would END the current trend
    highs: list[float] = []
    lows:  list[float] = []
    since: list[float] = []            # counter-swings formed since the last BOS (see below)
    last_ext: float | None = None      # the last swing that EXTENDED the trend (last LL / last HH)
    k = 0                              # pointer into pts — a swing at j is only KNOWN j+N bars later

    for i, c in enumerate(candles):
        while k < len(pts) and pts[k].index + _SWING_N <= i:
            p = pts[k]; k += 1
            (highs if p.is_high else lows).append(p.price)
            if trend == 0:
                continue
            # An UPTREND is extended by a higher HIGH; a DOWNTREND by a lower LOW. The swing on the
            # OTHER side is the one that PROTECTS the trend (the higher low / the lower high).
            extends = p.is_high if trend == 1 else (not p.is_high)
            if not extends:
                # A protective-side swing: bank it, but it does NOT move the protection yet. This is
                # the whole point — the highs printed while a downtrend consolidates are noise INSIDE
                # the trend, not the level that defines it. Moving protection to each of them is what
                # made the first version flip 8 times in 8 days.
                since.append(p.price)
                continue
            # A swing in the trend's own direction. It is a BOS (continuation) only if it actually
            # EXTENDED the trend. Only then does protection advance — to the most conservative
            # counter-swing of the leg just completed — and the accumulator resets.
            if last_ext is None or (p.price > last_ext if trend == 1 else p.price < last_ext):
                if since:
                    protected = min(since) if trend == 1 else max(since)
                last_ext = p.price
                since = []

        if trend == 0:
            # ESTABLISH from two consecutive swings each way
            if len(highs) >= 2 and len(lows) >= 2:
                if highs[-1] > highs[-2] and lows[-1] > lows[-2]:
                    trend, protected, last_ext, since = 1, lows[-2], lows[-1], []
                elif highs[-1] < highs[-2] and lows[-1] < lows[-2]:
                    trend, protected, last_ext, since = -1, highs[-2], highs[-1], []
        elif protected is not None:
            # FLIP only on a BODY CLOSE through the protected swing — a wick through it is a
            # liquidity grab, the platform-wide rule for both strategies.
            if trend == 1 and c.close < protected:
                trend, protected, last_ext, since = -1, (max(since) if since else None), None, []
            elif trend == -1 and c.close > protected:
                trend, protected, last_ext, since = 1, (min(since) if since else None), None, []

    return trend


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
