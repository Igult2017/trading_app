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

/*
  WHAT A RELEASE MEANS — TWO SEPARATE QUESTIONS, AND THEY OFTEN DISAGREE.

  ⚠ REWRITTEN 2026-10-11 BECAUSE THE CURRENCY DIRECTION WAS INVERTED on the biggest releases, and
  that answer was already live on the calendar page.

  The old table had ONE field, `betterThanExpected`, read as both the stock direction AND the
  currency direction, with `currencyEffect`/`stockEffect` meant to reconcile them. For CPI,
  Inflation, Interest Rate and Unemployment the two point opposite ways, and the currency came out
  backwards. Measured on the real Core CPI row in production (forecast 0.2%, previous 0.3% — that
  is inflation COOLING, which weakens a currency):

      "Bullish outlook for USD"      EUR/USD -> bearish      USD/JPY -> bullish

  The `Interest Rate` entry even contradicted itself: its description read "Rate hikes strengthen
  currency but pressure stocks" while its value said bearish.

  So the two questions are asked separately now, and each is answerable on its own:

    higherMeansCurrency  a number ABOVE forecast — does this currency get STRONGER or WEAKER?
    higherMeansStocks    the same number — do that country's shares go UP or DOWN?

  The pair mapping underneath was always right (currency stronger -> the pair it is the BASE of
  rises, the pair it is the QUOTE of falls) and is unchanged.
*/
const eventSentimentRules: Record<string, {
  higherMeansCurrency: 'stronger' | 'weaker';
  higherMeansStocks: 'up' | 'down';
  description: string;
}> = {
  // Growth up -> currency stronger, shares up. The uncontroversial one.
  'GDP':           { higherMeansCurrency: 'stronger', higherMeansStocks: 'up',
                     description: 'Stronger growth supports the currency and shares' },
  // ⚠ THE ONE THAT WAS BACKWARDS. Hot inflation pulls rate-hike expectations forward and the
  // currency RISES; shares fall on the same news. Both halves are said here, separately.
  'CPI':           { higherMeansCurrency: 'stronger', higherMeansStocks: 'down',
                     description: 'Hotter inflation brings rate hikes closer — currency up, shares down' },
  'Inflation':     { higherMeansCurrency: 'stronger', higherMeansStocks: 'down',
                     description: 'Hotter inflation brings rate hikes closer — currency up, shares down' },
  'PPI':           { higherMeansCurrency: 'stronger', higherMeansStocks: 'down',
                     description: 'Producer prices feed consumer inflation — currency up, shares down' },
  'NFP':           { higherMeansCurrency: 'stronger', higherMeansStocks: 'up',
                     description: 'Strong hiring supports the currency and shares' },
  'Employment':    { higherMeansCurrency: 'stronger', higherMeansStocks: 'up',
                     description: 'Strong employment supports the currency and shares' },
  // ⚠ ALSO BACKWARDS BEFORE. A HIGHER unemployment number is bad news: currency weaker.
  'Unemployment':  { higherMeansCurrency: 'weaker',   higherMeansStocks: 'down',
                     description: 'More unemployment weakens the currency' },
  // ⚠ AND THIS ONE CONTRADICTED ITS OWN DESCRIPTION. A hike strengthens the currency.
  'Interest Rate': { higherMeansCurrency: 'stronger', higherMeansStocks: 'down',
                     description: 'Rate hikes strengthen the currency and pressure shares' },
  'Retail Sales':  { higherMeansCurrency: 'stronger', higherMeansStocks: 'up',
                     description: 'Strong consumer spending drives growth' },
  'PMI':           { higherMeansCurrency: 'stronger', higherMeansStocks: 'up',
                     description: 'Business activity points to economic momentum' },
  'Trade Balance': { higherMeansCurrency: 'stronger', higherMeansStocks: 'up',
                     description: 'A bigger surplus supports the currency' },
};

