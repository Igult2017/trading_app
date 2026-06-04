"""
Single source of truth for all platform types.
Every module imports from here — no type duplication anywhere.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


# ── TimeFrame — dynamic, any string is valid ───────────────────────────────────
# Strategies declare whatever they need: "M15", "H2", "H8", "D1", etc.
# The platform fetches it without restriction.
TimeFrame = str


class TF:
    """
    Convenience constants — use these or pass any plain string.
    A strategy can declare required_timeframes = [TF.M15, TF.H4, "H2"]
    or just required_timeframes = ["M15", "H4", "H2"].  Both are identical.
    """
    M1  = "M1"
    M3  = "M3"
    M5  = "M5"
    M10 = "M10"
    M15 = "M15"
    M30 = "M30"
    H1  = "H1"
    H2  = "H2"
    H3  = "H3"
    H4  = "H4"
    H6  = "H6"
    H8  = "H8"
    H12 = "H12"
    D1  = "D1"
    W1  = "W1"
    MN  = "MN"   # monthly


# ── Other enums (these are fixed — not user-extensible) ───────────────────────

class Session(Enum):
    ASIAN    = "asian"
    LONDON   = "london"
    NEW_YORK = "new_york"
    ALL      = "all"


class Trend(Enum):
    UPTREND   = "uptrend"
    DOWNTREND = "downtrend"
    RANGING   = "ranging"
    ANY       = "any"


class Direction(Enum):
    BUY     = "buy"
    SELL    = "sell"
    NEUTRAL = "neutral"


class NewsImpact(Enum):
    LOW    = "low"
    MEDIUM = "medium"
    HIGH   = "high"


class NewsStance(Enum):
    AVOID_ALL       = "avoid_all"
    AVOID_HIGH_ONLY = "avoid_high_only"
    REQUIRE_NEWS    = "require_news"
    NEWS_AGNOSTIC   = "news_agnostic"


class SignalStatus(Enum):
    PENDING     = "pending"
    ACTIVE      = "active"
    EXECUTED    = "executed"
    INVALIDATED = "invalidated"
    EXPIRED     = "expired"


class ZoneType(Enum):
    SUPPLY = "supply"
    DEMAND = "demand"


# ── Core data structures ───────────────────────────────────────────────────────

@dataclass
class Candle:
    time:      int        # unix timestamp (seconds)
    open:      float
    high:      float
    low:       float
    close:     float
    volume:    float
    timeframe: str        # any string e.g. "M15", "H4", "D1"


@dataclass
class Zone:
    type:       ZoneType
    top:        float
    bottom:     float
    timeframe:  str
    formed_at:  int       # candle index where zone formed
    mitigated:  bool = False


@dataclass
class SwingPoint:
    price:     float
    index:     int
    is_high:   bool       # True = swing high, False = swing low


@dataclass
class LiquiditySweep:
    direction: Direction  # which side was swept
    level:     float
    candle_idx: int


# ── MTFCandles container ───────────────────────────────────────────────────────

@dataclass
class MTFCandles:
    _data: dict[str, list[Candle]] = field(default_factory=dict)

    @classmethod
    def from_cache(cls, cache: dict[str, list[Candle]],
                   timeframes: list[str]) -> "MTFCandles":
        return cls(_data={tf: cache[tf] for tf in timeframes if tf in cache})

    def get(self, tf: str) -> list[Candle]:
        return self._data.get(tf, [])

    def timeframes(self) -> list[str]:
        return list(self._data.keys())


# ── News types ─────────────────────────────────────────────────────────────────

@dataclass
class NewsEvent:
    title:        str
    currency:     str
    impact:       NewsImpact
    scheduled_at: datetime
    actual:       Optional[str] = None
    forecast:     Optional[str] = None
    previous:     Optional[str] = None


@dataclass
class NewsContext:
    events:             list[NewsEvent]
    pre_window_mins:    int = 15
    post_window_mins:   int = 15

    def has_high_impact(self, currencies: list[str]) -> bool:
        return any(
            e.impact == NewsImpact.HIGH and e.currency in currencies
            for e in self.events
        )

    def upcoming(self, impact: NewsImpact, currencies: list[str]) -> list[NewsEvent]:
        return [e for e in self.events
                if e.impact == impact and e.currency in currencies]

    def recent(self, impact: NewsImpact, currencies: list[str]) -> list[NewsEvent]:
        return self.upcoming(impact, currencies)


# ── Signal ─────────────────────────────────────────────────────────────────────

@dataclass
class Signal:
    symbol:             str
    asset_class:        str = "forex"
    direction:          Direction = Direction.BUY
    strategy_id:        str = ""
    strategy_name:      str = ""
    entry_price:        float = 0.0
    stop_loss:          float = 0.0
    take_profit:        float = 0.0
    risk_reward:        float = 0.0
    confidence:         float = 0.0          # 0.0 – 1.0
    primary_timeframe:  str = ""
    technical_reasons:  list[str] = field(default_factory=list)
    smc_factors:        list[str] = field(default_factory=list)
    market_context:     str = ""
    status:             SignalStatus = SignalStatus.ACTIVE
    chart_path:         Optional[str] = None
    created_at:         datetime = field(default_factory=datetime.utcnow)
    expires_at:         Optional[datetime] = None


# ── Strategy result ────────────────────────────────────────────────────────────

@dataclass
class StrategyResult:
    signals:  list[Signal] = field(default_factory=list)
    errors:   list[str]    = field(default_factory=list)

    @classmethod
    def empty(cls) -> "StrategyResult":
        return cls()

    def has_signals(self) -> bool:
        return bool(self.signals)
