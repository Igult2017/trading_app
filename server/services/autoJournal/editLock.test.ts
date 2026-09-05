/**
 * editLock.test.ts — run with:
 *     npx tsx server/services/autoJournal/editLock.test.ts
 *
 * HIS REPORT, 2026-09-05: *"i am unable to edit and make corrections to trade vault for auto synced
 * trades. I need to make corrections there and they appear everywhere."*
 *
 * The edit was never BLOCKED — `PUT /api/journal/entries/:id` has no synced-trade check. It was
 * OVERWRITTEN. `repairJournalDerived` rebuilds fifteen fields from the broker's own numbers, and
 * the sync calls it from four places (brokerSyncService 264 / 292 / 320 / 347), so a correction
 * survived until the next pass and then reverted. That is also why a trade he re-classified as
 * break-even kept coming back as a loss: the automatic classifier re-asserted LOSS every cycle.
 *
 * The repair is NOT itself the bug. The live feed records a trade the instant it closes with no open
 * time and no original stop, and the later sweep genuinely learns them. What was missing was any way
 * to tell "this was blank and we found it out" from "he changed it on purpose".
 *
 * These checks drive the real `repairJournalDerived` against a fake storage layer, so they exercise
 * the actual merge/skip logic rather than a description of it.
 */
import { EDIT_LOCK_KEY, EDIT_LOCKABLE_FIELDS } from './index';

let pass = 0, fail = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

console.log('\nA HAND EDIT BEATS THE BROKER\n');

// ── 1. THE TWO SIDES CANNOT DRIFT ──────────────────────────────────────────
// The PUT records the names; the repair skips them. Both import from one place, and every name on
// the list must actually be a field the repair writes — otherwise locking it would do nothing.
console.log('1. the list is shared and every name on it is a field the repair writes:');
const src = await import('fs').then(fs =>
  fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8'));
const patchBlock = src.slice(src.indexOf('const patch: Record<string, any> = {'),
                             src.indexOf('for (const f of edited) delete patch[f];'));
const missing = EDIT_LOCKABLE_FIELDS.filter(f => !new RegExp(`\\b${f}:`).test(patchBlock));
check('every lockable field is in the rebuild', missing, []);
check('the routes side imports the same constants, not its own copy',
      /import \{ EDIT_LOCK_KEY, EDIT_LOCKABLE_FIELDS \} from "\.\/services\/autoJournal"/
        .test(await import('fs').then(fs => fs.readFileSync('server/routes.ts', 'utf8'))), true);

// ── 2. THE SKIP ITSELF, DRIVEN FOR REAL ────────────────────────────────────
console.log('\n2. driving repairJournalDerived against a fake store:');

const BROKER = { direction: 'Short', outcome: 'LOSS', profitLoss: '-51.03', achievedRR: -1 };
const HIS    = { outcome: 'BE', profitLoss: '0' };

/** Runs the repair with `edited` locked, and returns the patch it tried to write. */
async function runRepair(edited: string[]): Promise<Record<string, any>> {
  const stored: Record<string, any> = {
    manualFields: edited.length ? { [EDIT_LOCK_KEY]: edited, note: 'his note' } : { note: 'his note' },
  };
  let written: Record<string, any> = {};

  const storage = await import('../../storage');
  const realGet = (storage.storage as any).getJournalEntryById;
  const realUpd = (storage.storage as any).updateJournalEntry;
  (storage.storage as any).getJournalEntryById = async () => stored;
  (storage.storage as any).updateJournalEntry = async (_id: string, patch: any) => { written = patch; return {}; };

  const { repairJournalDerived } = await import('./index');
  try {
    await repairJournalDerived({
      id: 't1', journalEntryId: 'j1', brokerAccountId: 'b1', externalId: 'x1', symbol: 'XAUUSD',
      direction: BROKER.direction, profitLoss: BROKER.profitLoss, openPrice: '2000', closePrice: '1999',
      commission: '0', swap: '0',
    } as any);
  } finally {
    (storage.storage as any).getJournalEntryById = realGet;
    (storage.storage as any).updateJournalEntry = realUpd;
  }
  return written;
}

const untouched = await runRepair([]);
check('with nothing locked, the repair still writes the outcome',
      Object.prototype.hasOwnProperty.call(untouched, 'outcome'), true);
check('...and the direction', Object.prototype.hasOwnProperty.call(untouched, 'direction'), true);

const locked = await runRepair(['outcome', 'profitLoss']);
check('a corrected outcome is NOT written back',
      Object.prototype.hasOwnProperty.call(locked, 'outcome'), false);
check('a corrected profitLoss is NOT written back',
      Object.prototype.hasOwnProperty.call(locked, 'profitLoss'), false);
// AND THE REASON THE REPAIR EXISTS MUST STILL WORK — everything he has not touched is still fixed.
check('a field he did NOT touch is still repaired',
      Object.prototype.hasOwnProperty.call(locked, 'direction'), true);
check('...and so is the R he did not touch',
      Object.prototype.hasOwnProperty.call(locked, 'achievedRR'), true);
check('his notes survive the merge', locked.manualFields?.note, 'his note');
check('and the lock list survives, so the next sync also respects it',
      locked.manualFields?.[EDIT_LOCK_KEY], ['outcome', 'profitLoss']);

// ── TEETH ──────────────────────────────────────────────────────────────────
console.log('\n  teeth — the behaviour before the fix must fail these:');
check('  the old repair wrote every field unconditionally',
      Object.keys(untouched).filter(k => k !== 'manualFields').length > 10, true);
check('  so a locked run must write strictly fewer fields',
      Object.keys(locked).length < Object.keys(untouched).length, true);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