/**
 * The rule for an event title, or NULL when we do not recognise it.
 *
 * ⚠ IT USED TO FALL BACK TO THE GDP RULE, which meant an unrecognised release — a central banker
 * speaking, a confidence survey, anything not in the table — was given GDP's direction and
 * announced with full confidence. Guessing a direction is worse than declining to call one,
 * especially now these reach a channel people trade from. Callers must handle null by reporting
 * the numbers and saying the direction is not called.
 */
/**
 * ⚠ LONGEST KEY FIRST, AND THAT IS LOAD-BEARING. Matching is by substring, and
 * **"employment" is a substring of "unemployment"** — so with the table's own ordering,
 * "Unemployment Rate" matched the Employment rule and was called the exact opposite of the truth
 * (more people out of work read as good news for the currency). Measured: it returned bullish
 * where bearish is correct.
 *
 * Sorting by length makes the most specific key win whatever order the table is written in, so
 * adding a rule can never silently shadow another one. Computed once, not per call.
 */
const RULE_KEYS_LONGEST_FIRST = Object.keys(eventSentimentRules)
  .sort((a, b) => b.length - a.length);

function getEventRule(title: string) {
  const t = title.toLowerCase();
  for (const key of RULE_KEYS_LONGEST_FIRST) {
    if (t.includes(key.toLowerCase())) return eventSentimentRules[key];
  }
  return null;
}

/** Bullish or bearish for the CURRENCY, from whether the number came in above or below. */
function currencyDirection(
  rule: { higherMeansCurrency: 'stronger' | 'weaker' },
  higher: boolean,
): 'bullish' | 'bearish' {
  const stronger = rule.higherMeansCurrency === 'stronger' ? higher : !higher;
  return stronger ? 'bullish' : 'bearish';
}

/**
 * Which way a release points THE CURRENCY, or null when no direction can honestly be called.
 *
 * Small on purpose: it is what the Telegram warnings need, without dragging in the share sectors
 * or the six-major pair list that the web calendar wants. The rules and the matcher are the ones
 * tested in `__tests__/newsDirection.check.ts` — not a second copy that could drift from them.
 *
 * `null` means one of: we do not model this release, or there are no numbers to compare. Callers
 * must print the figures and say nothing about direction, never fall back to a guess.
 */
export function currencyOutlook(
  title: string,
  higherFirst: string | null | undefined,
  lowerSecond: string | null | undefined,
): 'bullish' | 'bearish' | 'neutral' | null {
  const rule = getEventRule(title || '');
  if (!rule) return null;
  const a = parseNumericValue(higherFirst ?? null);
  const b = parseNumericValue(lowerSecond ?? null);
  if (a === null || b === null) return null;
  if (a === b) return 'neutral';
  return currencyDirection(rule, a > b);
}

