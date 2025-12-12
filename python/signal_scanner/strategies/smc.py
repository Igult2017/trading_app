"""
Smart Money Concepts (SMC) Strategy implementation.
5-step adaptive analysis: Clarity -> Context -> Zone Detection -> Refinement -> Entry
"""

import time
from typing import List, Optional, Tuple
from dataclasses import dataclass

from .base import BaseStrategy, StrategyConfig, InstrumentData
from ..types import (
    StrategyResult,
    StrategySignal,
    EntrySetup,
    MultiTimeframeData,
    Candle,
    Zone,
    ZoneType,
    SwingPoint,
    SwingType,
    MarketContext,
    SignalDirection,
    EntryType,
    TrendDirection,
    Timeframe,
    TimeframeSelection,
)
from ..logging_config import get_logger

logger = get_logger("smc_strategy")


SMC_CONFIG = StrategyConfig(
    id="smc_v2",
    name="Smart Money Concepts",
    description="Multi-timeframe SMC analysis with adaptive timeframe selection",
    min_confidence=60,
    max_signals_per_scan=3,
    enabled=True
)


@dataclass
class SMCClarityConfig:
    """Configurable parameters for SMC clarity analysis."""
    min_clarity_score: int = 60
    min_zones_required: int = 1
    max_zones_for_clarity: int = 5
    min_swing_points_required: int = 4
    min_trend_consistency: float = 0.6
    min_candles: int = 20
    swing_lookback: int = 5
    zone_max_age_hours: float = 168.0
    use_recency_weighting: bool = True
    use_swing_size_weighting: bool = True
    filter_overlapping_zones: bool = True
    min_rr_ratio: float = 1.5
    min_entry_confidence: int = 60


DEFAULT_SMC_CONFIG = SMCClarityConfig()


@dataclass
class ClarityResult:
    """Result of clarity analysis for a timeframe (matches TypeScript version)."""
    score: float
    is_clear: bool
    trend_consistency: float  # 0-1 score for trend consistency
    zone_clarity: float  # 0-1 score for zone quality
    structure_clarity: float  # 0-1 score for swing alternation
    reasoning: List[str]


@dataclass
class ZoneResult:
    """Result of zone analysis."""
    tradable_zones: List[Zone]
    unmitigated_supply: List[Zone]
    unmitigated_demand: List[Zone]
    all_zones: List[Zone]
    reasoning: List[str]


@dataclass
class RefinementResult:
    """Result of zone refinement."""
    refined_zone: Optional[Zone]
    original_zone: Zone
    was_refined: bool
    reasoning: List[str]


@dataclass
class EntryResult:
    """Result of entry detection."""
    has_valid_entry: bool
    setup: Optional[EntrySetup]
    reasoning: List[str]


def classify_swing_points(swing_points: List[SwingPoint]) -> List[SwingPoint]:
    """
    Classify swing points as HH/HL/LH/LL based on previous swings.
    Also calculates swing_size for quality scoring.
    Matches TypeScript implementation by seeding initial values with -Infinity/Infinity.
    This ensures the first high/low always gets classified.
    """
    if len(swing_points) == 0:
        return swing_points
    
    classified = []
    last_higher_high = float('-inf')
    last_lower_low = float('inf')
    last_higher_low = float('-inf')
    last_lower_high = float('inf')
    prev_high_price: Optional[float] = None
    prev_low_price: Optional[float] = None
    
    for sp in swing_points:
        swing_type: Optional[SwingType] = None
        swing_size: float = 0.0
        
        if sp.is_high:
            if prev_high_price is not None:
                swing_size = abs(sp.price - prev_high_price)
            prev_high_price = sp.price
            
            if sp.price > last_higher_high:
                swing_type = SwingType.HH
                last_higher_high = sp.price
                last_lower_high = sp.price
            elif sp.price < last_lower_high:
                swing_type = SwingType.LH
                last_lower_high = sp.price
            else:
                swing_type = SwingType.LH
        else:
            if prev_low_price is not None:
                swing_size = abs(sp.price - prev_low_price)
            prev_low_price = sp.price
            
            if sp.price < last_lower_low:
                swing_type = SwingType.LL
                last_lower_low = sp.price
                last_higher_low = sp.price
            elif sp.price > last_higher_low:
                swing_type = SwingType.HL
                last_higher_low = sp.price
            else:
                swing_type = SwingType.HL
        
        new_sp = SwingPoint(
            price=sp.price,
            index=sp.index,
            is_high=sp.is_high,
            timestamp=sp.timestamp,
            swing_type=swing_type,
            swing_size=swing_size
        )
        classified.append(new_sp)
    
    return classified


