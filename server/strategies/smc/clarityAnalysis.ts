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
import { SMC_CLARITY_CONFIG, CONTEXT_TIMEFRAME, MAJOR_ZONE_TIMEFRAMES, ZONE_IDENTIFICATION_TIMEFRAMES, ENTRY_REFINEMENT_TIMEFRAMES } from './config';

export interface ClarityResult {
  score: number;
  isClear: boolean;
  trendConsistency: number;
  zoneClarity: number;
  structureClarity: number;
  reasons: string[];
}

export interface TimeframeSelection {
  dailyContextTf: Timeframe;
  majorZoneTf: Timeframe;
  zoneIdentificationTf: Timeframe;
  entryRefinementTf: Timeframe;
  usedAlternative: boolean;
  dailyContextClarity: ClarityResult;
  majorZoneClarity: ClarityResult;
  zoneIdentificationClarity: ClarityResult;
  entryRefinementClarity: ClarityResult;
  reasoning: string[];
}

export function analyzeClarity(
  candles: Candle[],
  timeframe: Timeframe
): ClarityResult {
  const reasons: string[] = [];

  if (!candles || candles.length < 20) {
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
  m1Candles: Candle[],
  d1Candles?: Candle[],
  h1Candles?: Candle[]
): TimeframeSelection {
  const reasoning: string[] = [];
  
  const d1Clarity = d1Candles && d1Candles.length >= 20 
    ? analyzeClarity(d1Candles, '1D')
    : { score: 0, isClear: false, trendConsistency: 0, zoneClarity: 0, structureClarity: 0, reasons: ['No 1D data'] };
  
  const h4Clarity = analyzeClarity(h4Candles, '4H');
  const h2Clarity = analyzeClarity(h2Candles, '2H');
  const h1Clarity = h1Candles && h1Candles.length >= 20
    ? analyzeClarity(h1Candles, '1H')
    : { score: 0, isClear: false, trendConsistency: 0, zoneClarity: 0, structureClarity: 0, reasons: ['No 1H data'] };
  
  const m30Clarity = analyzeClarity(m30Candles, '30M');
  const m15Clarity = analyzeClarity(m15Candles, '15M');
  
  const m5Clarity = analyzeClarity(m5Candles, '5M');
  const m3Clarity = analyzeClarity(m3Candles, '3M');
  const m1Clarity = analyzeClarity(m1Candles, '1M');

  const dailyContextTf: Timeframe = '1D';
  const dailyContextClarity = d1Clarity;
  
  if (d1Clarity.isClear) {
    reasoning.push(`1D Context: trend confirmed (clarity: ${d1Clarity.score}%)`);
  } else {
    reasoning.push(`1D Context: limited clarity (${d1Clarity.score}%), proceeding with caution`);
  }

  const majorZoneOptions: { tf: Timeframe; clarity: ClarityResult }[] = [
    { tf: '4H' as Timeframe, clarity: h4Clarity },
    { tf: '2H' as Timeframe, clarity: h2Clarity },
    { tf: '1H' as Timeframe, clarity: h1Clarity },
  ].filter(o => o.clarity.score > 0);
  
  majorZoneOptions.sort((a, b) => b.clarity.score - a.clarity.score);
  
  let majorZoneTf: Timeframe = '4H';
  let majorZoneClarity = h4Clarity;
  let usedAlternative = false;

  if (majorZoneOptions.length > 0) {
    const bestMajorZone = majorZoneOptions[0];
    if (bestMajorZone.clarity.isClear && bestMajorZone.clarity.score >= 60) {
      majorZoneTf = bestMajorZone.tf;
      majorZoneClarity = bestMajorZone.clarity;
      if (bestMajorZone.tf !== '4H') usedAlternative = true;
      reasoning.push(`Major Zones: ${bestMajorZone.tf} (best clarity: ${bestMajorZone.clarity.score}%)`);
    } else if (h4Clarity.score >= 50) {
      reasoning.push(`Major Zones: 4H (clarity: ${h4Clarity.score}%)`);
    } else {
      const fallback = majorZoneOptions.find(o => o.clarity.score >= 50) || majorZoneOptions[0];
      majorZoneTf = fallback.tf;
      majorZoneClarity = fallback.clarity;
      if (fallback.tf !== '4H') usedAlternative = true;
      reasoning.push(`Major Zones: ${fallback.tf} (best available: ${fallback.clarity.score}%)`);
    }
  }

  const zoneIdOptions: { tf: Timeframe; clarity: ClarityResult }[] = [
    { tf: '30M' as Timeframe, clarity: m30Clarity },
    { tf: '15M' as Timeframe, clarity: m15Clarity },
  ];
  zoneIdOptions.sort((a, b) => b.clarity.score - a.clarity.score);

  let zoneIdentificationTf: Timeframe = '15M';
  let zoneIdentificationClarity = m15Clarity;

  const bestZoneId = zoneIdOptions[0];
  if (bestZoneId.clarity.isClear && bestZoneId.clarity.score >= 60) {
    zoneIdentificationTf = bestZoneId.tf;
    zoneIdentificationClarity = bestZoneId.clarity;
    if (bestZoneId.tf !== '15M') usedAlternative = true;
    reasoning.push(`Zone ID: ${bestZoneId.tf} (best clarity: ${bestZoneId.clarity.score}%)`);
  } else if (m15Clarity.score >= 50) {
    reasoning.push(`Zone ID: 15M (clarity: ${m15Clarity.score}%)`);
  } else {
    const fallback = zoneIdOptions.find(o => o.clarity.score >= 50) || zoneIdOptions[0];
    zoneIdentificationTf = fallback.tf;
    zoneIdentificationClarity = fallback.clarity;
    if (fallback.tf !== '15M') usedAlternative = true;
    reasoning.push(`Zone ID: ${fallback.tf} (best available: ${fallback.clarity.score}%)`);
  }

  const entryOptions: { tf: Timeframe; clarity: ClarityResult }[] = [
    { tf: '5M' as Timeframe, clarity: m5Clarity },
    { tf: '3M' as Timeframe, clarity: m3Clarity },
    { tf: '1M' as Timeframe, clarity: m1Clarity },
  ];
  entryOptions.sort((a, b) => b.clarity.score - a.clarity.score);

  let entryRefinementTf: Timeframe = '5M';
  let entryRefinementClarity = m5Clarity;

  const bestEntry = entryOptions[0];
  if (bestEntry.clarity.isClear && bestEntry.clarity.score >= 60) {
    entryRefinementTf = bestEntry.tf;
    entryRefinementClarity = bestEntry.clarity;
    reasoning.push(`Entry/Refinement: ${bestEntry.tf} (best clarity: ${bestEntry.clarity.score}%)`);
  } else if (m5Clarity.score >= 50) {
    reasoning.push(`Entry/Refinement: 5M (clarity: ${m5Clarity.score}%)`);
  } else {
    const fallback = entryOptions.find(o => o.clarity.score >= 40) || entryOptions[0];
    entryRefinementTf = fallback.tf;
    entryRefinementClarity = fallback.clarity;
    reasoning.push(`Entry/Refinement: ${fallback.tf} (best available: ${fallback.clarity.score}%)`);
  }

  return {
    dailyContextTf,
    majorZoneTf,
    zoneIdentificationTf,
    entryRefinementTf,
    usedAlternative,
    dailyContextClarity,
    majorZoneClarity,
    zoneIdentificationClarity,
    entryRefinementClarity,
    reasoning,
  };
}

export function isMarketClear(selection: TimeframeSelection): boolean {
  const minContextClarity = 40;
  const minMajorZoneClarity = 50;
  const minZoneIdClarity = 50;
  const minEntryClarity = 40;

  const contextOk = selection.dailyContextClarity.score >= minContextClarity;
  const majorZoneOk = selection.majorZoneClarity.score >= minMajorZoneClarity;
  const zoneIdOk = selection.zoneIdentificationClarity.score >= minZoneIdClarity;
  const entryOk = selection.entryRefinementClarity.score >= minEntryClarity;

  return contextOk && majorZoneOk && zoneIdOk && entryOk;
}

export function getMarketClarityStatus(selection: TimeframeSelection): string {
  if (!isMarketClear(selection)) {
    const issues: string[] = [];
    if (selection.dailyContextClarity.score < 40) issues.push('unclear 1D context');
    if (selection.majorZoneClarity.score < 50) issues.push('unclear major zones');
    if (selection.zoneIdentificationClarity.score < 50) issues.push('unclear zone ID');
    if (selection.entryRefinementClarity.score < 40) issues.push('unclear entry TF');
    return `Market unclear: ${issues.join(', ')}`;
  }

  return `Market clear: 1D/${selection.majorZoneTf}/${selection.zoneIdentificationTf}/${selection.entryRefinementTf}`;
}

export function isWatchlistCandidate(selection: TimeframeSelection): boolean {
  return selection.dailyContextClarity.score >= 40 && 
         selection.majorZoneClarity.score >= 50 && 
         selection.zoneIdentificationClarity.score >= 50;
}

export function isEntryConfirmed(selection: TimeframeSelection): boolean {
  return isWatchlistCandidate(selection) && selection.entryRefinementClarity.score >= 50;
}
