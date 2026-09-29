/**
 * syncedTradeUniqueness.test.ts — run with:
 *     npx tsx server/services/syncedTradeUniqueness.test.ts
 *
 * THE MIGRATION THAT DELETES ROWS, RUN FOR REAL BEFORE IT TOUCHES PRODUCTION.
 *
 * `docker-migrate.sql` collapses duplicate `synced_trades` rows and then adds the uniqueness rule that
 * makes a second copy of the same broker trade impossible (docs/OPEN.md D52). It is the only migration
 * in this repo that DELETES anything, and it runs automatically on every container boot
 * (`start.sh:17`) where a failure is NON-FATAL — so a mistake here is both destructive and quiet.
 *
 * WHICH ROW SURVIVES IS THE WHOLE RISK. `synced_trades.journal_entry_id` points at a journal entry, so
 * deleting the journaled copy would leave an entry whose source is gone. The ordering must keep the
 * journaled row. That is what this test exists to prove, and reading the SQL cannot prove it.
 *
 * WHY PGlite. Docker needs a virtual machine this laptop does not have, and there is no local psql.
 * PGlite is real PostgreSQL compiled to WebAssembly, running in-process — same engine behaviour for
 * DDL, plpgsql and window functions, with nothing to install or start. It is a devDependency and the
 * production image is built with `npm ci --omit=dev` (Dockerfile:29), so it never ships.
 *
 * THE SQL IS EXTRACTED FROM THE REAL FILE, never retyped. A retyped copy would be a reproduction, and
 * a test that agrees with a reproduction of the code tells you nothing about the code.
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

// ── the real block, sliced out of the real migration ─────────────────────────
const MIGRATION = readFileSync(join(process.cwd(), 'docker-migrate.sql'), 'utf8');
const FROM = MIGRATION.indexOf('-- ── ONE ROW PER BROKER TRADE');
const MARK = 'ON synced_trades (broker_account_id, external_id);';
const TO   = MIGRATION.indexOf(MARK, FROM);
if (FROM < 0 || TO < 0) {
  console.error('   FAIL  could not find the uniqueness block in docker-migrate.sql — anchors moved');
  process.exit(1);
}
const BLOCK = MIGRATION.slice(FROM, TO + MARK.length);

// Only the columns the block touches. Deliberately no foreign key: this proves the SQL, not the schema.
const SETUP = `
CREATE TABLE synced_trades (
  id                VARCHAR PRIMARY KEY,
  broker_account_id VARCHAR NOT NULL,
  external_id       TEXT NOT NULL,
  journal_entry_id  VARCHAR,
  created_at        TIMESTAMP
);
INSERT INTO synced_trades VALUES
 -- three copies; the JOURNALED one must win even though it is not the oldest
 ('a1','acct1','deal-1', NULL,      '2026-09-01 10:00'),
 ('a2','acct1','deal-1','journal-A','2026-09-01 11:00'),
 ('a3','acct1','deal-1', NULL,      '2026-09-01 12:00'),
 -- both journaled: the OLDER wins
 ('b1','acct1','deal-2','journal-B1','2026-09-02 10:00'),
 ('b2','acct1','deal-2','journal-B2','2026-09-02 11:00'),
 -- no duplicate at all: untouched
 ('c1','acct1','deal-3', NULL,      '2026-09-03 10:00'),
 -- TEETH: same trade id, DIFFERENT account. Collapsing these would destroy a real trade.
 ('d1','acct2','deal-1', NULL,      '2026-09-04 10:00'),
 -- a NULL created_at must not beat a real one
 ('e1','acct1','deal-4', NULL,       NULL),
 ('e2','acct1','deal-4', NULL,      '2026-09-05 10:00');
`;

console.log('\nTHE UNIQUENESS MIGRATION, RUN AGAINST REAL POSTGRES\n');

const db = new PGlite();
const notices: string[] = [];
await db.exec(SETUP);
check('seeded', (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM synced_trades')).rows[0].n, 9);

try {
  await db.exec(BLOCK, { onNotice: (n: any) => notices.push(String(n.message)) });
  console.log('   PASS  the migration ran without error');
  pass++;
} catch (err: any) {
  console.log(`   FAIL  the migration threw: ${err.message}`);
  process.exit(1);
}

const survivors = (await db.query<{ id: string }>('SELECT id FROM synced_trades ORDER BY id')).rows.map(r => r.id);
check('exactly the right rows survive — journaled kept, other account untouched',
      survivors, ['a2', 'b1', 'c1', 'd1', 'e2']);

check('the uniqueness rule exists afterwards',
      (await db.query(`SELECT 1 FROM pg_indexes WHERE tablename='synced_trades'
                         AND indexname='synced_trades_account_external_key'`)).rows.length, 1);

// Does it actually refuse, rather than merely exist?
let refused = false;
try { await db.query(`INSERT INTO synced_trades VALUES ('x1','acct1','deal-3',NULL,now())`); }
catch (err: any) { refused = /unique|duplicate key/i.test(err.message); }
check('a second copy of the same trade is REFUSED', refused, true);

let allowed = true;
try { await db.query(`INSERT INTO synced_trades VALUES ('z1','acct3','deal-3',NULL,now())`); }
catch { allowed = false; }
check('...while the same trade id on a DIFFERENT account is still allowed', allowed, true);

// The migration reruns on every container boot, so it must be safe to run twice.
const before = (await db.query<{ id: string }>('SELECT id FROM synced_trades ORDER BY id')).rows.map(r => r.id);
await db.exec(BLOCK);
const after = (await db.query<{ id: string }>('SELECT id FROM synced_trades ORDER BY id')).rows.map(r => r.id);
check('running it a second time changes nothing', after, before);

check('and it says how many it removed, so a silent deletion is impossible',
      notices.some(n => /removed 4 duplicate row/.test(n)), true);

console.log(`\n   ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
