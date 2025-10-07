import { type Candle } from './marketData';

export interface LiquidityPool {
  price: number;
  type: 'high' | 'low';
  poolType: 'equal_levels' | 'swing' | 'session' | 'daily' | 'weekly' | 'monthly';
  sessionName?: string; // For session pools: 'Asian', 'London', 'NY'
  occurrences?: number; // For equal levels
  indices: number[];
  swept: boolean;
  sweepIndex?: number;
  strength: 'strong' | 'moderate' | 'weak';
}

// Legacy type alias for backward compatibility
export type EqualLevel = LiquidityPool;

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

export interface SwingPoint {
  price: number;
  index: number;
  type: 'HH' | 'HL' | 'LH' | 'LL'; // Higher High, Higher Low, Lower High, Lower Low
}

export interface CHoCHResult {
  detected: boolean;
  chochType?: 'bullish_choch' | 'bearish_choch'; // Bullish CHoCH = trend changed to bullish
  chochIndex?: number;
  chochPrice?: number;
  previousTrend?: 'uptrend' | 'downtrend';
  targetZone?: SupplyDemandZone;
  levelsBroken?: number; // Number of levels broken without mitigation
  entryValid: boolean;
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
    const startIndex = candles.length - recentCandles.length; // Handle any size
    
    // Find equal highs
    const highs = recentCandles.map((c, i) => ({ price: c.high, index: startIndex + i }));
    const equalHighs = this.findEqualPrices(highs, 'high');
    levels.push(...equalHighs);
    
    // Find equal lows
    const lows = recentCandles.map((c, i) => ({ price: c.low, index: startIndex + i }));
    const equalLows = this.findEqualPrices(lows, 'low');
    levels.push(...equalLows);
    
