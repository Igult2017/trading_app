import {
  Candle,
  SupplyDemandZone,
  SwingPoint,
  EntrySetup,
  EntryType,
  SignalDirection,
} from '../core/types';
import {
  detectSwingPoints,
  findBrokenStructure,
} from '../shared/swingPoints';
import {
  isBullishCandle,
  isBearishCandle,
  isImpulseCandle,
  isRejectionCandle,
} from '../shared/candlePatterns';
import { isPriceInZone, getUnmitigatedZones } from '../shared/zoneDetection';
import { SMC_ENTRY_CONFIG } from './config';
import { calculateOptimalEntry, calculateStopLoss } from './zoneRefinement';

export interface EntryDetectionResult {
  hasValidEntry: boolean;
  entryType: EntryType | null;
  setup: EntrySetup | null;
  reasoning: string[];
}

export function detectEntry(
  m1Candles: Candle[],
  targetZone: SupplyDemandZone,
  targetDirection: SignalDirection,
  nearestTarget: SupplyDemandZone | null,
  allZones: SupplyDemandZone[]
): EntryDetectionResult {
  const reasoning: string[] = [];

  if (m1Candles.length < 10) {
    return {
      hasValidEntry: false,
      entryType: null,
      setup: null,
      reasoning: ['Insufficient M1 data for entry detection'],
    };
  }

  const currentPrice = m1Candles[m1Candles.length - 1].close;
  const swingPoints = detectSwingPoints(m1Candles, { lookback: 3 });

  const chochResult = detectCHoCH(m1Candles, swingPoints, targetZone, targetDirection);
  if (chochResult.detected) {
    reasoning.push(...chochResult.reasoning);
    return buildEntrySetup(
      'choch',
      targetZone,
      targetDirection,
      nearestTarget,
      chochResult.confidence,
      chochResult.confirmations,
      reasoning
    );
  }

  const flipResult = detectDSSDFlip(m1Candles, targetZone, targetDirection, allZones);
  if (flipResult.detected) {
    reasoning.push(...flipResult.reasoning);
    return buildEntrySetup(
      'ds_sd_flip',
      targetZone,
      targetDirection,
      nearestTarget,
      flipResult.confidence,
      flipResult.confirmations,
      reasoning
    );
  }

  const contResult = detectContinuation(m1Candles, targetZone, targetDirection, swingPoints);
  if (contResult.detected) {
    reasoning.push(...contResult.reasoning);
    return buildEntrySetup(
      'continuation',
      targetZone,
      targetDirection,
      nearestTarget,
      contResult.confidence,
      contResult.confirmations,
      reasoning
    );
  }

  reasoning.push('No valid entry trigger detected on M1');
  return {
    hasValidEntry: false,
    entryType: null,
    setup: null,
    reasoning,
  };
}

interface DetectionResult {
  detected: boolean;
  confidence: number;
  confirmations: string[];
  reasoning: string[];
}

