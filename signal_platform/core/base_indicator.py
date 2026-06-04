from abc import ABC, abstractmethod
from core.types import MTFCandles
from core.indicator_types import IndicatorResult


class BaseIndicator(ABC):
    name:                str
    id:                  str
    required_timeframes: list[str]   # any TF strings e.g. ["H4", "D1"]

    @abstractmethod
    def compute(self, candles: MTFCandles) -> IndicatorResult:
        """Compute indicator values from multi-timeframe candles."""
        ...