def calculate_trend_consistency(swing_points: List[SwingPoint], trend: TrendDirection) -> float:
    """
    Calculate how consistent swings are with the trend direction.
    Returns 0-1 score. Matches TypeScript calculateTrendConsistency().
    """
    if len(swing_points) < 4:
        return 0.0
    
    recent_swings = swing_points[-8:]
    
    if trend == TrendDirection.BULLISH:
        bullish_swings = sum(
            1 for s in recent_swings 
            if s.swing_type in (SwingType.HH, SwingType.HL)
        )
        return bullish_swings / len(recent_swings)
    
    if trend == TrendDirection.BEARISH:
        bearish_swings = sum(
            1 for s in recent_swings 
            if s.swing_type in (SwingType.LL, SwingType.LH)
        )
        return bearish_swings / len(recent_swings)
    
    hh_hl = sum(1 for s in recent_swings if s.swing_type in (SwingType.HH, SwingType.HL))
    ll_lh = sum(1 for s in recent_swings if s.swing_type in (SwingType.LL, SwingType.LH))
    balance = abs(hh_hl - ll_lh) / len(recent_swings)
    
    return 1 - balance


def calculate_weighted_trend_consistency(
    swing_points: List[SwingPoint], 
    trend: TrendDirection,
    use_recency: bool = True,
    use_size_weight: bool = True
) -> float:
    """
    Calculate weighted trend consistency with recency and size weighting.
    
    Args:
        swing_points: Classified swing points
        trend: Expected trend direction
        use_recency: Apply recency weighting (newer swings matter more)
        use_size_weight: Apply swing size weighting (larger swings matter more)
    
    Returns 0-1 score where higher = more consistent with trend.
    """
    if len(swing_points) < 4:
        return 0.0
    
    recent_swings = swing_points[-8:]
    n = len(recent_swings)
    
    total_weight = 0.0
    weighted_score = 0.0
    
    max_swing_size = max((s.swing_size for s in recent_swings), default=1.0) or 1.0
    
    for i, swing in enumerate(recent_swings):
        recency_weight = (i + 1) / n if use_recency else 1.0
        size_weight = (swing.swing_size / max_swing_size) if use_size_weight and swing.swing_size > 0 else 1.0
        combined_weight = recency_weight * (0.5 + 0.5 * size_weight)
        
        is_trend_aligned = False
        if trend == TrendDirection.BULLISH:
            is_trend_aligned = swing.swing_type in (SwingType.HH, SwingType.HL)
        elif trend == TrendDirection.BEARISH:
            is_trend_aligned = swing.swing_type in (SwingType.LL, SwingType.LH)
        else:
            is_trend_aligned = True
        
        weighted_score += combined_weight if is_trend_aligned else 0.0
        total_weight += combined_weight
    
    return weighted_score / total_weight if total_weight > 0 else 0.0


def calculate_swing_quality_score(swing_points: List[SwingPoint]) -> float:
    """
    Calculate overall swing quality score based on swing sizes.
    
    Higher score = more significant swing structures (larger moves).
    Returns 0-1 score.
    """
    if len(swing_points) < 2:
        return 0.0
    
    recent_swings = swing_points[-10:]
    swing_sizes = [s.swing_size for s in recent_swings if s.swing_size > 0]
    
    if not swing_sizes:
        return 0.5
    
    avg_size = sum(swing_sizes) / len(swing_sizes)
    max_size = max(swing_sizes)
    
    consistency = 1.0 - (max(swing_sizes) - min(swing_sizes)) / max_size if max_size > 0 else 0.5
    
    return min(1.0, 0.5 + 0.5 * consistency)


def calculate_zone_clarity(zones: List[Zone], max_zones: int = 10) -> float:
    """
    Calculate zone clarity score based on quality and balance.
    Returns 0-1 score. Matches TypeScript calculateZoneClarity().
    """
    if len(zones) == 0:
        return 0.0
    
    if len(zones) > max_zones:
        return 0.3
    
    strong_zones = sum(1 for z in zones if z.strength == "strong")
    moderate_zones = sum(1 for z in zones if z.strength == "moderate")
    
    quality_score = (strong_zones * 1.0 + moderate_zones * 0.6) / len(zones)
    
    supply_zones = sum(1 for z in zones if z.type == ZoneType.SUPPLY)
    demand_zones = sum(1 for z in zones if z.type == ZoneType.DEMAND)
    balance_score = 1.0 if supply_zones > 0 and demand_zones > 0 else 0.5
    
    return min(1.0, quality_score * 0.7 + balance_score * 0.3)


