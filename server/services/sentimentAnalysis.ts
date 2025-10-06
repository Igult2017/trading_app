import { EconomicEvent } from '@shared/schema';

export interface CurrencyPairImpact {
  pair: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  reasoning: string;
}

export interface StockImpact {
  sector: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  reasoning: string;
}

export interface SentimentAnalysis {
  expertSentiment: 'bullish' | 'bearish' | 'neutral';
  preReleaseSentiment: 'bullish' | 'bearish' | 'neutral';
  postReleaseSentiment: 'bullish' | 'bearish' | 'neutral' | null;
  currencyPairImpacts: CurrencyPairImpact[];
  stockImpacts: StockImpact[];
  marketImpactAnalysis: string;
  surpriseFactor: string | null;
}

const eventSentimentRules: Record<string, {
  betterThanExpected: 'bullish' | 'bearish';
  worseThanExpected: 'bullish' | 'bearish';
  currencyEffect: 'positive' | 'negative';
  stockEffect: 'positive' | 'negative';
  description: string;
}> = {
  'GDP': {
    betterThanExpected: 'bullish',
    worseThanExpected: 'bearish',
    currencyEffect: 'positive',
    stockEffect: 'positive',
    description: 'GDP growth indicates economic strength'
  },
  'CPI': {
    betterThanExpected: 'bearish',
    worseThanExpected: 'bullish',
    currencyEffect: 'positive',
    stockEffect: 'negative',
    description: 'Higher inflation may lead to rate hikes'
  },
  'Inflation': {
    betterThanExpected: 'bearish',
    worseThanExpected: 'bullish',
    currencyEffect: 'positive',
    stockEffect: 'negative',
    description: 'Higher inflation typically negative for stocks'
  },
  'NFP': {
    betterThanExpected: 'bullish',
    worseThanExpected: 'bearish',
    currencyEffect: 'positive',
    stockEffect: 'positive',
    description: 'Strong employment supports economic growth'
  },
  'Employment': {
    betterThanExpected: 'bullish',
    worseThanExpected: 'bearish',
    currencyEffect: 'positive',
    stockEffect: 'positive',
    description: 'Employment data reflects economic health'
  },
  'Unemployment': {
    betterThanExpected: 'bearish',
    worseThanExpected: 'bullish',
    currencyEffect: 'negative',
    stockEffect: 'negative',
    description: 'Higher unemployment indicates economic weakness'
  },
  'Interest Rate': {
    betterThanExpected: 'bearish',
    worseThanExpected: 'bullish',
    currencyEffect: 'positive',
    stockEffect: 'negative',
    description: 'Rate hikes strengthen currency but pressure stocks'
  },
  'Retail Sales': {
    betterThanExpected: 'bullish',
    worseThanExpected: 'bearish',
    currencyEffect: 'positive',
    stockEffect: 'positive',
    description: 'Strong consumer spending drives growth'
  },
  'PMI': {
    betterThanExpected: 'bullish',
    worseThanExpected: 'bearish',
    currencyEffect: 'positive',
    stockEffect: 'positive',
    description: 'Manufacturing activity indicates economic momentum'
  },
  'Trade Balance': {
    betterThanExpected: 'bullish',
    worseThanExpected: 'bearish',
    currencyEffect: 'positive',
    stockEffect: 'positive',
    description: 'Trade surplus supports currency strength'
  }
};

function getEventRule(title: string) {
  for (const [key, rule] of Object.entries(eventSentimentRules)) {
    if (title.toLowerCase().includes(key.toLowerCase())) {
      return rule;
    }
  }
  return eventSentimentRules['GDP'];
}

