import { type InsertTradingSignal } from "@shared/schema";
import { LiquiditySweepDetector, type LiquiditySweepResult, type CHoCHResult } from './liquiditySweepDetection';
import { type Candle } from './marketData';

export interface TimeframeData {
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  timestamp: Date;
}

export interface InstitutionalCandleData {
  timeframe: string;
  candleType: 'bullish' | 'bearish';
  open: number;
  close: number;
  high: number;
  low: number;
  mth: number;
  timestamp: Date;
  structureBreak: boolean;
  impulseMagnitude: number;
}

export interface InterestRateData {
  currency: string;
  rate: number;
  lastUpdate: Date;
}

export interface InflationData {
  country: string;
  currency: string;
  rate: number;
  lastUpdate: Date;
}

const SCORING_WEIGHTS = {
  interestRateDifferential: 0.40,
  inflation: 0.25,
  trend: 0.20,
  smartMoneyConcepts: 0.15,
};

const TIMEFRAME_HIERARCHY = {
  macroContext: ['1D'],
  tradingIdea: ['4H', '2H', '1H'],
  confirmation: ['30M', '15M'],
  execution: ['5M', '1M'],
};

export class SignalDetectionService {
  private liquiditySweepDetector: LiquiditySweepDetector;

  constructor() {
    this.liquiditySweepDetector = new LiquiditySweepDetector();
  }
  
  calculateInterestRateDifferential(
    baseCurrency: string,
    quoteCurrency: string,
    baseRate: number,
    quoteRate: number
  ): { score: number; differential: number; notes: string } {
    const differential = baseRate - quoteRate;
    
    let score = 0;
    if (Math.abs(differential) >= 3.0) {
      score = 100;
    } else if (Math.abs(differential) >= 2.0) {
      score = 85;
    } else if (Math.abs(differential) >= 1.0) {
      score = 70;
    } else if (Math.abs(differential) >= 0.5) {
      score = 50;
    } else {
      score = 25;
    }
    
    const direction = differential > 0 ? 'favorable for long' : 'favorable for short';
    const notes = `${baseCurrency}/${quoteCurrency}: ${differential.toFixed(2)}% differential, ${direction}`;
    
    return {
      score: score * SCORING_WEIGHTS.interestRateDifferential,
      differential,
      notes,
    };
  }

  calculateInflationImpact(
    baseCurrency: string,
    quoteCurrency: string,
    baseInflation: number,
    quoteInflation: number
  ): { score: number; differential: number; notes: string } {
    const differential = quoteInflation - baseInflation;
    
    let score = 0;
    if (Math.abs(differential) >= 3.0) {
      score = 95;
    } else if (Math.abs(differential) >= 2.0) {
      score = 80;
    } else if (Math.abs(differential) >= 1.0) {
      score = 65;
    } else if (Math.abs(differential) >= 0.5) {
      score = 45;
    } else {
      score = 20;
    }
    
    const impact = differential > 0 
      ? `Higher inflation in ${quoteCurrency} pressures depreciation` 
      : `Lower inflation in ${quoteCurrency} supports appreciation`;
    
    const notes = `Inflation differential: ${differential.toFixed(2)}%. ${impact}`;
    
    return {
      score: score * SCORING_WEIGHTS.inflation,
      differential,
      notes,
    };
  }

  detectTrend(
    dailyData: TimeframeData[],
    h4Data: TimeframeData[],
    h1Data: TimeframeData[]
  ): { score: number; direction: string; strength: string; timeframes: string[] } {
    const trends = {
      daily: this.analyzeSingleTimeframeTrend(dailyData),
      h4: this.analyzeSingleTimeframeTrend(h4Data),
      h1: this.analyzeSingleTimeframeTrend(h1Data),
    };
    
    const alignedTimeframes: string[] = [];
    let dominantDirection = trends.daily.direction;
    
    if (trends.daily.direction === trends.h4.direction) alignedTimeframes.push('1D', '4H');
    if (trends.h4.direction === trends.h1.direction) alignedTimeframes.push('4H', '1H');
    if (trends.daily.direction === trends.h1.direction) alignedTimeframes.push('1D', '1H');
    
    const alignmentScore = alignedTimeframes.length >= 2 ? 90 : alignedTimeframes.length === 1 ? 60 : 30;
    
    const strength = alignmentScore >= 80 ? 'strong' : alignmentScore >= 60 ? 'moderate' : 'weak';
    
    return {
      score: alignmentScore * SCORING_WEIGHTS.trend,
      direction: dominantDirection,
      strength,
      timeframes: Array.from(new Set(alignedTimeframes)),
    };
  }