function detectCHoCH(
  candles: Candle[],
  swingPoints: SwingPoint[],
  targetZone: SupplyDemandZone,
  direction: SignalDirection
): DetectionResult {
  const reasoning: string[] = [];
  const confirmations: string[] = [];
  let confidence = 0;

  if (swingPoints.length < 4) {
    return { detected: false, confidence: 0, confirmations: [], reasoning: ['Not enough swing points'] };
  }

  const currentPrice = candles[candles.length - 1].close;
  const recentSwings = swingPoints.slice(-8);

  const bosResult = findBrokenStructure(swingPoints, currentPrice);

  if (direction === 'buy') {
    const llSequence = recentSwings.filter(s => s.type === 'LL' || s.type === 'LH');
    const hasDowntrendStructure = llSequence.length >= 2;

    const latestHH = recentSwings.filter(s => s.type === 'HH').pop();
    const hasBullishBreak = bosResult.type === 'bullish_bos' || (latestHH && currentPrice > latestHH.price);

    if (hasDowntrendStructure && hasBullishBreak) {
      reasoning.push('Bullish CHoCH: Downtrend structure broken by HH');
      confirmations.push('CHoCH: Bearish to Bullish transition');
      confidence = SMC_ENTRY_CONFIG.chochConfidence;

      if (isPriceInZone(currentPrice, targetZone)) {
        confirmations.push('Price currently in demand zone');
        confidence += 20;
      } else if (wasRecentlyInZone(candles, targetZone)) {
        confirmations.push('Price reacted from demand zone');
        confidence += 15;
      }

      if (hasReactionCandle(candles, 'bullish')) {
        confirmations.push('Strong bullish reaction candle');
        confidence += 10;
      }

      if (hasRejectionFromZone(candles, targetZone, 'bullish')) {
        confirmations.push('Bullish rejection from zone');
        confidence += 10;
      }

      return { detected: true, confidence, confirmations, reasoning };
    }
  } else {
    const hhSequence = recentSwings.filter(s => s.type === 'HH' || s.type === 'HL');
    const hasUptrendStructure = hhSequence.length >= 2;

    const latestLL = recentSwings.filter(s => s.type === 'LL').pop();
    const hasBearishBreak = bosResult.type === 'bearish_bos' || (latestLL && currentPrice < latestLL.price);

    if (hasUptrendStructure && hasBearishBreak) {
      reasoning.push('Bearish CHoCH: Uptrend structure broken by LL');
      confirmations.push('CHoCH: Bullish to Bearish transition');
      confidence = SMC_ENTRY_CONFIG.chochConfidence;

      if (isPriceInZone(currentPrice, targetZone)) {
        confirmations.push('Price currently in supply zone');
        confidence += 20;
      } else if (wasRecentlyInZone(candles, targetZone)) {
        confirmations.push('Price reacted from supply zone');
        confidence += 15;
      }

      if (hasReactionCandle(candles, 'bearish')) {
        confirmations.push('Strong bearish reaction candle');
        confidence += 10;
      }

      if (hasRejectionFromZone(candles, targetZone, 'bearish')) {
        confirmations.push('Bearish rejection from zone');
        confidence += 10;
      }

      return { detected: true, confidence, confirmations, reasoning };
    }
  }

  return { detected: false, confidence: 0, confirmations: [], reasoning: ['No CHoCH pattern'] };
}

function hasRejectionFromZone(
  candles: Candle[],
  zone: SupplyDemandZone,
  direction: 'bullish' | 'bearish'
): boolean {
  const recent = candles.slice(-5);

  for (const candle of recent) {
    const inZone = candle.low <= zone.topPrice && candle.high >= zone.bottomPrice;
    if (!inZone) continue;

    if (isRejectionCandle(candle)) {
      if (direction === 'bullish' && isBullishCandle(candle)) {
        return true;
      }
      if (direction === 'bearish' && isBearishCandle(candle)) {
        return true;
      }
    }
  }

  return false;
}

function detectDSSDFlip(
  candles: Candle[],
  targetZone: SupplyDemandZone,
  direction: SignalDirection,
  allZones: SupplyDemandZone[]
): DetectionResult {
  const reasoning: string[] = [];
  const confirmations: string[] = [];
  let confidence = 0;

  const currentPrice = candles[candles.length - 1].close;

  const oppositeType = targetZone.type === 'demand' ? 'supply' : 'demand';
  const nearbyOpposite = allZones.filter(z => 
    z.type === oppositeType &&
    Math.abs(((z.topPrice + z.bottomPrice) / 2) - ((targetZone.topPrice + targetZone.bottomPrice) / 2)) < (targetZone.topPrice - targetZone.bottomPrice) * 3
  );

  if (nearbyOpposite.length > 0 && isPriceInZone(currentPrice, targetZone)) {
    if (direction === 'buy' && targetZone.type === 'demand') {
      reasoning.push('D/S to S/D Flip: Supply zone converted to demand, price in demand zone');
      confirmations.push('Zone flip detected');
      confidence = SMC_ENTRY_CONFIG.dsSdFlipConfidence;

      if (hasReactionCandle(candles, 'bullish')) {
        confirmations.push('Bullish reaction from flipped zone');
        confidence += 15;
      }

      return { detected: true, confidence, confirmations, reasoning };
    }

    if (direction === 'sell' && targetZone.type === 'supply') {
      reasoning.push('S/D to D/S Flip: Demand zone converted to supply, price in supply zone');
      confirmations.push('Zone flip detected');
      confidence = SMC_ENTRY_CONFIG.dsSdFlipConfidence;

      if (hasReactionCandle(candles, 'bearish')) {
        confirmations.push('Bearish reaction from flipped zone');
        confidence += 15;
      }

      return { detected: true, confidence, confirmations, reasoning };
    }
  }

  return { detected: false, confidence: 0, confirmations: [], reasoning: ['No D/S-S/D flip'] };
}