function parseNumericValue(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function calculateSurpriseFactor(actual: number, expected: number): string {
  const diff = actual - expected;
  const percentDiff = ((diff / Math.abs(expected)) * 100);
  
  if (Math.abs(percentDiff) < 5) return 'In-line';
  if (Math.abs(percentDiff) < 15) return percentDiff > 0 ? 'Mild Beat' : 'Mild Miss';
  if (Math.abs(percentDiff) < 30) return percentDiff > 0 ? 'Strong Beat' : 'Strong Miss';
  return percentDiff > 0 ? 'Major Beat' : 'Major Miss';
}

function getCurrencyPairs(currency: string): string[] {
  const majorPairs: Record<string, string[]> = {
    'USD': ['EUR/USD', 'USD/JPY', 'GBP/USD', 'USD/CHF', 'AUD/USD', 'USD/CAD'],
    'EUR': ['EUR/USD', 'EUR/GBP', 'EUR/JPY', 'EUR/CHF'],
    'GBP': ['GBP/USD', 'EUR/GBP', 'GBP/JPY'],
    'JPY': ['USD/JPY', 'EUR/JPY', 'GBP/JPY'],
    'AUD': ['AUD/USD', 'AUD/JPY'],
    'CAD': ['USD/CAD', 'CAD/JPY'],
    'CHF': ['USD/CHF', 'EUR/CHF'],
    'NZD': ['NZD/USD', 'NZD/JPY']
  };
  
  return majorPairs[currency] || [`${currency}/USD`];
}

function getAffectedStocks(currency: string, eventType: string): string[] {
  const stocksByEvent: Record<string, string[]> = {
    'Interest Rate': ['Banks', 'Financial Services', 'Real Estate'],
    'CPI': ['Consumer Goods', 'Retail', 'Energy'],
    'GDP': ['Broad Market', 'Industrials', 'Financials'],
    'Employment': ['Consumer Discretionary', 'Services', 'Retail'],
    'PMI': ['Manufacturing', 'Industrials', 'Materials'],
    'Retail Sales': ['Retail', 'Consumer Discretionary', 'E-commerce']
  };
  
  const stocksByCurrency: Record<string, string[]> = {
    'USD': ['S&P 500', 'Dow Jones', 'NASDAQ'],
    'EUR': ['DAX', 'CAC 40', 'Euro Stoxx 50'],
    'GBP': ['FTSE 100', 'FTSE 250'],
    'JPY': ['Nikkei 225', 'TOPIX'],
    'AUD': ['ASX 200'],
    'CAD': ['TSX Composite']
  };
  
  for (const [key, stocks] of Object.entries(stocksByEvent)) {
    if (eventType.includes(key)) {
      return [...stocks, ...(stocksByCurrency[currency] || [])];
    }
  }
  
  return stocksByCurrency[currency] || ['Local Market Indices'];
}

export function analyzeEventSentiment(event: Partial<EconomicEvent>): SentimentAnalysis {
  const rule = getEventRule(event.title || '');
  const currency = event.currency || event.countryCode || 'USD';
  
  let expertSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let preReleaseSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let postReleaseSentiment: 'bullish' | 'bearish' | 'neutral' | null = null;
  let surpriseFactor: string | null = null;
  
  const expectedValue = parseNumericValue(event.expectedValue || null);
  const previousValue = parseNumericValue(event.previousValue || null);
  const actualValue = parseNumericValue(event.actualValue || null);
  
  if (expectedValue !== null && previousValue !== null) {
    if (expectedValue > previousValue) {
      preReleaseSentiment = rule.betterThanExpected;
      expertSentiment = rule.betterThanExpected;
    } else if (expectedValue < previousValue) {
      preReleaseSentiment = rule.worseThanExpected;
      expertSentiment = rule.worseThanExpected;
    }
  } else if (event.futuresImpliedExpectation) {
    const futuresSentiment = event.futuresImpliedExpectation.toLowerCase();
    if (futuresSentiment.includes('higher') || futuresSentiment.includes('increase')) {
      preReleaseSentiment = rule.betterThanExpected;
    } else if (futuresSentiment.includes('lower') || futuresSentiment.includes('decrease')) {
      preReleaseSentiment = rule.worseThanExpected;
    }
  }
  
  if (actualValue !== null && expectedValue !== null) {
    surpriseFactor = calculateSurpriseFactor(actualValue, expectedValue);
    
    if (actualValue > expectedValue) {
      postReleaseSentiment = rule.betterThanExpected;
    } else if (actualValue < expectedValue) {
      postReleaseSentiment = rule.worseThanExpected;
    } else {
      postReleaseSentiment = 'neutral';
    }
  }
  
  const currencyPairs = getCurrencyPairs(currency);
  const currencyPairImpacts: CurrencyPairImpact[] = currencyPairs.map(pair => {
    const sentiment = event.isReleased && postReleaseSentiment 
      ? postReleaseSentiment 
      : preReleaseSentiment;
    
    const isBaseCurrency = pair.startsWith(currency);
    const effectiveSentiment = rule.currencyEffect === 'positive' 
      ? sentiment 
      : (sentiment === 'bullish' ? 'bearish' : sentiment === 'bearish' ? 'bullish' : 'neutral');
    
    const finalSentiment = isBaseCurrency 
      ? effectiveSentiment 
      : (effectiveSentiment === 'bullish' ? 'bearish' : effectiveSentiment === 'bearish' ? 'bullish' : 'neutral');
    
    return {
      pair,
      sentiment: finalSentiment,
      reasoning: event.isReleased 
        ? `Post-release: ${surpriseFactor} - ${rule.description}`
        : `Pre-release: Market expects ${preReleaseSentiment} impact - ${rule.description}`
    };
  });
  
  const affectedStocks = getAffectedStocks(currency, event.title || '');
  const stockImpacts: StockImpact[] = affectedStocks.slice(0, 3).map(sector => {
    const sentiment = event.isReleased && postReleaseSentiment 
      ? postReleaseSentiment 
      : preReleaseSentiment;
    
    const effectiveSentiment = rule.stockEffect === 'positive' 
      ? sentiment 
      : (sentiment === 'bullish' ? 'bearish' : sentiment === 'bearish' ? 'bullish' : 'neutral');
    
    return {
      sector,
      sentiment: effectiveSentiment,
      reasoning: event.isReleased
        ? `${surpriseFactor} data ${effectiveSentiment === 'bullish' ? 'supports' : 'pressures'} ${sector}`
        : `Expected data to ${effectiveSentiment === 'bullish' ? 'support' : 'pressure'} ${sector}`
    };
  });
  
  let marketImpactAnalysis = '';
  if (event.isReleased && postReleaseSentiment) {
    marketImpactAnalysis = `${surpriseFactor}: Actual ${actualValue} vs Expected ${expectedValue}. `;
    marketImpactAnalysis += `${currency} likely to ${postReleaseSentiment === 'bullish' ? 'strengthen' : 'weaken'}. `;
    marketImpactAnalysis += rule.description;
  } else {
    marketImpactAnalysis = `Market consensus expects ${expectedValue || 'no change'}. `;
    marketImpactAnalysis += `Previous: ${previousValue}. `;
    marketImpactAnalysis += `${preReleaseSentiment === 'bullish' ? 'Bullish' : 'Bearish'} outlook for ${currency}. `;
    marketImpactAnalysis += rule.description;
  }
  
  return {
    expertSentiment,
    preReleaseSentiment,
    postReleaseSentiment,
    currencyPairImpacts,
    stockImpacts,
    marketImpactAnalysis,
    surpriseFactor
  };
}

export function updateEventWithSentiment(event: Partial<EconomicEvent>): Partial<EconomicEvent> {
  const analysis = analyzeEventSentiment(event);
  
  return {
    ...event,
    expertSentiment: analysis.expertSentiment,
    preReleaseSentiment: analysis.preReleaseSentiment,
    postReleaseSentiment: analysis.postReleaseSentiment || undefined,
    surpriseFactor: analysis.surpriseFactor || undefined,
    marketImpactAnalysis: analysis.marketImpactAnalysis,
    currencyPairImpacts: JSON.stringify(analysis.currencyPairImpacts),
    stockImpacts: JSON.stringify(analysis.stockImpacts)
  };
}
