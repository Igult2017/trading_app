import {
  Candle,
  SupplyDemandZone,
  Timeframe,
} from '../core/types';
import {
  detectSupplyDemandZones,
  getUnmitigatedZones,
  getZonesByType,
} from '../shared/zoneDetection';
import { SMC_ZONE_CONFIG } from './config';

export interface RefinementResult {
  originalZone: SupplyDemandZone;
  refinedZone: SupplyDemandZone | null;
  refinementLevel: '15M' | '5M' | '1M';
  isClean: boolean;
  reasoning: string[];
}

const PIP_THRESHOLDS = {
  '15M': { maxPips: 30, targetPips: 15 },
  '5M': { maxPips: 13, targetPips: 8 },
  '1M': { maxPips: 6, targetPips: 3 },
};

export function refineZoneToLowerTimeframe(
  parentZone: SupplyDemandZone,
  m5Candles: Candle[],
  m1Candles: Candle[]
): RefinementResult {
  const reasoning: string[] = [];

  reasoning.push(`Attempting to refine ${parentZone.type} zone from ${parentZone.timeframe}`);
  reasoning.push(`Original zone: ${parentZone.topPrice.toFixed(5)} - ${parentZone.bottomPrice.toFixed(5)} (${parentZone.pipSize.toFixed(4)} pips)`);

  const m5Result = attemptRefinement(parentZone, m5Candles, '5M');

  if (!m5Result.success || !m5Result.refinedZone) {
    reasoning.push('M5 refinement failed: ' + m5Result.reason);
    return {
      originalZone: parentZone,
      refinedZone: null,
      refinementLevel: '15M',
      isClean: false,
      reasoning,
    };
  }

  reasoning.push(`M5 refinement: ${m5Result.refinedZone.topPrice.toFixed(5)} - ${m5Result.refinedZone.bottomPrice.toFixed(5)} (${m5Result.refinedZone.pipSize.toFixed(4)} pips)`);

  const m1Result = attemptRefinement(m5Result.refinedZone, m1Candles, '1M');

  if (m1Result.success && m1Result.refinedZone && m1Result.isClean) {
    reasoning.push(`M1 refinement: ${m1Result.refinedZone.topPrice.toFixed(5)} - ${m1Result.refinedZone.bottomPrice.toFixed(5)} (${m1Result.refinedZone.pipSize.toFixed(4)} pips)`);
    reasoning.push('Using M1 refined zone (clean single zone)');

    return {
      originalZone: parentZone,
      refinedZone: {
        ...m1Result.refinedZone,
        refinedFrom: parentZone.id,
      },
      refinementLevel: '1M',
      isClean: true,
      reasoning,
    };
  }

  if (!m1Result.isClean) {
    reasoning.push('M1 refinement resulted in multiple zones, staying with M5');
  } else {
    reasoning.push('M1 refinement failed: ' + m1Result.reason);
  }

  return {
    originalZone: parentZone,
    refinedZone: {
      ...m5Result.refinedZone,
      refinedFrom: parentZone.id,
    },
    refinementLevel: '5M',
    isClean: m5Result.isClean,
    reasoning,
  };
}

interface AttemptResult {
  success: boolean;
  refinedZone: SupplyDemandZone | null;
  isClean: boolean;
  reason: string;
}

