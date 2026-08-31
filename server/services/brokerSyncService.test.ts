/**
 * brokerSyncService.test.ts — run with:
 *     DATABASE_URL="postgresql://x:x@localhost:5432/x" npx tsx server/services/brokerSyncService.test.ts
 *
 * The dummy connection string is only there because importing this module pulls in `storage` ->
 * `db`, which refuses to load without one. Nothing here opens a connection or touches a table.
 *
 * No test framework is installed in this repo (only `tsx`), so this is a plain script rather than a
 * new dependency added on the way past — same shape as client/src/pages/assets/confirmedEntries.test.ts.
 *
 * WHAT BROKE. The accounts page showed "Issues syncing" with the error `Invalid time value` on the
 * very account the signal platform trades. `toDate` decided the unit from the TYPE — number meant
 * Unix seconds, string meant a date string — and SEVEN OF THE EIGHT adapters disagreed with it:
 *
 *   ctrader sent `String(ms / 1000)`, a numeric STRING of seconds. `new Date("1788123600")` is an
 *   **Invalid Date**, and an Invalid Date is TRUTHY, so `openTime ? openTime.toISOString() : undefined`
 *   walked straight past its own guard and threw. Every sync of that account died.
 *
 *   binance / bitget / bitunix / bybit / dxtrade / tradelocker all send MILLISECONDS as a number,
 *   which was multiplied by 1000 again — dating their trades to the year 58,633. Silent: no error,
 *   no crash, just history that can never show up in any date-ranged view.
 *
 * The fix reads the unit from the MAGNITUDE and never returns an Invalid Date. These checks are
 * written against the REAL adapter expressions, not against a description of them.
 */
import { toDate } from './brokerSyncService';

let failed = 0;
let count = 0;

function check(name: string, got: unknown, want: unknown) {
  count++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}` +
              (ok ? '' : `, want ${JSON.stringify(want)}`));
  if (!ok) failed++;
}

function teeth(name: string, brokeItAndFailed: boolean) {
  count++;
  console.log(`   ${brokeItAndFailed ? 'PASS' : 'FAIL'}  TEETH — ${name}`);
  if (!brokeItAndFailed) failed++;
}

const iso = (d: Date | undefined) => (d ? d.toISOString() : undefined);

// 30 Aug 2026 21:00 UTC — the hour the Sunday signal was read from.
const MS = 1_788_123_600_000;
const SEC = MS / 1000;

console.log('\nBROKER TIMESTAMPS — the unit comes from the magnitude, never from the type');

// ── THE LIVE CRASH ──────────────────────────────────────────────────────────
// Exactly what the cTrader adapter used to emit.
check('a numeric STRING of seconds (cTrader) now reads correctly',
      iso(toDate(String(Math.floor(MS / 1000)))), '2026-08-30T21:00:00.000Z');
check('...and the raw milliseconds it emits now read the same',
      iso(toDate(MS)), '2026-08-30T21:00:00.000Z');
check('seconds as a plain number read the same too', iso(toDate(SEC)), '2026-08-30T21:00:00.000Z');

// ── THE SILENT ONE: milliseconds must not be multiplied again ───────────────
check('milliseconds are NOT multiplied by 1000 (was the year 58,633)',
      toDate(MS)!.getUTCFullYear(), 2026);
check('dxtrade/tradelocker .getTime() lands in 2026', toDate(new Date(MS).getTime())!.getUTCFullYear(), 2026);
check('a millisecond STRING works as well as a number', iso(toDate(String(MS))), '2026-08-30T21:00:00.000Z');

// ── ISO strings still work — coinbase was the one adapter that always matched ──
check('an ISO string is unchanged', iso(toDate('2026-08-30T21:00:00.000Z')), '2026-08-30T21:00:00.000Z');

// ── IT MUST NEVER RETURN AN INVALID DATE ────────────────────────────────────
// This is the property every caller leans on: they all write `t ? t.toISOString() : undefined`,
// and an Invalid Date passes that test and then throws.
for (const bad of ['not-a-date', 'NaN', '   ', 'undefined']) {
  check(`garbage ${JSON.stringify(bad)} -> undefined, never an Invalid Date`, toDate(bad), undefined);
}
check('empty string -> undefined', toDate(''), undefined);
check('null -> undefined', toDate(null), undefined);
check('undefined -> undefined', toDate(undefined), undefined);
check('NaN -> undefined', toDate(NaN), undefined);

// Every value it DOES return must survive toISOString, which is what actually crashed.
for (const v of [MS, SEC, String(MS), String(SEC), '2026-08-30T21:00:00.000Z']) {
  const d = toDate(v as any);
  let threw = false;
  try { d?.toISOString(); } catch { threw = true; }
  check(`toISOString() is safe on the result of ${JSON.stringify(v)}`, threw, false);
}

// ── THE BOUNDARY ────────────────────────────────────────────────────────────
// 1e11 is the year 5138 read as seconds and 1973 read as milliseconds, so nothing real is near it.
check('just under the boundary is read as seconds', toDate(1e11 - 1)!.getUTCFullYear() > 3000, true);
check('just over the boundary is read as milliseconds', toDate(1e11 + 1)!.getUTCFullYear(), 1973);
check('a 2001 date in seconds reads as 2001', toDate(1_000_000_000)!.getUTCFullYear(), 2001);
check('the same 2001 date in milliseconds reads as 2001',
      toDate(1_000_000_000_000)!.getUTCFullYear(), 2001);

// ── TEETH ───────────────────────────────────────────────────────────────────
// The old rule, restored, must fail on the exact value cTrader sends.
const old = (v: string | number | undefined) =>
  !v ? undefined : (typeof v === 'number' ? new Date(v * 1000) : new Date(v));
const oldResult = old(String(Math.floor(MS / 1000)));
teeth('the old type-based rule produced an Invalid Date on cTrader\'s value',
      oldResult !== undefined && Number.isNaN(oldResult.getTime()));
teeth('...and that Invalid Date was TRUTHY, which is why the guards missed it',
      !!oldResult);
teeth('the old rule dated millisecond adapters to the year 58,633',
      old(MS)!.getUTCFullYear() > 50_000);

console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
