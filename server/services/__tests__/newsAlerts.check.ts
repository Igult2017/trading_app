/**
 * News-warning schedule — run: npx tsx server/services/__tests__/newsAlerts.check.ts
 *
 * The rule is "15 minutes before, then 5 minutes before, for high-impact news on pairs any strategy
 * trades". Every part of that is asserted on a FIXED clock, so it is checkable now rather than by
 * waiting for a real release and seeing whether a message shows up.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildNewsSchedule, affectedPairs, TRADED_PAIRS, TRADED_CURRENCIES,
  LEAD_MINUTES, MAX_HORIZON_MS, type NewsEventLike,
} from '../newsAlerts';
import { BRAND_NAME } from '../../lib/brand';

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const NOW = new Date('2026-08-05T12:00:00Z');
const ev = (o: Partial<NewsEventLike> = {}): NewsEventLike => ({
  id: 'e1', title: 'ISM Manufacturing PMI', currency: 'USD', impactLevel: 'high',
  eventTime: '2026-08-05T14:00:00Z', ...o,
});

console.log('\nALL THREE WARNINGS FIRE, IN ORDER');
const three = buildNewsSchedule([ev()], NOW);
check('three warnings for one release', three.length, 3);
check('the 60-minute one first', three[0].leadMinutes, 60);
check('...at 13:00Z for a 14:00Z release', three[0].at.toISOString(), '2026-08-05T13:00:00.000Z');
check('then the 15-minute one', three[1].leadMinutes, 15);
check('...at 13:45Z', three[1].at.toISOString(), '2026-08-05T13:45:00.000Z');
check('then the 5-minute one', three[2].leadMinutes, 5);
check('...at 13:55Z', three[2].at.toISOString(), '2026-08-05T13:55:00.000Z');
check('keys are distinct per lead', new Set(three.map(a => a.key)).size, 3);
// 60 added 2026-10-11, his ask: "high impact news ... like 'CPI release in the next 1HR'".
check('LEAD_MINUTES is exactly [60, 15, 5]', [...LEAD_MINUTES], [60, 15, 5]);

console.log('\nONLY HIGH IMPACT, ONLY PAIRS WE TRADE');
check('medium impact is ignored', buildNewsSchedule([ev({ impactLevel: 'medium' })], NOW).length, 0);
check('low impact is ignored', buildNewsSchedule([ev({ impactLevel: 'low' })], NOW).length, 0);
// ⚠ THE CASE CHECK THAT MATTERED WAS NOT THIS ONE, AND THAT IS THE LESSON OF THIS FILE.
// This always proved the IN-MEMORY filter is case-insensitive, and it always passed — while the
// SQL query that feeds it asked for 'high' against stored 'High' and returned nothing, so not one
// warning was ever sent in the life of the feature. A green test sitting next to a dead feature.
// The query itself is now checked in newsQuery.check.ts.
check('impact match is case-insensitive', buildNewsSchedule([ev({ impactLevel: 'HIGH' })], NOW).length, 3);
check('a currency we never trade is ignored (AUD)',
      buildNewsSchedule([ev({ currency: 'AUD' })], NOW).length, 0);
check('JPY counts — we trade USD/JPY and GBP/JPY',
      buildNewsSchedule([ev({ currency: 'JPY' })], NOW).length, 3);
// FOUR now, not three: gold joined on 2026-10-11 and its only leg is USD, so every USD release
// flags it. GBP/JPY still has no USD leg.
check('USD affects the four pairs with a USD leg',
      affectedPairs('USD'), ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD']);
check('JPY affects exactly the two yen crosses', affectedPairs('JPY'), ['USD/JPY', 'GBP/JPY']);
check('EUR affects only EUR/USD', affectedPairs('EUR'), ['EUR/USD']);
// GBP/JPY, checked from BOTH sides — he asked for it to be looked at. A sterling release and a
// yen release must each reach it, which is what makes the cross covered rather than half-covered.
check('GBP affects GBP/USD and GBP/JPY', affectedPairs('GBP'), ['GBP/USD', 'GBP/JPY']);
check('GBP/JPY is reached from the GBP side', affectedPairs('GBP').includes('GBP/JPY'), true);
check('...and from the JPY side',             affectedPairs('JPY').includes('GBP/JPY'), true);
check('lowercase currency still matches', affectedPairs('gbp').length, 2);
// GOLD HAS NO CALENDAR OF ITS OWN. "XAU" is not a currency any central bank reports on, so gold is
// only ever reached through its USD leg — recorded at instruments.py:29-31 before it shipped.
check('XAU itself matches only gold', affectedPairs('XAU'), ['XAU/USD']);
check('gold rides on a USD release', affectedPairs('USD').includes('XAU/USD'), true);

console.log('\nONE RELEASE, NOT FOUR MESSAGES');
// REAL DATA, 14 Oct 2026 12:30 UTC: one CPI release publishes FOUR separate high-impact USD rows.
// Ungrouped that was four messages per lead — twelve inside one minute, three times over.
const cpi = [
  ev({ id: 'c1', title: 'Core CPI m/m', eventTime: '2026-08-05T14:00:00Z' }),
  ev({ id: 'c2', title: 'Core CPI y/y', eventTime: '2026-08-05T14:00:00Z' }),
  ev({ id: 'c3', title: 'CPI m/m',      eventTime: '2026-08-05T14:00:00Z' }),
  ev({ id: 'c4', title: 'CPI y/y',      eventTime: '2026-08-05T14:00:00Z' }),
];
const grouped = buildNewsSchedule(cpi, NOW);
check('four rows at one minute -> three messages, not twelve', grouped.length, 3);
check('and the one message names all four',
      ['Core CPI m/m', 'Core CPI y/y', 'CPI m/m', 'CPI y/y'].every(t => grouped[0].message.includes(t)), true);
check('...and says how many there are', grouped[0].message.includes('4 releases'), true);
check('a different TIME is a different release',
      buildNewsSchedule([...cpi, ev({ id: 'x', title: 'Later', eventTime: '2026-08-05T15:00:00Z' })], NOW).length, 6);
check('a different CURRENCY is a different release',
      buildNewsSchedule([...cpi, ev({ id: 'g', currency: 'GBP', eventTime: '2026-08-05T14:00:00Z' })], NOW).length, 6);
check('one event still reads as a sentence, not a one-item list',
      three[0].message.includes('1 releases'), false);

console.log('\nWINDOW EDGES');
check('a release already past schedules nothing',
      buildNewsSchedule([ev({ eventTime: '2026-08-05T11:00:00Z' })], NOW).length, 0);
// 6 minutes out: the 60m and 15m warnings are in the past, the 5m one is still ahead.
const soon = buildNewsSchedule([ev({ eventTime: '2026-08-05T12:06:00Z' })], NOW);
check('6 minutes out -> only the 5-minute warning', soon.length, 1);
check('...and it is the 5-minute one', soon[0].leadMinutes, 5);
// The EVENT sitting past the horizon is not enough — its earlier warnings still land inside it.
// It has to clear the horizon by more than the LONGEST lead for all of them to fall outside, and
// the longest lead is 60 now, not 15 — so this edge moved when the hour warning was added.
check('an event just past the horizon still warns (the lead pulls it back in)',
      buildNewsSchedule([ev({ eventTime: new Date(NOW.getTime() + MAX_HORIZON_MS + 60_000) })], NOW).length, 3);
check('past the horizon by more than 15m -> only the 60-minute one survives',
      buildNewsSchedule([ev({ eventTime: new Date(NOW.getTime() + MAX_HORIZON_MS + 16 * 60_000) })], NOW).length, 1);
check('past the horizon by more than the LONGEST lead -> nothing',
      buildNewsSchedule([ev({ eventTime: new Date(NOW.getTime() + MAX_HORIZON_MS + 61 * 60_000) })], NOW).length, 0);
check('a garbage timestamp is skipped, not thrown',
      buildNewsSchedule([ev({ eventTime: 'not-a-date' })], NOW).length, 0);

console.log('\nTHE MESSAGE');
const m60 = three[0].message, m15 = three[1].message, m5 = three[2].message;
check('names the lead time', m15.includes('IN 15 MINUTES'), true);
check('the hour warning says so', m60.includes('IN 60 MINUTES'), true);
check('the 5-minute one is marked urgent', m5.includes('🚨'), true);
check('the hour one is NOT marked urgent', m60.includes('🚨'), false);
check('gold is listed on a USD release', m60.includes('XAU/USD'), true);

// THE DIRECTION LINE — his ask: "what it means to what pairs saying if the pairs are expected to
// go bearish or bullish". Cooling inflation (forecast under previous) weakens the dollar.
const cooling = buildNewsSchedule(
  [ev({ title: 'Core CPI m/m', expectedValue: '0.2%', previousValue: '0.3%' })], NOW)[0].message;
check('it calls the direction', cooling.includes('If it lands as forecast'), true);
check('cooling CPI -> a weaker dollar', cooling.includes('USD weaker'), true);
check('  ...EUR/USD up (dollar is the quote)', /EUR\/USD ↑/.test(cooling), true);
check('  ...USD/JPY down (dollar is the base)', /USD\/JPY ↓/.test(cooling), true);
check('  ...and gold up with a weaker dollar', /XAU\/USD ↑/.test(cooling), true);
const hot = buildNewsSchedule(
  [ev({ title: 'Core CPI m/m', expectedValue: '0.4%', previousValue: '0.2%' })], NOW)[0].message;
check('hot CPI -> a stronger dollar', hot.includes('USD stronger'), true);
check('  ...and the arrows invert', /EUR\/USD ↓/.test(hot) && /USD\/JPY ↑/.test(hot), true);
// ⚠ NO DIRECTION IS INVENTED for a release we do not model — a speech has no forecast to beat.
const speech = buildNewsSchedule(
  [ev({ title: 'Fed Chairman Warsh Speaks', expectedValue: '1', previousValue: '0' })], NOW)[0].message;
check('an unmodelled release calls no direction', speech.includes('If it lands as forecast'), false);
check('  ...but still warns, with its numbers', speech.includes('IN 60 MINUTES'), true);
// ...and so is nothing claimed when the feed gave no figures to compare.
const bare = buildNewsSchedule(
  [ev({ title: 'Core CPI m/m', expectedValue: null, previousValue: null })], NOW)[0].message;
check('no figures -> no direction', bare.includes('If it lands as forecast'), false);
check('lists the affected pairs', m15.includes('EUR/USD') && m15.includes('USD/JPY'), true);
check('carries the disclaimer', m15.includes('does not offer financial advice'), true);
// ⚠ THIS CHECK USED TO READ `m15.includes('Trade&amp;Journal')`, and it was the ONLY thing holding
// the app's name in the news disclaimer. It broke on the 2026-10-11 rename, which is how the
// second hand-written copy of the name came to light — this file and `sessionMessages.ts` each
// spelled it out, and the rename's file list only caught one. Both read `lib/brand.ts` now, and
// this asserts the NAME IS PRESENT rather than asserting one particular spelling of it, so a
// future rename cannot leave the disclaimer behind without this going red.
check('the disclaimer names the app', m15.includes(BRAND_NAME), true);
// The escaping still matters — just not for the name, which no longer contains an ampersand. A
// symbol, a strategy name or anything else carrying & < > would break Telegram's HTML parse and
// the message would silently never arrive.
check('no raw unescaped ampersand', /&(?!amp;|lt;|gt;)/.test(m15), false);

console.log('\nTHE NODE PAIR LIST MATCHES THE PLATFORM (instruments.py)');
// TRADED_PAIRS is the Node view of signal_platform/config/instruments.py. If a pair is added there
// and not here, news for its currency goes unwatched — silently. This parses the Python and fails.
const py = readFileSync(join(process.cwd(), 'signal_platform/config/instruments.py'), 'utf8');
const block = py.slice(py.indexOf('TRADEABLE_INSTRUMENTS'), py.indexOf('SYMBOL_TO_CURRENCIES'));
// `Array.from`, not a spread. tsc's target here predates downlevelIteration, so spreading an
// iterator (matchAll's result, a Set) is a TS2802 error even though tsx runs it happily — this file
// shipped with three of them and I reported the typecheck as unchanged. It wasn't.
const pyPairs = Array.from(
  block.matchAll(/\("([A-Z]{3}\/[A-Z]{3})",\s*"([A-Z]{3})",\s*"([A-Z]{3})"\)/g),
).map(m => [m[1], m[2], m[3]]);
check(`parsed ${pyPairs.length} pairs from instruments.py`, pyPairs.length > 0, true);
check('Node TRADED_PAIRS equals the Python list',
      TRADED_PAIRS.map(p => [...p]), pyPairs);
check('currency set derived from it',
      Array.from(TRADED_CURRENCIES).sort(),
      Array.from(new Set(pyPairs.flatMap(p => [p[1], p[2]]))).sort());

console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILED`}  (${pass + fail} checks)`);
process.exit(fail === 0 ? 0 : 1);