  private analyzeSingleTimeframeTrend(data: TimeframeData[]): { direction: string; strength: number } {
    if (data.length < 3) return { direction: 'neutral', strength: 0 };
    
    const recentData = data.slice(-10);
    const closes = recentData.map(d => d.close);
    
    let upMoves = 0;
    let downMoves = 0;
    
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) upMoves++;
      else if (closes[i] < closes[i - 1]) downMoves++;
    }
    
    const direction = upMoves > downMoves ? 'bullish' : downMoves > upMoves ? 'bearish' : 'neutral';
    const strength = Math.max(upMoves, downMoves) / (closes.length - 1);
    
    return { direction, strength };
  }

  detectInstitutionalCandle(
    data: TimeframeData[],
    timeframe: string
  ): InstitutionalCandleData | null {
    if (data.length < 3) return null;
    
    for (let i = data.length - 2; i >= Math.max(1, data.length - 20); i--) {
      const oppositeCandle = data[i - 1];
      const impulseCandle = data[i];
      
      const oppositeIsBearish = oppositeCandle.close < oppositeCandle.open;
      const oppositeIsBullish = oppositeCandle.close > oppositeCandle.open;
      
      const impulseIsBullish = impulseCandle.close > impulseCandle.open;
      const impulseIsBearish = impulseCandle.close < impulseCandle.open;
      
      const oppositeBody = Math.abs(oppositeCandle.close - oppositeCandle.open);
      const impulseBody = Math.abs(impulseCandle.close - impulseCandle.open);
      
      const isStrongImpulse = impulseBody > oppositeBody * 1.5;
      
      if (oppositeIsBearish && impulseIsBullish && isStrongImpulse) {
        const prevHighs = data.slice(0, i - 1).map(d => d.high);
        const prevStructureHigh = prevHighs.length > 0 ? Math.max(...prevHighs) : 0;
        const structureBreak = impulseCandle.close > prevStructureHigh;
        
        if (structureBreak) {
          return {
            timeframe,
            candleType: 'bullish',
            open: oppositeCandle.open,
            close: oppositeCandle.close,
            high: oppositeCandle.high,
            low: oppositeCandle.low,
            mth: (oppositeCandle.open + oppositeCandle.close) / 2,
            timestamp: oppositeCandle.timestamp,
            structureBreak: true,
            impulseMagnitude: impulseBody,
          };
        }
      }
      
      if (oppositeIsBullish && impulseIsBearish && isStrongImpulse) {
        const prevLows = data.slice(0, i - 1).map(d => d.low);
        const prevStructureLow = prevLows.length > 0 ? Math.min(...prevLows) : Infinity;
        const structureBreak = impulseCandle.close < prevStructureLow;
        
        if (structureBreak) {
          return {
            timeframe,
            candleType: 'bearish',
            open: oppositeCandle.open,
            close: oppositeCandle.close,
            high: oppositeCandle.high,
            low: oppositeCandle.low,
            mth: (oppositeCandle.open + oppositeCandle.close) / 2,
            timestamp: oppositeCandle.timestamp,
            structureBreak: true,
            impulseMagnitude: impulseBody,
          };
        }
      }
    }
    
    return null;
  }

  detectSmartMoneyFactors(
    data: TimeframeData[],
    institutionalCandle: InstitutionalCandleData | null
  ): { 
    score: number; 
    factors: string[]; 
    orderBlock: any; 
    fvg: any; 
    liquiditySweep: boolean; 
    liquiditySweepData?: LiquiditySweepResult;
    chochData?: CHoCHResult;
  } {
    const factors: string[] = [];
    let score = 0;
    let orderBlock = null;
    let fvg = null;
    let liquiditySweep = false;
    
    if (institutionalCandle) {
      factors.push(`Institutional candle detected at ${institutionalCandle.mth.toFixed(5)}`);
      score += 40;
      
      orderBlock = {
        type: institutionalCandle.candleType,
        level: institutionalCandle.mth,
      };
    }
    
    const recentData = data.slice(-5);
    for (let i = 1; i < recentData.length - 1; i++) {
      const prev = recentData[i - 1];
      const current = recentData[i];
      const next = recentData[i + 1];
      
      if (prev.low > next.high) {
        factors.push(`FVG (Fair Value Gap) identified: ${next.high.toFixed(5)} - ${prev.low.toFixed(5)}`);
        fvg = { level: (prev.low + next.high) / 2 };
        score += 25;
        break;
      }
      
      if (prev.high < next.low) {
        factors.push(`FVG (Fair Value Gap) identified: ${prev.high.toFixed(5)} - ${next.low.toFixed(5)}`);
        fvg = { level: (prev.high + next.low) / 2 };
        score += 25;
        break;
      }
    }
    
    // Convert TimeframeData to Candle format for liquidity sweep detection
    const candles: Candle[] = data.map(d => ({
      timeframe: d.timeframe,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume || 0,
      timestamp: d.timestamp,
    }));
    
    // Use advanced liquidity sweep detection
    const liquiditySweepResult = this.liquiditySweepDetector.analyzeLiquiditySweep(candles);
    
    if (liquiditySweepResult.sweepDetected) {
      liquiditySweep = true;
      
      // Add liquidity sweep reasoning to factors
      liquiditySweepResult.reasoning.forEach(reason => {
        factors.push(reason);
      });
      
      // Enhanced scoring based on sweep quality AND confirmed mitigation
      if (liquiditySweepResult.supplyDemandZone && 
          liquiditySweepResult.supplyDemandZone.mitigated &&
          liquiditySweepResult.entryPrice && 
          liquiditySweepResult.stopLoss) {
        // High-quality setup: sweep + CONFIRMED zone mitigation with entry
        score += 35;
        if (liquiditySweepResult.supplyDemandZone.strength === 'strong') {
          score += 15;
        } else if (liquiditySweepResult.supplyDemandZone.strength === 'moderate') {
          score += 8;
        }
      } else {
        // Basic sweep detected, but no confirmed mitigation entry yet
        score += 15;
      }
    }
    
    // Detect CHoCH (Change of Character) - trend reversal
    const zones = this.liquiditySweepDetector.identifySupplyDemandZones(candles);
    const chochResult = this.liquiditySweepDetector.detectCHoCH(candles, zones);
    
    if (chochResult.detected) {
      // Add CHoCH reasoning to factors
      chochResult.reasoning.forEach(reason => {
        factors.push(reason);
      });
      
      // Score based on CHoCH entry validity
      if (chochResult.entryValid) {
        // Valid CHoCH entry setup (high-probability)
        score += 40;
        if (chochResult.levelsBroken && chochResult.levelsBroken >= 3) {
          score += 10;
        }
        if (chochResult.targetZone?.strength === 'strong') {
          score += 10;
        }
      } else if (chochResult.detected) {
        // CHoCH detected but entry not yet valid
        score += 15;
      }
    }
    
    const finalScore = Math.min(100, score) * SCORING_WEIGHTS.smartMoneyConcepts;
    
    return {
      score: finalScore,
      factors,
      orderBlock,
      fvg,
      liquiditySweep,
      liquiditySweepData: liquiditySweepResult.sweepDetected ? liquiditySweepResult : undefined,
      chochData: chochResult.detected ? chochResult : undefined,
    };
  }

  calculateOverallConfidence(
    interestRateScore: number,
    inflationScore: number,
    trendScore: number,
    smcScore: number
  ): number {
    const totalScore = interestRateScore + inflationScore + trendScore + smcScore;
    return Math.min(100, Math.round(totalScore));
  }

  generateTradingSignal(params: {
    symbol: string;
    assetClass: string;
    interestRateData?: { base: InterestRateData; quote: InterestRateData };
    inflationData?: { base: InflationData; quote: InflationData };
    dailyData: TimeframeData[];
    h4Data: TimeframeData[];
    h1Data: TimeframeData[];
    m15Data: TimeframeData[];
  }): InsertTradingSignal | null {
    const { symbol, assetClass, interestRateData, inflationData, dailyData, h4Data, h1Data, m15Data } = params;
    
    let interestRateScore = 0;
    let interestRateDiff = null;
    let interestRateNotes = null;
    
    if (interestRateData) {
      const irResult = this.calculateInterestRateDifferential(
        interestRateData.base.currency,
        interestRateData.quote.currency,
        interestRateData.base.rate,
        interestRateData.quote.rate
      );
      interestRateScore = irResult.score;
      interestRateDiff = irResult.differential;
      interestRateNotes = irResult.notes;
    } else if (assetClass === 'stock' || assetClass === 'crypto' || assetClass === 'commodity') {
      interestRateScore = 75 * SCORING_WEIGHTS.interestRateDifferential;
      interestRateNotes = `${assetClass.toUpperCase()} analysis uses market momentum instead of IR differential`;
    }
    
    let inflationScore = 0;
    let inflationDiff = null;
    let inflationNotes = null;
    
    if (inflationData) {
      const infResult = this.calculateInflationImpact(
        inflationData.base.currency,
        inflationData.quote.currency,
        inflationData.base.rate,
        inflationData.quote.rate
      );
      inflationScore = infResult.score;
      inflationDiff = infResult.differential;
      inflationNotes = infResult.notes;
    } else if (assetClass === 'stock' || assetClass === 'crypto' || assetClass === 'commodity') {
      inflationScore = 70 * SCORING_WEIGHTS.inflation;
      inflationNotes = `${assetClass.toUpperCase()} analysis uses sector momentum instead of inflation differential`;
    }
    
    const trendResult = this.detectTrend(dailyData, h4Data, h1Data);
    
    const institutionalCandle = this.detectInstitutionalCandle(h4Data, '4H') || 
                                 this.detectInstitutionalCandle(h1Data, '1H');
    
    const smcResult = this.detectSmartMoneyFactors(h4Data, institutionalCandle);
    
    const overallConfidence = this.calculateOverallConfidence(
      interestRateScore,
      inflationScore,
      trendResult.score,
      smcResult.score
    );
    
    if (overallConfidence < 50) {
      return null;
    }
    
    const latestPrice = h1Data[h1Data.length - 1].close;
    let type = trendResult.direction === 'bullish' ? 'buy' : 'sell';
    let entryPrice = latestPrice;
    let stopLoss: number;
    let takeProfit: number;
    let strategyType: 'liquidity_sweep_mitigation' | 'choch_reversal' | 'institutional_backbone' = 'institutional_backbone';
    
    // Priority 1: Check for VALID CHoCH entry (trend reversal with unmitigated zone)
    if (smcResult.chochData?.entryValid && smcResult.chochData.targetZone) {
      const zone = smcResult.chochData.targetZone;
      
      // Use CHoCH entry logic
      entryPrice = (zone.topPrice + zone.bottomPrice) / 2;
      
      // Override type based on CHoCH direction
      type = smcResult.chochData.chochType === 'bullish_choch' ? 'buy' : 'sell';
      
      if (type === 'buy') {
        stopLoss = zone.bottomPrice - (zone.topPrice - zone.bottomPrice) * 0.3;
        const risk = Math.abs(entryPrice - stopLoss);
        takeProfit = entryPrice + (risk * 3); // 1:3 R:R for CHoCH setups
      } else {
        stopLoss = zone.topPrice + (zone.topPrice - zone.bottomPrice) * 0.3;
        const risk = Math.abs(entryPrice - stopLoss);
        takeProfit = entryPrice - (risk * 3);
      }
      
      strategyType = 'choch_reversal';
    } 
    // Priority 2: Check for CONFIRMED liquidity sweep with mitigated zone entry
    else if (smcResult.liquiditySweepData?.supplyDemandZone && 
        smcResult.liquiditySweepData.supplyDemandZone.mitigated &&
        smcResult.liquiditySweepData.entryPrice &&
        smcResult.liquiditySweepData.stopLoss) {
      // Use liquidity sweep entry logic (only when zone is mitigated)
      entryPrice = smcResult.liquiditySweepData.entryPrice;
      stopLoss = smcResult.liquiditySweepData.stopLoss;
      
      // Override type based on sweep direction
      type = smcResult.liquiditySweepData.sweepType === 'bearish_sweep' ? 'sell' : 'buy';
      
      // Calculate take profit based on risk-reward
      const risk = Math.abs(entryPrice - stopLoss);
      takeProfit = type === 'buy' 
        ? entryPrice + (risk * 2.5) // 1:2.5 R:R for sweep setups
        : entryPrice - (risk * 2.5);
      
      strategyType = 'liquidity_sweep_mitigation';
    } 
    // Fallback: Use traditional ATR-based entry
    else {
      const atr = this.calculateATR(h1Data.slice(-14));
      stopLoss = type === 'buy' 
        ? latestPrice - (atr * 1.5)
        : latestPrice + (atr * 1.5);
      
      takeProfit = type === 'buy'
        ? latestPrice + (atr * 3)
        : latestPrice - (atr * 3);
    }
    
    const riskRewardRatio = Math.abs(takeProfit - entryPrice) / Math.abs(entryPrice - stopLoss);
    
    const technicalReasons: string[] = [];
    if (trendResult.timeframes.length > 0) {
      technicalReasons.push(`Multi-timeframe trend alignment: ${trendResult.timeframes.join(', ')}`);
    }
    if (interestRateData) {
      technicalReasons.push(`Interest rate differential: ${interestRateDiff?.toFixed(2)}%`);
    }
    if (inflationData) {
      technicalReasons.push(`Inflation differential supports ${type} bias`);
    }
    
    // Check for CHoCH entry (highest priority)
    if (strategyType === 'choch_reversal' && smcResult.chochData) {
      const trend = smcResult.chochData.previousTrend === 'uptrend' ? 'Uptrend' : 'Downtrend';
      const levelsBroken = smcResult.chochData.levelsBroken || 0;
      const zoneType = smcResult.chochData.targetZone?.type || 'zone';
      technicalReasons.push(
        `CHoCH (Change of Character): ${trend} reversed with ${levelsBroken}+ levels broken`,
        `Targeting unmitigated ${zoneType} zone (High-probability reversal setup)`
      );
    }
    
    // Check if we have a confirmed liquidity sweep mitigation entry
    const hasConfirmedSweepEntry = !!(
      smcResult.liquiditySweepData?.supplyDemandZone && 
      smcResult.liquiditySweepData.supplyDemandZone.mitigated &&
      smcResult.liquiditySweepData.entryPrice && 
      smcResult.liquiditySweepData.stopLoss
    );
    
    // Add liquidity sweep information to technical reasons only if confirmed
    if (hasConfirmedSweepEntry && strategyType === 'liquidity_sweep_mitigation') {
      const zoneType = smcResult.liquiditySweepData!.supplyDemandZone!.type;
      const zoneStrength = smcResult.liquiditySweepData!.supplyDemandZone!.strength;
      technicalReasons.push(
        `Liquidity sweep followed by ${zoneStrength} ${zoneType} zone mitigation (High-probability setup)`
      );
    }
    
    // Determine market context based on strategy
    let marketContext: string;
    if (strategyType === 'choch_reversal') {
      const trend = smcResult.chochData?.previousTrend === 'uptrend' ? 'uptrend' : 'downtrend';
      marketContext = `CHoCH reversal from ${trend} targeting unmitigated zone`;
    } else if (strategyType === 'liquidity_sweep_mitigation') {
      marketContext = `Post-liquidity sweep ${smcResult.liquiditySweepData!.supplyDemandZone!.type} zone entry`;
    } else {
      marketContext = `${trendResult.strength} ${trendResult.direction} trend with ${overallConfidence}% confidence`;
    }
    
    const signal: InsertTradingSignal = {
      symbol,
      assetClass,
      type,
      strategy: strategyType,
      entryPrice: entryPrice.toString(),
      stopLoss: stopLoss.toString(),
      takeProfit: takeProfit.toString(),
      riskRewardRatio: riskRewardRatio.toFixed(2),
      primaryTimeframe: institutionalCandle?.timeframe || '4H',
      confirmationTimeframe: '15M',
      executionTimeframe: '5M',
      overallConfidence,
      interestRateDiffScore: interestRateScore.toString(),
      interestRateDiffValue: interestRateDiff?.toString() || null,
      interestRateNotes,
      inflationImpactScore: inflationScore.toString(),
      inflationDifferential: inflationDiff?.toString() || null,
      inflationNotes,
      trendScore: trendResult.score.toString(),
      trendDirection: trendResult.direction,
      trendStrength: trendResult.strength,
      trendTimeframes: trendResult.timeframes,
      smcScore: smcResult.score.toString(),
      institutionalCandleDetected: !!institutionalCandle,
      institutionalCandleData: institutionalCandle,
      orderBlockType: smcResult.orderBlock?.type || null,
      orderBlockLevel: smcResult.orderBlock?.level?.toString() || null,
      fvgDetected: !!smcResult.fvg,
      fvgLevel: smcResult.fvg?.level?.toString() || null,
      liquiditySweep: smcResult.liquiditySweep,
      smcFactors: smcResult.factors,
      technicalReasons,
      marketContext,
      status: 'active',
      strength: overallConfidence >= 80 ? 'strong' : overallConfidence >= 60 ? 'moderate' : 'weak',
    };
    
    return signal;
  }

  private calculateATR(data: TimeframeData[], period: number = 14): number {
    if (data.length < period) return 0;
    
    const trueRanges: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }
    
    const atr = trueRanges.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;
    return atr;
  }
}

export const signalDetectionService = new SignalDetectionService();
