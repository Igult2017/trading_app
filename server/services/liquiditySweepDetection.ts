import { type Candle } from './marketData';

export interface EqualLevel {
  price: number;
  type: 'high' | 'low';
  occurrences: number;
  indices: number[];
  swept: boolean;
  sweepIndex?: number;
}

export interface SupplyDemandZone {
  type: 'supply' | 'demand';
  topPrice: number;
  bottomPrice: number;
  formationIndex: number;
  strength: 'strong' | 'moderate' | 'weak';
  mitigated: boolean;
  mitigationIndex?: number;
}

export interface LiquiditySweepResult {
  sweepDetected: boolean;
  sweepType?: 'bullish_sweep' | 'bearish_sweep';
  sweptLevel?: EqualLevel;
  supplyDemandZone?: SupplyDemandZone;
  entryPrice?: number;
  stopLoss?: number;
  confidence: number;
  reasoning: string[];
}

export class LiquiditySweepDetector {
  private readonly EQUAL_LEVEL_TOLERANCE = 0.0015; // 0.15% tolerance for equal highs/lows
  private readonly MIN_OCCURRENCES = 2; // Minimum equal highs/lows to form liquidity pool
  private readonly SWEEP_CONFIRMATION_PIPS = 5; // Pips beyond level to confirm sweep
  
  /**
   * Detect equal highs or lows that form liquidity pools
   */
  detectEqualLevels(candles: Candle[], lookback: number = 20): EqualLevel[] {
    const levels: EqualLevel[] = [];
    const recentCandles = candles.slice(-lookback);
    
    // Find equal highs
    const highs = recentCandles.map((c, i) => ({ price: c.high, index: i }));
    const equalHighs = this.findEqualPrices(highs, 'high');
    levels.push(...equalHighs);
    
    // Find equal lows
    const lows = recentCandles.map((c, i) => ({ price: c.low, index: i }));
    const equalLows = this.findEqualPrices(lows, 'low');
    levels.push(...equalLows);
    
    return levels.filter(level => level.occurrences >= this.MIN_OCCURRENCES);
  }
  
  /**
   * Find prices that are equal within tolerance
   */
  private findEqualPrices(
    priceData: { price: number; index: number }[],
    type: 'high' | 'low'
  ): EqualLevel[] {
    const levels: Map<number, EqualLevel> = new Map();
    
    for (let i = 0; i < priceData.length; i++) {
      const { price, index } = priceData[i];
      let foundLevel = false;
      
      // Check if this price matches any existing level
      for (const [key, level] of Array.from(levels.entries())) {
        const tolerance = key * this.EQUAL_LEVEL_TOLERANCE;
        if (Math.abs(price - key) <= tolerance) {
          level.occurrences++;
          level.indices.push(index);
          foundLevel = true;
          break;
        }
      }
      
      // Create new level if no match found
      if (!foundLevel) {
        levels.set(price, {
          price,
          type,
          occurrences: 1,
          indices: [index],
          swept: false,
        });
      }
    }
    
    return Array.from(levels.values());
  }
  
  /**
   * Detect if a liquidity level has been swept
   */
  detectLiquiditySweep(
    candles: Candle[],
    equalLevels: EqualLevel[]
  ): EqualLevel | null {
    const latestCandles = candles.slice(-10);
    
    for (const level of equalLevels) {
      if (level.swept) continue;
      
      for (let i = 0; i < latestCandles.length; i++) {
        const candle = latestCandles[i];
        
        if (level.type === 'high') {
          // Check if price swept above equal highs
          if (candle.high > level.price + (this.SWEEP_CONFIRMATION_PIPS * 0.0001)) {
            level.swept = true;
            level.sweepIndex = candles.length - latestCandles.length + i;
            return level;
          }
        } else {
          // Check if price swept below equal lows
          if (candle.low < level.price - (this.SWEEP_CONFIRMATION_PIPS * 0.0001)) {
            level.swept = true;
            level.sweepIndex = candles.length - latestCandles.length + i;
            return level;
          }
        }
      }
    }
    
    return null;
  }
  
