/**
 * audit.test.ts — run with:
 *     npx tsx server/services/autoJournal/audit.test.ts
 *
 * FOUR DEFECTS FOUND BY AUDITING THE cTRADER -> JOURNAL PIPELINE END TO END (2026-09-04).
 *
 * Each one was traced in the code, not guessed at, and each check below fails without its fix.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

let pass = 0, fail = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

const index  = read('server', 'services', 'autoJournal', 'index.ts')
             + read('server', 'services', 'autoJournal', 'repair.ts');   // split 2026-09-05
const sync   = read('server', 'services', 'brokerSyncService.ts');
const storeS = read('server', 'storage.ts');
const auto   = read('server', 'services', 'autoSyncService.ts');
const routes = read('server', 'routes.ts');

console.log('\nAUTOSYNC PIPELINE AUDIT — the four defects, and the fix for each\n');


// ── 1. MAE/MFE NEVER REACHED THE JOURNAL ───────────────────────────────────
//
// His ask: "we can extend it to also record this MAE/MFE in the journal." They were written to
// `synced_trades` and stopped there. The ordering makes it permanent: the entry is created at
// brokerSyncService:376 while `mae` is still null, `marksFor` only runs in the already-seen branch
// on a LATER sync, and nothing then carried them across. `repairJournalDerived` rewrote 13 fields
// and these two were not among them — and the mark backfill was the ONLY one of the four backfills
// that called no repair at all.
console.log('1. how far the trade ran each way must reach the journal:');
const derived = index.slice(index.indexOf('export async function repairJournalDerived'));
check('the rebuild writes mae', /mae:\s*rebuilt\.mae/.test(derived), true);
check('...and mfe', /mfe:\s*rebuilt\.mfe/.test(derived), true);
// TEETH — the other 13 fields must still be there; adding two must not have displaced any.
for (const f of ['direction', 'profitLoss', 'achievedRR', 'outcome', 'primaryExitReason'])
  check(`...and still rewrites ${f}`, new RegExp(`${f}:\\s*rebuilt\\.${f}`).test(derived), true);
// And the sync must actually TRIGGER that rebuild once the marks land.
const marksBlock = sync.slice(sync.indexOf('const m = await marksFor('), sync.indexOf('HOW IT WAS ENTERED'));
check('the sync repairs the entry after the marks are filled in',
      /repairJournalDerived\(existing\)/.test(marksBlock), true);


// ── 2. A TRADE STORED WITHOUT A CLOSE TIME COULD NEVER BE JOURNALED ────────
//
// Journaling needs a close time (`if (closeTime)` on create, `existing.closeTime` on the heal), and
// the cTrader adapter writes `closeTime: …executionTimestamp ?? undefined`. Nothing could fill it:
// no setter existed and `correctSyncedTrade` accepts only direction, profitLoss, orderType and the
// marks. The same permanent-invisibility defect already fixed once for the missing-entry case.
console.log('\n2. a close time the row was stored without can now be filled:');
check('storage can set a close time', /async updateSyncedTradeCloseTime\(/.test(storeS), true);
check('...and it is on the interface, so it cannot be missed by a second implementation',
      /updateSyncedTradeCloseTime\(id: string, closeTime: Date\): Promise<void>;/.test(storeS), true);
check('the sync backfills it', /if \(!existing\.closeTime && raw\.closeTime\)/.test(sync), true);
check('...only ever filling a blank, never overwriting what we hold',
      sync.includes('if (!existing.closeTime && raw.closeTime)'), true);
// TEETH — it must come BEFORE the heal, or the trade waits another whole cycle to be journaled.
check('...and it runs before the heal that journals it',
      sync.indexOf('if (!existing.closeTime && raw.closeTime)')
        < sync.indexOf('if (!existing.journalEntryId && existing.closeTime)'), true);


// ── 3. THE MOST SERIOUS CORRECTION WAS INVISIBLE ──────────────────────────
//
// `corrected` counts a WRONG DIRECTION and a WRONG-SIGNED P&L — his EUR/USD long stored as a short
// with its $51 loss recorded as a $51 win. It was counted and never returned, so the pipeline
// rewrote a trade he may already have read and told him nothing.
console.log('\n3. a corrected value is reported, not swallowed:');
check('the sync returns it', /return \{ created, duplicates, journaled, healed, backfilled, corrected \}/.test(sync), true);
check('...and it is in the return type', /backfilled: number; corrected: number/.test(sync), true);
check('the outcome carries it', /corrected\?: number;/.test(auto), true);
check('the server log says so', /counts\.corrected \?/.test(auto), true);
check('and he is told', /outcome\.corrected \?/.test(routes), true);
// The old wording became a lie the moment a second field was backfilled.
// MATCH THE MESSAGE, NOT THE COMMENT. The first version of this check grepped the whole file for
// the old wording and found it in the note explaining why it was replaced — a test failing on its
// own explanation. The template literal is what he reads, so that is what is asserted.
check('the message no longer claims backfilled means only the open time',
      routes.includes('${outcome.backfilled} given their missing open time'), false);
check('...and says what it really covers',
      routes.includes("detail(s) filled in that the live feed "), true);


// ── 4. A FAILED BOOKMARK COULD JOURNAL THE TRADE TWICE ────────────────────
//
// Writing the entry and bookmarking it are two separate writes. If the second failed the first was
// orphaned: the trade still read as un-journaled, so the next sync wrote a SECOND entry for the same
// trade — silently doubling it in every metric. The unique pair guarding this is on `synced_trades`,
// not on `journal_entries`.
console.log('\n4. a failed bookmark cannot leave a duplicate behind:');
const journalFn = index.slice(index.indexOf('export async function journalSyncedTrade'));
check('the bookmark is guarded', /try \{\s*await storage\.markSyncedTradeJournaled/.test(journalFn), true);
check('...and a failure removes the orphaned entry',
      /deleteJournalEntry\(journalEntry\.id\)/.test(journalFn), true);
check('...and still reports the failure rather than swallowing it',
      /throw new Error\(`the entry was written but could not be bookmarked/.test(journalFn), true);


// ── THE ISOLATION RULE IS UNTOUCHED ───────────────────────────────────────
// His instruction: "the manual one is working fine so dont tamper with it even a bit." None of the
// above may reach the manual path.
console.log('\nthe manual journal is untouched:');
// Again: the endpoint's NAME appears in the docstring explaining what this pipeline deliberately
// does NOT touch. What matters is that no route is registered here.
check('nothing here registers a route', /app\.(get|post|put|patch|delete)\(/.test(index), false);
check('...and it does not import the express app', /from ['"]express['"]/.test(index), false);
check('enrichTradeWithBalance is CALLED, never redefined',
      /function enrichTradeWithBalance/.test(index), false);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
