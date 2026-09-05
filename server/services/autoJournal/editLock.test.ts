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
import { EDIT_LOCK_KEY, EDIT_LOCKABLE_FIELDS, EDIT_LOCKABLE_TIMING_FIELDS,
         EDIT_LOCKABLE_ALL } from './index';

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
  fs.readFileSync(new URL('./repair.ts', import.meta.url), 'utf8'));   // the repairs live here now
const patchBlock = src.slice(src.indexOf('const patch: Record<string, any> = {'),
                             src.indexOf('for (const f of edited) delete patch[f];'));
const missing = EDIT_LOCKABLE_FIELDS.filter(f => !new RegExp(`\\b${f}:`).test(patchBlock));
check('every lockable field is in the rebuild', missing, []);

// The clock fields are written by a DIFFERENT function, so they are pinned to that one instead.
const fieldsSrcForTiming = await import('fs').then(fs =>
  fs.readFileSync(new URL('./fields.ts', import.meta.url), 'utf8'));
const timingBlock = fieldsSrcForTiming.slice(
  fieldsSrcForTiming.indexOf('export function timingFields'));
const missingTiming = EDIT_LOCKABLE_TIMING_FIELDS
  .filter(f => !new RegExp(`\\b${f}:`).test(timingBlock));
check('every lockable CLOCK field is one timingFields writes', missingTiming, []);
check('the two lists together are the one the PUT records from',
      [...EDIT_LOCKABLE_ALL].sort(),
      [...EDIT_LOCKABLE_FIELDS, ...EDIT_LOCKABLE_TIMING_FIELDS].sort());

const routesSrc = await import('fs').then(fs => fs.readFileSync('server/routes.ts', 'utf8'));
check('the routes side imports the same constants, not its own copy',
      /import \{ EDIT_LOCK_KEY, EDIT_LOCKABLE_ALL \} from "\.\/services\/autoJournal"/
        .test(routesSrc), true);
// A PUT that recorded only the rebuild list would leave a corrected session unprotected.
check('...and records from the FULL list, clock fields included',
      /new Set<string>\(EDIT_LOCKABLE_ALL\)/.test(routesSrc), true);

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

// ── 3. THE BLANKS THE REBUILD NEVER COVERED ────────────────────────────────
// His report, 2026-09-05: *"It does not record whether trade was bearish or bullish, it does not
// record time, it does not record sessions."* `repairJournalDerived` above writes fifteen fields and
// NONE of them is the entry time, the session, the day of week or the holding time. The one function
// that writes those fires only at the instant an open time first arrives, so an entry that missed
// that moment kept its blanks for ever. `healJournalBlanks` fills them — and only them.
console.log('\n3. healJournalBlanks fills a blank and touches nothing else:');

const TRADE = {
  id: 't1', journalEntryId: 'j1', brokerAccountId: 'b1', externalId: 'x1', symbol: 'XAUUSD',
  direction: 'Short', profitLoss: '-51.03', openPrice: '2000', closePrice: '1999',
  commission: '0', swap: '0',
  openTime:  new Date('2026-09-01T09:15:00Z'),
  closeTime: new Date('2026-09-01T14:49:26Z'),
} as any;

/** Runs the heal against a stored entry and returns the patch it tried to write. */
async function runHeal(entry: Record<string, any>): Promise<Record<string, any>> {
  let written: Record<string, any> | null = null;
  const storage = await import('../../storage');
  const realUpd = (storage.storage as any).updateJournalEntry;
  (storage.storage as any).updateJournalEntry = async (_id: string, patch: any) => { written = patch; return {}; };
  const { healJournalBlanks } = await import('./index');
  try { await healJournalBlanks(TRADE, entry); }
  finally { (storage.storage as any).updateJournalEntry = realUpd; }
  return written ?? {};
}

const blank = await runHeal({ manualFields: { note: 'his note' } });
check('a blank entry time is filled from the trade',   blank.entryTime,   '2026-09-01T09:15:00.000Z');
check('a blank session is filled',                     typeof blank.sessionName, 'string');
check('a blank day of week is filled',                 blank.dayOfWeek,   'Tuesday');
check('a blank holding time is filled',                blank.tradeDuration, '334');
check('a blank direction is filled',                   blank.direction,   'Short');

// THE OTHER HALF, and the one that makes it safe to run every pass: a value already on the row is
// never replaced. That is `repairJournalDerived`'s job, and it is called where a value is KNOWN wrong.
const full = await runHeal({
  entryTime: '2026-01-01T00:00:00.000Z', sessionName: 'TOKYO', dayOfWeek: 'Friday',
  tradeDuration: '7', direction: 'Long', manualFields: {},
});
for (const f of ['entryTime', 'sessionName', 'dayOfWeek', 'tradeDuration', 'direction'])
  check(`a value already there is left alone — ${f}`,
        Object.prototype.hasOwnProperty.call(full, f), false);

// AND A HAND EDIT STILL WINS, even over a blank — he may have cleared it on purpose.
const heldByHand = await runHeal({
  manualFields: { [EDIT_LOCK_KEY]: ['sessionName', 'direction'] },
});
check('a hand-edited session is not filled',   Object.prototype.hasOwnProperty.call(heldByHand, 'sessionName'), false);
check('a hand-edited direction is not filled', Object.prototype.hasOwnProperty.call(heldByHand, 'direction'),   false);
check('...while the rest is still filled',     heldByHand.entryTime, '2026-09-01T09:15:00.000Z');

// `0` IS A VALUE, NOT A BLANK. Reading it as one would overwrite a real zero every single pass.
const zeroed = await runHeal({ mae: '0', mfe: 0, profitLoss: '0', manualFields: {} });
for (const f of ['mae', 'mfe', 'profitLoss'])
  check(`zero counts as a value, not a blank — ${f}`,
        Object.prototype.hasOwnProperty.call(zeroed, f), false);

// ── TEETH ──────────────────────────────────────────────────────────────────
console.log('\n  teeth — the behaviour before the fix must fail these:');
check('  the rebuild carries NO clock field, which is why the heal exists',
      EDIT_LOCKABLE_TIMING_FIELDS.some(f => (EDIT_LOCKABLE_FIELDS as readonly string[]).includes(f)), false);
check('  a heal that overwrote a filled field WOULD be caught',
      ['entryTime','sessionName','dayOfWeek','tradeDuration','direction'].filter(f => f in full), []);
check('  the old repair wrote every field unconditionally',
      Object.keys(untouched).filter(k => k !== 'manualFields').length > 10, true);
check('  so a locked run must write strictly fewer fields',
      Object.keys(locked).length < Object.keys(untouched).length, true);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
