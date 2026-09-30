/**
 * journalEntryUniqueness.test.ts — run with:
 *     npx tsx server/services/journalEntryUniqueness.test.ts
 *
 * ONE JOURNAL ENTRY PER BROKER TRADE — and the migration that enforces it DELETES ROWS, so it is run for
 * real here before it is ever run on his journal.
 *
 * WHY IT EXISTS. One demo trade was journaled three times. "Has this been journaled?" was answered by
 * reading a pointer from the trade to the entry, so a null pointer meant "never journaled" even when an
 * entry existed. `journal_entries` carried no broker identity at all, so nothing could compare against
 * what was already there. See docs/OPEN.md D57.
 *
 * WHAT MATTERS MOST HERE: the OLDEST copy survives, because that is the one the user's own edits would be
 * on, and hand-typed entries (no trade) must be left completely alone — there are many of them and a
 * non-partial rule would allow only one.
 *
 * The block is extracted from the real `docker-migrate.sql`, never retyped.
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
const FROM = MIGRATION.indexOf('-- ── ONE JOURNAL ENTRY PER BROKER TRADE');
const MARK = 'WHERE synced_trade_id IS NOT NULL;';
const TO   = MIGRATION.indexOf(MARK, FROM);
if (FROM < 0 || TO < 0) {
  console.error('   FAIL  could not find the block in docker-migrate.sql — anchors moved');
  process.exit(1);
}
const BLOCK = MIGRATION.slice(FROM, TO + MARK.length);

// Only the columns the block touches.
const SETUP = `
CREATE TABLE journal_entries (
  id VARCHAR PRIMARY KEY, user_id VARCHAR, instrument TEXT, created_at TIMESTAMP
);
CREATE TABLE synced_trades (
  id VARCHAR PRIMARY KEY, broker_account_id VARCHAR, external_id TEXT, journal_entry_id VARCHAR
);
INSERT INTO journal_entries VALUES
 -- three entries for ONE trade: the real bug. The OLDEST must survive.
 ('je1','u1','EURUSD','2026-09-29 21:58'),
 ('je2','u1','EURUSD','2026-09-29 22:17'),
 ('je3','u1','EURUSD','2026-09-29 22:58'),
 -- one entry for a different trade: untouched
 ('je4','u1','GBPUSD','2026-09-29 20:00'),
 -- TWO HAND-TYPED entries, no trade at all. A non-partial rule would refuse the second.
 ('m1','u1','XAUUSD','2026-09-28 10:00'),
 ('m2','u1','XAUUSD','2026-09-28 11:00');
INSERT INTO synced_trades VALUES
 -- ⚠ THE POINTER NAMES ONLY THE LAST ENTRY WRITTEN. Each pass re-stamped it, so after three passes the
 -- trade names je3 and je1/je2 are ORPHANS with nothing linking them to any trade. That is the real shape
 -- of the damage, and it is why the migration can PREVENT this but cannot clean up what already happened.
 ('st1','acct1','321984806','je3'),
 ('st2','acct1','321984807','je4');
`;

console.log('\nONE JOURNAL ENTRY PER BROKER TRADE, RUN AGAINST REAL POSTGRES\n');

const db = new PGlite();
const notices: string[] = [];
await db.exec(SETUP);
try {
  await db.exec(BLOCK, { onNotice: (n: any) => notices.push(String(n.message)) });
  console.log('   PASS  the migration ran without error');
  pass++;
} catch (err: any) {
  console.log(`   FAIL  the migration threw: ${err.message}`);
  process.exit(1);
}

const left = (await db.query<{ id: string }>('SELECT id FROM journal_entries ORDER BY id')).rows.map(r => r.id);
// ⚠ NOTHING IS DELETED, AND THAT IS CORRECT. Only je3 can be attributed to the trade; je1 and je2 are
// indistinguishable from entries the user typed himself. Deleting a user's journal entries on a guess is
// far worse than leaving two stale ones, so the migration does not guess.
check('no entry is deleted, because only one of the three can be attributed to the trade',
      left, ['je1', 'je2', 'je3', 'je4', 'm1', 'm2']);

check('the entry the trade DOES name now carries its identity',
      (await db.query<{ synced_trade_id: string }>(
        `SELECT synced_trade_id FROM journal_entries WHERE id = 'je3'`)).rows[0].synced_trade_id, 'st1');

check('...and the orphaned copies carry none, so they are left alone',
      (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM journal_entries WHERE id IN ('je1','je2') AND synced_trade_id IS NOT NULL`)
      ).rows[0].n, 0);

check('the trade keeps pointing at the entry it named', (await db.query<{ journal_entry_id: string }>(
  `SELECT journal_entry_id FROM synced_trades WHERE id = 'st1'`)).rows[0].journal_entry_id, 'je3');

check('the untouched trade keeps its own entry',
      (await db.query<{ journal_entry_id: string }>(
        `SELECT journal_entry_id FROM synced_trades WHERE id = 'st2'`)).rows[0].journal_entry_id, 'je4');

// Does it actually refuse a second entry for the same trade now?
let refused = false;
try {
  await db.query(`INSERT INTO journal_entries (id, user_id, instrument, created_at, synced_trade_id)
                  VALUES ('dupe','u1','EURUSD',now(),'st1')`);
} catch (err: any) { refused = /unique|duplicate key/i.test(err.message); }
check('a SECOND entry for the same trade is REFUSED', refused, true);

// ...while hand-typed entries stay unlimited. This is what the partial rule buys.
let manualOk = true;
try {
  await db.query(`INSERT INTO journal_entries (id, user_id, instrument, created_at)
                  VALUES ('m3','u1','XAUUSD',now())`);
} catch { manualOk = false; }
check('...while hand-typed entries with no trade stay unlimited', manualOk, true);

const before = (await db.query<{ id: string }>('SELECT id FROM journal_entries ORDER BY id')).rows.map(r => r.id);
await db.exec(BLOCK);
const after = (await db.query<{ id: string }>('SELECT id FROM journal_entries ORDER BY id')).rows.map(r => r.id);
check('running the migration twice changes nothing', after, before);

check('it reports that it found nothing to remove, rather than being silent',
      notices.some(n => /no duplicate auto-journaled entries found/.test(n)), true);

// AND THE DE-DUP BLOCK STILL HAS TEETH for the case it CAN see: two entries both naming the same trade,
// which is what a future bug or a missing index would produce.
await db.query(`INSERT INTO journal_entries (id, user_id, instrument, created_at, synced_trade_id)
                VALUES ('late','u1','EURUSD','2026-09-30 01:00', NULL)`);
await db.query(`DROP INDEX journal_entries_synced_trade_key`);
await db.query(`UPDATE journal_entries SET synced_trade_id = 'st1' WHERE id = 'late'`);
await db.exec(BLOCK);
check('TEETH — when two entries DO name the same trade, the older survives',
      (await db.query<{ id: string }>(
        `SELECT id FROM journal_entries WHERE synced_trade_id = 'st1' ORDER BY id`)).rows.map(r => r.id),
      ['je3']);

console.log(`\n   ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
