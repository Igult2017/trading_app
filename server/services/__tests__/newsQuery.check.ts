/**
 * THE QUERY THAT FEEDS THE NEWS WARNINGS — run:
 *     npx tsx server/services/__tests__/newsQuery.check.ts
 *
 * WHY THIS FILE EXISTS, and it is the most useful thing in it.
 *
 * The high-impact news warnings shipped and **never sent a single message**. He reported it on
 * 2026-10-11: *"i have never seen high impact news beeing announced in the channel."* Nothing was
 * wrong with the schedule, the message, the timers or the Telegram client. The one line that
 * loaded the events read:
 *
 *     eq(economicEvents.impactLevel, 'high')        // scheduler.ts:53
 *
 * Every writer stores `'High'` with a capital H, and Postgres text comparison is case-sensitive,
 * so it matched nothing for the entire life of the feature. Production logged
 * `[Telegram] Scheduled 0 news warning(s) [none]` every hour while the database held 13 'High'
 * events that week.
 *
 * **`newsAlerts.check.ts` was green throughout** — 31 checks, including one named "impact match is
 * case-insensitive". It was testing the in-memory filter, which was never the broken half. That is
 * the gap this file closes: nothing anywhere asserted anything about the QUERY.
 *
 * ⚠ THIS READS THE SOURCE AS TEXT, and that is a deliberate second-best. Running the real query
 * needs a database, and the point is to catch the mistake in review rather than in production six
 * weeks later. A source check cannot prove the query returns rows — only the live log line
 * `Scheduled N news warning(s)` with N above zero does that, and it is the last step of the
 * deploy. What this CAN do is make the specific mistake impossible to reintroduce quietly.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const root = join(import.meta.dirname, '..', '..');
const SCHED = readFileSync(join(root, 'scrapers', 'scheduler.ts'), 'utf8');
const CALDB = readFileSync(join(root, 'services', 'calendarDb.ts'), 'utf8');
const CACHE = readFileSync(join(root, 'scrapers', 'cacheService.ts'), 'utf8');
const PY    = readFileSync(join(root, 'python', 'news_calendar.py'), 'utf8');

/** The body of refreshNewsAlerts — the only place that loads events to warn about.
 *
 *  ⚠ COMMENTS STRIPPED, and that is not cosmetic. The comment above the fixed line QUOTES the
 *  broken one so the next reader understands it, and without this the "no bare equality" check
 *  below matched that quotation and failed on correct code. A check that reads a comment as code
 *  is the same class of mistake as the one this file exists to catch. */
const fnRaw = SCHED.slice(
  SCHED.indexOf('private async refreshNewsAlerts'),
  SCHED.indexOf('async runCleanup'),
);
const fn = fnRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

console.log('\nTHE NEWS QUERY COMPARES IMPACT WITHOUT CARING ABOUT CASE');
check('refreshNewsAlerts was found at all', fn.length > 200, true);
check('it lowercases the stored value before comparing',
      /lower\(\s*\$\{economicEvents\.impactLevel\}\s*\)\s*=\s*'high'/.test(fn), true);
// TEETH. The exact shape of the bug: a bare equality against the column, whatever the literal.
// `'high'` was wrong because the data is 'High'; `'High'` would be just as brittle, because the
// casing is decided by a Python scraper two files away and nothing here would notice it changing.
check('it does NOT compare the column with a bare equality',
      /eq\(\s*economicEvents\.impactLevel\s*,/.test(fn), false);
check('  teeth — that pattern is what the broken line looked like',
      /eq\(\s*economicEvents\.impactLevel\s*,/.test("eq(economicEvents.impactLevel, 'high')"), true);

console.log('\nWHY LOWERCASING IS NEEDED: EVERY WRITER CAPITALISES');
// If these ever change, the lower() above is what keeps the feature alive — but the mismatch is
// worth seeing written down, because reading any ONE of these files makes the casing look settled.
check('the Python scraper emits capitalised words',
      /'(High|Medium|Low)'/.test(PY), true);
check('calendarDb types the column High|Medium|Low',
      /"High"\s*\|\s*"Medium"\s*\|\s*"Low"/.test(CALDB), true);
check('cacheService filters on the capitalised spelling',
      /\['High',\s*'Medium'\]/.test(CACHE), true);

console.log('\nTHE HORIZON AND THE LEADS STILL AGREE');
// A lead longer than the horizon could never fire: the warning would be scheduled before the
// window the query even looks at. 60 minutes against 6 hours is fine; this fails if either moves
// far enough to break the other.
const ALERTS = readFileSync(join(root, 'services', 'newsAlerts.ts'), 'utf8');
const leads = (ALERTS.match(/LEAD_MINUTES = \[([^\]]+)\]/)?.[1] ?? '')
  .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
check('the leads parsed', leads, [60, 15, 5]);
check('the longest lead fits inside the 6-hour horizon', Math.max(...leads) * 60_000 < 6 * 60 * 60 * 1000, true);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
