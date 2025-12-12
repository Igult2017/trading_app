"""
Type definitions for the signal scanner.
Contains all data structures used throughout the application.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict, Optional, Literal, Any
from enum import Enum


class SignalDirection(str, Enum):
    BUY = "buy"
    SELL = "sell"


class SignalStatus(str, Enum):
    ACTIVE = "active"
    WATCHLIST = "watchlist"
    EXPIRED = "expired"
    STOPPED_OUT = "stopped_out"
    TARGET_HIT = "target_hit"


class TrendDirection(str, Enum):
    BULLISH = "bullish"
    BEARISH = "bearish"
    SIDEWAYS = "sideways"


class ZoneType(str, Enum):
    DEMAND = "demand"
    SUPPLY = "supply"


class EntryType(str, Enum):
    ZONE_TOUCH = "zone_touch"
    CHOCH = "choch"
    LIQUIDITY_SWEEP = "liquidity_sweep"
    FVG = "fvg"


class SwingType(str, Enum):
    """Swing point classification for market structure."""
    HH = "HH"  # Higher High
    HL = "HL"  # Higher Low
    LH = "LH"  # Lower High
    LL = "LL"  # Lower Low


Timeframe = Literal["1D", "4H", "2H", "1H", "30M", "15M", "5M", "3M", "1M"]


@dataclass
class Candle:
    """OHLCV candle data."""
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    
    @property
    def is_bullish(self) -> bool:
        return self.close > self.open
    
    @property
    def is_bearish(self) -> bool:
        return self.close < self.open
    
    @property
    def body_size(self) -> float:
        return abs(self.close - self.open)
    
    @property
    def total_range(self) -> float:
        return self.high - self.low
    
    @property
    def upper_wick(self) -> float:
        return self.high - max(self.open, self.close)
    
    @property
    def lower_wick(self) -> float:
        return min(self.open, self.close) - self.low
    
    @property
    def body_ratio(self) -> float:
        if self.total_range == 0:
            return 0
        return self.body_size / self.total_range


@dataclass
class Zone:
    """Supply or demand zone."""
    top_price: float
    bottom_price: float
    type: ZoneType
    strength: Literal["strong", "moderate", "weak"] = "moderate"
    origin_candle_index: int = 0
    touches: int = 0
    mitigated: bool = False
    created_at: int = 0  # Timestamp for freshness decay
    
    @property
    def mid_price(self) -> float:
        return (self.top_price + self.bottom_price) / 2
    
    @property
    def zone_size(self) -> float:
        return self.top_price - self.bottom_price
    
    def price_in_zone(self, price: float) -> bool:
        return self.bottom_price <= price <= self.top_price
    
    def overlaps_with(self, other: 'Zone') -> bool:
        """Check if this zone overlaps with another zone."""
        return not (self.top_price < other.bottom_price or self.bottom_price > other.top_price)
    
    def get_age_hours(self, current_timestamp: int) -> float:
        """Get zone age in hours for freshness decay."""
        if self.created_at == 0:
            return 0.0
        return (current_timestamp - self.created_at) / (1000 * 60 * 60)
    
    def freshness_score(self, current_timestamp: int, max_age_hours: float = 168.0) -> float:
        """
        Calculate zone freshness score (0-1).
        Newer zones score higher. Default max age is 168 hours (7 days).
        """
        age = self.get_age_hours(current_timestamp)
        if age >= max_age_hours:
            return 0.0
        return 1.0 - (age / max_age_hours)


@dataclass
class SwingPoint:
    """Swing high or low point with classification."""
    price: float
    index: int
    is_high: bool
    timestamp: int = 0
    swing_type: Optional['SwingType'] = None  # HH, HL, LH, LL
    swing_size: float = 0.0  # Price distance from previous swing (quality scoring)


@dataclass 
class MultiTimeframeData:
    """Candle data across all timeframes."""
    d1: List[Candle] = field(default_factory=list)
    h4: List[Candle] = field(default_factory=list)
    h2: List[Candle] = field(default_factory=list)
    h1: List[Candle] = field(default_factory=list)
    m30: List[Candle] = field(default_factory=list)
    m15: List[Candle] = field(default_factory=list)
    m5: List[Candle] = field(default_factory=list)
    m3: List[Candle] = field(default_factory=list)
    m1: List[Candle] = field(default_factory=list)


@dataclass
class TimeframeSelection:
    """Selected timeframes based on clarity analysis."""
    daily_context_tf: Timeframe
    major_zone_tf: Timeframe
    zone_identification_tf: Timeframe
    entry_refinement_tf: Timeframe
    daily_context_clarity: float
    major_zone_clarity: float
    zone_identification_clarity: float
    entry_refinement_clarity: float
    is_clear: bool
    reasoning: List[str] = field(default_factory=list)


@dataclass
class EntrySetup:
    """Entry setup details."""
    direction: SignalDirection
    entry_type: EntryType
    entry_price: float
    stop_loss: float
    take_profit: float
    risk_reward_ratio: float
    confidence: int
    entry_zone: Zone
    confirmations: List[str] = field(default_factory=list)
    
    @property
    def risk_pips(self) -> float:
        return abs(self.entry_price - self.stop_loss)
    
    @property
    def reward_pips(self) -> float:
        return abs(self.take_profit - self.entry_price)


@dataclass
class MarketContext:
    """Higher timeframe market context."""
    h4_trend_direction: TrendDirection
    d1_trend_direction: TrendDirection
    nearest_supply_target: Optional[float] = None
    nearest_demand_target: Optional[float] = None
    swing_points: List[SwingPoint] = field(default_factory=list)
    unmitigated_supply: List[Zone] = field(default_factory=list)
    unmitigated_demand: List[Zone] = field(default_factory=list)
    reasoning: List[str] = field(default_factory=list)


@dataclass
class StrategySignal:
    """Complete trading signal from strategy."""
    id: str
    strategy_id: str
    strategy_name: str
    symbol: str
    asset_class: str
    direction: SignalDirection
    entry_type: EntryType
    entry_price: float
    stop_loss: float
    take_profit: float
    risk_reward_ratio: float
    confidence: int
    timeframe: Timeframe
    market_context: MarketContext
    entry_setup: EntrySetup
    zones: Dict[str, List[Zone]]
    reasoning: List[str]
    created_at: int
    expires_at: int


@dataclass
class StrategyResult:
    """Result from running a strategy."""
    strategy_id: str
    signals: List[StrategySignal] = field(default_factory=list)
    pending_setups: List[EntrySetup] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    analysis_time_ms: int = 0


@dataclass
class GeminiValidation:
    """Result from Gemini AI validation."""
    validated: bool
    confidence_adjustment: int
    concerns: List[str]
    strengths: List[str]
    recommendation: Literal["proceed", "caution", "skip"]
    reasoning: str


@dataclass
class PriceResult:
    """Result from price fetch."""
    price: float
    change_24h: float = 0.0
    change_percent: float = 0.0
    high_24h: float = 0.0
    low_24h: float = 0.0
    volume: float = 0.0
    timestamp: int = 0
    source: str = "unknown"
