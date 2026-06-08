from abc import ABC, abstractmethod
from typing import Any
from core.types import MTFCandles


class BaseFeature(ABC):
    """
    A registered platform feature — a named, reusable analysis computation.
    Strategies request features by id in required_features = ["trend", "zones"].
    The platform computes and injects them into StrategyContext.features.
    """
    name: str
    id:   str

    @abstractmethod
    def compute(self, candles: MTFCandles) -> Any:
        """
        Compute feature from the strategy's declared MTFCandles.
        Return value type is feature-specific; document it in the subclass.
        """
        ...
