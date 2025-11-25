import {
  Candle,
  SupplyDemandZone,
  MarketControl,
} from '../core/types';
import {
  detectSupplyDemandZones,
  getUnmitigatedZones,
  getZonesByType,
  updateZoneMitigation,
} from '../shared/zoneDetection';
import { SMC_ZONE_CONFIG } from './config';

export interface M15ZoneResult {
  allZones: SupplyDemandZone[];
  unmitigatedSupply: SupplyDemandZone[];
  unmitigatedDemand: SupplyDemandZone[];
  tradableZones: SupplyDemandZone[];
  reasoning: string[];
}

export function analyzeM15Zones(
  m15Candles: Candle[],
  h4Control: MarketControl,
  currentPrice: number
): M15ZoneResult {
  const reasoning: string[] = [];

  let allZones = detectSupplyDemandZones(
    m15Candles,
    '15M',
    { lookback: SMC_ZONE_CONFIG.m15LookbackCandles }
  );

  if (m15Candles.length > 0) {
    const latestCandle = m15Candles[m15Candles.length - 1];
    allZones = updateZoneMitigation(allZones, latestCandle);
  }

  const supplyZones = getZonesByType(allZones, 'supply');
  const demandZones = getZonesByType(allZones, 'demand');
  const unmitigatedSupply = getUnmitigatedZones(supplyZones);
  const unmitigatedDemand = getUnmitigatedZones(demandZones);

  reasoning.push(`M15: Found ${supplyZones.length} supply zones (${unmitigatedSupply.length} unmitigated)`);
  reasoning.push(`M15: Found ${demandZones.length} demand zones (${unmitigatedDemand.length} unmitigated)`);

  const tradableZones = getTradableZones(
    unmitigatedSupply,
    unmitigatedDemand,
    h4Control,
    currentPrice
  );

  reasoning.push(`M15: ${tradableZones.length} tradable zones based on H4 ${h4Control} control`);

  return {
    allZones,
    unmitigatedSupply,
    unmitigatedDemand,
    tradableZones,
    reasoning,
  };
}

function getTradableZones(
  unmitigatedSupply: SupplyDemandZone[],
  unmitigatedDemand: SupplyDemandZone[],
  h4Control: MarketControl,
  currentPrice: number
): SupplyDemandZone[] {
  const tradable: SupplyDemandZone[] = [];

  if (h4Control === 'demand') {
    for (const zone of unmitigatedDemand) {
      if (currentPrice > zone.topPrice && zone.status === 'unmitigated') {
        tradable.push(zone);
      }
    }
  } else if (h4Control === 'supply') {
    for (const zone of unmitigatedSupply) {
      if (currentPrice < zone.bottomPrice && zone.status === 'unmitigated') {
        tradable.push(zone);
      }
    }
  } else {
    for (const zone of unmitigatedDemand) {
      if (currentPrice > zone.topPrice && zone.status === 'unmitigated') {
        tradable.push(zone);
      }
    }
    for (const zone of unmitigatedSupply) {
      if (currentPrice < zone.bottomPrice && zone.status === 'unmitigated') {
        tradable.push(zone);
      }
    }
  }

  return tradable.sort((a, b) => {
    const aDist = Math.abs(((a.topPrice + a.bottomPrice) / 2) - currentPrice);
    const bDist = Math.abs(((b.topPrice + b.bottomPrice) / 2) - currentPrice);
    return aDist - bDist;
  });
}

export function isPriceApproachingZone(
  currentPrice: number,
  zone: SupplyDemandZone,
  proximityPips: number = 10
): boolean {
  const pipValue = zone.pipSize > 0 ? zone.pipSize : 0.0001;
  const proximityRange = proximityPips * pipValue;

  if (zone.type === 'demand') {
    return currentPrice <= zone.topPrice + proximityRange && currentPrice >= zone.bottomPrice;
  } else {
    return currentPrice >= zone.bottomPrice - proximityRange && currentPrice <= zone.topPrice;
  }
}

export function findNearestUnmitigatedZone(
  zones: SupplyDemandZone[],
  currentPrice: number,
  direction: 'above' | 'below'
): SupplyDemandZone | null {
  const unmitigated = zones.filter(z => z.status === 'unmitigated');

  const filtered = unmitigated.filter(z => {
    const zoneCenter = (z.topPrice + z.bottomPrice) / 2;
    return direction === 'above' ? zoneCenter > currentPrice : zoneCenter < currentPrice;
  });

  if (filtered.length === 0) return null;

  return filtered.reduce((nearest, zone) => {
    const zoneCenter = (zone.topPrice + zone.bottomPrice) / 2;
    const nearestCenter = (nearest.topPrice + nearest.bottomPrice) / 2;
    const zoneDist = Math.abs(zoneCenter - currentPrice);
    const nearestDist = Math.abs(nearestCenter - currentPrice);
    return zoneDist < nearestDist ? zone : nearest;
  });
}
