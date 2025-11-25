import {
  Candle,
  MarketContext,
  MarketControl,
  TrendDirection,
  SupplyDemandZone,
  SwingPoint,
} from '../core/types';
import { detectSupplyDemandZones, getUnmitigatedZones, getNearestZone, getZonesByType } from '../shared/zoneDetection';
import { detectSwingPoints, detectTrendFromSwings } from '../shared/swingPoints';
import { SMC_ZONE_CONFIG } from './config';

export interface H4AnalysisResult {
  control: MarketControl;
  trend: TrendDirection;
  supplyZones: SupplyDemandZone[];
  demandZones: SupplyDemandZone[];
  unmitigatedSupply: SupplyDemandZone[];
  unmitigatedDemand: SupplyDemandZone[];
  nearestSupplyTarget: SupplyDemandZone | null;
  nearestDemandTarget: SupplyDemandZone | null;
  swingPoints: SwingPoint[];
  reasoning: string[];
}

export function analyzeH4Context(
  h4Candles: Candle[],
  currentPrice: number
): H4AnalysisResult {
  const reasoning: string[] = [];

  const allZones = detectSupplyDemandZones(
    h4Candles,
    '4H',
    { lookback: SMC_ZONE_CONFIG.h4LookbackCandles }
  );

  const supplyZones = getZonesByType(allZones, 'supply');
  const demandZones = getZonesByType(allZones, 'demand');

  const unmitigatedSupply = getUnmitigatedZones(supplyZones);
  const unmitigatedDemand = getUnmitigatedZones(demandZones);

  reasoning.push(`H4: Found ${supplyZones.length} supply zones (${unmitigatedSupply.length} unmitigated)`);
  reasoning.push(`H4: Found ${demandZones.length} demand zones (${unmitigatedDemand.length} unmitigated)`);

  const swingPoints = detectSwingPoints(h4Candles, { lookback: 5 });
  const trend = detectTrendFromSwings(swingPoints);

  reasoning.push(`H4 Trend: ${trend} (based on ${swingPoints.length} swing points)`);

  const control = determineMarketControl(
    h4Candles,
    unmitigatedSupply,
    unmitigatedDemand,
    swingPoints,
    currentPrice
  );

  reasoning.push(`H4 Control: ${control}`);

  const nearestSupplyTarget = getNearestZone(unmitigatedSupply, currentPrice, 'above');
  const nearestDemandTarget = getNearestZone(unmitigatedDemand, currentPrice, 'below');

  if (nearestSupplyTarget) {
    reasoning.push(`Nearest H4 supply target: ${nearestSupplyTarget.topPrice.toFixed(5)} - ${nearestSupplyTarget.bottomPrice.toFixed(5)}`);
  }
  if (nearestDemandTarget) {
    reasoning.push(`Nearest H4 demand target: ${nearestDemandTarget.topPrice.toFixed(5)} - ${nearestDemandTarget.bottomPrice.toFixed(5)}`);
  }

  return {
    control,
    trend,
    supplyZones,
    demandZones,
    unmitigatedSupply,
    unmitigatedDemand,
    nearestSupplyTarget,
    nearestDemandTarget,
    swingPoints,
    reasoning,
  };
}

function determineMarketControl(
  candles: Candle[],
  unmitigatedSupply: SupplyDemandZone[],
  unmitigatedDemand: SupplyDemandZone[],
  swingPoints: SwingPoint[],
  currentPrice: number
): MarketControl {
  if (candles.length < 10) return 'neutral';

  const recentSwings = swingPoints.slice(-6);
  const hhCount = recentSwings.filter(s => s.type === 'HH').length;
  const hlCount = recentSwings.filter(s => s.type === 'HL').length;
  const lhCount = recentSwings.filter(s => s.type === 'LH').length;
  const llCount = recentSwings.filter(s => s.type === 'LL').length;

  const bullishScore = hhCount * 2 + hlCount;
  const bearishScore = llCount * 2 + lhCount;

  let brokenSupply = false;
  let brokenDemand = false;

  for (const zone of unmitigatedSupply) {
    if (currentPrice > zone.topPrice) {
      brokenSupply = true;
      break;
    }
  }

  for (const zone of unmitigatedDemand) {
    if (currentPrice < zone.bottomPrice) {
      brokenDemand = true;
      break;
    }
  }

  if (brokenSupply && !brokenDemand) {
    return 'demand';
  }
  if (brokenDemand && !brokenSupply) {
    return 'supply';
  }

  if (bullishScore > bearishScore + 2) {
    return 'demand';
  }
  if (bearishScore > bullishScore + 2) {
    return 'supply';
  }

  return 'neutral';
}

export function isNearH4Zone(
  currentPrice: number,
  h4Zones: SupplyDemandZone[],
  proximityPercent: number = 0.5
): { near: boolean; zone: SupplyDemandZone | null; type: 'supply' | 'demand' | null } {
  for (const zone of h4Zones) {
    const zoneSize = zone.topPrice - zone.bottomPrice;
    const proximityRange = zoneSize * (1 + proximityPercent);

    const isNearSupply = 
      zone.type === 'supply' && 
      currentPrice >= zone.bottomPrice - proximityRange && 
      currentPrice <= zone.topPrice + proximityRange;

    const isNearDemand = 
      zone.type === 'demand' && 
      currentPrice >= zone.bottomPrice - proximityRange && 
      currentPrice <= zone.topPrice + proximityRange;

    if (isNearSupply || isNearDemand) {
      return {
        near: true,
        zone,
        type: zone.type,
      };
    }
  }

  return { near: false, zone: null, type: null };
}

export function buildMarketContext(
  h4Result: H4AnalysisResult,
  swingPoints: SwingPoint[]
): MarketContext {
  return {
    h4Control: h4Result.control,
    h4TrendDirection: h4Result.trend,
    h4SupplyZones: h4Result.unmitigatedSupply,
    h4DemandZones: h4Result.unmitigatedDemand,
    nearestH4Target: h4Result.control === 'demand' 
      ? h4Result.nearestSupplyTarget 
      : h4Result.nearestDemandTarget,
    swingPoints,
  };
}
