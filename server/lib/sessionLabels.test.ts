/**
 * sessionLabels.test.ts — run with:
 *     npx tsx server/lib/sessionLabels.test.ts
 *
 * ONE SPELLING PER TRADING SESSION.
 *
 * His question, 2026-10-26: is session recording accurate *"in the trade vault and in other
 * datapoints where it is required"*. It was not. The same session was stored under different names
 * depending on how the trade got in, and the per-session win rate groups on the raw stored text
 * (`server/python/metrics_calculator.py:836` is `groups[str(val)]`) — so a London trade he typed
 * and a London trade from his broker were counted as TWO SEPARATE SESSIONS, on Analytics, on the
 * Drawdown loss bars, in the timeframe metrics, and in what the Trader AI was told.
 *
 * ⚠ THE CENTRAL CHECK IS THE "BEFORE" ONE. Asserting that the labels agree after the fix proves
 * little on its own — the same assertion would pass on a system that never had the bug. So the old
 * spellings are grouped the way the metrics group them FIRST, and that must come back as two rows.
 * That contrast is the evidence the defect was real.
 *
 * The tidy-up itself is lifted out of `docker-migrate.sql` — production's own schema path — and run
 * against a real Postgres engine, rather than retyped here.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SESSION_NAMES, canonicalSession } from '../../shared/sessions';

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}`
              + (ok ? '' : `, want ${JSON.stringify(want)}`));
  ok ? pass++ : fail++;
}

/** How `metrics_calculator.breakdown_by_categorical` groups: on the raw text, with no tidying. */
function groupAsMetricsDo(rows: { session_name: string | null }[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) if (r.session_name) seen.add(String(r.session_name));
  return [...seen].sort();
}

const MIGRATION = readFileSync(join(process.cwd(), 'docker-migrate.sql'), 'utf8');
const FROM = MIGRATION.indexOf('-- ── ONE SPELLING PER TRADING SESSION');
const TO   = MIGRATION.indexOf('-- ── Done', FROM);
if (FROM < 0 || TO < 0) {
  console.error('   FAIL  could not find the session tidy-up in docker-migrate.sql — anchors moved');
  process.exit(1);
}
const TIDY = MIGRATION.slice(FROM, TO);

async function main() {
  console.log('\nONE SPELLING PER TRADING SESSION\n');

  // ── 1. THE RULE ITSELF ────────────────────────────────────────────────────────────────
  check('the synced spelling folds onto the kept one', canonicalSession('LONDON'), 'London');
  check('...and so does the typed one',                canonicalSession('London'), 'London');
  check('the two overlap spellings meet',              canonicalSession('LONDON/NY OVERLAP'), 'Overlap');
  check('...from either side',                         canonicalSession('Overlap'), 'Overlap');
  check('Asian is Tokyo under another name',           canonicalSession('ASIAN'), 'Tokyo');
  check('Frankfurt sits inside London here',           canonicalSession('FRANKFURT'), 'London');
  check('stray spacing and case do not make a new session', canonicalSession('  new york '), 'New York');
  // NOT A GUESS. Something nobody recognises is left for a person to look at, the same reasoning
  // that removed the old "unknown time means SYDNEY" rule in the same change.
  check('an unknown label is refused, not guessed',    canonicalSession('LDN'), null);
  check('a blank is nothing',                          canonicalSession(''), null);
  check('every kept name folds onto itself',
        SESSION_NAMES.every(n => canonicalSession(n) === n), true);

  // ── 2. HIS DATA, GROUPED THE WAY THE METRICS GROUP IT ─────────────────────────────────
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE journal_entries (
                   id VARCHAR PRIMARY KEY, user_id VARCHAR, session_name TEXT);`);
  await pg.exec(`INSERT INTO journal_entries (id, user_id, session_name) VALUES
                   ('t1','u','London'),              -- typed by hand
                   ('t2','u','LONDON'),              -- from his cTrader sync
                   ('t3','u','Overlap'),             -- typed
                   ('t4','u','LONDON/NY OVERLAP'),   -- synced
                   ('t5','u','ASIAN'),               -- an old Trade Vault value
                   ('t6','u','Tokyo'),
                   ('t7','u','LDN');                 -- nobody recognises this`);

  const before = groupAsMetricsDo((await pg.query<{ session_name: string }>(
    `SELECT session_name FROM journal_entries`)).rows);
  check('BEFORE — his Analytics saw SIX sessions for what are really three',
        before, ['ASIAN', 'LDN', 'LONDON', 'LONDON/NY OVERLAP', 'London', 'Overlap', 'Tokyo'].sort());
  check('...with London split in two', before.filter(s => /^london$/i.test(s)).length, 2);

  await pg.exec(TIDY);

  const after = groupAsMetricsDo((await pg.query<{ session_name: string }>(
    `SELECT session_name FROM journal_entries`)).rows);
  check('AFTER — one row per real session', after, ['LDN', 'London', 'Overlap', 'Tokyo']);
  check('...London is a single bucket now', after.filter(s => /^london$/i.test(s)).length, 1);

  const london = (await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM journal_entries WHERE session_name = 'London'`)).rows[0].n;
  check('...holding BOTH the typed and the synced trade', london, 2);
  const overlap = (await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM journal_entries WHERE session_name = 'Overlap'`)).rows[0].n;
  check('...and overlap holds both too', overlap, 2);
  const tokyo = (await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM journal_entries WHERE session_name = 'Tokyo'`)).rows[0].n;
  check('...and the old ASIAN row joined Tokyo', tokyo, 2);

  // ⚠ WHAT IT MUST NOT DO: invent a session for something it does not know.
  const odd = (await pg.query<{ session_name: string }>(
    `SELECT session_name FROM journal_entries WHERE id = 't7'`)).rows[0].session_name;
  check('an unrecognised label is left exactly as it was', odd, 'LDN');
  const total = (await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM journal_entries`)).rows[0].n;
  check('and no row was lost', total, 7);

  // ── 3. RUNNING IT TWICE CHANGES NOTHING ───────────────────────────────────────────────
  // It runs on every container boot (`start.sh` applies this file), so a second pass that moved
  // anything would be a defect that only showed up days later.
  await pg.exec(TIDY);
  const twice = groupAsMetricsDo((await pg.query<{ session_name: string }>(
    `SELECT session_name FROM journal_entries`)).rows);
  check('a second run is a no-op', twice, after);

  await pg.close();
  console.log();
  if (fail) { console.log(`${fail} of ${pass + fail} FAILED`); process.exit(1); }
  console.log(`ALL PASS (${pass} checks)`);
}

main().catch(e => { console.error(e); process.exit(1); });