def calculate_structure_clarity(swing_points: List[SwingPoint], min_swings: int = 4) -> float:
    """
    Calculate structure clarity based on alternating highs and lows.
    Returns 0-1 score. Matches TypeScript calculateStructureClarity().
    Uses only swing_type (HH/LH = high, HL/LL = low) without fallback.
    """
    if len(swing_points) < min_swings:
        return 0.0
    
    recent_swings = swing_points[-10:]
    
    alternating_count = 0
    for i in range(1, len(recent_swings)):
        prev = recent_swings[i - 1]
        curr = recent_swings[i]
        
        prev_is_high = prev.swing_type in (SwingType.HH, SwingType.LH)
        curr_is_high = curr.swing_type in (SwingType.HH, SwingType.LH)
        
        if prev_is_high != curr_is_high:
            alternating_count += 1
    
    return alternating_count / (len(recent_swings) - 1) if len(recent_swings) > 1 else 0.0


def analyze_clarity(
    candles: List[Candle], 
    timeframe: str = "15M",
    config: Optional[SMCClarityConfig] = None
) -> ClarityResult:
    """
    Analyze price action clarity on a timeframe.
    Enhanced version with configurable parameters and weighted scoring.
    
    Returns clarity score (0-100) based on:
    - Trend consistency (35%): How well swings match trend (with recency/size weighting)
    - Zone clarity (35%): Quality and balance of zones
    - Structure clarity (30%): Alternating highs/lows
    """
    cfg = config or DEFAULT_SMC_CONFIG
    reasons: List[str] = []
    
    if len(candles) < cfg.min_candles:
        return ClarityResult(
            score=0,
            is_clear=False,
            trend_consistency=0,
            zone_clarity=0,
            structure_clarity=0,
            reasoning=["Insufficient candle data"]
        )
    
    swing_points = detect_swing_points(candles, lookback=cfg.swing_lookback)
    classified_swings = classify_swing_points(swing_points)
    trend = determine_trend(candles, classified_swings)
    
    trend_consistency = calculate_weighted_trend_consistency(
        classified_swings, 
        trend,
        use_recency=cfg.use_recency_weighting,
        use_size_weight=cfg.use_swing_size_weighting
    )
    reasons.append(f"Trend consistency: {trend_consistency * 100:.0f}%")
    
    swing_quality = calculate_swing_quality_score(classified_swings)
    reasons.append(f"Swing quality: {swing_quality * 100:.0f}%")
    
    zones = detect_zones(candles, "neutral", candles[-1].close, filter_overlaps=cfg.filter_overlapping_zones)
    unmitigated = [z for z in zones.all_zones if not z.mitigated]
    
    zone_clarity = calculate_zone_clarity(unmitigated, max_zones=cfg.max_zones_for_clarity)
    reasons.append(f"Zone clarity: {zone_clarity * 100:.0f}% ({len(unmitigated)} unmitigated zones)")
    
    structure_clarity = calculate_structure_clarity(classified_swings, min_swings=cfg.min_swing_points_required)
    reasons.append(f"Structure clarity: {structure_clarity * 100:.0f}%")
    
    score = round(
        (trend_consistency * 30) +
        (zone_clarity * 30) +
        (structure_clarity * 25) +
        (swing_quality * 15)
    )
    
    is_clear = (
        score >= cfg.min_clarity_score and
        len(classified_swings) >= cfg.min_swing_points_required and
        len(unmitigated) >= cfg.min_zones_required
    )
    
    return ClarityResult(
        score=score,
        is_clear=is_clear,
        trend_consistency=trend_consistency,
        zone_clarity=zone_clarity,
        structure_clarity=structure_clarity,
        reasoning=reasons
    )


def detect_swing_points(candles: List[Candle], lookback: int = 5) -> List[SwingPoint]:
    """Detect swing highs and lows."""
    if len(candles) < lookback * 2 + 1:
        return []
    
    swing_points = []
    
    for i in range(lookback, len(candles) - lookback):
        is_swing_high = True
        is_swing_low = True
        
        for j in range(1, lookback + 1):
            if candles[i].high <= candles[i - j].high or candles[i].high <= candles[i + j].high:
                is_swing_high = False
            if candles[i].low >= candles[i - j].low or candles[i].low >= candles[i + j].low:
                is_swing_low = False
        
        if is_swing_high:
            swing_points.append(SwingPoint(
                price=candles[i].high,
                index=i,
                is_high=True,
                timestamp=candles[i].timestamp
            ))
        if is_swing_low:
            swing_points.append(SwingPoint(
                price=candles[i].low,
                index=i,
                is_high=False,
                timestamp=candles[i].timestamp
            ))
    
    return swing_points


