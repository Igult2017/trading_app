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

console.log('\nBOTH WARNINGS FIRE, IN ORDER');
const two = buildNewsSchedule([ev()], NOW);
check('two warnings for one event', two.length, 2);
check('the 15-minute one first', two[0].leadMinutes, 15);
check('...at 13:45Z for a 14:00Z release', two[0].at.toISOString(), '2026-08-05T13:45:00.000Z');
check('then the 5-minute one', two[1].leadMinutes, 5);
check('...at 13:55Z', two[1].at.toISOString(), '2026-08-05T13:55:00.000Z');
check('keys are distinct per lead', two[0].key !== two[1].key, true);
check('LEAD_MINUTES is exactly [15, 5]', [...LEAD_MINUTES], [15, 5]);

console.log('\nONLY HIGH IMPACT, ONLY PAIRS WE TRADE');
check('medium impact is ignored', buildNewsSchedule([ev({ impactLevel: 'medium' })], NOW).length, 0);
check('low impact is ignored', buildNewsSchedule([ev({ impactLevel: 'low' })], NOW).length, 0);
check('impact match is case-insensitive', buildNewsSchedule([ev({ impactLevel: 'HIGH' })], NOW).length, 2);
check('a currency we never trade is ignored (AUD)',
      buildNewsSchedule([ev({ currency: 'AUD' })], NOW).length, 0);
check('JPY counts — we trade USD/JPY and GBP/JPY',
      buildNewsSchedule([ev({ currency: 'JPY' })], NOW).length, 2);
// THREE, not four: GBP/JPY has no USD leg. My first assertion said four and the code was right.
check('USD affects the three pairs with a USD leg',
      affectedPairs('USD'), ['EUR/USD', 'GBP/USD', 'USD/JPY']);
check('JPY affects exactly the two yen crosses', affectedPairs('JPY'), ['USD/JPY', 'GBP/JPY']);
check('EUR affects only EUR/USD', affectedPairs('EUR'), ['EUR/USD']);
check('lowercase currency still matches', affectedPairs('gbp').length, 2);

console.log('\nWINDOW EDGES');
check('a release already past schedules nothing',
      buildNewsSchedule([ev({ eventTime: '2026-08-05T11:00:00Z' })], NOW).length, 0);
// 6 minutes out: the 15m warning is in the past, the 5m one is still ahead.
const soon = buildNewsSchedule([ev({ eventTime: '2026-08-05T12:06:00Z' })], NOW);
check('6 minutes out -> only the 5-minute warning', soon.length, 1);
check('...and it is the 5-minute one', soon[0].leadMinutes, 5);
// The EVENT sitting past the horizon is not enough — its 15m warning still lands inside it. The
// event has to clear the horizon by more than the longest lead for BOTH warnings to fall outside.
check('an event just past the horizon still warns (the lead pulls it back in)',
      buildNewsSchedule([ev({ eventTime: new Date(NOW.getTime() + MAX_HORIZON_MS + 60_000) })], NOW).length, 2);
check('an event past the horizon PLUS the longest lead is ignored',
      buildNewsSchedule([ev({ eventTime: new Date(NOW.getTime() + MAX_HORIZON_MS + 16 * 60_000) })], NOW).length, 0);
check('a garbage timestamp is skipped, not thrown',
      buildNewsSchedule([ev({ eventTime: 'not-a-date' })], NOW).length, 0);

console.log('\nTHE MESSAGE');
const m15 = two[0].message, m5 = two[1].message;
check('names the lead time', m15.includes('IN 15 MINUTES'), true);
check('the 5-minute one is marked urgent', m5.includes('🚨'), true);
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
