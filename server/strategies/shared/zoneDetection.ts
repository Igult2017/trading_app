import {
  Candle,
  SupplyDemandZone,
  ZoneType,
  ZoneStatus,
  ZoneStrength,
  Timeframe,
} from '../core/types';
import {
  isBullishCandle,
  isBearishCandle,
  getCandleBody,
  getCandleRange,
  getBodyToRangeRatio,
  isImpulseCandle,
} from './candlePatterns';

export interface ZoneDetectionOptions {
  minImpulseRatio: number;
  lookback: number;
  minZoneSize: number;
}

const DEFAULT_OPTIONS: ZoneDetectionOptions = {
  minImpulseRatio: 0.6,
  lookback: 50,
  minZoneSize: 0,
};

function generateZoneId(): string {
  return `zone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function calculateZoneStrength(
  impulseCandle: Candle,
  subsequentCandles: Candle[]
): ZoneStrength {
  const impulseBody = getCandleBody(impulseCandle);
  const impulseRange = getCandleRange(impulseCandle);
  const bodyRatio = impulseBody / impulseRange;

  let touches = 0;
  const zoneTop = Math.max(impulseCandle.open, impulseCandle.close);
  const zoneBottom = Math.min(impulseCandle.open, impulseCandle.close);

  for (const candle of subsequentCandles.slice(0, 10)) {
    if (candle.low <= zoneTop && candle.high >= zoneBottom) {
      touches++;
    }
  }

  if (bodyRatio > 0.7 && touches === 0) return 'strong';
  if (bodyRatio > 0.5 && touches <= 1) return 'moderate';
  return 'weak';
}

export function isSupplyZonePattern(
  base: Candle,
  impulse: Candle,
  confirmation: Candle
): boolean {
  const isBearishImpulse = isBearishCandle(impulse);
  const hasImpulse = isImpulseCandle(impulse, 0.6);
  const followThrough = confirmation.close < impulse.close;

  return isBearishImpulse && hasImpulse && followThrough;
}

export function isDemandZonePattern(
  base: Candle,
  impulse: Candle,
  confirmation: Candle
): boolean {
  const isBullishImpulse = isBullishCandle(impulse);
  const hasImpulse = isImpulseCandle(impulse, 0.6);
  const followThrough = confirmation.close > impulse.close;

  return isBullishImpulse && hasImpulse && followThrough;
}

export function detectSupplyDemandZones(
  candles: Candle[],
  timeframe: Timeframe,
  options: Partial<ZoneDetectionOptions> = {}
): SupplyDemandZone[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const zones: SupplyDemandZone[] = [];

  if (candles.length < 3) return zones;

  const recentCandles = candles.slice(-opts.lookback);
  const startIndex = candles.length - recentCandles.length;

  for (let i = 1; i < recentCandles.length - 1; i++) {
    const base = recentCandles[i - 1];
    const impulse = recentCandles[i];
    const confirmation = recentCandles[i + 1];

    if (isSupplyZonePattern(base, impulse, confirmation)) {
      const zone: SupplyDemandZone = {
        id: generateZoneId(),
        type: 'supply',
        status: 'unmitigated',
        strength: calculateZoneStrength(impulse, recentCandles.slice(i + 1)),
        topPrice: base.high,
        bottomPrice: base.low,
        formationTime: base.timestamp,
        formationIndex: startIndex + (i - 1),
        timeframe,
        pipSize: base.high - base.low,
      };
      zones.push(zone);
    }

    if (isDemandZonePattern(base, impulse, confirmation)) {
      const zone: SupplyDemandZone = {
        id: generateZoneId(),
        type: 'demand',
        status: 'unmitigated',
        strength: calculateZoneStrength(impulse, recentCandles.slice(i + 1)),
        topPrice: base.high,
        bottomPrice: base.low,
        formationTime: base.timestamp,
        formationIndex: startIndex + (i - 1),
        timeframe,
        pipSize: base.high - base.low,
      };
      zones.push(zone);
    }
  }

  return zones;
}

export function updateZoneMitigation(
  zones: SupplyDemandZone[],
  currentCandle: Candle
): SupplyDemandZone[] {
  return zones.map(zone => {
    if (zone.status === 'mitigated') return zone;

    const isTouched =
      currentCandle.low <= zone.topPrice && currentCandle.high >= zone.bottomPrice;

    if (isTouched) {
      return {
        ...zone,
        status: 'mitigated' as ZoneStatus,
        mitigatedAt: currentCandle.timestamp,
      };
    }

    return zone;
  });
}

export function getUnmitigatedZones(zones: SupplyDemandZone[]): SupplyDemandZone[] {
  return zones.filter(z => z.status === 'unmitigated');
}

export function getMitigatedZones(zones: SupplyDemandZone[]): SupplyDemandZone[] {
  return zones.filter(z => z.status === 'mitigated');
}

export function getZonesByType(zones: SupplyDemandZone[], type: ZoneType): SupplyDemandZone[] {
  return zones.filter(z => z.type === type);
}

export function getNearestZone(
  zones: SupplyDemandZone[],
  currentPrice: number,
  direction: 'above' | 'below'
): SupplyDemandZone | null {
  const filteredZones = zones.filter(z => {
    const zoneMiddle = (z.topPrice + z.bottomPrice) / 2;
    return direction === 'above' ? zoneMiddle > currentPrice : zoneMiddle < currentPrice;
  });

  if (filteredZones.length === 0) return null;

  return filteredZones.reduce((nearest, zone) => {
    const zoneMiddle = (zone.topPrice + zone.bottomPrice) / 2;
    const nearestMiddle = (nearest.topPrice + nearest.bottomPrice) / 2;
    const zoneDist = Math.abs(zoneMiddle - currentPrice);
    const nearestDist = Math.abs(nearestMiddle - currentPrice);
    return zoneDist < nearestDist ? zone : nearest;
  });
}

export function isPriceInZone(price: number, zone: SupplyDemandZone): boolean {
  return price >= zone.bottomPrice && price <= zone.topPrice;
}

export function getZoneSize(zone: SupplyDemandZone): number {
  return zone.topPrice - zone.bottomPrice;
}

export function refineZone(
  parentZone: SupplyDemandZone,
  lowerTfCandles: Candle[],
  lowerTimeframe: Timeframe
): SupplyDemandZone | null {
  const zonesInRange = lowerTfCandles.filter(
    c => c.low <= parentZone.topPrice && c.high >= parentZone.bottomPrice
  );

  if (zonesInRange.length < 3) return null;

  const refinedZones = detectSupplyDemandZones(zonesInRange, lowerTimeframe);

  const matchingZones = refinedZones.filter(z => z.type === parentZone.type);

  if (matchingZones.length === 0) return null;

  if (matchingZones.length > 1) {
    const unmitigated = matchingZones.filter(z => z.status === 'unmitigated');
    if (unmitigated.length === 1) {
      return {
        ...unmitigated[0],
        refinedFrom: parentZone.id,
      };
    }
    return null;
  }

  return {
    ...matchingZones[0],
    refinedFrom: parentZone.id,
  };
}