def determine_trend(candles: List[Candle], swing_points: List[SwingPoint]) -> TrendDirection:
    """
    Determine trend direction from classified swing points.
    Matches TypeScript detectTrendFromSwings() using swing type counts.
    """
    if len(swing_points) < 4:
        return TrendDirection.SIDEWAYS
    
    recent = swing_points[-6:]
    
    hh_count = sum(1 for s in recent if s.swing_type == SwingType.HH)
    hl_count = sum(1 for s in recent if s.swing_type == SwingType.HL)
    lh_count = sum(1 for s in recent if s.swing_type == SwingType.LH)
    ll_count = sum(1 for s in recent if s.swing_type == SwingType.LL)
    
    if hh_count >= 1 and hl_count >= 1 and (hh_count + hl_count) > (lh_count + ll_count):
        return TrendDirection.BULLISH
    
    if ll_count >= 1 and lh_count >= 1 and (ll_count + lh_count) > (hh_count + hl_count):
        return TrendDirection.BEARISH
    
    return TrendDirection.SIDEWAYS


def filter_overlapping_zones(zones: List[Zone]) -> List[Zone]:
    """
    Filter overlapping zones, keeping only the strongest one in each overlap group.
    """
    if len(zones) <= 1:
        return zones
    
    strength_order = {"strong": 3, "moderate": 2, "weak": 1}
    sorted_zones = sorted(zones, key=lambda z: (strength_order.get(z.strength, 0), -z.origin_candle_index), reverse=True)
    
    filtered = []
    for zone in sorted_zones:
        has_overlap = any(zone.overlaps_with(existing) for existing in filtered)
        if not has_overlap:
            filtered.append(zone)
    
    return filtered


def detect_zones(
    candles: List[Candle],
    control: str,
    current_price: float,
    filter_overlaps: bool = True
) -> ZoneResult:
    """
    Detect supply and demand zones.
    
    Looks for:
    - Strong impulse candles followed by consolidation
    - Unmitigated zones (not yet tested by price)
    
    Args:
        candles: Price candles
        control: Market control ("buyers", "sellers", "neutral")
        current_price: Current price for distance calculation
        filter_overlaps: Remove overlapping zones, keeping strongest
    """
    if len(candles) < 10:
        return ZoneResult([], [], [], [], ["Insufficient candles"])
    
    zones: List[Zone] = []
    reasoning = []
    current_timestamp = candles[-1].timestamp if candles else 0
    
    for i in range(2, len(candles) - 1):
        candle = candles[i]
        prev_candle = candles[i - 1]
        
        if candle.body_ratio < 0.6:
            continue
        
        is_impulse = candle.body_size > prev_candle.body_size * 1.5
        
        if not is_impulse:
            continue
        
        if candle.is_bullish:
            zone = Zone(
                top_price=prev_candle.high,
                bottom_price=min(prev_candle.low, candles[i-2].low if i >= 2 else prev_candle.low),
                type=ZoneType.DEMAND,
                strength="strong" if candle.body_ratio > 0.7 else "moderate",
                origin_candle_index=i - 1,
                created_at=prev_candle.timestamp
            )
            
            for j in range(i + 1, len(candles)):
                if candles[j].low < zone.bottom_price:
                    zone.mitigated = True
                    break
            
            zones.append(zone)
            
        elif candle.is_bearish:
            zone = Zone(
                top_price=max(prev_candle.high, candles[i-2].high if i >= 2 else prev_candle.high),
                bottom_price=prev_candle.low,
                type=ZoneType.SUPPLY,
                strength="strong" if candle.body_ratio > 0.7 else "moderate",
                origin_candle_index=i - 1,
                created_at=prev_candle.timestamp
            )
            
            for j in range(i + 1, len(candles)):
                if candles[j].high > zone.top_price:
                    zone.mitigated = True
                    break
            
            zones.append(zone)
    
    if filter_overlaps:
        zones = filter_overlapping_zones(zones)
    
    unmitigated_supply = [z for z in zones if z.type == ZoneType.SUPPLY and not z.mitigated]
    unmitigated_demand = [z for z in zones if z.type == ZoneType.DEMAND and not z.mitigated]
    
    tradable_zones = []
    for zone in zones:
        if zone.mitigated:
            continue
        
        freshness = zone.freshness_score(current_timestamp) if current_timestamp > 0 else 1.0
        if freshness < 0.1:
            continue
        
        if zone.type == ZoneType.DEMAND and control in ("buyers", "neutral"):
            distance = abs(current_price - zone.mid_price)
            zone_size = zone.zone_size
            if distance < zone_size * 3:
                tradable_zones.append(zone)
        elif zone.type == ZoneType.SUPPLY and control in ("sellers", "neutral"):
            distance = abs(current_price - zone.mid_price)
            zone_size = zone.zone_size
            if distance < zone_size * 3:
                tradable_zones.append(zone)
    
    reasoning.append(f"Found {len(zones)} total zones")
    reasoning.append(f"Unmitigated: {len(unmitigated_supply)} supply, {len(unmitigated_demand)} demand")
    reasoning.append(f"Tradable zones: {len(tradable_zones)}")
    
    return ZoneResult(
        tradable_zones=tradable_zones,
        unmitigated_supply=unmitigated_supply,
        unmitigated_demand=unmitigated_demand,
        all_zones=zones,
        reasoning=reasoning
    )


