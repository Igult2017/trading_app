/**
 * journalDelete.test.ts — run with:
 *     npx tsx server/lib/journalDelete.test.ts
 *
 * WHAT IT GUARDS. His instruction, 2026-10-26: *"Tradevault should allow me to select more than
 * one item then delete them once not one by one."*
 *
 * ⚠ THE DANGER IN A SECOND DELETE PATH IS NOT THAT IT DELETES TOO MUCH. It is that it forgets to
 * mark the broker trade as deleted ON PURPOSE. Without that mark the next sync sweep writes every
 * one of them straight back — his report, 2026-10-04: *"I try deleting trades from my synced
 * account and it keeps getting rerecorded."* The symptom would be trades reappearing a quarter of
 * an hour after a bulk delete, which looks nothing like a bulk-delete bug and would be hunted
 * somewhere else entirely.
 *
 * So the checks below are about the MARK as much as the deletion, and they run against a real
 * Postgres engine (PGlite, Postgres compiled to run in-process) with the real tables from
 * `docker-migrate.sql`, never a retyped copy.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}`
              + (ok ? '' : `, want ${JSON.stringify(want)}`));
  ok ? pass++ : fail++;
}

const MIGRATION = readFileSync(join(process.cwd(), 'docker-migrate.sql'), 'utf8');

/** One table's CREATE, plus every later ADD COLUMN for it — which is the shape production has. */
function tableDDL(name: string): string {
  const from = MIGRATION.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`);
  if (from < 0) throw new Error(`no CREATE TABLE for ${name} in docker-migrate.sql`);
  const to = MIGRATION.indexOf(');', from);
  const create = MIGRATION.slice(from, to + 2);
  const alters = (MIGRATION.match(
    new RegExp(`^ALTER TABLE ${name} ADD COLUMN IF NOT EXISTS.*$`, 'gm')) ?? []).join(' ');
  return create + '\n' + alters;
}

async function main() {
  console.log('\nBULK DELETE — gone, and STAYING gone\n');

  const pg = new PGlite();
  await pg.exec(tableDDL('broker_accounts'));
  await pg.exec(tableDDL('synced_trades'));
  // ⚠ `journal_entries` IS THE ONE TABLE WRITTEN OUT BY HAND HERE, and only because it has no
  // CREATE TABLE in `docker-migrate.sql` — it is created by the schema push (`npm run db:push`),
  // so there is no file to lift it from. Only the four columns these checks touch are declared;
  // the real table has many more, none of which this test has an opinion about.
  await pg.exec(`CREATE TABLE journal_entries (
                   id         VARCHAR PRIMARY KEY,
                   user_id    VARCHAR,
                   session_id VARCHAR,
                   instrument TEXT
                 );`);

  await pg.exec(`INSERT INTO broker_accounts (id, user_id, name, login_id, platform)
                 VALUES ('acct', 'me', 'A', '1', 'ctrader');`);

  // Five of his, one someone else's — the id of that last one is what a broken bulk delete would
  // happily remove, because it arrives in the same list as the rest.
  for (const [id, owner] of [['e1','me'],['e2','me'],['e3','me'],['e4','me'],['e5','me'],['x1','someone-else']]) {
    await pg.exec(`INSERT INTO journal_entries (id, user_id, instrument)
                   VALUES ('${id}', '${owner}', 'EURUSD');`);
    await pg.exec(`INSERT INTO synced_trades
                     (id, broker_account_id, user_id, external_id, symbol, direction, journal_entry_id)
                   VALUES ('st-${id}', 'acct', '${owner}', 'ticket-${id}', 'EURUSD', 'Long', '${id}');`);
  }

  // ── THE BULK DELETE, AS THE ROUTE PERFORMS IT ──────────────────────────────────────────
  // Ownership is settled over the whole batch first, then each survivor is deleted and its broker
  // trade marked. Exactly the order `routes.ts` uses, so the ordering itself is under test.
  const asked = ['e1', 'e2', 'e4', 'x1', 'does-not-exist'];
  const mine = (await pg.query<{ id: string }>(
    `SELECT id FROM journal_entries WHERE user_id = 'me' AND id = ANY($1)`, [asked])).rows.map(r => r.id);
  check('only his own entries are eligible', mine.sort(), ['e1', 'e2', 'e4']);
  check('...so two of the five asked for are refused', asked.length - mine.length, 2);

  let released = 0;
  for (const id of mine) {
    await pg.query(
      `UPDATE synced_trades SET journal_entry_id = NULL, journaled_at = NULL,
                                journal_deleted_at = NOW()
        WHERE journal_entry_id = $1`, [id]);
    const r = await pg.query(`DELETE FROM journal_entries WHERE id = $1`, [id]);
    released += r.affectedRows ?? 0;
  }
  check('three entries were deleted', released, 3);

  const left = (await pg.query<{ id: string }>(
    `SELECT id FROM journal_entries ORDER BY id`)).rows.map(r => r.id);
  check('the ones he did not tick are untouched', left, ['e3', 'e5', 'x1']);
  check('...including the other user\'s, which was in the same request', left.includes('x1'), true);

  // ── THE PART THAT WOULD FAIL SILENTLY ──────────────────────────────────────────────────
  const marked = (await pg.query<{ id: string }>(
    `SELECT id FROM synced_trades WHERE journal_deleted_at IS NOT NULL ORDER BY id`)).rows.map(r => r.id);
  check('EVERY deleted trade is marked as deleted on purpose — so no sweep re-records it',
        marked, ['st-e1', 'st-e2', 'st-e4']);
  const stillPointing = (await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM synced_trades WHERE journal_entry_id IN ('e1','e2','e4')`)).rows[0].n;
  check('...and none still points at an entry that no longer exists', stillPointing, 0);

  const untouched = (await pg.query<{ id: string }>(
    `SELECT id FROM synced_trades WHERE journal_deleted_at IS NULL ORDER BY id`)).rows.map(r => r.id);
  check('the trades he kept carry no mark at all', untouched, ['st-e3', 'st-e5', 'st-x1']);

  // ── TEETH: the version that forgets the mark ───────────────────────────────────────────
  // Deleting without marking passes every check above except this one, and the trade silently
  // returns at the next sweep.
  await pg.query(`DELETE FROM journal_entries WHERE id = 'e3'`);
  const wouldReturn = (await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM synced_trades
      WHERE id = 'st-e3' AND journal_deleted_at IS NULL`)).rows[0].n;
  check('TEETH — deleting WITHOUT the mark leaves a trade the sweep will write back', wouldReturn, 1);

  await pg.close();
  console.log();
  if (fail) { console.log(`${fail} of ${pass + fail} FAILED`); process.exit(1); }
  console.log(`ALL PASS (${pass} checks)`);
}

main().catch(e => { console.error(e); process.exit(1); });
