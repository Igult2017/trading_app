from abc import ABC, abstractmethod
from core.types import Candle
from core.pattern_types import PatternMatch


class BasePattern(ABC):
    name:                str
    id:                  str       # must match CandlePattern enum value
    required_timeframes: list[str] # any TF strings e.g. ["M5", "H1"]
    lookback:            int       # minimum candles needed to detect

    @abstractmethod
    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        """Scan candle list and return every location where pattern occurs."""
        ...
