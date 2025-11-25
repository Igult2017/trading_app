import { Candle, SwingPoint, SwingPointType } from '../core/types';

export interface SwingPointDetectionOptions {
  lookback: number;
  minSwingSize: number;
}

const DEFAULT_OPTIONS: SwingPointDetectionOptions = {
  lookback: 5,
  minSwingSize: 0,
};

export function isSwingHigh(candles: Candle[], index: number, lookback: number = 2): boolean {
  if (index < lookback || index >= candles.length - lookback) return false;

  const current = candles[index];

  for (let i = 1; i <= lookback; i++) {
    if (candles[index - i].high >= current.high) return false;
    if (candles[index + i].high >= current.high) return false;
  }

  return true;
}

export function isSwingLow(candles: Candle[], index: number, lookback: number = 2): boolean {
  if (index < lookback || index >= candles.length - lookback) return false;

  const current = candles[index];

  for (let i = 1; i <= lookback; i++) {
    if (candles[index - i].low <= current.low) return false;
    if (candles[index + i].low <= current.low) return false;
  }

  return true;
}

export function detectSwingPoints(
  candles: Candle[],
  options: Partial<SwingPointDetectionOptions> = {}
): SwingPoint[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const swingPoints: SwingPoint[] = [];

  const highs: { price: number; index: number; timestamp: number }[] = [];
  const lows: { price: number; index: number; timestamp: number }[] = [];

  for (let i = opts.lookback; i < candles.length - opts.lookback; i++) {
    if (isSwingHigh(candles, i, opts.lookback)) {
      highs.push({
        price: candles[i].high,
        index: i,
        timestamp: candles[i].timestamp,
      });
    }
    if (isSwingLow(candles, i, opts.lookback)) {
      lows.push({
        price: candles[i].low,
        index: i,
        timestamp: candles[i].timestamp,
      });
    }
  }

  const allPoints = [...highs.map(h => ({ ...h, isHigh: true })), ...lows.map(l => ({ ...l, isHigh: false }))];
  allPoints.sort((a, b) => a.index - b.index);

  let lastHigherHigh = -Infinity;
  let lastLowerLow = Infinity;
  let lastHigherLow = -Infinity;
  let lastLowerHigh = Infinity;

  for (const point of allPoints) {
    let type: SwingPointType;

    if (point.isHigh) {
      if (point.price > lastHigherHigh) {
        type = 'HH';
        lastHigherHigh = point.price;
        lastLowerHigh = point.price;
      } else if (point.price < lastLowerHigh) {
        type = 'LH';
        lastLowerHigh = point.price;
      } else {
        type = 'LH';
      }
    } else {
      if (point.price < lastLowerLow) {
        type = 'LL';
        lastLowerLow = point.price;
        lastHigherLow = point.price;
      } else if (point.price > lastHigherLow) {
        type = 'HL';
        lastHigherLow = point.price;
      } else {
        type = 'HL';
      }
    }

    swingPoints.push({
      type,
      price: point.price,
      index: point.index,
      timestamp: point.timestamp,
    });
  }

  return swingPoints;
}

export function getRecentSwingPoints(swingPoints: SwingPoint[], count: number = 5): SwingPoint[] {
  return swingPoints.slice(-count);
}

export function detectTrendFromSwings(swingPoints: SwingPoint[]): 'bullish' | 'bearish' | 'sideways' {
  if (swingPoints.length < 4) return 'sideways';

  const recent = swingPoints.slice(-6);

  const highs = recent.filter(s => s.type === 'HH' || s.type === 'LH');
  const lows = recent.filter(s => s.type === 'HL' || s.type === 'LL');

  const hhCount = recent.filter(s => s.type === 'HH').length;
  const hlCount = recent.filter(s => s.type === 'HL').length;
  const lhCount = recent.filter(s => s.type === 'LH').length;
  const llCount = recent.filter(s => s.type === 'LL').length;

  if (hhCount >= 1 && hlCount >= 1 && hhCount + hlCount > lhCount + llCount) {
    return 'bullish';
  }

  if (llCount >= 1 && lhCount >= 1 && llCount + lhCount > hhCount + hlCount) {
    return 'bearish';
  }

  return 'sideways';
}

export function findBrokenStructure(
  swingPoints: SwingPoint[],
  currentPrice: number
): { type: 'bullish_bos' | 'bearish_bos' | null; level: number | null } {
  if (swingPoints.length < 2) {
    return { type: null, level: null };
  }

  const recentHighs = swingPoints.filter(s => s.type === 'HH' || s.type === 'LH');
  const recentLows = swingPoints.filter(s => s.type === 'HL' || s.type === 'LL');

  if (recentHighs.length > 0) {
    const lastHigh = recentHighs[recentHighs.length - 1];
    if (currentPrice > lastHigh.price) {
      return { type: 'bullish_bos', level: lastHigh.price };
    }
  }

  if (recentLows.length > 0) {
    const lastLow = recentLows[recentLows.length - 1];
    if (currentPrice < lastLow.price) {
      return { type: 'bearish_bos', level: lastLow.price };
    }
  }

  return { type: null, level: null };
}
