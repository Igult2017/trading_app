import { Candle, MultiTimeframeData, Timeframe } from '../core/types';

export interface TimeframeConfig {
  timeframe: Timeframe;
  period: string;
  interval: string;
  candleCount: number;
}

export const TIMEFRAME_CONFIGS: Record<Timeframe, TimeframeConfig> = {
  '1M': { timeframe: '1M', period: '1d', interval: '1m', candleCount: 60 },
  '3M': { timeframe: '3M', period: '2d', interval: '3m', candleCount: 80 },
  '5M': { timeframe: '5M', period: '5d', interval: '5m', candleCount: 100 },
  '15M': { timeframe: '15M', period: '5d', interval: '15m', candleCount: 100 },
  '30M': { timeframe: '30M', period: '10d', interval: '30m', candleCount: 100 },
  '1H': { timeframe: '1H', period: '1mo', interval: '1h', candleCount: 100 },
  '2H': { timeframe: '2H', period: '2mo', interval: '2h', candleCount: 100 },
  '4H': { timeframe: '4H', period: '3mo', interval: '4h', candleCount: 100 },
  '1D': { timeframe: '1D', period: '1y', interval: '1d', candleCount: 252 },
  '1W': { timeframe: '1W', period: '2y', interval: '1wk', candleCount: 104 },
};

export function generateMockCandles(
  basePrice: number,
  timeframe: Timeframe,
  count: number,
  volatility: number = 0.002,
  trend: 'bullish' | 'bearish' | 'sideways' = 'sideways'
): Candle[] {
  const candles: Candle[] = [];
  let currentPrice = basePrice;
  const now = Date.now();

  const timeframeMs: Record<Timeframe, number> = {
    '1M': 60 * 1000,
    '3M': 3 * 60 * 1000,
    '5M': 5 * 60 * 1000,
    '15M': 15 * 60 * 1000,
    '30M': 30 * 60 * 1000,
    '1H': 60 * 60 * 1000,
    '2H': 2 * 60 * 60 * 1000,
    '4H': 4 * 60 * 60 * 1000,
    '1D': 24 * 60 * 60 * 1000,
    '1W': 7 * 24 * 60 * 60 * 1000,
  };

  const intervalMs = timeframeMs[timeframe];

  for (let i = count - 1; i >= 0; i--) {
    const trendBias = trend === 'bullish' ? 0.0003 : trend === 'bearish' ? -0.0003 : 0;
    const randomChange = (Math.random() - 0.5) * 2 * volatility + trendBias;

    const open = currentPrice;
    const closeChange = randomChange * currentPrice;
    const close = open + closeChange;

    const highExtra = Math.random() * volatility * currentPrice;
    const lowExtra = Math.random() * volatility * currentPrice;

    const high = Math.max(open, close) + highExtra;
    const low = Math.min(open, close) - lowExtra;

    candles.push({
      timestamp: now - i * intervalMs,
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 1000000) + 100000,
      timeframe,
    });

    currentPrice = close;
  }

  return candles;
}

export async function fetchMultiTimeframeData(
  symbol: string,
  assetClass: string,
  currentPrice: number
): Promise<MultiTimeframeData> {
  const trendBias = determineTrendBias(symbol, currentPrice);

  const volatility = getVolatilityForAsset(assetClass);

  const [h4Data, h2Data, m30Data, m15Data, m5Data, m3Data, m1Data] = await Promise.all([
    generateMockCandles(currentPrice, '4H', 100, volatility, trendBias),
    generateMockCandles(currentPrice, '2H', 100, volatility, trendBias),
    generateMockCandles(currentPrice, '30M', 100, volatility, trendBias),
    generateMockCandles(currentPrice, '15M', 100, volatility, trendBias),
    generateMockCandles(currentPrice, '5M', 100, volatility, trendBias),
    generateMockCandles(currentPrice, '3M', 80, volatility, trendBias),
    generateMockCandles(currentPrice, '1M', 60, volatility, trendBias),
  ]);

  return {
    h4: h4Data,
    h2: h2Data,
    m30: m30Data,
    m15: m15Data,
    m5: m5Data,
    m3: m3Data,
    m1: m1Data,
  };
}

function determineTrendBias(symbol: string, price: number): 'bullish' | 'bearish' | 'sideways' {
  const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const dayOfWeek = new Date().getDay();
  const combined = (hash + dayOfWeek + Math.floor(price)) % 3;

  if (combined === 0) return 'bullish';
  if (combined === 1) return 'bearish';
  return 'sideways';
}

function getVolatilityForAsset(assetClass: string): number {
  switch (assetClass) {
    case 'crypto':
      return 0.01;
    case 'forex':
      return 0.002;
    case 'stock':
      return 0.005;
    case 'commodity':
      return 0.008;
    case 'index':
      return 0.004;
    default:
      return 0.003;
  }
}

export function alignCandles(
  higherTf: Candle[],
  lowerTf: Candle[],
  startTime: number,
  endTime: number
): Candle[] {
  return lowerTf.filter(c => c.timestamp >= startTime && c.timestamp <= endTime);
}

export function getCurrentPrice(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  return candles[candles.length - 1].close;
}

export function getLatestCandle(candles: Candle[]): Candle | null {
  if (candles.length === 0) return null;
  return candles[candles.length - 1];
}
