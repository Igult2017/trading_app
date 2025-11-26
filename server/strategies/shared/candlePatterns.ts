import { Candle } from '../core/types';

export interface InstitutionalCandle {
  index: number;
  candle: Candle;
  type: 'bullish' | 'bearish';
  bodyRatio: number;
  impulseMagnitude: number;
}

export function isBullishCandle(candle: Candle): boolean {
  return candle.close > candle.open;
}

export function isBearishCandle(candle: Candle): boolean {
  return candle.close < candle.open;
}

export function getCandleBody(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

export function getCandleRange(candle: Candle): number {
  return candle.high - candle.low;
}

export function getBodyToRangeRatio(candle: Candle): number {
  const range = getCandleRange(candle);
  if (range === 0) return 0;
  return getCandleBody(candle) / range;
}

export function getUpperWick(candle: Candle): number {
  const bodyTop = Math.max(candle.open, candle.close);
  return candle.high - bodyTop;
}

export function getLowerWick(candle: Candle): number {
  const bodyBottom = Math.min(candle.open, candle.close);
  return bodyBottom - candle.low;
}

export function isImpulseCandle(candle: Candle, threshold: number = 0.6): boolean {
  return getBodyToRangeRatio(candle) >= threshold;
}

export function detectInstitutionalCandle(
  candles: Candle[],
  lookback: number = 20
): InstitutionalCandle | null {
  if (candles.length < lookback) return null;

  const recentCandles = candles.slice(-lookback);
  const avgRange = recentCandles.reduce((sum, c) => sum + getCandleRange(c), 0) / recentCandles.length;

  for (let i = recentCandles.length - 1; i >= 0; i--) {
    const candle = recentCandles[i];
    const range = getCandleRange(candle);
    const bodyRatio = getBodyToRangeRatio(candle);

    if (range > avgRange * 1.5 && bodyRatio > 0.6) {
      return {
        index: candles.length - lookback + i,
        candle,
        type: isBullishCandle(candle) ? 'bullish' : 'bearish',
        bodyRatio,
        impulseMagnitude: range / avgRange,
      };
    }
  }

  return null;
}

export function isEngulfingPattern(prev: Candle, curr: Candle): 'bullish' | 'bearish' | null {
  const prevBody = getCandleBody(prev);
  const currBody = getCandleBody(curr);

  if (isBearishCandle(prev) && isBullishCandle(curr)) {
    if (curr.open <= prev.close && curr.close >= prev.open && currBody > prevBody) {
      return 'bullish';
    }
  }

  if (isBullishCandle(prev) && isBearishCandle(curr)) {
    if (curr.open >= prev.close && curr.close <= prev.open && currBody > prevBody) {
      return 'bearish';
    }
  }

  return null;
}

export function isPinBar(candle: Candle, threshold: number = 0.3): 'bullish' | 'bearish' | null {
  const range = getCandleRange(candle);
  const body = getCandleBody(candle);
  const upperWick = getUpperWick(candle);
  const lowerWick = getLowerWick(candle);

  if (range === 0) return null;

  const bodyRatio = body / range;

  if (bodyRatio <= threshold) {
    if (lowerWick > range * 0.6 && upperWick < range * 0.2) {
      return 'bullish';
    }
    if (upperWick > range * 0.6 && lowerWick < range * 0.2) {
      return 'bearish';
    }
  }

  return null;
}

export function getAverageRange(candles: Candle[], lookback: number = 14): number {
  const recent = candles.slice(-lookback);
  if (recent.length === 0) return 0;
  return recent.reduce((sum, c) => sum + getCandleRange(c), 0) / recent.length;
}

export function getAverageBody(candles: Candle[], lookback: number = 14): number {
  const recent = candles.slice(-lookback);
  if (recent.length === 0) return 0;
  return recent.reduce((sum, c) => sum + getCandleBody(c), 0) / recent.length;
}

export function isRejectionCandle(candle: Candle, threshold: number = 0.4): boolean {
  const range = getCandleRange(candle);
  const body = getCandleBody(candle);
  const upperWick = getUpperWick(candle);
  const lowerWick = getLowerWick(candle);

  if (range === 0) return false;

  const bodyRatio = body / range;
  const maxWick = Math.max(upperWick, lowerWick);

  return bodyRatio <= threshold && maxWick >= range * 0.5;
}

export function isDoji(candle: Candle, threshold: number = 0.1): boolean {
  const range = getCandleRange(candle);
  const body = getCandleBody(candle);

  if (range === 0) return false;

  return body / range <= threshold;
}

export function detectMomentumShift(candles: Candle[], lookback: number = 5): 'bullish' | 'bearish' | null {
  if (candles.length < lookback + 1) return null;

  const recent = candles.slice(-lookback);
  const prev = candles.slice(-lookback - 3, -lookback);

  const recentBullish = recent.filter(isBullishCandle).length;
  const recentBearish = recent.filter(isBearishCandle).length;
  const prevBullish = prev.filter(isBullishCandle).length;
  const prevBearish = prev.filter(isBearishCandle).length;

  if (prevBearish >= 2 && recentBullish >= 3) {
    return 'bullish';
  }

  if (prevBullish >= 2 && recentBearish >= 3) {
    return 'bearish';
  }

  return null;
}

export interface VolatilityAnalysis {
  isVolatile: boolean;
  wickRatio: number;
  avgWickRatio: number;
  rangeMultiplier: number;
  longWickCount: number;
  reasons: string[];
}

export function analyzeVolatility(candles: Candle[], lookback: number = 20): VolatilityAnalysis {
  if (candles.length < lookback) {
    return {
      isVolatile: false,
      wickRatio: 0,
      avgWickRatio: 0,
      rangeMultiplier: 1,
      longWickCount: 0,
      reasons: ['Insufficient data for volatility analysis'],
    };
  }

  const recentCandles = candles.slice(-lookback);
  const reasons: string[] = [];

  const avgRange = recentCandles.reduce((sum, c) => sum + getCandleRange(c), 0) / recentCandles.length;
  const avgBody = recentCandles.reduce((sum, c) => sum + getCandleBody(c), 0) / recentCandles.length;

  let totalWickRatio = 0;
  let longWickCount = 0;

  for (const candle of recentCandles) {
    const range = getCandleRange(candle);
    const body = getCandleBody(candle);
    const upperWick = getUpperWick(candle);
    const lowerWick = getLowerWick(candle);
    const totalWick = upperWick + lowerWick;

    if (range > 0) {
      const wickRatio = totalWick / range;
      totalWickRatio += wickRatio;

      if (wickRatio > 0.6) {
        longWickCount++;
      }
    }
  }

  const avgWickRatio = totalWickRatio / recentCandles.length;
  const lastCandle = recentCandles[recentCandles.length - 1];
  const lastRange = getCandleRange(lastCandle);
  const rangeMultiplier = avgRange > 0 ? lastRange / avgRange : 1;

  let isVolatile = false;

  if (avgWickRatio > 0.55) {
    isVolatile = true;
    reasons.push(`High wick ratio: ${(avgWickRatio * 100).toFixed(0)}% (market indecision)`);
  }

  if (longWickCount >= lookback * 0.4) {
    isVolatile = true;
    reasons.push(`Too many long wick candles: ${longWickCount}/${lookback}`);
  }

  if (rangeMultiplier > 2.5) {
    isVolatile = true;
    reasons.push(`Abnormal range expansion: ${rangeMultiplier.toFixed(1)}x average`);
  }

  const lastWickRatio = getCandleRange(lastCandle) > 0 
    ? (getUpperWick(lastCandle) + getLowerWick(lastCandle)) / getCandleRange(lastCandle)
    : 0;

  if (lastWickRatio > 0.7) {
    isVolatile = true;
    reasons.push(`Current candle has extreme wicks: ${(lastWickRatio * 100).toFixed(0)}%`);
  }

  return {
    isVolatile,
    wickRatio: lastWickRatio,
    avgWickRatio,
    rangeMultiplier,
    longWickCount,
    reasons,
  };
}

export function hasCleanPriceAction(candles: Candle[], lookback: number = 10): boolean {
  if (candles.length < lookback) return false;

  const recent = candles.slice(-lookback);
  let cleanCandles = 0;

  for (const candle of recent) {
    const bodyRatio = getBodyToRangeRatio(candle);
    if (bodyRatio >= 0.4) {
      cleanCandles++;
    }
  }

  return cleanCandles >= lookback * 0.6;
}

export function getWickToBodyRatio(candle: Candle): number {
  const body = getCandleBody(candle);
  const upperWick = getUpperWick(candle);
  const lowerWick = getLowerWick(candle);

  if (body === 0) return Infinity;
  return (upperWick + lowerWick) / body;
}
