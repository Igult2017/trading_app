/**
 * Matching a released number to the event it belongs to —
 * run: npx tsx server/services/__tests__/releasedMatch.check.ts
 *
 * WHY THIS EXISTS. The first production run of the released-value fetch pulled 32 real numbers from
 * Trading Economics and filled ZERO of them:
 *
 *     [calendarDb] released values: 0 filled, 32 unmatched, 0 ambiguous
 *
 * because the two sources name the SAME event completely differently. These are the real pairs,
 * taken from production on 23 Oct 2026, not invented:
 *
 *     ForexFactory (stored)                 Trading Economics (released)
 *     Flash Manufacturing PMI               S&P Global Manufacturing PMI Flash
 *     Flash Services PMI                    S&P Global Services PMI Flash
 *     Revised UoM Consumer Sentiment        Michigan Consumer Sentiment Final
 *     Revised UoM Inflation Expectations    Michigan Inflation Expectations Final
 *
 * ⚠ THE LAST ONE MUST NOT MATCH. Trading Economics publishes BOTH "Michigan Inflation Expectations
 * Final" and "Michigan 5 Year Inflation Expectations Final" — two different series that score the
 * same against one stored row. Attaching either would put a real number beside the wrong event.
 * Refusing is the correct answer, and it is the check that matters most here.
 */
import { titleTokens, pickMatch, resolveClaims } from '../releasedMatch';

const m = {
  tokens: (t: string) => Array.from(titleTokens(t)),
  pick: (released: string, titles: string[]) =>
    pickMatch(released, titles.map(title => ({ title })))?.title ?? null,
};

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// Everything Trading Economics published for USD that day.
const TE = [
  'S&P Global Composite PMI Flash',
  'S&P Global Manufacturing PMI Flash',
  'S&P Global Services PMI Flash',
  'Michigan Consumer Sentiment Final',
  'Michigan 5 Year Inflation Expectations Final',
  'Michigan Consumer Expectations Final',
  'Michigan Current Conditions Final',
  'Michigan Inflation Expectations Final',
];
// Everything ForexFactory had stored for USD that same day.
const FF = [
  'Flash Manufacturing PMI',
  'Flash Services PMI',
  'Revised UoM Consumer Sentiment',
  'Revised UoM Inflation Expectations',
];

/** Which stored title a released title lands on — or null when it refuses to choose. */
const landsOn = (teTitle: string): string | null => m.pick(teTitle, FF);

check('"S&P Global Manufacturing PMI Flash" finds the Flash Manufacturing PMI',
      landsOn('S&P Global Manufacturing PMI Flash'), 'Flash Manufacturing PMI');
check('"S&P Global Services PMI Flash" finds the Flash Services PMI',
      landsOn('S&P Global Services PMI Flash'), 'Flash Services PMI');
check('"Michigan Consumer Sentiment Final" finds the Revised UoM Consumer Sentiment',
      landsOn('Michigan Consumer Sentiment Final'), 'Revised UoM Consumer Sentiment');

// The composite PMI has no stored counterpart at all — it must not borrow one.
check('a release with no stored counterpart matches NOTHING',
      landsOn('S&P Global Composite PMI Flash'), null);
check('...nor does an unrelated one', landsOn('Baker Hughes Oil Rig Count'), null);

// THE ONE THAT MUST REFUSE: two Michigan inflation series, one stored row.
// THE COLLISION THAT MATTERS, and it is the reverse of the obvious one. Trading Economics
// publishes BOTH of these; ForexFactory stores ONE row. Each on its own matches that row, so
// whichever was processed first would win and the FIVE-YEAR figure could be filed as the headline
// one, silently. resolveClaims must store NEITHER.
const bothClaim = resolveClaims(
  [{ event: 'Michigan Inflation Expectations Final', actual: '4.7%' },
   { event: 'Michigan 5 Year Inflation Expectations Final', actual: '3.5%' }],
  FF.map(title => ({ title })),
);
check('two released series claiming ONE stored row store NEITHER', bothClaim.size, 0);

// On its own, each one is a perfectly good match - the refusal above is about the collision only.
check('...though either alone would have matched',
      landsOn('Michigan Inflation Expectations Final'), 'Revised UoM Inflation Expectations');

// And a clean bucket still resolves everything it can.
const clean = resolveClaims(
  [{ event: 'S&P Global Manufacturing PMI Flash', actual: '56.0' },
   { event: 'S&P Global Services PMI Flash', actual: '57.9' },
   { event: 'Michigan Consumer Sentiment Final', actual: '48.0' }],
  FF.map(title => ({ title })),
);
check('three unambiguous releases all land', clean.size, 3);
check('...on the right rows',
      Array.from(clean.values()).map(v => v.actual).sort(), ['48.0', '56.0', '57.9']);

// Vendor branding and release-stage wording must not decide anything.
check('"S&P Global" branding is ignored',
      m.tokens('S&P Global Manufacturing PMI Flash').sort(), ['manufacturing', 'pmi']);
check('"Revised" and "Final" are ignored — the sites disagree on them by convention',
      m.tokens('Revised UoM Consumer Sentiment').sort(), ['consumer', 'michigan', 'sentiment']);
check('UoM and Michigan are the same institution',
      m.tokens('UoM Consumer Sentiment').sort(), m.tokens('Michigan Consumer Sentiment').sort());
check('m/m and y/y survive as distinct words',
      m.tokens('Core CPI m/m').sort(), ['core', 'cpi', 'mom']);
check('...and are not confused with each other',
      m.tokens('Core CPI y/y').includes('yoy') && !m.tokens('Core CPI y/y').includes('mom'), true);

// -- THE WHOLE REAL BUCKET, END TO END --------------------------------------
// Everything Trading Economics published for USD on 23 Oct against everything the platform had
// stored for USD that day. Both lists are real, neither is trimmed to make the answer come out.
const REAL_RELEASED = [
  { event: 'S&P Global Composite PMI Flash',               actual: '57.6' },
  { event: 'S&P Global Manufacturing PMI Flash',           actual: '56.0' },
  { event: 'S&P Global Services PMI Flash',                actual: '57.9' },
  { event: 'Michigan Consumer Sentiment Final',            actual: '48.0' },
  { event: 'Michigan 5 Year Inflation Expectations Final', actual: '3.5%' },
  { event: 'Michigan Consumer Expectations Final',         actual: '48.8' },
  { event: 'Michigan Current Conditions Final',            actual: '46.7' },
  { event: 'Michigan Inflation Expectations Final',        actual: '4.7%' },
  { event: 'Baker Hughes Oil Rig Count',                   actual: '460'  },
];
const REAL_STORED = FF.map(title => ({ title }));
const resolved = resolveClaims(REAL_RELEASED, REAL_STORED);
const landed = Object.fromEntries(
  Array.from(resolved).map(([i, v]) => [REAL_STORED[i].title, v.actual]));

check('the real bucket fills the three it can be sure of', resolved.size, 3);
check('...Flash Manufacturing PMI gets the manufacturing number',
      landed['Flash Manufacturing PMI'], '56.0');
check('...Flash Services PMI gets the services number',
      landed['Flash Services PMI'], '57.9');
check('...Revised UoM Consumer Sentiment gets the Michigan sentiment number',
      landed['Revised UoM Consumer Sentiment'], '48.0');
check('...and the inflation row is left EMPTY rather than given a coin-flip',
      landed['Revised UoM Inflation Expectations'], undefined);


console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILED`}  (${pass + fail} checks)`);
process.exit(fail === 0 ? 0 : 1);