def refine_zone(
    major_zone: Zone,
    zone_candles: List[Candle],
    refinement_candles: List[Candle]
) -> RefinementResult:
    """Refine a zone using lower timeframe data."""
    reasoning = []
    
    if not refinement_candles:
        return RefinementResult(
            refined_zone=None,
            original_zone=major_zone,
            was_refined=False,
            reasoning=["No refinement candles available"]
        )
    
    zone_candles_ltf = [
        c for c in refinement_candles
        if major_zone.bottom_price <= c.close <= major_zone.top_price or
           major_zone.bottom_price <= c.open <= major_zone.top_price
    ]
    
    if len(zone_candles_ltf) < 3:
        return RefinementResult(
            refined_zone=None,
            original_zone=major_zone,
            was_refined=False,
            reasoning=["Not enough LTF candles in zone for refinement"]
        )
    
    if major_zone.type == ZoneType.DEMAND:
        refined_bottom = min(c.low for c in zone_candles_ltf)
        refined_top = min(c.high for c in zone_candles_ltf[-3:])
    else:
        refined_top = max(c.high for c in zone_candles_ltf)
        refined_bottom = max(c.low for c in zone_candles_ltf[-3:])
    
    if refined_top <= refined_bottom:
        refined_top, refined_bottom = refined_bottom, refined_top
    
    zone_reduction = 1 - ((refined_top - refined_bottom) / major_zone.zone_size)
    
    if zone_reduction < 0.1:
        return RefinementResult(
            refined_zone=None,
            original_zone=major_zone,
            was_refined=False,
            reasoning=["Refinement did not significantly reduce zone size"]
        )
    
    refined_zone = Zone(
        top_price=refined_top,
        bottom_price=refined_bottom,
        type=major_zone.type,
        strength=major_zone.strength,
        origin_candle_index=major_zone.origin_candle_index
    )
    
    reasoning.append(f"Refined zone by {zone_reduction*100:.0f}%")
    reasoning.append(f"Original: {major_zone.bottom_price:.5f} - {major_zone.top_price:.5f}")
    reasoning.append(f"Refined: {refined_bottom:.5f} - {refined_top:.5f}")
    
    return RefinementResult(
        refined_zone=refined_zone,
        original_zone=major_zone,
        was_refined=True,
        reasoning=reasoning
    )


