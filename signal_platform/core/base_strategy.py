from abc import ABC, abstractmethod
from core.types import (
    Session, Trend, NewsStance, NewsImpact,
    MTFCandles, NewsContext, StrategyResult,
)
from core.indicator_types import IndicatorBundle
from core.pattern_types import PatternBundle

_REQUIRED = (
    "name", "id", "enabled",
    "required_timeframes", "required_indicators", "required_patterns",
    "allowed_sessions", "allowed_trends", "allowed_instruments",
    "news_stance", "news_impact_filter",
)


class BaseStrategy(ABC):
    name:                 str
    id:                   str
    enabled:              bool = True

    # Data declarations — list of any TF strings e.g. ["M15", "H4", "D1"]
    required_timeframes:  list[str]
    required_indicators:  list[str]
    required_patterns:    list[str]

    # Pre-filter declarations
    allowed_sessions:     list[Session]
    allowed_trends:       list[Trend]
    allowed_instruments:  list[str] | None   # None = all instruments
    news_stance:          NewsStance
    news_impact_filter:   list[NewsImpact]

    @abstractmethod
    async def analyze(
        self,
        candles:      MTFCandles,
        indicators:   IndicatorBundle,
        patterns:     PatternBundle,
        news_context: NewsContext,
    ) -> StrategyResult:
        """Core strategy logic. Return StrategyResult.empty() when no signal."""
        ...

    @classmethod
    def validate_declarations(cls) -> None:
        """Called at registration — raises ValueError on missing declarations."""
        missing = [attr for attr in _REQUIRED if not hasattr(cls, attr)]
        if missing:
            raise ValueError(
                f"Strategy '{cls.__name__}' missing declarations: {missing}. "
                "All 8 declarations are required."
            )