function parseNumericValue(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function calculateSurpriseFactor(actual: number, expected: number): string {
  if (Math.abs(expected) === 0) {
    return actual === 0 ? 'In-line' : actual > 0 ? 'Major Beat' : 'Major Miss';
  }
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
  
  // BEFORE THE RELEASE: what the forecast implies against last time. A forecast ABOVE the previous
  // reading is "a higher number coming", and the rule says what higher means for this currency.
  // `rule` is null for an event we do not recognise — then no direction is called at all.
  if (rule && expectedValue !== null && previousValue !== null && expectedValue !== previousValue) {
    preReleaseSentiment = currencyDirection(rule, expectedValue > previousValue);
    expertSentiment = preReleaseSentiment;
  } else if (rule && event.futuresImpliedExpectation) {
    const f = event.futuresImpliedExpectation.toLowerCase();
    if (f.includes('higher') || f.includes('increase'))      preReleaseSentiment = currencyDirection(rule, true);
    else if (f.includes('lower') || f.includes('decrease'))  preReleaseSentiment = currencyDirection(rule, false);
  }

  // AFTER THE RELEASE: the only comparison that matters is actual against forecast. The market has
  // already priced the forecast; the move comes from the gap.
  if (actualValue !== null && expectedValue !== null) {
    surpriseFactor = calculateSurpriseFactor(actualValue, expectedValue);
    if (!rule || actualValue === expectedValue) {
      postReleaseSentiment = 'neutral';
    } else {
      postReleaseSentiment = currencyDirection(rule, actualValue > expectedValue);
    }
  }
  
  const currencyPairs = getCurrencyPairs(currency);
  const currencyPairImpacts: CurrencyPairImpact[] = currencyPairs.map(pair => {
    const sentiment = event.isReleased && postReleaseSentiment 
      ? postReleaseSentiment 
      : preReleaseSentiment;
    
    // THE PAIR MAPPING, which was always correct and is unchanged. `sentiment` is the direction of
    // the CURRENCY. A stronger currency lifts the pair it is the BASE of (USD stronger -> USD/JPY
    // up) and sinks the pair it is the QUOTE of (USD stronger -> EUR/USD down).
    const isBaseCurrency = pair.startsWith(currency);
    const flip = (d: typeof sentiment) => d === 'bullish' ? 'bearish' : d === 'bearish' ? 'bullish' : 'neutral';
    const finalSentiment = isBaseCurrency ? sentiment : flip(sentiment);

    return {
      pair,
      sentiment: finalSentiment,
      reasoning: !rule
        ? 'Direction not called — this release is not one we model'
        : event.isReleased
          ? `Post-release: ${surpriseFactor} - ${rule.description}`
          : `Pre-release: ${currency} expected ${preReleaseSentiment} - ${rule.description}`
    };
  });
  
  const affectedStocks = getAffectedStocks(currency, event.title || '');
  const stockImpacts: StockImpact[] = affectedStocks.slice(0, 3).map(sector => {
    const sentiment = event.isReleased && postReleaseSentiment 
      ? postReleaseSentiment 
      : preReleaseSentiment;
    
    // SHARES ARE A SEPARATE QUESTION FROM THE CURRENCY, which is the whole point of splitting the
    // rule. `sentiment` above is the CURRENCY's direction; when a higher number lifts the currency
    // but pushes shares down (inflation, rate hikes), the two disagree and the share call flips.
    const agree = !rule
      ? true
      : (rule.higherMeansCurrency === 'stronger') === (rule.higherMeansStocks === 'up');
    const flip = (d: typeof sentiment) => d === 'bullish' ? 'bearish' : d === 'bearish' ? 'bullish' : 'neutral';
    const effectiveSentiment = agree ? sentiment : flip(sentiment);

    return {
      sector,
      sentiment: effectiveSentiment,
      reasoning: !rule
        ? 'Direction not called — this release is not one we model'
        : event.isReleased
          ? `${surpriseFactor} data ${effectiveSentiment === 'bullish' ? 'supports' : 'pressures'} ${sector}`
          : `Expected data to ${effectiveSentiment === 'bullish' ? 'support' : 'pressure'} ${sector}`
    };
  });
  
  // THE SENTENCE A PERSON READS. An unrecognised release reports its numbers and stops — it does
  // not guess a direction, which is what the old GDP fallback did.
  let marketImpactAnalysis = '';
  if (event.isReleased && postReleaseSentiment && rule) {
    marketImpactAnalysis = `${surpriseFactor}: actual ${actualValue} against a ${expectedValue} forecast. `
      + `${currency} likely to ${postReleaseSentiment === 'bullish' ? 'strengthen' : postReleaseSentiment === 'bearish' ? 'weaken' : 'hold steady'}. `
      + rule.description;
  } else if (rule) {
    marketImpactAnalysis = `Forecast ${expectedValue ?? 'unchanged'}, previous ${previousValue ?? 'n/a'}. `
      + `If it comes in as forecast, ${currency} looks ${preReleaseSentiment}. `
      + rule.description;
  } else {
    marketImpactAnalysis = `Forecast ${expectedValue ?? 'unchanged'}, previous ${previousValue ?? 'n/a'}. `
      + `Direction not called — this release is not one we model.`;
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