def detect_entry(
    candles: List[Candle],
    zone: Zone,
    direction: SignalDirection,
    target_price: Optional[float],
    all_zones: List[Zone]
) -> EntryResult:
    """
    Detect entry trigger at zone.
    
    Looks for:
    - Price at zone
    - Momentum candle in direction
    - CHoCH or structure shift
    """
    reasoning = []
    
    if len(candles) < 5:
        return EntryResult(False, None, ["Insufficient candles"])
    
    current_price = candles[-1].close
    
    price_at_zone = zone.price_in_zone(current_price)
    price_near_zone = (
        abs(current_price - zone.top_price) < zone.zone_size * 0.5 or
        abs(current_price - zone.bottom_price) < zone.zone_size * 0.5
    )
    
    if not (price_at_zone or price_near_zone):
        return EntryResult(False, None, ["Price not at zone"])
    
    last_candle = candles[-1]
    prev_candle = candles[-2]
    
    confirmations = []
    confidence = 50
    entry_type = EntryType.ZONE_TOUCH
    
    if price_at_zone:
        confirmations.append(f"Price at {zone.type.value} zone")
        confidence += 10
    
    if direction == SignalDirection.BUY:
        if last_candle.is_bullish and last_candle.body_ratio >= 0.5:
            confirmations.append("Strong bullish momentum candle")
            confidence += 10
        
        if last_candle.close > prev_candle.high:
            confirmations.append("Closed above previous high")
            confidence += 10
            entry_type = EntryType.CHOCH
        
        if last_candle.lower_wick > last_candle.body_size:
            confirmations.append("Bullish rejection wick")
            confidence += 5
        
        if last_candle.low < prev_candle.low and last_candle.close > prev_candle.close:
            confirmations.append("Liquidity sweep followed by recovery")
            confidence += 15
            entry_type = EntryType.LIQUIDITY_SWEEP
    
    else:
        if last_candle.is_bearish and last_candle.body_ratio >= 0.5:
            confirmations.append("Strong bearish momentum candle")
            confidence += 10
        
        if last_candle.close < prev_candle.low:
            confirmations.append("Closed below previous low")
            confidence += 10
            entry_type = EntryType.CHOCH
        
        if last_candle.upper_wick > last_candle.body_size:
            confirmations.append("Bearish rejection wick")
            confidence += 5
        
        if last_candle.high > prev_candle.high and last_candle.close < prev_candle.close:
            confirmations.append("Liquidity sweep followed by drop")
            confidence += 15
            entry_type = EntryType.LIQUIDITY_SWEEP
    
    if confidence < 60:
        return EntryResult(
            has_valid_entry=False,
            setup=None,
            reasoning=[f"Confidence {confidence}% too low, need 60%"]
        )
    
    entry_price = current_price
    
    if direction == SignalDirection.BUY:
        stop_loss = zone.bottom_price - (zone.zone_size * 0.5)
        
        if target_price and target_price > entry_price:
            take_profit = target_price
        else:
            nearest_supply = [z for z in all_zones if z.type == ZoneType.SUPPLY and z.bottom_price > entry_price]
            if nearest_supply:
                take_profit = min(z.bottom_price for z in nearest_supply)
            else:
                risk = entry_price - stop_loss
                take_profit = entry_price + (risk * 2.5)
    else:
        stop_loss = zone.top_price + (zone.zone_size * 0.5)
        
        if target_price and target_price < entry_price:
            take_profit = target_price
        else:
            nearest_demand = [z for z in all_zones if z.type == ZoneType.DEMAND and z.top_price < entry_price]
            if nearest_demand:
                take_profit = max(z.top_price for z in nearest_demand)
            else:
                risk = stop_loss - entry_price
                take_profit = entry_price - (risk * 2.5)
    
    risk = abs(entry_price - stop_loss)
    reward = abs(take_profit - entry_price)
    rr_ratio = reward / risk if risk > 0 else 0
    
    if rr_ratio < 1.5:
        return EntryResult(
            has_valid_entry=False,
            setup=None,
            reasoning=[f"R:R {rr_ratio:.2f} too low, need 1.5"]
        )
    
    setup = EntrySetup(
        direction=direction,
        entry_type=entry_type,
        entry_price=entry_price,
        stop_loss=stop_loss,
        take_profit=take_profit,
        risk_reward_ratio=rr_ratio,
        confidence=min(confidence, 95),
        entry_zone=zone,
        confirmations=confirmations
    )
    
    reasoning.append(f"Entry detected: {entry_type.value}")
    reasoning.append(f"Confidence: {confidence}%, R:R: 1:{rr_ratio:.1f}")
    reasoning.extend(confirmations)
    
    return EntryResult(
        has_valid_entry=True,
        setup=setup,
        reasoning=reasoning
    )


