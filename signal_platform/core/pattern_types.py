from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from core.types import Direction


class CandlePattern(Enum):
    # Volume / size
    VOLUME_CANDLE     = "volume_candle"
    MARUBOZU          = "marubozu"
    # Wick-based
    LONG_UPPER_WICK   = "long_upper_wick"
    LONG_LOWER_WICK   = "long_lower_wick"
    VIOLENT_CANDLE    = "violent_candle"
    # Doji family
    DOJI              = "doji"
    GRAVESTONE_DOJI   = "gravestone_doji"
    DRAGONFLY_DOJI    = "dragonfly_doji"
    LONG_LEGGED_DOJI  = "long_legged_doji"
    # Reversal single-candle
    HAMMER            = "hammer"
    SHOOTING_STAR     = "shooting_star"
    INVERTED_HAMMER   = "inverted_hammer"
    HANGING_MAN       = "hanging_man"
    # Engulfing
    BULLISH_ENGULFING = "bullish_engulfing"
    BEARISH_ENGULFING = "bearish_engulfing"
    # Institutional / smart money
    INSTITUTIONAL     = "institutional"
    IMPULSE           = "impulse"
    REJECTION         = "rejection"
    # Consolidation
    INSIDE_BAR        = "inside_bar"
    OUTSIDE_BAR       = "outside_bar"
    SPINNING_TOP      = "spinning_top"


@dataclass
class PatternMatch:
    pattern:    CandlePattern
    timeframe:  str           # any TF string e.g. "M15", "H4"
    candle_idx: int
    direction:  Direction
    strength:   float         # 0.0 – 1.0
    notes:      str = ""


@dataclass
class PatternBundle:
    _data: dict[CandlePattern, list[PatternMatch]] = field(default_factory=dict)

    def get(self, p: CandlePattern) -> list[PatternMatch]:
        return self._data.get(p, [])

    def found(self, p: CandlePattern) -> bool:
        return bool(self.get(p))

    def latest(self, p: CandlePattern) -> PatternMatch | None:
        matches = self.get(p)
        return matches[-1] if matches else None

    @classmethod
    def from_cache(cls, cache: dict[str, list[PatternMatch]],
                   ids: list[str]) -> "PatternBundle":
        data: dict[CandlePattern, list[PatternMatch]] = {}
        for k in ids:
            if k not in cache:
                continue
            try:
                data[CandlePattern(k)] = cache[k]
            except ValueError:
                pass
        return cls(_data=data)
