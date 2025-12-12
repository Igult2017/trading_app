"""
Base strategy class that all strategies inherit from.
Provides common functionality for analysis and signal generation.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional
import time
import uuid

from ..types import (
    StrategyResult, 
    StrategySignal, 
    EntrySetup,
    MultiTimeframeData,
    Candle
)
from ..instruments import Instrument
from ..logging_config import get_logger


@dataclass
class StrategyConfig:
    """Strategy configuration."""
    id: str
    name: str
    description: str
    min_confidence: int = 60
    max_signals_per_scan: int = 3
    enabled: bool = True


@dataclass
class InstrumentData:
    """Data passed to strategy for analysis."""
    symbol: str
    asset_class: str
    current_price: float
    data: MultiTimeframeData


class BaseStrategy(ABC):
    """
    Abstract base class for trading strategies.
    
    All strategies should inherit from this class and implement
    the `analyze` method.
    """
    
    def __init__(self, config: StrategyConfig):
        self.config = config
        self.id = config.id
        self.name = config.name
        self.description = config.description
        self.min_confidence = config.min_confidence
        self.max_signals = config.max_signals_per_scan
        self.enabled = config.enabled
        self.logger = get_logger(f"strategy.{config.id}")
    
    @abstractmethod
    async def analyze(self, instrument: InstrumentData) -> StrategyResult:
        """
        Analyze an instrument and return signals.
        
        Args:
            instrument: InstrumentData with price and candle data
            
        Returns:
            StrategyResult with signals and pending setups
        """
        pass
    
    def validate_setup(
        self, 
        setup: EntrySetup, 
        data: MultiTimeframeData
    ) -> bool:
        """
        Validate an entry setup is still valid.
        
        Args:
            setup: The entry setup to validate
            data: Current MTF data
            
        Returns:
            True if setup is still valid
        """
        if setup.risk_reward_ratio < 1.5:
            return False
        
        if setup.confidence < self.min_confidence:
            return False
        
        if data.m1:
            current_price = data.m1[-1].close
            zone = setup.entry_zone
            
            is_still_valid = (
                current_price >= zone.bottom_price * 0.995 and
                current_price <= zone.top_price * 1.005
            )
            return is_still_valid
        
        return True
    
    def create_signal_id(self) -> str:
        """Generate unique signal ID."""
        return f"{self.id}_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    
    def calculate_expiry_time(self, hours: float = 4.0) -> int:
        """Calculate signal expiry timestamp."""
        return int((time.time() + hours * 3600) * 1000)
    
    def log_analysis(self, message: str, **kwargs) -> None:
        """Log analysis step."""
        self.logger.info(message, extra=kwargs)
    
    def log_error(self, message: str, error: Optional[Exception] = None) -> None:
        """Log error during analysis."""
        if error:
            self.logger.error(f"{message}: {error}", exc_info=True)
        else:
            self.logger.error(message)


class StrategyRegistry:
    """Registry for managing multiple strategies."""
    
    def __init__(self):
        self._strategies: List[BaseStrategy] = []
    
    def register(self, strategy: BaseStrategy) -> None:
        """Register a strategy."""
        self._strategies.append(strategy)
        get_logger("registry").info(f"Registered strategy: {strategy.name}")
    
    def get_enabled_strategies(self) -> List[BaseStrategy]:
        """Get all enabled strategies."""
        return [s for s in self._strategies if s.enabled]
    
    async def run_all_strategies(
        self, 
        instrument: InstrumentData
    ) -> StrategyResult:
        """
        Run all enabled strategies on an instrument.
        
        Args:
            instrument: Instrument data to analyze
            
        Returns:
            Combined StrategyResult from all strategies
        """
        all_signals: List[StrategySignal] = []
        all_pending: List[EntrySetup] = []
        all_errors: List[str] = []
        total_time = 0
        
        for strategy in self.get_enabled_strategies():
            try:
                result = await strategy.analyze(instrument)
                all_signals.extend(result.signals)
                all_pending.extend(result.pending_setups)
                all_errors.extend(result.errors)
                total_time += result.analysis_time_ms
            except Exception as e:
                all_errors.append(f"{strategy.name}: {str(e)}")
        
        return StrategyResult(
            strategy_id="combined",
            signals=all_signals,
            pending_setups=all_pending,
            errors=all_errors,
            analysis_time_ms=total_time
        )
    
    def get_stats(self) -> dict:
        """Get registry statistics."""
        return {
            "total_strategies": len(self._strategies),
            "enabled_strategies": len(self.get_enabled_strategies()),
            "strategy_names": [s.name for s in self._strategies]
        }


strategy_registry = StrategyRegistry()
