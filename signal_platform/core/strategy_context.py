from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any
from core.types import MTFCandles, NewsContext, Session
from core.indicator_types import IndicatorBundle
from core.pattern_types import PatternBundle


@dataclass
class StrategyContext:
    """
    Platform-built, strategy-specific execution context.
    Contains ONLY what the strategy declared it needs — nothing extra.
    Strategies never build this themselves; the platform does.
    """
    symbol:     str
    candles:    MTFCandles
    indicators: IndicatorBundle
    patterns:   PatternBundle
    features:   dict[str, Any]      = field(default_factory=dict)
    session:    list[Session]       = field(default_factory=list)
    news:       NewsContext | None  = None
    spread:     float | None        = None
    # THE LIVE (bid, ask) AT THIS TICK — the only genuinely current price the platform has, because
    # the feed serves CLOSED bars only and the newest close can be ~2 minutes old. For TRIGGER reads
    # ("which side of the line is price on now", "would this stop order fill immediately"), never for
    # levels. Comes from the same two tick requests the spread already makes. None = could not read.
    quote:      tuple[float, float] | None = None
    volatility: float | None        = None
