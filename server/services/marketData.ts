export interface InterestRateData {
  currency: string;
  rate: number;
  lastUpdate: Date;
}

export interface InflationData {
  country: string;
  currency: string;
  rate: number;
  lastUpdate: Date;
}

export interface Candle {
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

export const CURRENT_INTEREST_RATES: Record<string, InterestRateData> = {
  USD: { currency: 'USD', rate: 5.50, lastUpdate: new Date('2025-10-01') },
  EUR: { currency: 'EUR', rate: 4.00, lastUpdate: new Date('2025-10-01') },
  GBP: { currency: 'GBP', rate: 5.25, lastUpdate: new Date('2025-10-01') },
  JPY: { currency: 'JPY', rate: 0.25, lastUpdate: new Date('2025-10-01') },
  AUD: { currency: 'AUD', rate: 4.35, lastUpdate: new Date('2025-10-01') },
  CAD: { currency: 'CAD', rate: 5.00, lastUpdate: new Date('2025-10-01') },
  CHF: { currency: 'CHF', rate: 1.75, lastUpdate: new Date('2025-10-01') },
  NZD: { currency: 'NZD', rate: 5.50, lastUpdate: new Date('2025-10-01') },
};

export const CURRENT_INFLATION: Record<string, InflationData> = {
  USD: { country: 'United States', currency: 'USD', rate: 3.2, lastUpdate: new Date('2025-09-01') },
  EUR: { country: 'Eurozone', currency: 'EUR', rate: 2.4, lastUpdate: new Date('2025-09-01') },
  GBP: { country: 'United Kingdom', currency: 'GBP', rate: 4.0, lastUpdate: new Date('2025-09-01') },
  JPY: { country: 'Japan', currency: 'JPY', rate: 2.8, lastUpdate: new Date('2025-09-01') },
  AUD: { country: 'Australia', currency: 'AUD', rate: 5.1, lastUpdate: new Date('2025-09-01') },
  CAD: { country: 'Canada', currency: 'CAD', rate: 3.6, lastUpdate: new Date('2025-09-01') },
  CHF: { country: 'Switzerland', currency: 'CHF', rate: 1.7, lastUpdate: new Date('2025-09-01') },
  NZD: { country: 'New Zealand', currency: 'NZD', rate: 5.6, lastUpdate: new Date('2025-09-01') },
};

export function parseCurrencyPair(symbol: string): { base: string; quote: string } | null {
  const forexPattern = /^([A-Z]{3})\/([A-Z]{3})$/;
  const match = symbol.match(forexPattern);
  
  if (match) {
    return { base: match[1], quote: match[2] };
  }
  
  return null;
}

export function getInterestRateData(currency: string): InterestRateData | null {
  return CURRENT_INTEREST_RATES[currency] || null;
}

export function getInflationData(currency: string): InflationData | null {
  return CURRENT_INFLATION[currency] || null;
}

export function generateMockTimeframeData(
  currentPrice: number,
  trend: 'bullish' | 'bearish' | 'neutral',
  candles: number = 20
): any[] {
  const data = [];
  let price = currentPrice;
  
  const trendBias = trend === 'bullish' ? 0.0005 : trend === 'bearish' ? -0.0005 : 0;
  
  for (let i = 0; i < candles; i++) {
    const open = price;
    const volatility = price * 0.002;
    const direction = Math.random() > 0.5 ? 1 : -1;
    const move = (Math.random() * volatility + trendBias * price) * direction;
    const close = open + move;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    
    data.push({
      timeframe: '1H',
      open,
      high,
      low,
      close,
      volume: Math.random() * 10000,
      timestamp: new Date(Date.now() - (candles - i) * 3600000),
    });
    
    price = close;
  }
  
  return data;
}
