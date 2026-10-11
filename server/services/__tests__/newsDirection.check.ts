/**
 * WHICH WAY A RELEASE PUSHES A PAIR — run:
 *     npx tsx server/services/__tests__/newsDirection.check.ts
 *
 * WHY THIS EXISTS. These calls go to a channel people trade from, and until 2026-10-11 the
 * currency direction was INVERTED for the four biggest releases. Measured on the real Core CPI row
 * in production — forecast 0.2% against a 0.3% previous, which is inflation COOLING and therefore
 * a WEAKER dollar — the live API answered:
 *
 *     "Bullish outlook for USD"        EUR/USD -> bearish        USD/JPY -> bullish
 *
 * One field, `betterThanExpected`, was being read as both the share direction and the currency
 * direction. For CPI, Inflation, Interest Rate and Unemployment those point opposite ways, so the
 * currency came out backwards. `Interest Rate` even contradicted its own description.
 *
 * Every case below is a fact about markets, not about this code, so it can be checked by reading
 * it: a hot inflation print lifts the currency, a rate hike lifts the currency, rising
 * unemployment sinks it. If a future edit flips one, this goes red.
 */
import { analyzeEventSentiment } from '../sentimentAnalysis';

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

/** A released event: `actual` against `forecast` is the only comparison that moves price. */
const released = (title: string, currency: string, actual: string, forecast: string) =>
  analyzeEventSentiment({
    title, currency, actualValue: actual, expectedValue: forecast,
    previousValue: forecast, isReleased: true,
  } as any);

const dirOf = (a: ReturnType<typeof analyzeEventSentiment>, pair: string) =>
  a.currencyPairImpacts.find(p => p.pair === pair)?.sentiment ?? 'missing';

console.log('\nTHE CURRENCY DIRECTION — the half that was inverted');

// HOT INFLATION LIFTS THE CURRENCY. Rate hikes come closer. This is the case that was wrong.
const hotCpi = released('Core CPI m/m', 'USD', '0.5%', '0.2%');
check('hot US CPI -> USD strengthens', hotCpi.postReleaseSentiment, 'bullish');
check('  ...so EUR/USD falls', dirOf(hotCpi, 'EUR/USD'), 'bearish');
check('  ...and USD/JPY rises', dirOf(hotCpi, 'USD/JPY'), 'bullish');
check('  ...and the sentence agrees', hotCpi.marketImpactAnalysis.includes('USD likely to strengthen'), true);

const coldCpi = released('Core CPI m/m', 'USD', '0.0%', '0.2%');
check('cooling US CPI -> USD weakens', coldCpi.postReleaseSentiment, 'bearish');
check('  ...so EUR/USD rises', dirOf(coldCpi, 'EUR/USD'), 'bullish');

// A HIKE LIFTS THE CURRENCY. The old table said bearish while its own description said the opposite.
const hike = released('Interest Rate Decision', 'GBP', '5.25%', '5.00%');
check('a surprise rate hike -> GBP strengthens', hike.postReleaseSentiment, 'bullish');
check('  ...so GBP/USD rises', dirOf(hike, 'GBP/USD'), 'bullish');
check('  ...and GBP/JPY rises', dirOf(hike, 'GBP/JPY'), 'bullish');

// MORE UNEMPLOYMENT IS BAD NEWS. A HIGHER number must weaken the currency.
//
// ⚠ THE SUBTLE ONE. Rules are matched by substring, and "employment" is inside "unemployment" —
// so until the matcher was made longest-key-first, "Unemployment Rate" picked up the Employment
// rule and this came back BULLISH: more people out of work read as good news for the dollar.
const jobless = released('Unemployment Rate', 'USD', '4.5%', '4.0%');
check('unemployment above forecast -> USD weakens', jobless.postReleaseSentiment, 'bearish');
check('  ...so EUR/USD rises', dirOf(jobless, 'EUR/USD'), 'bullish');
// ...and the rule it must NOT have matched still works on its own title.
const payrolls = released('Employment Change', 'USD', '60K', '20K');
check('  teeth — plain "Employment" still reads as good news', payrolls.postReleaseSentiment, 'bullish');
check('  ...so the two are not the same rule',
      jobless.postReleaseSentiment !== payrolls.postReleaseSentiment, true);

// The ones that were already right — they must stay right.
const gdp = released('GDP m/m', 'GBP', '0.6%', '0.2%');
check('a GDP beat -> GBP strengthens', gdp.postReleaseSentiment, 'bullish');
const nfp = released('Non-Farm Employment Change', 'USD', '250K', '180K');
check('an NFP beat -> USD strengthens', nfp.postReleaseSentiment, 'bullish');
const retail = released('Retail Sales m/m', 'USD', '0.1%', '0.8%');
check('a retail sales miss -> USD weakens', retail.postReleaseSentiment, 'bearish');

console.log('\nIN LINE WITH FORECAST IS NOT A DIRECTION');
const inline = released('Core CPI m/m', 'USD', '0.2%', '0.2%');
check('actual equals forecast -> neutral', inline.postReleaseSentiment, 'neutral');

console.log('\nAN UNKNOWN RELEASE DECLINES TO CALL A DIRECTION');
// It used to inherit the GDP rule and announce a confident guess. For a speech or a survey that is
// simply made up, and it would have gone out to the channel looking exactly like a real call.
const speech = released('Fed Chairman Warsh Speaks', 'USD', '1', '0');
check('no direction is claimed', speech.postReleaseSentiment, 'neutral');
check('and it says so plainly', speech.marketImpactAnalysis.includes('Direction not called'), true);
check('  teeth — a modelled release does NOT say that',
      hotCpi.marketImpactAnalysis.includes('Direction not called'), false);

console.log('\nSHARES ARE A SEPARATE QUESTION FROM THE CURRENCY');
// The reason the one-field table went wrong: on inflation the currency and the stock market move
// in OPPOSITE directions, and a single value cannot say both.
check('hot CPI lifts the dollar...', hotCpi.postReleaseSentiment, 'bullish');
check('  ...while pressuring shares', hotCpi.stockImpacts[0]?.sentiment, 'bearish');
check('a GDP beat lifts both', gdp.stockImpacts[0]?.sentiment, 'bullish');

console.log('\nBEFORE THE RELEASE, THE FORECAST AGAINST LAST TIME');
const pre = analyzeEventSentiment({
  title: 'Core CPI m/m', currency: 'USD',
  expectedValue: '0.2%', previousValue: '0.3%', isReleased: false,
} as any);
// The real production row. Forecast BELOW previous = inflation cooling = weaker dollar. The live
// API said "Bullish outlook for USD" here.
check('forecast under previous -> USD looks weaker', pre.preReleaseSentiment, 'bearish');
check('  ...so EUR/USD looks higher', dirOf(pre, 'EUR/USD'), 'bullish');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
