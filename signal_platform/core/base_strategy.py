from abc import ABC, abstractmethod
from core.types import Session, Trend, NewsStance, NewsImpact, StrategyResult
from core.strategy_context import StrategyContext

# Mandatory declarations — missing any of these raises at registration time.
# Optional declarations (required_indicators, required_features, requires_*)
# all have safe defaults and do not need to be re-declared in every strategy.
_REQUIRED = (
    "name", "id", "enabled",
    "required_timeframes",
    "allowed_sessions", "allowed_trends", "allowed_instruments",
    "news_stance", "news_impact_filter",
)


class BaseStrategy(ABC):
    name:    str
    id:      str
    enabled: bool = True

    # ── What to fetch ──────────────────────────────────────────────────────────
    required_timeframes: list[str]   # e.g. ["M15", "H4"]

    # ── Plugin dependencies (all optional — default to empty) ──────────────────
    required_indicators: list[str] = []
    required_patterns:   list[str] = []
    required_features:   list[str] = []   # e.g. ["trend", "liquidity_sweep"]

    # ── Context opt-ins (platform populates only what is True) ─────────────────
    requires_news:       bool = False
    requires_session:    bool = False
    requires_volatility: bool = False
    requires_spread:     bool = False

    # ── Pre-filter declarations (control WHEN strategy runs, not what it sees) ─
    allowed_sessions:    list[Session]
    allowed_trends:      list[Trend]
    allowed_instruments: list[str] | None   # None = all instruments
    news_stance:         NewsStance
    news_impact_filter:  list[NewsImpact]

    @abstractmethod
    async def analyze(self, context: StrategyContext) -> StrategyResult:
        """
        Core strategy logic.
        context contains exactly what this strategy declared — nothing else.
        Return StrategyResult.empty() when no signal is found.
        """
        ...

    @classmethod
    def validate_declarations(cls) -> None:
        """Called at registration — raises ValueError on missing declarations."""
        missing = [attr for attr in _REQUIRED if not hasattr(cls, attr)]
        if missing:
            raise ValueError(
                f"Strategy '{cls.__name__}' missing required declarations: {missing}"
            )
