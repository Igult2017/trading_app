import type { EconomicEvent } from '@shared/schema';
import { format, addDays } from 'date-fns';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE_URL = 'https://financialmodelingprep.com/api/v3';

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

const countryToRegion: Record<string, string> = {
  'US': 'Americas',
  'CA': 'Americas',
  'BR': 'Americas',
  'MX': 'Americas',
  'GB': 'Europe',
  'DE': 'Europe',
  'FR': 'Europe',
  'IT': 'Europe',
  'ES': 'Europe',
  'CH': 'Europe',
  'SE': 'Europe',
  'NO': 'Europe',
  'DK': 'Europe',
  'PL': 'Europe',
  'NL': 'Europe',
  'BE': 'Europe',
  'AT': 'Europe',
  'FI': 'Europe',
  'IE': 'Europe',
  'PT': 'Europe',
  'GR': 'Europe',
  'CZ': 'Europe',
  'HU': 'Europe',
  'RO': 'Europe',
  'JP': 'Asia',
  'CN': 'Asia',
  'AU': 'Asia',
  'NZ': 'Asia',
  'SG': 'Asia',
  'HK': 'Asia',
  'KR': 'Asia',
  'IN': 'Asia',
  'TH': 'Asia',
  'MY': 'Asia',
  'ID': 'Asia',
  'PH': 'Asia',
  'VN': 'Asia',
  'TW': 'Asia',
};

const countryToCurrency: Record<string, string> = {
  'US': 'USD',
  'GB': 'GBP',
  'EU': 'EUR',
  'DE': 'EUR',
  'FR': 'EUR',
  'IT': 'EUR',
  'ES': 'EUR',
  'JP': 'JPY',
  'CN': 'CNY',
  'AU': 'AUD',
  'CA': 'CAD',
  'CH': 'CHF',
  'NZ': 'NZD',
  'SE': 'SEK',
  'NO': 'NOK',
  'DK': 'DKK',
  'PL': 'PLN',
  'NL': 'EUR',
  'BE': 'EUR',
  'AT': 'EUR',
  'FI': 'EUR',
  'IE': 'EUR',
  'PT': 'EUR',
  'GR': 'EUR',
  'SG': 'SGD',
  'HK': 'HKD',
  'KR': 'KRW',
  'IN': 'INR',
  'BR': 'BRL',
  'MX': 'MXN',
};

function determineMarketImpact(event: any): string {
  if (!event.estimate || event.actual === null) {
    return 'Impact pending - awaiting actual data release';
  }

  const actual = parseFloat(event.actual);
  const estimate = parseFloat(event.estimate);
  const previous = event.previous ? parseFloat(event.previous) : null;

  if (isNaN(actual) || isNaN(estimate)) {
    return 'Market impact analysis unavailable';
  }

  const surprise = ((actual - estimate) / Math.abs(estimate)) * 100;
  const currency = event.currency || 'currency';

  if (Math.abs(surprise) < 1) {
    return `Minimal market impact - ${currency} actual value aligned with expectations`;
  }

  if (actual > estimate) {
    if (event.event.toLowerCase().includes('unemployment') || 
        event.event.toLowerCase().includes('inflation') ||
        event.event.toLowerCase().includes('cpi')) {
      return `Bearish for ${currency} - worse than expected (+${surprise.toFixed(1)}% surprise), potential pressure on currency`;
    }
    return `Bullish for ${currency} - beat expectations (+${surprise.toFixed(1)}% surprise), positive market sentiment`;
  } else {
    if (event.event.toLowerCase().includes('unemployment') || 
        event.event.toLowerCase().includes('inflation') ||
        event.event.toLowerCase().includes('cpi')) {
      return `Bullish for ${currency} - better than expected (${surprise.toFixed(1)}% surprise), supportive for currency`;
    }
    return `Bearish for ${currency} - missed expectations (${surprise.toFixed(1)}% surprise), negative pressure`;
  }
}

export async function getEconomicCalendar(
  fromDate?: Date,
  toDate?: Date
): Promise<EconomicEvent[]> {
  if (!FMP_API_KEY) {
    console.error('FMP_API_KEY not configured');
    return [];
  }

  const from = fromDate || new Date();
  const to = toDate || addDays(new Date(), 7);

  const fromStr = format(from, 'yyyy-MM-dd');
  const toStr = format(to, 'yyyy-MM-dd');

  try {
    const url = `${BASE_URL}/economic_calendar?from=${fromStr}&to=${toStr}&apikey=${FMP_API_KEY}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`FMP API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      console.error('FMP API returned invalid data format');
      return [];
    }

    const events: EconomicEvent[] = data
      .filter(item => {
        const impact = item.impact?.toLowerCase() || 'low';
        return impact === 'high' || impact === 'medium';
      })
      .map(item => {
        const eventTime = new Date(item.date);
        const country = item.country || 'US';
        const currency = item.currency || countryToCurrency[country] || 'USD';
        
        const id = hashString(`${item.date}-${item.event}-${country}`);

        const marketImpact = determineMarketImpact(item);

        return {
          id,
          title: item.event || 'Economic Event',
          description: null,
          eventType: item.event || 'Economic Data Release',
          country,
          region: countryToRegion[country] || 'Other',
          eventTime,
          currency,
          impactLevel: item.impact || 'Medium',
          previousValue: item.previous?.toString() || null,
          expectedValue: item.estimate?.toString() || null,
          actualValue: item.actual?.toString() || null,
          unit: null,
          futuresImpliedExpectation: null,
          surpriseFactor: item.change ? item.change.toString() : null,
          marketImpactAnalysis: marketImpact,
          affectedCurrencies: [currency],
          affectedStocks: [],
          isReleased: item.actual !== null,
          createdAt: null,
        };
      })
      .sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

    return events;
  } catch (error) {
    console.error('Error fetching FMP economic calendar:', error);
    return [];
  }
}
