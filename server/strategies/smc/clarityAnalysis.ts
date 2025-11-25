import {
  Candle,
  SupplyDemandZone,
  SwingPoint,
  Timeframe,
  TrendDirection,
  MarketControl,
} from '../core/types';
import { detectSwingPoints, detectTrendFromSwings } from '../shared/swingPoints';
import { detectSupplyDemandZones, getUnmitigatedZones } from '../shared/zoneDetection';
import { SMC_CLARITY_CONFIG, TimeframePair, PRIMARY_TIMEFRAMES, ALTERNATIVE_TIMEFRAMES, ENTRY_TIMEFRAMES } from './config';

export interface ClarityResult {
  score: number;
  isClear: boolean;
  trendConsistency: number;
  zoneClarity: number;
  structureClarity: number;
  reasons: string[];
}

export interface TimeframeSelection {
  contextTf: Timeframe;
  zoneTf: Timeframe;
  entryTf: Timeframe;
  usedAlternative: boolean;
  contextClarity: ClarityResult;
  zoneClarity: ClarityResult;
  entryClarity: ClarityResult;
  reasoning: string[];
}

export function analyzeClarity(
  candles: Candle[],
  timeframe: Timeframe
): ClarityResult {
  const reasons: string[] = [];

  if (candles.length < 20) {
    return {
      score: 0,
      isClear: false,
      trendConsistency: 0,
      zoneClarity: 0,
      structureClarity: 0,
      reasons: ['Insufficient candle data'],
    };
  }

  const swingPoints = detectSwingPoints(candles, { lookback: 3 });
  const trend = detectTrendFromSwings(swingPoints);

  const trendConsistency = calculateTrendConsistency(swingPoints, trend);
  reasons.push(`Trend consistency: ${(trendConsistency * 100).toFixed(0)}%`);

  const zones = detectSupplyDemandZones(candles, timeframe, { lookback: candles.length });
  const unmitigatedZones = getUnmitigatedZones(zones);

  const zoneClarity = calculateZoneClarity(unmitigatedZones);
  reasons.push(`Zone clarity: ${(zoneClarity * 100).toFixed(0)}% (${unmitigatedZones.length} unmitigated zones)`);

  const structureClarity = calculateStructureClarity(swingPoints);
  reasons.push(`Structure clarity: ${(structureClarity * 100).toFixed(0)}%`);

  const score = Math.round(
    (trendConsistency * 35) + 
    (zoneClarity * 35) + 
    (structureClarity * 30)
  );

  const isClear = score >= SMC_CLARITY_CONFIG.minClarityScore &&
                  swingPoints.length >= SMC_CLARITY_CONFIG.minSwingPointsRequired &&
                  unmitigatedZones.length >= SMC_CLARITY_CONFIG.minZonesRequired;

  return {
    score,
    isClear,
    trendConsistency,
    zoneClarity,
    structureClarity,
    reasons,
  };
}

function calculateTrendConsistency(swingPoints: SwingPoint[], trend: TrendDirection): number {
  if (swingPoints.length < 4) return 0;

  const recentSwings = swingPoints.slice(-8);

  if (trend === 'bullish') {
    const bullishSwings = recentSwings.filter(s => s.type === 'HH' || s.type === 'HL').length;
    return bullishSwings / recentSwings.length;
  }

  if (trend === 'bearish') {
    const bearishSwings = recentSwings.filter(s => s.type === 'LL' || s.type === 'LH').length;
    return bearishSwings / recentSwings.length;
  }

  const hhhl = recentSwings.filter(s => s.type === 'HH' || s.type === 'HL').length;
  const lllh = recentSwings.filter(s => s.type === 'LL' || s.type === 'LH').length;
  const balance = Math.abs(hhhl - lllh) / recentSwings.length;

  return 1 - balance;
}

function calculateZoneClarity(zones: SupplyDemandZone[]): number {
  if (zones.length === 0) return 0;

  if (zones.length > SMC_CLARITY_CONFIG.maxZonesForClarity) {
    return 0.3;
  }

  const strongZones = zones.filter(z => z.strength === 'strong').length;
  const moderateZones = zones.filter(z => z.strength === 'moderate').length;

  const qualityScore = (strongZones * 1.0 + moderateZones * 0.6) / zones.length;

  const supplyZones = zones.filter(z => z.type === 'supply').length;
  const demandZones = zones.filter(z => z.type === 'demand').length;
  const balanceScore = supplyZones > 0 && demandZones > 0 ? 1 : 0.5;

  return Math.min(1, (qualityScore * 0.7 + balanceScore * 0.3));
}