    return levels.filter(level => (level.occurrences || 0) >= this.MIN_OCCURRENCES);
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
          level.occurrences = (level.occurrences || 0) + 1;
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
          poolType: 'equal_levels',
          occurrences: 1,
          indices: [index],
          swept: false,
          strength: 'moderate', // Will be calculated based on occurrences later
        });
      }
    }
    
    return Array.from(levels.values());
  }
  
  /**
   * Detect swing highs and lows (local peaks/troughs)
   */
  detectSwingLevels(candles: Candle[], lookback: number = 20): LiquidityPool[] {
    const pools: LiquidityPool[] = [];
    const recentCandles = candles.slice(-lookback);
    const startIndex = candles.length - recentCandles.length; // Handle any size
    
    for (let i = 2; i < recentCandles.length - 2; i++) {
      const current = recentCandles[i];
      
      // Check for swing high
      if (current.high > recentCandles[i-1].high && 
          current.high > recentCandles[i-2].high &&
          current.high > recentCandles[i+1].high &&
          current.high > recentCandles[i+2].high) {
        pools.push({
          price: current.high,
          type: 'high',
          poolType: 'swing',
          indices: [startIndex + i], // ✅ Absolute index
          swept: false,
          strength: 'moderate',
        });
      }
      
      // Check for swing low
      if (current.low < recentCandles[i-1].low && 
          current.low < recentCandles[i-2].low &&
          current.low < recentCandles[i+1].low &&
          current.low < recentCandles[i+2].low) {
        pools.push({
          price: current.low,
          type: 'low',
          poolType: 'swing',
          indices: [startIndex + i], // ✅ Absolute index
          swept: false,
          strength: 'moderate',
        });
      }
    }
    
    return pools;
  }

  /**
   * Detect session highs and lows (Asian, London, NY)
   */
  detectSessionLevels(candles: Candle[]): LiquidityPool[] {
    const pools: LiquidityPool[] = [];
    
    // Get last 24 hours of data (or whatever is available)
    const last24h = candles.slice(-24);
    const startIndex = candles.length - last24h.length; // Handle < 24 candles
    
    // Session times in UTC
    const sessions = [
      { name: 'Asian', startHour: 0, endHour: 9 },
      { name: 'London', startHour: 8, endHour: 17 },
      { name: 'NY', startHour: 13, endHour: 22 },
    ];
    
    for (const session of sessions) {
      // Filter candles using actual timestamp UTC hours
      const sessionCandlesWithIndex = last24h
        .map((c, i) => ({
          candle: c,
          originalIndex: startIndex + i, // Correct index calculation
        }))
        .filter(({ candle }) => {
          const utcHour = candle.timestamp.getUTCHours(); // Already a Date object
          return utcHour >= session.startHour && utcHour < session.endHour;
        });
      
      if (sessionCandlesWithIndex.length > 0) {
        const sessionHigh = Math.max(...sessionCandlesWithIndex.map(s => s.candle.high));
        const sessionLow = Math.min(...sessionCandlesWithIndex.map(s => s.candle.low));
        
        const highItem = sessionCandlesWithIndex.find(s => s.candle.high === sessionHigh);
        const lowItem = sessionCandlesWithIndex.find(s => s.candle.low === sessionLow);
        
        if (highItem) {
          pools.push({
            price: sessionHigh,
            type: 'high',
            poolType: 'session',
            sessionName: session.name,
            indices: [highItem.originalIndex],
            swept: false,
            strength: 'strong', // Session levels are considered strong
          });
        }
        
        if (lowItem) {
          pools.push({
            price: sessionLow,
            type: 'low',
            poolType: 'session',
            sessionName: session.name,
            indices: [lowItem.originalIndex],
            swept: false,
            strength: 'strong',
          });
        }
      }
    }
    
    return pools;
  }

  /**
   * Detect daily, weekly, and monthly highs/lows
   */
  detectTimeframeLevels(candles: Candle[]): LiquidityPool[] {
    const pools: LiquidityPool[] = [];
    
    // Daily high/low (last 24 H1 candles or whatever is available)
    const dailyCandles = candles.slice(-24);
    if (dailyCandles.length > 0) {
      const dailyStartIndex = candles.length - dailyCandles.length;
      const dailyHigh = Math.max(...dailyCandles.map(c => c.high));
      const dailyLow = Math.min(...dailyCandles.map(c => c.low));
      const highIndex = dailyCandles.findIndex(c => c.high === dailyHigh);
      const lowIndex = dailyCandles.findIndex(c => c.low === dailyLow);
      
      pools.push({
        price: dailyHigh,
        type: 'high',
        poolType: 'daily',
        indices: [dailyStartIndex + highIndex],
        swept: false,
        strength: 'strong',
      });
      
      pools.push({
        price: dailyLow,
        type: 'low',
        poolType: 'daily',
        indices: [dailyStartIndex + lowIndex],
        swept: false,
        strength: 'strong',
      });
    }
    
    // Weekly high/low (last 120 H1 candles ~5 days or whatever is available)
    const weeklyCandles = candles.slice(-120);
    if (weeklyCandles.length > 0) {
      const weeklyStartIndex = candles.length - weeklyCandles.length;
      const weeklyHigh = Math.max(...weeklyCandles.map(c => c.high));
      const weeklyLow = Math.min(...weeklyCandles.map(c => c.low));
      const highIndex = weeklyCandles.findIndex(c => c.high === weeklyHigh);
      const lowIndex = weeklyCandles.findIndex(c => c.low === weeklyLow);
      
      pools.push({
        price: weeklyHigh,
        type: 'high',
        poolType: 'weekly',
        indices: [weeklyStartIndex + highIndex],
        swept: false,
        strength: 'strong',
      });
      
      pools.push({
        price: weeklyLow,
        type: 'low',
        poolType: 'weekly',
        indices: [weeklyStartIndex + lowIndex],
        swept: false,
        strength: 'strong',
      });
    }
    
    // Monthly high/low (last 500 H1 candles ~20 days or whatever is available)
    const monthlyCandles = candles.slice(-500);
    if (monthlyCandles.length > 0) {
      const monthlyStartIndex = candles.length - monthlyCandles.length;
      const monthlyHigh = Math.max(...monthlyCandles.map(c => c.high));
      const monthlyLow = Math.min(...monthlyCandles.map(c => c.low));
      const highIndex = monthlyCandles.findIndex(c => c.high === monthlyHigh);
      const lowIndex = monthlyCandles.findIndex(c => c.low === monthlyLow);
      
      pools.push({
        price: monthlyHigh,
        type: 'high',
        poolType: 'monthly',
        indices: [monthlyStartIndex + highIndex],
        swept: false,
        strength: 'strong',
      });
      
      pools.push({
        price: monthlyLow,
        type: 'low',
        poolType: 'monthly',
        indices: [monthlyStartIndex + lowIndex],
        swept: false,
        strength: 'strong',
      });
    }
    
    return pools;
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
   * Marks zones at the BASE candle (last candle before impulse) per SMC methodology
   */
  identifySupplyDemandZones(candles: Candle[], lookback: number = 50): SupplyDemandZone[] {
    const zones: SupplyDemandZone[] = [];
    const recentCandles = candles.slice(-lookback);
    const startIndex = candles.length - recentCandles.length;
    
    for (let i = 1; i < recentCandles.length - 1; i++) {
      const base = recentCandles[i - 1]; // Last candle before impulse
      const impulse = recentCandles[i]; // The impulse candle
      const confirmation = recentCandles[i + 1]; // Confirmation candle
      
      // Detect supply zone: Mark zone on BASE candle before bearish impulse
      // Base candle can be bullish or bearish - use FULL RANGE (high to low)
      if (this.isSupplyZone(base, impulse, confirmation)) {
        const zone: SupplyDemandZone = {
          type: 'supply',
          topPrice: base.high, // Full high of base candle
          bottomPrice: base.low, // Full low of base candle
          formationIndex: startIndex + (i - 1), // Index of BASE candle
          strength: this.calculateZoneStrength(impulse, recentCandles.slice(i + 1)),
          mitigated: false, // Fresh/unmitigated zone
        };
        zones.push(zone);
      }
      
      // Detect demand zone: Mark zone on BASE candle before bullish impulse
      // Base candle can be bullish or bearish - use FULL RANGE (high to low)
      if (this.isDemandZone(base, impulse, confirmation)) {
        const zone: SupplyDemandZone = {
          type: 'demand',
          topPrice: base.high, // Full high of base candle
          bottomPrice: base.low, // Full low of base candle
          formationIndex: startIndex + (i - 1), // Index of BASE candle
          strength: this.calculateZoneStrength(impulse, recentCandles.slice(i + 1)),
          mitigated: false, // Fresh/unmitigated zone
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
   * Detect ALL liquidity pools (equal levels, swing, session, timeframe)
   */
  detectAllLiquidityPools(candles: Candle[]): LiquidityPool[] {
    const allPools: LiquidityPool[] = [];
    
    // 1. Equal highs/lows
    const equalLevels = this.detectEqualLevels(candles, 30);
    allPools.push(...equalLevels);
    
    // 2. Swing highs/lows
    const swingLevels = this.detectSwingLevels(candles, 20);
    allPools.push(...swingLevels);
    
    // 3. Session highs/lows
    const sessionLevels = this.detectSessionLevels(candles);
    allPools.push(...sessionLevels);
    
    // 4. Daily/Weekly/Monthly highs/lows
    const timeframeLevels = this.detectTimeframeLevels(candles);
    allPools.push(...timeframeLevels);
    
    return allPools;
  }

  /**
   * Main function: Analyze for liquidity sweep with supply/demand entry
   */
  analyzeLiquiditySweep(candles: Candle[]): LiquiditySweepResult {
    const reasoning: string[] = [];
    
    // Step 1: Identify ALL liquidity pools
    const allPools = this.detectAllLiquidityPools(candles);
    
    if (allPools.length === 0) {
      return {
        sweepDetected: false,
        confidence: 0,
        reasoning: ['No liquidity pools detected'],
      };
    }
    
    // Count pools by type for reporting
    const poolCounts = {
      equal_levels: allPools.filter(p => p.poolType === 'equal_levels').length,
      swing: allPools.filter(p => p.poolType === 'swing').length,
      session: allPools.filter(p => p.poolType === 'session').length,
      daily: allPools.filter(p => p.poolType === 'daily').length,
      weekly: allPools.filter(p => p.poolType === 'weekly').length,
      monthly: allPools.filter(p => p.poolType === 'monthly').length,
    };
    
    const poolTypesSummary = Object.entries(poolCounts)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => `${count} ${type.replace('_', ' ')}`)
      .join(', ');
    
    reasoning.push(`Identified liquidity pools: ${poolTypesSummary}`);
    
    // Step 2: Detect liquidity sweep
    const sweptLevel = this.detectLiquiditySweep(candles, allPools);
    
    if (!sweptLevel) {
      return {
        sweepDetected: false,
        confidence: 0,
        reasoning: [...reasoning, 'No liquidity sweep detected'],
      };
    }
    
    // Create descriptive label for the swept pool
    let poolLabel = '';
    if (sweptLevel.poolType === 'equal_levels') {
      poolLabel = sweptLevel.type === 'high' ? 'Equal Highs' : 'Equal Lows';
    } else if (sweptLevel.poolType === 'swing') {
      poolLabel = sweptLevel.type === 'high' ? 'Swing High' : 'Swing Low';
    } else if (sweptLevel.poolType === 'session') {
      poolLabel = `${sweptLevel.sessionName} ${sweptLevel.type === 'high' ? 'High' : 'Low'}`;
    } else if (sweptLevel.poolType === 'daily') {
      poolLabel = sweptLevel.type === 'high' ? 'Daily High' : 'Daily Low';
    } else if (sweptLevel.poolType === 'weekly') {
      poolLabel = sweptLevel.type === 'high' ? 'Weekly High' : 'Weekly Low';
    } else if (sweptLevel.poolType === 'monthly') {
      poolLabel = sweptLevel.type === 'high' ? 'Monthly High' : 'Monthly Low';
    }
    
    reasoning.push(
      `Liquidity sweep detected at ${sweptLevel.price.toFixed(5)} (${poolLabel})`
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
    
    // Multiple equal levels = stronger liquidity pool
    if (sweptLevel.poolType === 'equal_levels' && (sweptLevel.occurrences || 0) >= 3) {
      confidence += 10;
    }
    
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

  /**
   * Identify swing points (HH, HL, LH, LL) for trend analysis
   */
  private identifySwingPoints(candles: Candle[], lookback: number = 30): SwingPoint[] {
    const swingPoints: SwingPoint[] = [];
    const recentCandles = candles.slice(-lookback);
    const startIndex = candles.length - recentCandles.length;
    
    // Need at least 5 candles to identify swing points
    if (recentCandles.length < 5) return swingPoints;
    
    let prevHigh: { price: number; index: number } | null = null;
    let prevLow: { price: number; index: number } | null = null;
    
    for (let i = 2; i < recentCandles.length - 2; i++) {
      const current = recentCandles[i];
      const absoluteIndex = startIndex + i;
      
      // Detect swing high (local peak)
      if (current.high > recentCandles[i-1].high && 
          current.high > recentCandles[i-2].high &&
          current.high > recentCandles[i+1].high &&
          current.high > recentCandles[i+2].high) {
        
        if (prevHigh) {
          // Compare with previous high to determine HH or LH
          if (current.high > prevHigh.price) {
            swingPoints.push({
              price: current.high,
              index: absoluteIndex,
              type: 'HH', // Higher High
            });
          } else {
            swingPoints.push({
              price: current.high,
              index: absoluteIndex,
              type: 'LH', // Lower High
            });
          }
        }
        prevHigh = { price: current.high, index: absoluteIndex };
      }
      
      // Detect swing low (local trough)
      if (current.low < recentCandles[i-1].low && 
          current.low < recentCandles[i-2].low &&
          current.low < recentCandles[i+1].low &&
          current.low < recentCandles[i+2].low) {
        
        if (prevLow) {
          // Compare with previous low to determine HL or LL
          if (current.low > prevLow.price) {
            swingPoints.push({
              price: current.low,
              index: absoluteIndex,
              type: 'HL', // Higher Low
            });
          } else {
            swingPoints.push({
              price: current.low,
              index: absoluteIndex,
              type: 'LL', // Lower Low
            });
          }
        }
        prevLow = { price: current.low, index: absoluteIndex };
      }
    }
    
    return swingPoints;
  }

  /**
   * Detect CHoCH (Change of Character) - trend reversal signal
   * Bullish CHoCH: Downtrend breaks (LH, LL → HH)
   * Bearish CHoCH: Uptrend breaks (HH, HL → LL)
   */
  detectCHoCH(candles: Candle[], zones: SupplyDemandZone[]): CHoCHResult {
    const reasoning: string[] = [];
    const swingPoints = this.identifySwingPoints(candles);
    
    if (swingPoints.length < 3) {
      return {
        detected: false,
        entryValid: false,
        confidence: 0,
        reasoning: ['Insufficient swing points for CHoCH detection'],
      };
    }
    
    // Analyze recent swing points to detect trend change
    const recentSwings = swingPoints.slice(-5); // Look at last 5 swing points
    
    // Detect Bullish CHoCH: Downtrend (LH, LL) breaks with HH
    const hasLH = recentSwings.some(s => s.type === 'LH');
    const hasLL = recentSwings.some(s => s.type === 'LL');
    const latestHH = recentSwings.filter(s => s.type === 'HH').pop();
    
    if (hasLH && hasLL && latestHH) {
      reasoning.push('Bearish trend detected (LH, LL pattern)');
      reasoning.push(`Bullish CHoCH: Price made Higher High at ${latestHH.price.toFixed(5)}`);
      
      return this.validateCHoCHEntry(
        candles,
        zones,
        'bullish_choch',
        latestHH.index,
        latestHH.price,
        'downtrend',
        reasoning
      );
    }
    
    // Detect Bearish CHoCH: Uptrend (HH, HL) breaks with LL
    const hasHH = recentSwings.some(s => s.type === 'HH');
    const hasHL = recentSwings.some(s => s.type === 'HL');
    const latestLL = recentSwings.filter(s => s.type === 'LL').pop();
    
    if (hasHH && hasHL && latestLL) {
      reasoning.push('Bullish trend detected (HH, HL pattern)');
      reasoning.push(`Bearish CHoCH: Price made Lower Low at ${latestLL.price.toFixed(5)}`);
      
      return this.validateCHoCHEntry(
        candles,
        zones,
        'bearish_choch',
        latestLL.index,
        latestLL.price,
        'uptrend',
        reasoning
      );
    }
    
    return {
      detected: false,
      entryValid: false,
      confidence: 0,
      reasoning: ['No CHoCH pattern detected in recent price action'],
    };
  }

  /**
   * Validate CHoCH entry conditions
   */
  private validateCHoCHEntry(
    candles: Candle[],
    zones: SupplyDemandZone[],
    chochType: 'bullish_choch' | 'bearish_choch',
    chochIndex: number,
    chochPrice: number,
    previousTrend: 'uptrend' | 'downtrend',
    reasoning: string[]
  ): CHoCHResult {
    // Determine target zone type based on CHoCH direction
    const targetZoneType = chochType === 'bullish_choch' ? 'demand' : 'supply';
    
    // Find unmitigated zones BEFORE the CHoCH
    const unmitigatedZones = zones.filter(z => 
      z.type === targetZoneType && 
      z.formationIndex < chochIndex &&
      !z.mitigated
    );
    
    if (unmitigatedZones.length === 0) {
      reasoning.push(`No unmitigated ${targetZoneType} zones found before CHoCH`);
      return {
        detected: true,
        chochType,
        chochIndex,
        chochPrice,
        previousTrend,
        entryValid: false,
        confidence: 40,
        levelsBroken: 0,
        reasoning,
      };
    }
    
    // Get most recent unmitigated zone
    const targetZone = unmitigatedZones[unmitigatedZones.length - 1];
    
    // Count levels broken between zone and CHoCH WITHOUT mitigation
    const levelsBroken = this.countLevelsBrokenWithoutMitigation(
      candles,
      zones,
      targetZone.formationIndex,
      chochIndex,
      targetZoneType
    );
    
    reasoning.push(`Found unmitigated ${targetZoneType} zone from index ${targetZone.formationIndex}`);
    reasoning.push(`Price broke ${levelsBroken} level(s) without mitigation`);
    
    // Entry is INVALID if price comes FROM an unmitigated zone (zone still in control)
    if (this.priceComesFromUnmitigatedZone(candles, targetZone, chochIndex)) {
      reasoning.push(`Entry INVALID: Price comes from unmitigated ${targetZoneType} zone (still in control)`);
      return {
        detected: true,
        chochType,
        chochIndex,
        chochPrice,
        previousTrend,
        targetZone,
        levelsBroken,
        entryValid: false,
        confidence: 35,
        reasoning,
      };
    }
    
    // Entry requires 2+ levels broken
    if (levelsBroken < 2) {
      reasoning.push('Entry INVALID: Must break 2+ levels without mitigation');
      return {
        detected: true,
        chochType,
        chochIndex,
        chochPrice,
        previousTrend,
        targetZone,
        levelsBroken,
        entryValid: false,
        confidence: 45,
        reasoning,
      };
    }
    
    // Valid CHoCH entry setup
    reasoning.push(`✅ Valid CHoCH entry: ${levelsBroken}+ levels broken, targeting unmitigated ${targetZoneType} zone`);
    
    let confidence = 75;
    if (levelsBroken >= 3) confidence += 10;
    if (targetZone.strength === 'strong') confidence += 10;
    
    return {
      detected: true,
      chochType,
      chochIndex,
      chochPrice,
      previousTrend,
      targetZone,
      levelsBroken,
      entryValid: true,
      confidence: Math.min(confidence, 95),
      reasoning,
    };
  }

  /**
   * Count demand/supply levels broken without mitigation
   */
  private countLevelsBrokenWithoutMitigation(
    candles: Candle[],
    zones: SupplyDemandZone[],
    startIndex: number,
    endIndex: number,
    targetZoneType: 'demand' | 'supply'
  ): number {
    const relevantZones = zones.filter(z => 
      z.type === targetZoneType &&
      z.formationIndex > startIndex &&
      z.formationIndex < endIndex &&
      !z.mitigated
    );
    
    return relevantZones.length;
  }

  /**
   * Check if price comes FROM an unmitigated zone (invalid entry)
   */
  private priceComesFromUnmitigatedZone(
    candles: Candle[],
    zone: SupplyDemandZone,
    chochIndex: number
  ): boolean {
    // Check candles between zone formation and CHoCH
    const relevantCandles = candles.slice(zone.formationIndex, chochIndex + 1);
    
    // If price was inside zone in the last 3-5 candles before CHoCH, it "comes from" the zone
    const recentCandles = relevantCandles.slice(-5);
    
    for (const candle of recentCandles) {
      if (candle.low <= zone.topPrice && candle.high >= zone.bottomPrice) {
        return true; // Price was inside zone recently
      }
    }
    
    return false;
  }
}