function attemptRefinement(
  parentZone: SupplyDemandZone,
  lowerTfCandles: Candle[],
  targetTimeframe: Timeframe
): AttemptResult {
  const candlesInRange = lowerTfCandles.filter(
    c => c.high >= parentZone.bottomPrice && c.low <= parentZone.topPrice
  );

  if (candlesInRange.length < 3) {
    return {
      success: false,
      refinedZone: null,
      isClean: false,
      reason: 'Not enough candles in zone range',
    };
  }

  const zonesFound = detectSupplyDemandZones(candlesInRange, targetTimeframe, {
    lookback: candlesInRange.length,
  });

  const matchingZones = zonesFound.filter(z => z.type === parentZone.type);

  if (matchingZones.length === 0) {
    return {
      success: false,
      refinedZone: null,
      isClean: false,
      reason: 'No matching zones found in lower timeframe',
    };
  }

  const pipThreshold = PIP_THRESHOLDS[targetTimeframe as keyof typeof PIP_THRESHOLDS] || { maxPips: 30, targetPips: 15 };
  const pipValue = parentZone.pipSize > 0 ? parentZone.pipSize / 10 : 0.0001;

  if (matchingZones.length === 1) {
    const refined = matchingZones[0];
    const zonePips = (refined.topPrice - refined.bottomPrice) / pipValue;

    if (isZoneWithinBounds(refined, parentZone) && zonePips <= pipThreshold.maxPips) {
      return {
        success: true,
        refinedZone: refined,
        isClean: zonePips <= pipThreshold.targetPips,
        reason: `Single zone found (${zonePips.toFixed(1)} pips)`,
      };
    }
  }

  if (matchingZones.length > 1) {
    const unmitigated = getUnmitigatedZones(matchingZones);

    if (unmitigated.length === 1) {
      const refined = unmitigated[0];
      const zonePips = (refined.topPrice - refined.bottomPrice) / pipValue;
      
      if (isZoneWithinBounds(refined, parentZone) && zonePips <= pipThreshold.maxPips) {
        return {
          success: true,
          refinedZone: refined,
          isClean: zonePips <= pipThreshold.targetPips,
          reason: `One unmitigated zone (${zonePips.toFixed(1)} pips)`,
        };
      }
    }

    if (matchingZones.length >= 2) {
      return {
        success: false,
        refinedZone: null,
        isClean: false,
        reason: `${matchingZones.length} zones - too messy, stay with parent`,
      };
    }

    const bestZone = selectBestZone(matchingZones);
    if (bestZone && isZoneWithinBounds(bestZone, parentZone)) {
      const zonePips = (bestZone.topPrice - bestZone.bottomPrice) / pipValue;
      return {
        success: true,
        refinedZone: bestZone,
        isClean: false,
        reason: `Selected strongest zone (${zonePips.toFixed(1)} pips)`,
      };
    }

    return {
      success: false,
      refinedZone: null,
      isClean: false,
      reason: 'Multiple zones - too messy for refinement',
    };
  }

  return {
    success: false,
    refinedZone: null,
    isClean: false,
    reason: 'Refinement criteria not met',
  };
}

function isZoneWithinBounds(zone: SupplyDemandZone, parentZone: SupplyDemandZone): boolean {
  return zone.topPrice <= parentZone.topPrice && zone.bottomPrice >= parentZone.bottomPrice;
}

function selectBestZone(zones: SupplyDemandZone[]): SupplyDemandZone | null {
  if (zones.length === 0) return null;

  const strengthOrder = { strong: 3, moderate: 2, weak: 1 };

  return zones.reduce((best, zone) => {
    if (strengthOrder[zone.strength] > strengthOrder[best.strength]) {
      return zone;
    }
    if (zone.status === 'unmitigated' && best.status === 'mitigated') {
      return zone;
    }
    return best;
  });
}

export function calculateOptimalEntry(
  zone: SupplyDemandZone,
  direction: 'buy' | 'sell'
): number {
  if (direction === 'buy') {
    return zone.bottomPrice + (zone.topPrice - zone.bottomPrice) * 0.7;
  } else {
    return zone.topPrice - (zone.topPrice - zone.bottomPrice) * 0.7;
  }
}

export function calculateStopLoss(
  zone: SupplyDemandZone,
  direction: 'buy' | 'sell',
  bufferPips: number = 5
): number {
  const pipValue = zone.pipSize > 0 ? zone.pipSize / 10 : 0.0001;
  const buffer = bufferPips * pipValue;

  if (direction === 'buy') {
    return zone.bottomPrice - buffer;
  } else {
    return zone.topPrice + buffer;
  }
}