function calculateStructureClarity(swingPoints: SwingPoint[]): number {
  if (swingPoints.length < SMC_CLARITY_CONFIG.minSwingPointsRequired) {
    return 0;
  }

  const recentSwings = swingPoints.slice(-10);

  let alternatingCount = 0;
  for (let i = 1; i < recentSwings.length; i++) {
    const prev = recentSwings[i - 1];
    const curr = recentSwings[i];

    const prevIsHigh = prev.type === 'HH' || prev.type === 'LH';
    const currIsHigh = curr.type === 'HH' || curr.type === 'LH';

    if (prevIsHigh !== currIsHigh) {
      alternatingCount++;
    }
  }

  return alternatingCount / (recentSwings.length - 1);
}

export function selectBestTimeframes(
  h4Candles: Candle[],
  h2Candles: Candle[],
  m30Candles: Candle[],
  m15Candles: Candle[],
  m5Candles: Candle[],
  m3Candles: Candle[],
  m1Candles: Candle[]
): TimeframeSelection {
  const reasoning: string[] = [];

  const h4Clarity = analyzeClarity(h4Candles, '4H');
  const h2Clarity = analyzeClarity(h2Candles, '2H');
  const m15Clarity = analyzeClarity(m15Candles, '15M');
  const m30Clarity = analyzeClarity(m30Candles, '30M');

  let contextTf: Timeframe = '4H';
  let contextClarity = h4Clarity;
  let usedAlternative = false;

  if (h4Clarity.isClear) {
    reasoning.push(`Using primary 4H context (clarity: ${h4Clarity.score}%)`);
  } else if (h2Clarity.isClear && h2Clarity.score > h4Clarity.score) {
    contextTf = '2H';
    contextClarity = h2Clarity;
    usedAlternative = true;
    reasoning.push(`Switched to 2H context for better clarity (${h2Clarity.score}% vs 4H ${h4Clarity.score}%)`);
  } else {
    reasoning.push(`Using 4H context despite low clarity (${h4Clarity.score}%)`);
  }

  let zoneTf: Timeframe = '15M';
  let zoneClarity = m15Clarity;

  if (m15Clarity.isClear) {
    reasoning.push(`Using primary 15M zones (clarity: ${m15Clarity.score}%)`);
  } else if (m30Clarity.isClear && m30Clarity.score > m15Clarity.score) {
    zoneTf = '30M';
    zoneClarity = m30Clarity;
    usedAlternative = true;
    reasoning.push(`Switched to 30M zones for better clarity (${m30Clarity.score}% vs 15M ${m15Clarity.score}%)`);
  } else {
    reasoning.push(`Using 15M zones despite low clarity (${m15Clarity.score}%)`);
  }

  const m5Clarity = analyzeClarity(m5Candles, '5M');
  const m3Clarity = analyzeClarity(m3Candles, '3M');
  const m1ClarityResult = analyzeClarity(m1Candles, '1M');

  let entryTf: Timeframe = '5M';
  let entryClarity = m5Clarity;

  if (m5Clarity.isClear && m5Clarity.score >= 60) {
    entryTf = '5M';
    entryClarity = m5Clarity;
    reasoning.push(`Using 5M for entry confirmation (clarity: ${m5Clarity.score}%)`);
  } else if (m3Clarity.isClear && m3Clarity.score > m5Clarity.score) {
    entryTf = '3M';
    entryClarity = m3Clarity;
    reasoning.push(`Using 3M for entry confirmation (clarity: ${m3Clarity.score}%)`);
  } else if (m1ClarityResult.isClear && m1ClarityResult.score > m5Clarity.score) {
    entryTf = '1M';
    entryClarity = m1ClarityResult;
    reasoning.push(`Using 1M for entry confirmation (clarity: ${m1ClarityResult.score}%)`);
  } else {
    reasoning.push(`Using 5M for entry (best available: ${m5Clarity.score}%)`);
  }

  return {
    contextTf,
    zoneTf,
    entryTf,
    usedAlternative,
    contextClarity,
    zoneClarity,
    entryClarity,
    reasoning,
  };
}

export function isMarketClear(selection: TimeframeSelection): boolean {
  const minContextClarity = 50;
  const minZoneClarity = 50;
  const minEntryClarity = 40;

  const contextOk = selection.contextClarity.score >= minContextClarity;
  const zoneOk = selection.zoneClarity.score >= minZoneClarity;
  const entryOk = selection.entryClarity.score >= minEntryClarity;

  return contextOk && zoneOk && entryOk;
}

export function getMarketClarityStatus(selection: TimeframeSelection): string {
  if (!isMarketClear(selection)) {
    const issues: string[] = [];
    if (selection.contextClarity.score < 50) issues.push('unclear context');
    if (selection.zoneClarity.score < 50) issues.push('unclear zones');
    if (selection.entryClarity.score < 40) issues.push('unclear entry TF');
    return `Market unclear: ${issues.join(', ')}`;
  }

  return `Market clear: ${selection.contextTf}/${selection.zoneTf}/${selection.entryTf}`;
}