  /**
   * Identify supply and demand zones
   */
  identifySupplyDemandZones(candles: Candle[], lookback: number = 50): SupplyDemandZone[] {
    const zones: SupplyDemandZone[] = [];
    const recentCandles = candles.slice(-lookback);
    
    for (let i = 1; i < recentCandles.length - 1; i++) {
      const prev = recentCandles[i - 1];
      const curr = recentCandles[i];
      const next = recentCandles[i + 1];
      
      // Detect supply zone (rejection from above)
      if (this.isSupplyZone(prev, curr, next)) {
        const zone: SupplyDemandZone = {
          type: 'supply',
          topPrice: Math.max(curr.high, prev.high),
          bottomPrice: Math.min(curr.open, curr.close),
          formationIndex: candles.length - lookback + i,
          strength: this.calculateZoneStrength(curr, recentCandles.slice(i + 1)),
          mitigated: false,
        };
        zones.push(zone);
      }
      
      // Detect demand zone (rejection from below)
      if (this.isDemandZone(prev, curr, next)) {
        const zone: SupplyDemandZone = {
          type: 'demand',
          topPrice: Math.max(curr.open, curr.close),
          bottomPrice: Math.min(curr.low, prev.low),
          formationIndex: candles.length - lookback + i,
          strength: this.calculateZoneStrength(curr, recentCandles.slice(i + 1)),
          mitigated: false,
        };
        zones.push(zone);
      }
    }
    
    return zones;
  }
  
  /**
   * Check if pattern forms a supply zone
   */
  private isSupplyZone(prev: Candle, curr: Candle, next: Candle): boolean {
    // Strong bearish candle after consolidation/bullish move
    const isBearish = curr.close < curr.open;
    const hasImpulse = (curr.open - curr.close) > (curr.high - curr.low) * 0.6;
    const followThrough = next.close < curr.close;
    
    return isBearish && hasImpulse && followThrough;
  }
  
  /**
   * Check if pattern forms a demand zone
   */
  private isDemandZone(prev: Candle, curr: Candle, next: Candle): boolean {
    // Strong bullish candle after consolidation/bearish move
    const isBullish = curr.close > curr.open;
    const hasImpulse = (curr.close - curr.open) > (curr.high - curr.low) * 0.6;
    const followThrough = next.close > curr.close;
    
    return isBullish && hasImpulse && followThrough;
  }
  
  /**
   * Calculate zone strength based on subsequent price action
   */
  private calculateZoneStrength(
    formationCandle: Candle,
    subsequentCandles: Candle[]
  ): 'strong' | 'moderate' | 'weak' {
    const bodySize = Math.abs(formationCandle.close - formationCandle.open);
    const wickSize = formationCandle.high - formationCandle.low - bodySize;
    const bodyToWickRatio = bodySize / (bodySize + wickSize);
    
    // Check if zone has been respected
    const touches = subsequentCandles.filter(c => 
      c.low <= formationCandle.high && c.high >= formationCandle.low
    ).length;
    
    if (bodyToWickRatio > 0.7 && touches === 0) return 'strong';
    if (bodyToWickRatio > 0.5 && touches <= 1) return 'moderate';
    return 'weak';
  }
  
