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
import { SMC_CLARITY_CONFIG, HTF_TIMEFRAMES, LTF_TIMEFRAMES, ENTRY_TIMEFRAMES } from './config';

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

interface TimeframeClarityMap {
  d1?: ClarityResult;
  h4?: ClarityResult;
  h2?: ClarityResult;
  h1?: ClarityResult;
  m30?: ClarityResult;
  m15?: ClarityResult;
  m5?: ClarityResult;
  m3?: ClarityResult;
  m1?: ClarityResult;
}

export function selectBestTimeframes(
  h4Candles: Candle[],
  h2Candles: Candle[],
  m30Candles: Candle[],
  m15Candles: Candle[],
  m5Candles: Candle[],
  m3Candles: Candle[],
  m1Candles: Candle[],
  d1Candles?: Candle[],
  h1Candles?: Candle[]
): TimeframeSelection {
  const reasoning: string[] = [];
  
  const clarityMap: TimeframeClarityMap = {};
  
  if (d1Candles && d1Candles.length >= 20) {
    clarityMap.d1 = analyzeClarity(d1Candles, '1D');
  }
  clarityMap.h4 = analyzeClarity(h4Candles, '4H');
  clarityMap.h2 = analyzeClarity(h2Candles, '2H');
  if (h1Candles && h1Candles.length >= 20) {
    clarityMap.h1 = analyzeClarity(h1Candles, '1H');
  }
  
  clarityMap.m30 = analyzeClarity(m30Candles, '30M');
  clarityMap.m15 = analyzeClarity(m15Candles, '15M');
  
  clarityMap.m5 = analyzeClarity(m5Candles, '5M');
  clarityMap.m3 = analyzeClarity(m3Candles, '3M');
  clarityMap.m1 = analyzeClarity(m1Candles, '1M');

  const htfOptions: { tf: Timeframe; clarity: ClarityResult }[] = [];
  if (clarityMap.d1) htfOptions.push({ tf: '1D', clarity: clarityMap.d1 });
  htfOptions.push({ tf: '4H', clarity: clarityMap.h4 });
  htfOptions.push({ tf: '2H', clarity: clarityMap.h2 });
  if (clarityMap.h1) htfOptions.push({ tf: '1H', clarity: clarityMap.h1 });

  htfOptions.sort((a, b) => b.clarity.score - a.clarity.score);
  
  let contextTf: Timeframe = '4H';
  let contextClarity = clarityMap.h4;
  let usedAlternative = false;

  const bestHtf = htfOptions[0];
  if (bestHtf.clarity.isClear && bestHtf.clarity.score >= 60) {
    contextTf = bestHtf.tf;
    contextClarity = bestHtf.clarity;
    if (bestHtf.tf !== '4H') usedAlternative = true;
    reasoning.push(`Using ${bestHtf.tf} context (best clarity: ${bestHtf.clarity.score}%)`);
  } else if (clarityMap.h4.score >= 50) {
    reasoning.push(`Using 4H context (clarity: ${clarityMap.h4.score}%)`);
  } else {
    const fallback = htfOptions.find(o => o.clarity.score >= 50) || htfOptions[0];
    contextTf = fallback.tf;
    contextClarity = fallback.clarity;
    if (fallback.tf !== '4H') usedAlternative = true;
    reasoning.push(`Using ${fallback.tf} context (best available: ${fallback.clarity.score}%)`);
  }

  const ltfOptions: { tf: Timeframe; clarity: ClarityResult }[] = [
    { tf: '30M', clarity: clarityMap.m30 },
    { tf: '15M', clarity: clarityMap.m15 },
  ];
  ltfOptions.sort((a, b) => b.clarity.score - a.clarity.score);

  let zoneTf: Timeframe = '15M';
  let zoneClarity = clarityMap.m15;

  const bestLtf = ltfOptions[0];
  if (bestLtf.clarity.isClear && bestLtf.clarity.score >= 60) {
    zoneTf = bestLtf.tf;
    zoneClarity = bestLtf.clarity;
    if (bestLtf.tf !== '15M') usedAlternative = true;
    reasoning.push(`Using ${bestLtf.tf} zones (best clarity: ${bestLtf.clarity.score}%)`);
  } else if (clarityMap.m15.score >= 50) {
    reasoning.push(`Using 15M zones (clarity: ${clarityMap.m15.score}%)`);
  } else {
    const fallback = ltfOptions.find(o => o.clarity.score >= 50) || ltfOptions[0];
    zoneTf = fallback.tf;
    zoneClarity = fallback.clarity;
    if (fallback.tf !== '15M') usedAlternative = true;
    reasoning.push(`Using ${fallback.tf} zones (best available: ${fallback.clarity.score}%)`);
  }

  const entryOptions: { tf: Timeframe; clarity: ClarityResult }[] = [
    { tf: '5M', clarity: clarityMap.m5 },
    { tf: '3M', clarity: clarityMap.m3 },
    { tf: '1M', clarity: clarityMap.m1 },
  ];
  entryOptions.sort((a, b) => b.clarity.score - a.clarity.score);

  let entryTf: Timeframe = '5M';
  let entryClarity = clarityMap.m5;

  const bestEntry = entryOptions[0];
  if (bestEntry.clarity.isClear && bestEntry.clarity.score >= 60) {
    entryTf = bestEntry.tf;
    entryClarity = bestEntry.clarity;
    reasoning.push(`Using ${bestEntry.tf} entry (best clarity: ${bestEntry.clarity.score}%)`);
  } else if (clarityMap.m5.score >= 50) {
    reasoning.push(`Using 5M entry (clarity: ${clarityMap.m5.score}%)`);
  } else {
    const fallback = entryOptions.find(o => o.clarity.score >= 40) || entryOptions[0];
    entryTf = fallback.tf;
    entryClarity = fallback.clarity;
    reasoning.push(`Using ${fallback.tf} entry (best available: ${fallback.clarity.score}%)`);
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
    if (selection.contextClarity.score < 50) issues.push('unclear HTF context');
    if (selection.zoneClarity.score < 50) issues.push('unclear LTF zones');
    if (selection.entryClarity.score < 40) issues.push('unclear entry TF');
    return `Market unclear: ${issues.join(', ')}`;
  }

  return `Market clear: ${selection.contextTf}/${selection.zoneTf}/${selection.entryTf}`;
}

export function isWatchlistCandidate(selection: TimeframeSelection): boolean {
  return selection.contextClarity.score >= 50 && selection.zoneClarity.score >= 50;
}

export function isEntryConfirmed(selection: TimeframeSelection): boolean {
  return isWatchlistCandidate(selection) && selection.entryClarity.score >= 50;
}