class SMCStrategy(BaseStrategy):
    """Smart Money Concepts trading strategy."""
    
    def __init__(self, config: Optional[SMCClarityConfig] = None):
        super().__init__(SMC_CONFIG)
        self.smc_config = config or DEFAULT_SMC_CONFIG
    
    async def analyze(self, instrument: InstrumentData) -> StrategyResult:
        """Analyze instrument using SMC methodology."""
        start_time = time.time()
        signals: List[StrategySignal] = []
        pending_setups: List[EntrySetup] = []
        errors: List[str] = []
        
        try:
            self.log_analysis(f"Analyzing {instrument.symbol}...")
            
            data = instrument.data
            current_price = instrument.current_price
            
            tf_selection = self._select_timeframes(data)
            self.log_analysis(
                f"TF Selection: {tf_selection.daily_context_tf}/{tf_selection.major_zone_tf}/"
                f"{tf_selection.zone_identification_tf}/{tf_selection.entry_refinement_tf}"
            )
            
            if not tf_selection.is_clear:
                self.log_analysis(f"Skipping {instrument.symbol}: Market not clear")
                return StrategyResult(
                    strategy_id=self.id,
                    signals=[],
                    pending_setups=[],
                    errors=[],
                    analysis_time_ms=int((time.time() - start_time) * 1000)
                )
            
            context_candles = data.d1 if data.d1 else data.h4
            swing_points = detect_swing_points(context_candles, lookback=self.smc_config.swing_lookback)
            h4_trend = determine_trend(context_candles, swing_points)
            
            control = "buyers" if h4_trend == TrendDirection.BULLISH else "sellers" if h4_trend == TrendDirection.BEARISH else "neutral"
            self.log_analysis(f"1D Context: {control}, Trend: {h4_trend.value}")
            
            major_zone_candles = self._get_major_zone_candles(data, tf_selection.major_zone_tf)
            major_zones_result = detect_zones(major_zone_candles, control, current_price, filter_overlaps=self.smc_config.filter_overlapping_zones)
            self.log_analysis(f"{tf_selection.major_zone_tf} Major Zones: {len(major_zones_result.tradable_zones)} zones found")
            
            if not major_zones_result.tradable_zones:
                self.log_analysis("No major zones found, skipping...")
                return StrategyResult(
                    strategy_id=self.id,
                    signals=[],
                    pending_setups=[],
                    errors=[],
                    analysis_time_ms=int((time.time() - start_time) * 1000)
                )
            
            for major_zone in major_zones_result.tradable_zones[:3]:
                zone_id_candles = self._get_zone_id_candles(data, tf_selection.zone_identification_tf)
                refinement_candles = self._get_refinement_candles(data, tf_selection.entry_refinement_tf)
                
                refinement_result = refine_zone(major_zone, zone_id_candles, refinement_candles)
                zone_to_use = refinement_result.refined_zone or major_zone
                
                direction = SignalDirection.BUY if major_zone.type == ZoneType.DEMAND else SignalDirection.SELL
                
                nearest_target = None
                if direction == SignalDirection.BUY and major_zones_result.unmitigated_supply:
                    supply_above = [z for z in major_zones_result.unmitigated_supply if z.bottom_price > current_price]
                    if supply_above:
                        nearest_target = min(z.bottom_price for z in supply_above)
                elif direction == SignalDirection.SELL and major_zones_result.unmitigated_demand:
                    demand_below = [z for z in major_zones_result.unmitigated_demand if z.top_price < current_price]
                    if demand_below:
                        nearest_target = max(z.top_price for z in demand_below)
                
                entry_result = detect_entry(
                    refinement_candles,
                    zone_to_use,
                    direction,
                    nearest_target,
                    major_zones_result.all_zones
                )
                
                if not entry_result.has_valid_entry:
                    if entry_result.setup and entry_result.setup.confidence >= 40:
                        pending_setups.append(entry_result.setup)
                        self.log_analysis(f"Zone monitoring: {direction.value} ({entry_result.setup.confidence}% confidence)")
                    continue
                
                if entry_result.has_valid_entry and entry_result.setup:
                    confidence = entry_result.setup.confidence
                    
                    if confidence >= self.min_confidence:
                        signal = self._build_signal(
                            instrument,
                            entry_result,
                            h4_trend,
                            major_zones_result,
                            refinement_result,
                            tf_selection,
                            swing_points
                        )
                        signals.append(signal)
                        self.log_analysis(f"Signal generated: {signal.direction.value} @ {signal.entry_price:.5f} ({confidence}%)")
                    elif confidence >= 50:
                        pending_setups.append(entry_result.setup)
                        self.log_analysis(f"Pending setup: {direction.value} ({confidence}%, needs {self.min_confidence}%)")
        
        except Exception as e:
            errors.append(str(e))
            self.log_error("Analysis failed", e)
        
        return StrategyResult(
            strategy_id=self.id,
            signals=signals,
            pending_setups=pending_setups,
            errors=errors,
            analysis_time_ms=int((time.time() - start_time) * 1000)
        )
    
    def _select_timeframes(self, data: MultiTimeframeData) -> TimeframeSelection:
        """Select best timeframes based on clarity analysis."""
        d1_clarity = analyze_clarity(data.d1, "1D", self.smc_config) if data.d1 else ClarityResult(0, False, 0, 1.0, False, [])
        h4_clarity = analyze_clarity(data.h4, "4H", self.smc_config) if data.h4 else ClarityResult(0, False, 0, 1.0, False, [])
        m15_clarity = analyze_clarity(data.m15, "15M", self.smc_config) if data.m15 else ClarityResult(0, False, 0, 1.0, False, [])
        m5_clarity = analyze_clarity(data.m5, "5M", self.smc_config) if data.m5 else ClarityResult(0, False, 0, 1.0, False, [])
        
        major_zone_tf: Timeframe = "4H" if h4_clarity.score >= 50 else "2H"
        zone_id_tf: Timeframe = "15M" if m15_clarity.score >= 50 else "30M"
        entry_tf: Timeframe = "5M" if m5_clarity.score >= 50 else "3M"
        
        is_clear = d1_clarity.score >= 40 and h4_clarity.score >= 40 and m15_clarity.score >= 40
        
        reasoning = []
        reasoning.extend(d1_clarity.reasoning)
        reasoning.extend(h4_clarity.reasoning)
        
        return TimeframeSelection(
            daily_context_tf="1D",
            major_zone_tf=major_zone_tf,
            zone_identification_tf=zone_id_tf,
            entry_refinement_tf=entry_tf,
            daily_context_clarity=d1_clarity.score,
            major_zone_clarity=h4_clarity.score,
            zone_identification_clarity=m15_clarity.score,
            entry_refinement_clarity=m5_clarity.score,
            is_clear=is_clear,
            reasoning=reasoning
        )
    
    def _get_major_zone_candles(self, data: MultiTimeframeData, tf: Timeframe) -> List[Candle]:
        """Get candles for major zone timeframe."""
        if tf == "4H":
            return data.h4
        elif tf == "2H":
            return data.h2
        elif tf == "1H":
            return data.h1
        return data.h4
    
    def _get_zone_id_candles(self, data: MultiTimeframeData, tf: Timeframe) -> List[Candle]:
        """Get candles for zone identification timeframe."""
        if tf == "30M":
            return data.m30
        elif tf == "15M":
            return data.m15
        return data.m15
    
    def _get_refinement_candles(self, data: MultiTimeframeData, tf: Timeframe) -> List[Candle]:
        """Get candles for entry refinement timeframe."""
        if tf == "5M":
            return data.m5
        elif tf == "3M":
            return data.m3
        elif tf == "1M":
            return data.m1
        return data.m5
    
    def _build_signal(
        self,
        instrument: InstrumentData,
        entry_result: EntryResult,
        h4_trend: TrendDirection,
        zones_result: ZoneResult,
        refinement_result: RefinementResult,
        tf_selection: TimeframeSelection,
        swing_points: List[SwingPoint]
    ) -> StrategySignal:
        """Build a complete trading signal."""
        setup = entry_result.setup
        assert setup is not None, "Entry setup must exist when building signal"
        
        market_context = MarketContext(
            h4_trend_direction=h4_trend,
            d1_trend_direction=h4_trend,
            swing_points=swing_points,
            unmitigated_supply=zones_result.unmitigated_supply,
            unmitigated_demand=zones_result.unmitigated_demand,
            reasoning=zones_result.reasoning
        )
        
        all_reasoning = [
            f"1D Context: trend {h4_trend.value} (clarity: {tf_selection.daily_context_clarity:.0f}%)",
            f"Major Zones: {tf_selection.major_zone_tf} (clarity: {tf_selection.major_zone_clarity:.0f}%)",
            f"Zone ID: {tf_selection.zone_identification_tf} (clarity: {tf_selection.zone_identification_clarity:.0f}%)",
            f"Entry: {tf_selection.entry_refinement_tf} (clarity: {tf_selection.entry_refinement_clarity:.0f}%)",
            *tf_selection.reasoning,
            *zones_result.reasoning,
            *refinement_result.reasoning,
            *entry_result.reasoning,
        ]
        
        return StrategySignal(
            id=self.create_signal_id(),
            strategy_id=self.id,
            strategy_name=self.name,
            symbol=instrument.symbol,
            asset_class=instrument.asset_class,
            direction=setup.direction,
            entry_type=setup.entry_type,
            entry_price=setup.entry_price,
            stop_loss=setup.stop_loss,
            take_profit=setup.take_profit,
            risk_reward_ratio=setup.risk_reward_ratio,
            confidence=setup.confidence,
            timeframe=tf_selection.entry_refinement_tf,
            market_context=market_context,
            entry_setup=setup,
            zones={
                "h4": zones_result.all_zones,
                "m15": zones_result.tradable_zones,
                "m5": [],
                "m1": []
            },
            reasoning=all_reasoning,
            created_at=int(time.time() * 1000),
            expires_at=self.calculate_expiry_time()
        )


smc_strategy = SMCStrategy()
