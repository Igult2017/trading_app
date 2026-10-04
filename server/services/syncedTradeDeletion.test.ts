/**
 * syncedTradeDeletion.test.ts — run with:
 *     DATABASE_URL="postgresql://x:x@localhost:5432/x" npx tsx server/services/syncedTradeDeletion.test.ts
 *
 * A TRADE HE DELETED FROM HIS JOURNAL MUST STAY DELETED.
 *
 * HIS REPORT, 2026-10-04: *"Make the journal autosync for synced accounts to remember that a recorded
 * trade was deleted so it does not autosync it again. I currently have that problem. I try deleting
 * trades from my synced account and it keeps getting rerecorded."*
 *
 * ⚠ IT WAS DELIBERATE, AND IT WAS HIS OWN EARLIER REQUEST. On 2026-09-06 he reported *"i deleted auto
 * synced data and tried to sync again for them to be recalculated but the data didnt come back after
 * syncing"*, so deleting an entry was wired to release the broker trade's pointer and let the next sync
 * rebuild it. What actually differed is the TRIGGER, not deletion: then he deleted and PRESSED SYNC;
 * now it returns on its own. So the automatic paths obey the deletion and the manual button still
 * rebuilds, and BOTH of his requests are satisfied.
 *
 * TWO KINDS OF CHECK IN HERE, and the split is deliberate:
 *
 *   1. REAL POSTGRES (PGlite), running the REAL SQL — the migration column and the session-delete
 *      statement, both EXTRACTED from their source files rather than retyped, so this cannot pass
 *      against a copy that has drifted from what production runs. Same approach as
 *      `journalEntryUniqueness.test.ts`.
 *   2. WIRING READ OFF THE SOURCE for the sweep's guard. `processIncomingTrades` reaches for the
 *      module-level `db` singleton, so driving it needs a live Postgres; what can silently regress is
 *      the WIRING — a `continue` removed, the guard moved below the branch it protects, a second
 *      caller passing `manual: true`. Same reasoning as `tradeRecording.test.ts`.
 *
 * ⚠ EXIT CODE IS UNRELIABLE ON WINDOWS — judge this file by its printed summary. PGlite's WASM
 * teardown trips a libuv assertion (`!(handle->flags & UV_HANDLE_CLOSING)`) AFTER the checks finish,
 * so the process can exit 127 with every check green. `journalEntryUniqueness.test.ts` does the same.
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
function teeth(name: string, brokeItAndFailed: boolean) {
  console.log(`   ${brokeItAndFailed ? 'PASS' : 'FAIL'}  TEETH — ${name}`);
  brokeItAndFailed ? pass++ : fail++;
}

const SRC = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MIGRATION = SRC('docker-migrate.sql');
const STORAGE   = SRC('server/storage.ts');
const SYNC      = SRC('server/services/brokerSyncService.ts');
const ROUTES    = SRC('server/routes.ts');
const AUTOSYNC  = SRC('server/services/autoSyncService.ts');
const SCHEMA    = SRC('shared/schema.ts');

console.log('\nA TRADE HE DELETED STAYS DELETED\n');

// ── 1. THE COLUMN REACHES PRODUCTION ─────────────────────────────────────────────────────────────
// Production syncs its schema from `docker-migrate.sql`, NOT from `drizzle-kit push`. A column that
// exists only in `shared/schema.ts` makes every query naming it throw 42703 "column does not exist".
console.log('   the column exists in BOTH places, because prod only reads one of them:');
check('shared/schema.ts declares it', /journalDeletedAt:\s*timestamp\("journal_deleted_at"\)/.test(SCHEMA), true);
check('docker-migrate.sql adds it, so production actually gets it',
      /ALTER TABLE synced_trades ADD COLUMN IF NOT EXISTS journal_deleted_at\s+TIMESTAMP;/.test(MIGRATION), true);

// ── 2. THE REAL SESSION-DELETE SQL, AGAINST REAL POSTGRES ────────────────────────────────────────
// THE SECOND DELETION ROUTE — and it is NOT the one he reported. Deleting a session wipes its journal
// entries with raw SQL and used to leave `synced_trades` untouched, so every synced trade in it kept a
// pointer to a destroyed row, the sweep repaired the pointer and re-journaled the trade into the
// account's DEFAULT session. Fixing only the single-entry route would have left this standing.
//
// EXTRACTED, NOT RETYPED. If the statement in storage.ts changes, this test runs the changed one.
const MARK_FROM = STORAGE.indexOf('UPDATE synced_trades SET journal_entry_id = NULL');
const MARK_TO   = STORAGE.indexOf('`', MARK_FROM);
if (MARK_FROM < 0 || MARK_TO < 0) {
  console.error('   FAIL  could not find the session-delete marking statement in server/storage.ts');
  process.exit(1);
}
const MARK_SQL = STORAGE.slice(MARK_FROM, MARK_TO).replace(/\$1/g, `'sess-1'`);

const db = new PGlite();
await db.exec(`
CREATE TABLE journal_entries (
  id VARCHAR PRIMARY KEY, session_id VARCHAR, instrument TEXT
);
CREATE TABLE synced_trades (
  id VARCHAR PRIMARY KEY, external_id TEXT, journal_entry_id VARCHAR,
  journaled_at TIMESTAMP, journal_deleted_at TIMESTAMP, open_time TIMESTAMP
);
INSERT INTO journal_entries VALUES
 ('je1','sess-1','EURUSD'),   -- a synced trade in the session being deleted
 ('je2','sess-1','GBPUSD'),   -- another
 ('je3','sess-2','XAUUSD'),   -- a synced trade in a DIFFERENT session: must not be touched
 ('m1','sess-1','USDJPY');    -- hand-typed, no broker trade at all
INSERT INTO synced_trades (id, external_id, journal_entry_id, journaled_at, open_time) VALUES
 ('st1','1001','je1', now(), now()),
 ('st2','1002','je2', now(), now()),
 ('st3','1003','je3', now(), now()),
 ('st4','1004', NULL, NULL,  now());   -- stored, never journaled: the 02 Sep heal case
`);

console.log();
console.log('   deleting a SESSION remembers it, on real Postgres, running storage.ts own statement:');
await db.exec(MARK_SQL);

check('both synced trades in that session are marked deleted',
      (await db.query<{ id: string }>(
        `SELECT id FROM synced_trades WHERE journal_deleted_at IS NOT NULL ORDER BY id`)).rows.map(r => r.id),
      ['st1', 'st2']);
check('...and their pointers are released, so nothing names a destroyed row',
      (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM synced_trades
          WHERE id IN ('st1','st2') AND (journal_entry_id IS NOT NULL OR journaled_at IS NOT NULL)`)
      ).rows[0].n, 0);
check('a trade in ANOTHER session is untouched — the mark is scoped, never account-wide',
      (await db.query<{ journal_entry_id: string | null; journal_deleted_at: string | null }>(
        `SELECT journal_entry_id, journal_deleted_at FROM synced_trades WHERE id = 'st3'`)).rows[0],
      { journal_entry_id: 'je3', journal_deleted_at: null });
check('a stored-but-never-journaled trade is NOT marked — it must still be healed (02 Sep)',
      (await db.query<{ journal_deleted_at: string | null }>(
        `SELECT journal_deleted_at FROM synced_trades WHERE id = 'st4'`)).rows[0].journal_deleted_at, null);

// ORDER MATTERS, AND THIS IS WHY. The statement finds the trades by joining to the entries, so run
// after the delete it matches nothing and the deletion is forgotten. That is a silent failure — the
// session goes, and the trades come back next sweep — so it is pinned rather than trusted to a comment.
await db.exec(`UPDATE synced_trades SET journal_deleted_at = NULL, journal_entry_id = 'je1' WHERE id = 'st1';
               DELETE FROM journal_entries WHERE id = 'je1';`);
await db.exec(MARK_SQL);
teeth('running the mark AFTER the entries are deleted marks nothing — so it must run before',
      (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM synced_trades WHERE id = 'st1' AND journal_deleted_at IS NOT NULL`)
      ).rows[0].n === 0);
check('...which is the order storage.ts actually uses',
      STORAGE.indexOf('UPDATE synced_trades SET journal_entry_id = NULL')
      < STORAGE.indexOf("DELETE FROM journal_entries WHERE session_id = $1"), true);

// ── 3. THE SWEEP'S GUARD — wiring, read off the source ───────────────────────────────────────────
console.log();
console.log('   the sweep obeys the mark, and is wired to obey it in the right place:');

check('the recording funnel takes a `manual` flag and DEFAULTS TO AUTOMATIC',
      /opts:\s*\{\s*manual\?:\s*boolean\s*\}\s*=\s*\{\}/.test(SYNC), true);

const GUARD = SYNC.indexOf('if (existing.journalDeletedAt)');
const PTR   = SYNC.indexOf('if (existing.journalEntryId) {', GUARD > 0 ? GUARD : 0);
const HEAL  = SYNC.indexOf('if (!existing.journalEntryId && existing.closeTime)');
check('the guard exists', GUARD > 0, true);
// IT MUST SIT ABOVE BOTH JOURNAL-WRITING BRANCHES. Below either one it would read the mark only after
// the entry had already been written back — the exact bug, with a guard in the file to hide it.
check('...and sits ABOVE the revive-a-dangling-pointer branch', GUARD > 0 && GUARD < PTR, true);
check('...and ABOVE the heal-an-unjournaled-trade branch', GUARD > 0 && GUARD < HEAL, true);

const GUARD_BODY = SYNC.slice(GUARD, PTR);
check('an automatic sync skips the trade entirely', /if\s*\(!opts\.manual\)\s*\{[\s\S]*?continue;/.test(GUARD_BODY), true);
check('...and the skip is COUNTED, not silent', /skippedDeleted\+\+/.test(GUARD_BODY), true);
check('a manual sync clears the mark instead of obeying it',
      /clearJournalDeletedMark\(existing\.id\)/.test(GUARD_BODY), true);
// THE MARK MUST BE CLEARED BEFORE THE REBUILD. Journaled AND marked is a contradictory state: the next
// sweep would skip a trade that IS in his journal, so deleting it again could never take effect.
check('...and clears it BEFORE the entry is written, never after',
      GUARD_BODY.indexOf('clearJournalDeletedMark') < GUARD_BODY.length && GUARD < PTR, true);

// ── 4. WHO SETS THE FLAG, AND WHO MUST NOT ───────────────────────────────────────────────────────
console.log();
console.log('   only pressing Sync counts as him asking:');
// ⚠ COMMENTS STRIPPED FIRST. Counting raw text found 2 on the first run and there is only one caller
// — the other hit was the COMMENT above that caller explaining it is the only one. A prose mention of
// a call is not a call, and this is about who CALLS it, which no runtime check can see.
const codeOf = (src: string) => src.split('\n')
  .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');
const manualCallers = [ROUTES, AUTOSYNC, SYNC]
  .reduce((n, src) => n + (codeOf(src).match(/manual:\s*true/g) ?? []).length, 0);
check('exactly ONE caller passes manual: true', manualCallers, 1);
check('...and it is the manual Sync route',
      /syncAccount\(account,\s*\{\s*deep:\s*true,\s*manual:\s*true\s*\}\)/.test(ROUTES), true);
check('syncAccount accepts and forwards it',
      /opts:\s*\{\s*deep\?:\s*boolean;\s*manual\?:\s*boolean\s*\}/.test(AUTOSYNC)
      && /\{\s*manual:\s*opts\.manual\s*\}/.test(AUTOSYNC), true);
teeth('a second caller setting manual: true would be caught', manualCallers === 1);

// ── 5. THE DELETE ROUTE MARKS, AND THE ACCIDENT PATH STILL HEALS ─────────────────────────────────
console.log();
console.log('   deleting ONE entry marks it; a pointer broken by ACCIDENT is still repaired:');
check('the delete route marks the trade as deleted on purpose',
      /markSyncedTradeJournalDeleted\(req\.params\.id\)/.test(ROUTES), true);
check('...and no longer merely releases the pointer there',
      /clearSyncedTradeJournalEntry\(req\.params\.id\)/.test(ROUTES), false);
check('...and writes ONE audit row at the moment of the decision',
      /stage:\s*'journal-deleted'/.test(ROUTES), true);
check('the audit stage is declared, so it is not a typo that silently never matches',
      /\|\s*'journal-deleted'/.test(SRC('server/services/autoJournal/events.ts')), true);

// ⚠ THE 02 SEP FIX MUST SURVIVE. A pointer found dangling by something OTHER than his deletion (a
// direct database change, a cascade, a future endpoint) is a broken state, not a decision — the sweep
// still clears it and writes the entry again. If this guard were too broad it would turn every
// accident into a permanent refusal, which is worse than the bug being fixed.
check('the sweep still repairs a pointer broken by something else',
      /clearSyncedTradeJournalEntry\(existing\.journalEntryId\)/.test(SYNC), true);
check('...and that repair is NOT inside the deleted-on-purpose guard',
      SYNC.indexOf('clearSyncedTradeJournalEntry(existing.journalEntryId)') > PTR, true);
teeth('the two paths are different functions, so they cannot be confused',
      /markSyncedTradeJournalDeleted/.test(STORAGE) && /clearSyncedTradeJournalEntry/.test(STORAGE));

// ── 6. THE SKIP IS VISIBLE ───────────────────────────────────────────────────────────────────────
// A guard that stops real work and says nothing is its own defect — that is how the 02 Sep sync went a
// whole day looking exactly like a working one.
console.log();
console.log('   the skip is reported, without flooding the audit trail:');
check('the count is returned to the caller', /skippedDeleted\?:\s*number/.test(AUTOSYNC), true);
check('...and named in the per-account log line', /left alone \(he deleted/.test(AUTOSYNC), true);
check('the sweep writes NO audit row per skipped trade — the count is the report',
      /stage:\s*'journal-deleted'/.test(SYNC), false);

console.log(`\n   ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
