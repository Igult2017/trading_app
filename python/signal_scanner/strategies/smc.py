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
class ClarityResult:
    """Result of clarity analysis for a timeframe."""
    score: float
    is_clear: bool
    clean_bodies: int
    wick_ratio: float
    trend_visible: bool
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


def analyze_clarity(candles: List[Candle], min_candles: int = 20) -> ClarityResult:
    """
    Analyze price action clarity on a timeframe.
    
    Returns clarity score (0-100) based on:
    - Clean candle bodies vs wicks
    - Clear trend structure
    - Volatility consistency
    """
    if len(candles) < min_candles:
        return ClarityResult(
            score=0,
            is_clear=False,
            clean_bodies=0,
            wick_ratio=1.0,
            trend_visible=False,
            reasoning=["Insufficient candles for clarity analysis"]
        )
    
    recent = candles[-min_candles:]
    
    clean_bodies = 0
    total_wick_ratio = 0.0
    
    for candle in recent:
        if candle.total_range > 0:
            body_ratio = candle.body_ratio
            if body_ratio >= 0.5:
                clean_bodies += 1
            total_wick_ratio += (1 - body_ratio)
    
    avg_wick_ratio = total_wick_ratio / len(recent)
    clean_body_pct = (clean_bodies / len(recent)) * 100
    
    highs = [c.high for c in recent]
    lows = [c.low for c in recent]
    
    hh_count = sum(1 for i in range(1, len(highs)) if highs[i] > highs[i-1])
    ll_count = sum(1 for i in range(1, len(lows)) if lows[i] < lows[i-1])
    
    trend_visible = (hh_count >= len(recent) * 0.6) or (ll_count >= len(recent) * 0.6)
    
    clarity_score = (
        clean_body_pct * 0.4 +
        (1 - avg_wick_ratio) * 100 * 0.3 +
        (100 if trend_visible else 40) * 0.3
    )
    
    reasoning = []
    if clean_body_pct >= 60:
        reasoning.append(f"Clean bodies: {clean_body_pct:.0f}%")
    else:
        reasoning.append(f"Choppy price action: {clean_body_pct:.0f}% clean bodies")
    
    if trend_visible:
        reasoning.append("Clear trend structure visible")
    else:
        reasoning.append("No clear trend structure")
    
    return ClarityResult(
        score=clarity_score,
        is_clear=clarity_score >= 60,
        clean_bodies=clean_bodies,
        wick_ratio=avg_wick_ratio,
        trend_visible=trend_visible,
        reasoning=reasoning
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
    """Determine trend direction from swing points."""
    if len(swing_points) < 4:
        return TrendDirection.SIDEWAYS
    
    recent_swings = sorted(swing_points, key=lambda s: s.index)[-6:]
    
    highs = [s for s in recent_swings if s.is_high]
    lows = [s for s in recent_swings if not s.is_high]
    
    if len(highs) >= 2 and len(lows) >= 2:
        higher_highs = all(highs[i].price > highs[i-1].price for i in range(1, len(highs)))
        higher_lows = all(lows[i].price > lows[i-1].price for i in range(1, len(lows)))
        lower_highs = all(highs[i].price < highs[i-1].price for i in range(1, len(highs)))
        lower_lows = all(lows[i].price < lows[i-1].price for i in range(1, len(lows)))
        
        if higher_highs and higher_lows:
            return TrendDirection.BULLISH
        elif lower_highs and lower_lows:
            return TrendDirection.BEARISH
    
    return TrendDirection.SIDEWAYS


def detect_zones(
    candles: List[Candle],
    control: str,
    current_price: float
) -> ZoneResult:
    """
    Detect supply and demand zones.
    
    Looks for:
    - Strong impulse candles followed by consolidation
    - Unmitigated zones (not yet tested by price)
    """
    if len(candles) < 10:
        return ZoneResult([], [], [], [], ["Insufficient candles"])
    
    zones: List[Zone] = []
    reasoning = []
    
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
                origin_candle_index=i - 1
            )
            
            is_mitigated = False
            for j in range(i + 1, len(candles)):
                if candles[j].low < zone.bottom_price:
                    is_mitigated = True
                    zone.mitigated = True
                    break
            
            zones.append(zone)
            
        elif candle.is_bearish:
            zone = Zone(
                top_price=max(prev_candle.high, candles[i-2].high if i >= 2 else prev_candle.high),
                bottom_price=prev_candle.low,
                type=ZoneType.SUPPLY,
                strength="strong" if candle.body_ratio > 0.7 else "moderate",
                origin_candle_index=i - 1
            )
            
            is_mitigated = False
            for j in range(i + 1, len(candles)):
                if candles[j].high > zone.top_price:
                    is_mitigated = True
                    zone.mitigated = True
                    break
            
            zones.append(zone)
    
    unmitigated_supply = [z for z in zones if z.type == ZoneType.SUPPLY and not z.mitigated]
    unmitigated_demand = [z for z in zones if z.type == ZoneType.DEMAND and not z.mitigated]
    
    tradable_zones = []
    for zone in zones:
        if zone.mitigated:
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
    
    def __init__(self):
        super().__init__(SMC_CONFIG)
    
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
            swing_points = detect_swing_points(context_candles, lookback=3)
            h4_trend = determine_trend(context_candles, swing_points)
            
            control = "buyers" if h4_trend == TrendDirection.BULLISH else "sellers" if h4_trend == TrendDirection.BEARISH else "neutral"
            self.log_analysis(f"1D Context: {control}, Trend: {h4_trend.value}")
            
            major_zone_candles = self._get_major_zone_candles(data, tf_selection.major_zone_tf)
            major_zones_result = detect_zones(major_zone_candles, control, current_price)
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
        d1_clarity = analyze_clarity(data.d1) if data.d1 else ClarityResult(0, False, 0, 1.0, False, [])
        h4_clarity = analyze_clarity(data.h4) if data.h4 else ClarityResult(0, False, 0, 1.0, False, [])
        m15_clarity = analyze_clarity(data.m15) if data.m15 else ClarityResult(0, False, 0, 1.0, False, [])
        m5_clarity = analyze_clarity(data.m5) if data.m5 else ClarityResult(0, False, 0, 1.0, False, [])
        
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