  /**
   * Detect zone mitigation (when price revisits supply/demand zone)
   * Requires structural confirmation: close within zone + reaction
   */
  detectZoneMitigation(
    candles: Candle[],
    zone: SupplyDemandZone,
    afterSweep: boolean = false
  ): boolean {
    const relevantCandles = afterSweep ? candles.slice(-5) : candles.slice(-10);
    
    for (let i = 0; i < relevantCandles.length - 1; i++) {
      const current = relevantCandles[i];
      const next = relevantCandles[i + 1];
      
      // Check if candle CLOSES within the zone (not just wicks)
      const closeInZone = current.close >= zone.bottomPrice && current.close <= zone.topPrice;
      
      if (!closeInZone) continue;
      
      // Verify structural reaction based on zone type
      let hasReaction = false;
      
      if (zone.type === 'supply') {
        // For supply zone: next candle should move down (rejection from supply)
        hasReaction = next.close < current.close;
      } else {
        // For demand zone: next candle should move up (bounce from demand)
        hasReaction = next.close > current.close;
      }
      
      // Mitigation confirmed only when close is in zone AND there's a reaction
      if (hasReaction) {
        zone.mitigated = true;
        zone.mitigationIndex = candles.length - relevantCandles.length + i;
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Main function: Analyze for liquidity sweep with supply/demand entry
   */
  analyzeLiquiditySweep(candles: Candle[]): LiquiditySweepResult {
    const reasoning: string[] = [];
    
    // Step 1: Identify equal highs/lows (liquidity pools)
    const equalLevels = this.detectEqualLevels(candles, 30);
    
    if (equalLevels.length === 0) {
      return {
        sweepDetected: false,
        confidence: 0,
        reasoning: ['No equal highs/lows detected to form liquidity pools'],
      };
    }
    
    reasoning.push(`Identified ${equalLevels.length} liquidity pool(s)`);
    
    // Step 2: Detect liquidity sweep
    const sweptLevel = this.detectLiquiditySweep(candles, equalLevels);
    
    if (!sweptLevel) {
      return {
        sweepDetected: false,
        confidence: 0,
        reasoning: [...reasoning, 'No liquidity sweep detected'],
      };
    }
    
    reasoning.push(
      `Liquidity sweep detected at ${sweptLevel.price.toFixed(5)} (${sweptLevel.type === 'high' ? 'Equal Highs' : 'Equal Lows'})`
    );
    
    // Step 3: Identify supply/demand zones
    const zones = this.identifySupplyDemandZones(candles, 50);
    
    if (zones.length === 0) {
      return {
        sweepDetected: true,
        sweepType: sweptLevel.type === 'high' ? 'bearish_sweep' : 'bullish_sweep',
        sweptLevel,
        confidence: 40,
        reasoning: [...reasoning, 'No supply/demand zones identified for entry'],
      };
    }
    
    // Step 4: Find valid zone for entry AFTER sweep
    const sweepType = sweptLevel.type === 'high' ? 'bearish_sweep' : 'bullish_sweep';
    const targetZoneType = sweepType === 'bearish_sweep' ? 'supply' : 'demand';
    
    // Look for zones that were formed before the sweep
    const validZones = zones.filter(z => 
      z.type === targetZoneType && 
      z.formationIndex < (sweptLevel.sweepIndex || 0) &&
      !z.mitigated
    );
    
    if (validZones.length === 0) {
      return {
        sweepDetected: true,
        sweepType,
        sweptLevel,
        confidence: 45,
        reasoning: [...reasoning, `No valid ${targetZoneType} zones found before sweep`],
      };
    }
    
    // Step 5: Check for zone mitigation AFTER sweep
    const latestCandles = candles.slice(-5);
    let mitigatedZone: SupplyDemandZone | undefined;
    
    for (const zone of validZones) {
      if (this.detectZoneMitigation(candles, zone, true)) {
        mitigatedZone = zone;
        break;
      }
    }
    
    if (!mitigatedZone) {
      return {
        sweepDetected: true,
        sweepType,
        sweptLevel,
        supplyDemandZone: validZones[0],
        confidence: 55,
        reasoning: [
          ...reasoning,
          `${validZones.length} ${targetZoneType} zone(s) identified`,
          'Waiting for price to mitigate zone after sweep'
        ],
      };
    }
    
    // Step 6: Calculate entry and stop loss based on mitigated zone
    const latestCandle = candles[candles.length - 1];
    let entryPrice: number;
    let stopLoss: number;
    
    if (sweepType === 'bearish_sweep') {
      // Enter short at supply zone mitigation
      entryPrice = (mitigatedZone.topPrice + mitigatedZone.bottomPrice) / 2;
      stopLoss = mitigatedZone.topPrice + (mitigatedZone.topPrice - mitigatedZone.bottomPrice) * 0.2;
      
      reasoning.push(
        'Supply zone mitigation confirmed after liquidity sweep',
        `Entry: ${entryPrice.toFixed(5)} (Supply zone)`,
        `Stop: ${stopLoss.toFixed(5)} (Above supply zone)`
      );
    } else {
      // Enter long at demand zone mitigation
      entryPrice = (mitigatedZone.topPrice + mitigatedZone.bottomPrice) / 2;
      stopLoss = mitigatedZone.bottomPrice - (mitigatedZone.topPrice - mitigatedZone.bottomPrice) * 0.2;
      
      reasoning.push(
        'Demand zone mitigation confirmed after liquidity sweep',
        `Entry: ${entryPrice.toFixed(5)} (Demand zone)`,
        `Stop: ${stopLoss.toFixed(5)} (Below demand zone)`
      );
    }
    
    // Calculate confidence based on zone strength and sweep clarity
    let confidence = 70;
    if (mitigatedZone.strength === 'strong') confidence += 15;
    else if (mitigatedZone.strength === 'moderate') confidence += 8;
    
    if (sweptLevel.occurrences >= 3) confidence += 10; // Multiple equal levels = stronger liquidity pool
    
    return {
      sweepDetected: true,
      sweepType,
      sweptLevel,
      supplyDemandZone: mitigatedZone,
      entryPrice,
      stopLoss,
      confidence: Math.min(confidence, 95),
      reasoning,
    };
  }
}
