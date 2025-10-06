interface FinnhubEconomicEvent {
  country: string;
  event: string;
  impact: string;
  actual: string | null;
  estimate: string | null;
  prev: string | null;
  time: string;
}

interface EconomicCalendarResponse {
  economicCalendar: FinnhubEconomicEvent[];
}

const COUNTRY_TO_REGION: Record<string, string> = {
  'US': 'NA',
  'CA': 'NA',
  'MX': 'NA',
  'GB': 'EU',
  'DE': 'EU',
  'FR': 'EU',
  'IT': 'EU',
  'ES': 'EU',
  'EU': 'EU',
  'JP': 'ASIA',
  'CN': 'ASIA',
  'IN': 'ASIA',
  'AU': 'OCEANIA',
  'NZ': 'OCEANIA',
};

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  'US': 'USD',
  'CA': 'CAD',
  'MX': 'MXN',
  'GB': 'GBP',
  'DE': 'EUR',
  'FR': 'EUR',
  'IT': 'EUR',
  'ES': 'EUR',
  'EU': 'EUR',
  'JP': 'JPY',
  'CN': 'CNY',
  'IN': 'INR',
  'AU': 'AUD',
  'NZ': 'NZD',
};

function generateEventId(event: FinnhubEconomicEvent): string {
  const str = `${event.time}-${event.event}-${event.country}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export async function fetchEconomicCalendar(fromDate?: string, toDate?: string) {
  const apiKey = process.env.FINNHUB_API_KEY;
  
  if (!apiKey) {
    throw new Error('FINNHUB_API_KEY environment variable is not set');
  }

  const today = new Date();
  const from = fromDate || today.toISOString().split('T')[0];
  const to = toDate || new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 403) {
        console.error('Finnhub API key does not have access to economic calendar endpoint. This feature requires a paid plan or different API key.');
        return [];
      }
      throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
    }

    const data: EconomicCalendarResponse = await response.json();
    
    const events = data.economicCalendar
      .filter(event => {
        const impact = event.impact?.toLowerCase() || '';
        return impact === 'high' || impact === 'medium';
      })
      .map(event => {
        const country = event.country || 'US';
        const region = COUNTRY_TO_REGION[country] || 'NA';
        const currency = COUNTRY_TO_CURRENCY[country] || 'USD';
        
        const eventDate = new Date(event.time);
        const isReleased = event.actual !== null && event.actual !== '';
        
        let marketImpact = '';
        if (isReleased && event.estimate && event.actual) {
          const estimate = parseFloat(event.estimate);
          const actual = parseFloat(event.actual);
          if (!isNaN(estimate) && !isNaN(actual)) {
            if (actual > estimate) {
              marketImpact = 'Actual exceeded expectations, potentially bullish for ' + currency;
            } else if (actual < estimate) {
              marketImpact = 'Actual below expectations, potentially bearish for ' + currency;
            } else {
              marketImpact = 'In line with expectations, neutral impact';
            }
          }
        }

        const affectedCurrencies = [currency];
        if (currency === 'USD') {
          affectedCurrencies.push('EUR/USD', 'GBP/USD', 'USD/JPY');
        } else if (currency === 'EUR') {
          affectedCurrencies.push('EUR/USD', 'EUR/GBP');
        } else if (currency === 'GBP') {
          affectedCurrencies.push('GBP/USD', 'EUR/GBP');
        }

        return {
          id: generateEventId(event),
          title: event.event,
          description: `${country} - ${event.event}`,
          eventType: event.event.includes('GDP') ? 'GDP' : 
                     event.event.includes('CPI') ? 'Inflation' :
                     event.event.includes('Employment') || event.event.includes('Payrolls') ? 'Employment' :
                     event.event.includes('PMI') ? 'Manufacturing' :
                     event.event.includes('Rate') ? 'Interest Rate' : 'Economic Indicator',
          country: country,
          region: region,
          currency: currency,
          impactLevel: event.impact?.toUpperCase() || 'MEDIUM',
          eventTime: eventDate,
          expectedValue: event.estimate || null,
          previousValue: event.prev || null,
          actualValue: event.actual || null,
          unit: null,
          futuresImpliedExpectation: null,
          surpriseFactor: null,
          marketImpactAnalysis: marketImpact || null,
          affectedCurrencies: affectedCurrencies,
          affectedStocks: [],
          isReleased: isReleased,
        };
      });
    
    return events.sort((a, b) => 
      new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime()
    );
  } catch (error) {
    console.error('Error fetching Finnhub economic calendar:', error);
    throw error;
  }
}
