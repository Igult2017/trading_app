/**
 * Market-week alert schedule — one assertion per day of the week.
 *
 * Run: npx tsx server/services/__tests__/marketSessionAlerts.check.ts
 *
 * Exists because the defect it covers is only observable on a Saturday. The old scheduler had no
 * weekday check and announced "London Session Opening in 15 min" every weekend morning; nobody
 * noticed until a user reported it live on Sat 2026-08-01.
 */
import { buildDailySchedule, nextWeekOpen, shouldStillFire } from '../marketSessionAlerts';

let fails = 0;
let n = 0;

function chk(name: string, got: unknown, want: unknown) {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}` +
    (ok ? '' : `, want ${JSON.stringify(want)}`));
  if (!ok) fails++;
}

function teeth(name: string, broke: boolean) {
  n++;
  console.log(`   ${broke ? 'PASS' : 'FAIL'}  TEETH — ${name}: ${broke}`);
  if (!broke) fails++;
}

const kinds = (iso: string) => buildDailySchedule(new Date(iso)).map(a => a.kind);
const times = (iso: string) =>
  buildDailySchedule(new Date(iso)).map(a => a.at.toISOString().slice(11, 16));

console.log('WEEKDAYS — session alerts only');
chk('Mon 2026-07-27', kinds('2026-07-27T00:00:00Z'), ['session_open', 'session_open']);
chk('  fire at 07:45 and 12:45 UTC', times('2026-07-27T00:00:00Z'), ['07:45', '12:45']);
chk('Wed 2026-07-29', kinds('2026-07-29T00:00:00Z'), ['session_open', 'session_open']);

console.log('\nTHE REPORTED BUG — weekends must be silent about session opens');
chk('SAT 2026-08-01 (the day he was messaged)', kinds('2026-08-01T00:00:00Z'), []);
teeth('Saturday really schedules nothing at all',
  buildDailySchedule(new Date('2026-08-01T00:00:00Z')).length === 0);
chk('Sun 2026-08-02 — no session opens, only the pre-open', kinds('2026-08-02T00:00:00Z'),
  ['week_preopen']);
teeth('no session_open survives on a Sunday',
  !kinds('2026-08-02T00:00:00Z').includes('session_open'));

console.log('\nFRIDAY — sessions still run, plus the weekend close');
chk('Fri 2026-07-31', kinds('2026-07-31T00:00:00Z'),
  ['session_open', 'session_open', 'week_close']);
chk('  close fires at 22:00 UTC', times('2026-07-31T00:00:00Z').slice(-1), ['22:00']);

console.log('\nMONDAY PRE-OPEN — 1 hour before the week opens');
chk('Sunday schedules it at 21:00 UTC', times('2026-08-02T00:00:00Z'), ['21:00']);
const preopen = buildDailySchedule(new Date('2026-08-02T00:00:00Z'))[0];
chk('  and the week opens 60 min later',
  new Date(preopen.at.getTime() + 3600_000).toISOString(), '2026-08-02T22:00:00.000Z');
teeth('it is scheduled on SUNDAY, not Monday', preopen.at.getUTCDay() === 0);

console.log('\nnextWeekOpen');
chk('from Saturday -> the coming Sunday 22:00',
  nextWeekOpen(new Date('2026-08-01T10:26:00Z')).toISOString(), '2026-08-02T22:00:00.000Z');
chk('from Friday close -> the coming Sunday 22:00',
  nextWeekOpen(new Date('2026-07-31T22:00:00Z')).toISOString(), '2026-08-02T22:00:00.000Z');
chk('from Sunday 21:00 -> the SAME day 22:00',
  nextWeekOpen(new Date('2026-08-02T21:00:00Z')).toISOString(), '2026-08-02T22:00:00.000Z');
teeth('it never returns a time in the past',
  nextWeekOpen(new Date('2026-08-02T22:00:00Z')).getTime() > Date.parse('2026-08-02T22:00:00Z'));

console.log('\nFIRE-TIME RECHECK');
chk('a session alert is suppressed if the market shut meanwhile',
  shouldStillFire('session_open', new Date('2026-08-01T07:45:00Z')), false);
chk('  but allowed midweek', shouldStillFire('session_open', new Date('2026-07-29T07:45:00Z')), true);
chk('the CLOSED notice is not gated on the market being open',
  shouldStillFire('week_close', new Date('2026-07-31T22:00:00Z')), true);
chk('nor is the pre-open notice',
  shouldStillFire('week_preopen', new Date('2026-08-02T21:00:00Z')), true);
teeth('gating them on isOpen would have silenced them',
  shouldStillFire('week_preopen', new Date('2026-08-02T21:00:00Z')) === true);

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}  (${n} checks)`);
process.exit(fails === 0 ? 0 : 1);