function detectContinuation(
  candles: Candle[],
  targetZone: SupplyDemandZone,
  direction: SignalDirection,
  swingPoints: SwingPoint[]
): DetectionResult {
  const reasoning: string[] = [];
  const confirmations: string[] = [];
  let confidence = 0;

  const currentPrice = candles[candles.length - 1].close;
  const recentSwings = swingPoints.slice(-4);

  if (direction === 'buy') {
    const hasHL = recentSwings.some(s => s.type === 'HL');
    const hasHH = recentSwings.some(s => s.type === 'HH');

    if (hasHL && hasHH) {
      if (isPriceInZone(currentPrice, targetZone) || wasRecentlyInZone(candles, targetZone)) {
        reasoning.push('Bullish continuation: HL formed, price at demand zone');
        confirmations.push('Trend continuation with pullback to zone');
        confidence = SMC_ENTRY_CONFIG.continuationConfidence;

        if (hasReactionCandle(candles, 'bullish')) {
          confirmations.push('Bullish reaction candle');
          confidence += 10;
        }

        return { detected: true, confidence, confirmations, reasoning };
      }
    }
  } else {
    const hasLH = recentSwings.some(s => s.type === 'LH');
    const hasLL = recentSwings.some(s => s.type === 'LL');

    if (hasLH && hasLL) {
      if (isPriceInZone(currentPrice, targetZone) || wasRecentlyInZone(candles, targetZone)) {
        reasoning.push('Bearish continuation: LH formed, price at supply zone');
        confirmations.push('Trend continuation with pullback to zone');
        confidence = SMC_ENTRY_CONFIG.continuationConfidence;

        if (hasReactionCandle(candles, 'bearish')) {
          confirmations.push('Bearish reaction candle');
          confidence += 10;
        }

        return { detected: true, confidence, confirmations, reasoning };
      }
    }
  }

  return { detected: false, confidence: 0, confirmations: [], reasoning: ['No continuation pattern'] };
}

function wasRecentlyInZone(candles: Candle[], zone: SupplyDemandZone, lookback: number = 5): boolean {
  const recent = candles.slice(-lookback);
  return recent.some(c => 
    c.low <= zone.topPrice && c.high >= zone.bottomPrice
  );
}

function hasReactionCandle(candles: Candle[], type: 'bullish' | 'bearish'): boolean {
  const recent = candles.slice(-3);
  
  for (const candle of recent) {
    if (type === 'bullish' && isBullishCandle(candle) && isImpulseCandle(candle, 0.5)) {
      return true;
    }
    if (type === 'bearish' && isBearishCandle(candle) && isImpulseCandle(candle, 0.5)) {
      return true;
    }
  }

  return false;
}

function buildEntrySetup(
  entryType: EntryType,
  targetZone: SupplyDemandZone,
  direction: SignalDirection,
  nearestTarget: SupplyDemandZone | null,
  baseConfidence: number,
  confirmations: string[],
  reasoning: string[]
): EntryDetectionResult {
  const entryPrice = calculateOptimalEntry(targetZone, direction);
  const stopLoss = calculateStopLoss(targetZone, direction);

  let takeProfit: number;
  if (nearestTarget) {
    takeProfit = direction === 'buy' 
      ? nearestTarget.bottomPrice 
      : nearestTarget.topPrice;
  } else {
    const risk = Math.abs(entryPrice - stopLoss);
    takeProfit = direction === 'buy'
      ? entryPrice + risk * SMC_ENTRY_CONFIG.defaultRiskReward
      : entryPrice - risk * SMC_ENTRY_CONFIG.defaultRiskReward;
  }

  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);
  const riskRewardRatio = reward / risk;

  let finalConfidence = baseConfidence;

  if (targetZone.strength === 'strong') {
    finalConfidence += SMC_ENTRY_CONFIG.strongZoneBonus;
    confirmations.push('Strong zone strength');
  }

  if (confirmations.length >= 3) {
    finalConfidence += SMC_ENTRY_CONFIG.multipleConfirmationsBonus;
  }

  finalConfidence = Math.min(finalConfidence, 95);

  const setup: EntrySetup = {
    entryType,
    direction,
    entryZone: targetZone,
    entryPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
    confidence: finalConfidence,
    confirmations,
    reasoning,
  };

  return {
    hasValidEntry: true,
    entryType,
    setup,
    reasoning,
  };
}
