/**
 * The day outcome rule — run: npx tsx client/src/lib/__tests__/dayOutcome.check.ts
 *
 * His instruction, 2026-10-25: *"Drawdown by month should have a drop that shows all traded dates
 * and outcome just like the calendar does but not with money ... L for loss ... W for win ... BE
 * for breakeven."*
 *
 * "Just like the calendar" is the requirement being pinned here. The calendar COLOURS a day and the
 * Monthly Drawdown table LETTERS it; if those two ever answered differently about the same date the
 * user would be right to trust neither. They now read ONE function, and these checks are what keep
 * the two answers locked together.
 */
import { dayTone, dayMark, FLAT_EPS } from '../dayOutcome';

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

check('a profitable day is a win', dayMark(250.4), 'W');
check('a losing day is a loss', dayMark(-80), 'L');
check('a day that nets exactly zero is break-even', dayMark(0), 'BE');

// THE ONE THAT MATTERS: a day made of a +100 and a -100 nets to zero. It must read BE, not a win
// off a rounding crumb - and it must read the same on both screens.
check('a +100 and a -100 on the same day is BE', dayMark(100 + -100), 'BE');
check('...and the calendar agrees it is flat', dayTone(100 + -100), 'flat');

// The half-cent boundary, from both sides.
check('just inside the tolerance is BE', dayMark(FLAT_EPS / 2), 'BE');
check('just outside it is a win', dayMark(FLAT_EPS * 2), 'W');
check('and on the loss side', dayMark(-FLAT_EPS * 2), 'L');

// The letters and the colours are the SAME decision, for every case.
const pairs: [number, 'W' | 'L' | 'BE', string][] = [
  [500, 'W', 'win'], [-500, 'L', 'loss'], [0, 'BE', 'flat'],
  [0.004, 'BE', 'flat'], [0.006, 'W', 'win'], [-0.006, 'L', 'loss'],
];
check('letter and colour never disagree, across the boundary',
      pairs.every(([pnl, mark, tone]) => dayMark(pnl) === mark && dayTone(pnl) === tone), true);

console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILED`}  (${pass + fail} checks)`);
process.exit(fail === 0 ? 0 : 1);
