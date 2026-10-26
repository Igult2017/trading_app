/**
 * accountFilters.test.ts — run with:
 *     npx tsx server/lib/accountFilters.test.ts
 *
 * WHAT IT GUARDS. His instruction, 2026-10-26: *"when i logout account, its data is not errased
 * and when i log it back in it is not autosynced from scratch."* Two things have to hold for that,
 * and both are the kind that break silently:
 *
 *   1. A logged-out account must actually STOP. Its row is kept on purpose, so the only thing
 *      standing between it and the sweep is one condition — and three separate runners use it.
 *   2. The resume mark (`last_sync_at`) must survive the log-out. If it is ever cleared, the
 *      account still logs out, still keeps its trades, still looks right — and the next reconnect
 *      re-imports and re-journals the whole history (`autoSyncService.ts:301-302`).
 *
 * ⚠ IT RUNS THE REAL CONDITION AGAINST A REAL POSTGRES ENGINE. PGlite is Postgres compiled to run
 * in-process, so `coalesce(...) = true` is evaluated by Postgres itself rather than by a
 * re-implementation of it in JavaScript — which matters, because the whole point of that
 * `coalesce` is a NULL rule that only Postgres can be trusted to settle. The table is created from
 * `docker-migrate.sql`, the file production's schema actually comes from, never retyped.
 *
 * ⚠ WHAT THIS DOES NOT PROVE: the end-to-end log out -> reconnect -> only-the-gap-is-journaled
 * run. That needs his production database and a live cTrader sign-in. After a deploy the proof is
 * one line in the log — the sweep must say `back from the last sync`, never `first sync, 2y`.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import { brokerAccounts } from '../../shared/schema';
import { KEPT_BY_LOGOUT, RUNNING_API_ACCOUNT, accountTypeEdit, loggedOutFields } from './accountFilters';

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}`
              + (ok ? '' : `, want ${JSON.stringify(want)}`));
  ok ? pass++ : fail++;
}

// The real table definition, lifted out of the real migration rather than written again here.
const MIGRATION = readFileSync(join(process.cwd(), 'docker-migrate.sql'), 'utf8');
const FROM = MIGRATION.indexOf('CREATE TABLE IF NOT EXISTS broker_accounts');
const TO   = MIGRATION.indexOf(');', FROM);
if (FROM < 0 || TO < 0) {
  console.error('   FAIL  could not find broker_accounts in docker-migrate.sql — anchors moved');
  process.exit(1);
}
const DDL = MIGRATION.slice(FROM, TO + 2);
// Production's table is the CREATE plus every later ADD COLUMN in the same file — `copy_enabled`
// and `ctrader_token_id` only exist because of those. Taking all of them keeps this table the
// shape production actually has, instead of the shape it had when the CREATE was written.
const ALTERS = (MIGRATION.match(/^ALTER TABLE broker_accounts ADD COLUMN IF NOT EXISTS.*$/gm) ?? [])
  .join(' ');

async function main() {
  console.log('\nA LOGGED-OUT ACCOUNT STOPS, AND KEEPS ITS HISTORY\n');

  const pg = new PGlite();
  await pg.exec(DDL);
  await pg.exec(ALTERS);
  const db = drizzle(pg, { schema: { brokerAccounts } });

  const base = { userId: 'u1', name: 'n', platform: 'ctrader' };
  await db.insert(brokerAccounts).values([
    { ...base, id: 'live',     loginId: '111', connectionType: 'api',     isActive: true,
      lastSyncAt: new Date('2026-10-20T10:00:00Z'), defaultSessionId: 's1', tradeCount: 7 },
    { ...base, id: 'legacy',   loginId: '222', connectionType: 'api',     isActive: null },
    { ...base, id: 'loggedout', loginId: '333', connectionType: 'api',    isActive: false },
    { ...base, id: 'ea',       loginId: '444', connectionType: 'webhook', isActive: true },
  ]);

  // ── 1. THE CONDITION ALL THREE RUNNERS NOW SHARE ──────────────────────────────────────
  const running = await db.select().from(brokerAccounts).where(RUNNING_API_ACCOUNT);
  check('a live API account keeps running', running.some(a => a.id === 'live'), true);
  check('an account he LOGGED OUT is left alone', running.some(a => a.id === 'loggedout'), false);
  // THE TRAP THIS CATCHES: `is_active = true` would silently drop this row, because comparing
  // NULL to anything is NULL, which Postgres reads as "no". A real account would stop syncing and
  // nothing would say why.
  check('an older row with no value at all still counts as switched on',
        running.some(a => a.id === 'legacy'), true);
  check('an EA account is still not in the API set', running.some(a => a.id === 'ea'), false);
  check('...so exactly two accounts are running', running.length, 2);

  // ── 2. LOGGING OUT ERASES NOTHING ─────────────────────────────────────────────────────
  const before = (await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, 'live')))[0];
  await db.update(brokerAccounts).set(loggedOutFields()).where(eq(brokerAccounts.id, 'live'));
  const after = (await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, 'live')))[0];

  check('it is marked as logged out', after.syncStatus, 'disconnected');
  check('...and switched off', after.isActive, false);
  check('...and the broker credentials are gone', after.passwordEnc, null);
  check('THE RESUME MARK SURVIVES — this is the whole feature',
        after.lastSyncAt?.toISOString(), before.lastSyncAt?.toISOString());
  check('its performance dashboard is still attached', after.defaultSessionId, 's1');
  check('its trade count is untouched', after.tradeCount, 7);
  check('the row itself is still there', !!after, true);

  const stillRunning = await db.select().from(brokerAccounts).where(RUNNING_API_ACCOUNT);
  check('and the sweep no longer picks it up', stillRunning.some(a => a.id === 'live'), false);

  // ── 3. THE EDIT THAT WOULD BREAK THIS SILENTLY ────────────────────────────────────────
  // Adding `lastSyncAt: null` to the log-out as housekeeping would pass every check above except
  // this one: the account would still log out and still keep its trades, and the next reconnect
  // would re-import two years and journal it all a second time.
  const touched = Object.keys(loggedOutFields());
  for (const field of KEPT_BY_LOGOUT) {
    check(`logging out does not touch ${field}`, touched.includes(field), false);
  }

  // ── 4. SIGNING BACK IN SWITCHES IT ON AGAIN ───────────────────────────────────────────
  await db.update(brokerAccounts).set({ isActive: true, syncStatus: 'pending' })
          .where(eq(brokerAccounts.id, 'live'));
  const back = await db.select().from(brokerAccounts).where(RUNNING_API_ACCOUNT);
  check('reconnecting puts it back in the sweep', back.some(a => a.id === 'live'), true);
  const resumed = (await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, 'live')))[0];
  check('...still carrying the mark the sweep resumes from',
        resumed.lastSyncAt?.toISOString(), '2026-10-20T10:00:00.000Z');

  // ── 5. HIS COPY SETUP SURVIVES THE LOG-OUT ───────────────────────────────────────────
  // ⚠ PROMISED IN THE PLAN AND NOT MEASURED AT THE TIME. His instruction, 2026-10-26: *"when one
  // logs out ctrader account that was followed or following, when they log back in, the previous
  // settings and setups are restored."* The reasoning was that the rows point at the account and
  // the account row survives — true, but reasoning is not a measurement, and the one thing that
  // would quietly break it is a future log-out that also tidies these rows away.
  await pg.exec(`CREATE TABLE copy_masters (
                   id VARCHAR PRIMARY KEY, user_id VARCHAR, broker_account_id VARCHAR,
                   is_active BOOLEAN DEFAULT TRUE, is_public BOOLEAN DEFAULT FALSE);`);
  await pg.exec(`CREATE TABLE copy_followers (
                   id VARCHAR PRIMARY KEY, user_id VARCHAR, broker_account_id VARCHAR,
                   master_id VARCHAR, lot_mode TEXT, lot_multiplier NUMERIC,
                   is_active BOOLEAN DEFAULT TRUE, dropped_at TIMESTAMP);`);
  await pg.exec(`INSERT INTO copy_masters (id, user_id, broker_account_id)
                 VALUES ('m1', 'u1', 'legacy');`);
  await pg.exec(`INSERT INTO copy_followers (id, user_id, broker_account_id, master_id, lot_mode, lot_multiplier)
                 VALUES ('f1', 'u1', 'legacy', 'm1', 'mult', 2.5);`);

  const copyState = async () => (await pg.query<{ masters: number; followers: number;
                                                  dropped: number; paused: number }>(`
    SELECT (SELECT count(*)::int FROM copy_masters   WHERE broker_account_id = 'legacy') AS masters,
           (SELECT count(*)::int FROM copy_followers WHERE broker_account_id = 'legacy') AS followers,
           (SELECT count(*)::int FROM copy_followers WHERE dropped_at IS NOT NULL)       AS dropped,
           (SELECT count(*)::int FROM copy_followers WHERE is_active = false)            AS paused`)).rows[0];

  const beforeCopy = await copyState();
  await db.update(brokerAccounts).set(loggedOutFields()).where(eq(brokerAccounts.id, 'legacy'));
  const afterCopy = await copyState();

  check('the account he was COPYING is still set up after logging out', afterCopy.masters, beforeCopy.masters);
  check('...and the one that was FOLLOWING it too', afterCopy.followers, beforeCopy.followers);
  check('...none of them was retired', afterCopy.dropped, 0);
  check('...none of them was paused', afterCopy.paused, 0);
  const settings = (await pg.query<{ lot_mode: string; lot_multiplier: string }>(
    `SELECT lot_mode, lot_multiplier FROM copy_followers WHERE id = 'f1'`)).rows[0];
  check('...and the settings themselves are untouched',
        [settings.lot_mode, String(Number(settings.lot_multiplier))], ['mult', '2.5']);

  // ── 6. DEMO/LIVE CANNOT BE EDITED ON A cTRADER ACCOUNT ───────────────────────────────
  // Also promised and not measured. This is the whole of what he asked for — *"This will prevent
  // users from editing but display real status."*
  check('changing it on a cTrader account is refused',
        accountTypeEdit('ctrader', 'demo', 'live'), 'refuse');
  check('...whatever the spelling',
        accountTypeEdit('cTrader', 'demo', 'LIVE'), 'refuse');
  check('sending back the value it already has is NOT a refusal — a rename must still save',
        accountTypeEdit('ctrader', 'live', 'live'), 'ignore');
  check('not sending it at all is nothing to do',
        accountTypeEdit('ctrader', 'live', undefined), 'ignore');
  check('an EA account keeps the field — there is no broker to ask',
        accountTypeEdit('mt5', 'demo', 'live'), 'apply');
  check('...and a funded one can still be marked as such',
        accountTypeEdit('mt4', 'demo', 'funded'), 'apply');

  await pg.close();
  console.log();
  if (fail) { console.log(`${fail} of ${pass + fail} FAILED`); process.exit(1); }
  console.log(`ALL PASS (${pass} checks)`);
}

main().catch(e => { console.error(e); process.exit(1); });
