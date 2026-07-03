"""
BX-S/D — market-structure engine (Phase 1).

BX-S/D's OWN structure logic (self-contained). Maps swing structure and detects
BOS / CHoCH by CANDLE BODY CLOSE — never wicks — per the SMC book (Ch. 11-12):
  * BOS  = a body close beyond the last swing in the SAME direction as the trend (continuation).
  * CHoCH = a body close beyond the last swing AGAINST the trend (flips character).
A trend is only CONFIRMED after TWO same-direction breaks (2 highs / 2 lows); the first
break leaves it unconfirmed. BX-S/D trades ONLY the confirmed pro-trend direction.

Reuses only the generic shared RESOURCE find_swing_points (pivot detection) — no other
strategy's logic.
"""
from dataclasses import dataclass, field

from core.types import Candle
from shared.swing_points import find_swing_points

_SWING_N = 3   # generic pivot half-width


@dataclass
class StructureEvent:
    kind:      str      # "BOS" | "CHoCH"
    direction: str      # "up" | "down"
    index:     int      # candle index where the body-close break confirmed
    level:     float    # the swing price that was broken


@dataclass
class StructureState:
    trend:     str  = "none"      # "up" | "down" | "none"
    confirmed: bool = False       # True after 2 same-direction breaks (no opposing CHoCH between)
    events:    list = field(default_factory=list)   # ordered StructureEvent
    ref_high:  float | None = None   # current unbroken swing high (bullish break level)
    ref_low:   float | None = None   # current unbroken swing low  (bearish break level)

    @property
    def last_bos(self):
        return next((e for e in reversed(self.events) if e.kind == "BOS"), None)

    @property
    def last_choch(self):
        return next((e for e in reversed(self.events) if e.kind == "CHoCH"), None)

    def pro_trend(self) -> str | None:
        """The direction BX-S/D may trade — only when the trend is CONFIRMED."""
        return self.trend if self.confirmed else None


def map_structure(candles: list[Candle], n: int = _SWING_N) -> StructureState:
    """
    Walk candles left→right. A body CLOSE beyond the most recent UNBROKEN opposite swing is a
    break: with the prior trend = BOS, against it = CHoCH (flips the trend). Confirmed only
    after 2 same-direction breaks. Returns the final StructureState.
    """
    pts = sorted(find_swing_points(candles, n), key=lambda p: p.index)
    st  = StructureState()
    if not pts:
        return st

    up_streak = down_streak = 0
    broken_high_idx = broken_low_idx = -1     # swing indices already consumed by a break

    for i, c in enumerate(candles):
        # A swing at index j is only "known" n bars later (needs n bars on its right).
        conf        = [p for p in pts if p.index + n <= i]
        fresh_highs = [p for p in conf if p.is_high     and p.index > broken_high_idx]
        fresh_lows  = [p for p in conf if not p.is_high and p.index > broken_low_idx]
        ref_high    = fresh_highs[-1] if fresh_highs else None
        ref_low     = fresh_lows[-1]  if fresh_lows  else None

        if ref_high is not None and c.close > ref_high.price:
            broken_high_idx = ref_high.index
            prior = st.trend
            if prior == "down":
                kind, up_streak, down_streak = "CHoCH", 1, 0
            else:
                kind = "BOS"; up_streak += 1
            st.trend, st.confirmed = "up", up_streak >= 2
            st.events.append(StructureEvent(kind, "up", i, ref_high.price))

        elif ref_low is not None and c.close < ref_low.price:
            broken_low_idx = ref_low.index
            prior = st.trend
            if prior == "up":
                kind, down_streak, up_streak = "CHoCH", 1, 0
            else:
                kind = "BOS"; down_streak += 1
            st.trend, st.confirmed = "down", down_streak >= 2
            st.events.append(StructureEvent(kind, "down", i, ref_low.price))

    # expose the current unbroken swings to beat (for later phases)
    tail_conf = [p for p in pts]
    fh = [p for p in tail_conf if p.is_high     and p.index > broken_high_idx]
    fl = [p for p in tail_conf if not p.is_high and p.index > broken_low_idx]
    st.ref_high = fh[-1].price if fh else None
    st.ref_low  = fl[-1].price if fl else None
    return st
