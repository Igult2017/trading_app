/**
 * brokerScaleOut.test.ts — run with:
 *     npx tsx server/services/brokerScaleOut.test.ts
 *
 * THE HALF OF THE SCALE-OUT FIX THAT DELETES THINGS.
 *
 * `brokerAdapters/ctraderScaleOut.test.ts` pins the recording: one position, one trade, emitted only
 * once the whole order is closed. That stops his report of 2026-09-26 happening again and does nothing
 * about the rows already in his journal — a trade taken off in three pieces is sitting there as three
 * entries, and the one that survives is sized at a third of the trade.
 *
 * `./brokerScaleOut` fixes those from the ordinary sweep, which means it RESTATES a row he may already
 * have read and DELETES two others. This file exists because that is the only destructive code in the
 * change, and the rules that stop it destroying the wrong thing must be testable — not inferred from
 * reading it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { whyKeep } from './brokerScaleOut';
import { EDIT_LOCK_KEY } from './autoJournal';

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

console.log();
console.log('SCALE-OUT REPAIR — what it may delete, and the three things it may not');

// ── 1. WHAT MAY GO ─────────────────────────────────────────────────────────
console.log('\n1. a part-exit entry the auto-journal wrote and he has not touched:');
check('an auto-journaled entry with no hand edits may be retired',
      whyKeep({ manualFields: { autoJournaled: true } }), null);
check('...an empty edit list is not a hand edit',
      whyKeep({ manualFields: { autoJournaled: true, [EDIT_LOCK_KEY]: [] } }), null);
check('a row that never got a journal entry has nothing of his on it',
      whyKeep(null), null);
check('...and neither has an undefined one', whyKeep(undefined), null);

// ── 2. WHAT MAY NOT ────────────────────────────────────────────────────────
//
// His report, 2026-09-05: *"i am unable to edit and make corrections to trade vault for auto synced
// trades."* The answer to that was the edit lock, and it would be a poor answer if a later fix simply
// deleted the row he had corrected. A trade he has touched is a trade he has READ.
console.log('\n2. anything of his stays, even when it is a duplicate:');
check('an entry he has corrected by hand is KEPT',
      whyKeep({ manualFields: { autoJournaled: true, [EDIT_LOCK_KEY]: ['outcome'] } }),
      'he has corrected it by hand');
check('...whatever else is on it',
      whyKeep({ manualFields: { autoJournaled: true, [EDIT_LOCK_KEY]: ['profitLoss', 'mae'],
                                note: 'his note' } }),
      'he has corrected it by hand');
check('an entry the auto-journal did NOT write is KEPT',
      whyKeep({ manualFields: { note: 'typed in by hand' } }),
      'it was not written by the auto-journal');
check('...a missing manualFields blob counts as not ours',
      whyKeep({}), 'it was not written by the auto-journal');
check('...and so does an autoJournaled flag that is not literally true',
      whyKeep({ manualFields: { autoJournaled: 'yes' } }),
      'it was not written by the auto-journal');
// THE HAND EDIT IS CHECKED FIRST, so a row that is both his AND ours is reported as his — the stronger
// reason, and the one he would recognise.
check('a hand edit outranks the autoJournaled flag',
      whyKeep({ manualFields: { autoJournaled: true, [EDIT_LOCK_KEY]: ['direction'] } }),
      'he has corrected it by hand');

// TEETH — a guard that let everything through would pass every check in section 1 and fail here.
teeth('a guard that always returned null would be caught',
      whyKeep({ manualFields: { autoJournaled: true, [EDIT_LOCK_KEY]: ['outcome'] } }) !== null);
teeth('...and one that always kept everything would be caught too',
      whyKeep({ manualFields: { autoJournaled: true } }) === null);

// ── 3. THE INVARIANTS THAT CANNOT BE CALLED, ONLY READ ─────────────────────
//
// These three are about ORDER and REACH rather than a return value, so they are pinned against the
// source. Each is a defect this codebase has already shipped in another form.
console.log('\n3. the shape of the repair itself:');
const src = readFileSync(join(process.cwd(), 'server', 'services', 'brokerScaleOut.ts'), 'utf8');
const sync = readFileSync(join(process.cwd(), 'server', 'services', 'brokerSyncService.ts'), 'utf8');

// RECORDED BEFORE DELETED. `sync_events` is in Postgres; the container log dies on every deploy. On
// 02 Sep finding one defect cost four deploys because the evidence went with each one.
check('the retire is written to sync_events BEFORE the row is deleted',
      src.indexOf("stage: 'retired'") < src.indexOf('deleteJournalEntry'), true);
check('...and before the trade row goes too',
      src.indexOf("stage: 'retired'") < src.indexOf('deleteSyncedTrade'), true);

// IT NEVER RUNS ON A TRADE CLOSED IN ONE DEAL. That is most of them, and a lookup per trade for a
// question whose answer is already known is how a sweep gets slow enough to time out.
check('nothing is retired unless the aggregate says the position came off in parts',
      /if \(!raw\.positionId \|\| \(raw\.closedInParts \?\? 1\) < 2\) return 0;/.test(src), true);
check('...and the sync only calls it on such a trade',
      (src.match(/closedInParts \?\? 1/g) ?? []).length >= 1
        && (sync.match(/\(raw\.closedInParts \?\? 1\) >= 2/g) ?? []).length === 2, true);

// BOTH PATHS. The aggregate is keyed on the FINAL closing deal, and that deal's own row may never have
// been written (the feed was down, or the window ended before it) while the earlier take-profits' rows
// were. Retiring only where the trade is a duplicate would leave exactly those behind.
check('the sync retires on the CREATE path as well as the duplicate one',
      (sync.match(/retireSupersededParts\(/g) ?? []).length, 2);

// THE ROW WE KEEP IS NEVER A CANDIDATE. Deleting it would take the whole trade out of his journal.
check('the surviving externalId is excluded from the siblings',
      /\.filter\(t => t\.externalId !== keepExternalId\)/.test(src), true);

// AND A RESTATED OR RETIRED TRADE CLEARS THE CACHED PAGES. Every journal page is built from one cached
// list (D23); a fix the pages do not show for five minutes reads exactly like no fix at all.
check('the compute caches are cleared for a restate or a retire',
      /created > 0 \|\| healed > 0 \|\| backfilled > 0 \|\| restated > 0 \|\| retired > 0/.test(sync),
      true);

console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
