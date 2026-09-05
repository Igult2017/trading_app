/**
 * PUTTING AN EXISTING ENTRY BACK IN STEP WITH THE TRADE.
 *
 * Three jobs, and the difference between them is the whole design:
 *
 *   repairJournalTiming  — the CLOCK, once the sweep learns the real open time.
 *   repairJournalDerived — CORRECTS a value we know is WRONG (the live feed defaults the direction
 *                          to Short, and that flag also signs the money).
 *   healJournalBlanks    — FILLS a blank and nothing else, so it is safe to run every pass.
 *
 * All three stop dead at a field he has corrected by hand. Split out of ./index on 2026-09-05 when
 * that file passed 370 lines; nothing else changed, and index.ts re-exports every name so no caller
 * had to move.
 */
import { storage } from '../../storage';
import type { SyncedTrade } from '../../../shared/schema';
import { buildJournalEntry, timingFields } from './fields';
import { contextFor, newsEnvironmentAt } from './context';
import { record } from './events';

/**
 * A HAND EDIT WINS OVER THE BROKER, FOR EVER.
 *
 * These are the fields `repairJournalDerived` below rebuilds from the broker's numbers. Once he has
 * corrected one by hand, the sync must never put its own value back — his report, 2026-09-05:
 * *"i am unable to edit and make corrections to trade vault for auto synced trades."* The edit was
 * saving and then being reverted on the next sync pass, which is also why a trade he re-classified
 * as break-even kept returning as a loss.
 *
 * `PUT /api/journal/entries/:id` writes the names he touched into `manualFields[EDIT_LOCK_KEY]`;
 * the repair reads them back and leaves those alone. Anything he has NOT touched is still repaired,
 * so the reason the repair exists — the live feed records a trade with no open time and no original
 * stop, and the later sweep learns them — keeps working.
 *
 * Both sides import from here so the two lists cannot drift apart.
 */
export const EDIT_LOCK_KEY = '__editedByHand';
export const EDIT_LOCKABLE_FIELDS = [
  'direction', 'profitLoss', 'pipsGainedLost', 'stopLoss', 'takeProfit',
  'stopLossDistance', 'takeProfitDistance', 'riskReward', 'achievedRR',
  'outcome', 'primaryExitReason', 'orderType', 'entryTF', 'mae', 'mfe',
  // ADDED 2026-09-05 with the R:R fix. `riskReward` now carries the ACHIEVED multiple and
  // `plannedRR` the plan, so both are rebuilt and both must stop at a hand edit.
  'plannedRR',
] as const;

/**
 * THE CLOCK FIELDS — a separate list because a DIFFERENT function writes them.
 *
 * `repairJournalTiming` overwrites these when the sweep finally learns the real open time, and it
 * has to respect a hand correction for the same reason the rebuild does. They are not in the list
 * above because that one is pinned, field by field, to what `repairJournalDerived` writes.
 */
export const EDIT_LOCKABLE_TIMING_FIELDS = [
  'entryTime', 'entryTimeUTC', 'dayOfWeek', 'tradeDuration',
  'sessionName', 'sessionPhase',
] as const;

/** Every field a hand edit can pin. The PUT endpoint records from this. */
export const EDIT_LOCKABLE_ALL = [
  ...EDIT_LOCKABLE_FIELDS, ...EDIT_LOCKABLE_TIMING_FIELDS,
] as const;


/**
 * Correct an existing entry's timing once the real open time arrives.
 *
 * The live feed records a trade the instant it closes and has no open time; the 15-minute sweep
 * pairs the two deals and does. Until that lands, the entry has no holding time, no day of week and
 * a session derived from the close — which on 01 Sep filed a LONDON/NY OVERLAP trade as LONDON.
 *
 * Only the timing fields are touched. His notes, tags and screenshots live on the same row and a
 * sync must never overwrite those.
 */
export async function repairJournalTiming(trade: SyncedTrade): Promise<void> {
  if (!trade.journalEntryId || !trade.openTime) return;
  const fields: Record<string, any> = timingFields(trade);
  // A CLOCK HE HAS SET BY HAND WINS, same rule as the rebuild. Without this, correcting a session
  // in the Trade Vault would be reverted the moment the sweep supplied a real open time.
  for (const f of await editedByHand(trade.journalEntryId)) delete fields[f];
  if (!Object.keys(fields).length) return;
  await storage.updateJournalEntry(trade.journalEntryId, fields);
  await record({
    brokerAccountId: trade.brokerAccountId, externalId: trade.externalId, symbol: trade.symbol,
    stage: 'backfilled',
    detail: `journal timing corrected — ${Object.keys(fields).join(', ')}`,
  });
}

/** The fields he has corrected by hand on one entry. Empty when the row cannot be read. */
async function editedByHand(journalEntryId: string): Promise<string[]> {
  try {
    const entry = await storage.getJournalEntryById(journalEntryId);
    const lock = ((entry?.manualFields ?? {}) as Record<string, unknown>)[EDIT_LOCK_KEY];
    return Array.isArray(lock) ? lock.filter((k): k is string => typeof k === 'string') : [];
  } catch { return []; }
}

/**
 * REBUILD EVERYTHING THE ENTRY DERIVES FROM THE TRADE'S OWN NUMBERS.
 *
 * The live feed records a trade the instant it closes, from one event that turns out to be missing
 * things: the open time, the risk as placed, and — worst — the DIRECTION, which it defaults to Short
 * and which also signs the money. The sweep fixes the trade row; this puts the entry back in step.
 *
 * WHAT IS REBUILT: direction, P&L, pips, the stop and target actually placed, their distances, the
 * planned and achieved R, the exit reason, the order type, the strategy and the entry timeframe.
 *
 * WHAT IS NEVER TOUCHED: his notes. `storage.updateJournalEntry` REPLACES a JSONB column rather than
 * merging it (`.set(...)` in storage.ts), so passing `manualFields` wholesale would wipe every note,
 * tag and screenshot on the row. The existing blob is read and merged, exactly as the manual PUT
 * endpoint does for the same reason.
 */
export async function repairJournalDerived(trade: SyncedTrade): Promise<void> {
  if (!trade.journalEntryId) return;
  const at = trade.openTime ? new Date(trade.openTime)
                            : (trade.closeTime ? new Date(trade.closeTime) : null);
  const rebuilt = buildJournalEntry(trade, null, await contextFor(trade),
                                    await newsEnvironmentAt(trade.symbol, at));

  // MERGE, NEVER REPLACE — see the note above. Only our own keys are overwritten.
  let manualFields: any = rebuilt.manualFields;
  let edited: string[] = [];
  try {
    const existing = await storage.getJournalEntryById(trade.journalEntryId);
    const his = (existing?.manualFields ?? {}) as Record<string, unknown>;
    // WHICH FIELDS HE HAS CORRECTED BY HAND. Read before the merge, because the merge is what
    // would otherwise carry our value over his. See EDIT_LOCK_KEY at the top of this file.
    const lock = his[EDIT_LOCK_KEY];
    edited = Array.isArray(lock) ? lock.filter((k): k is string => typeof k === 'string') : [];
    manualFields = { ...his, ...(rebuilt.manualFields as Record<string, unknown>) };
    // His list survives our merge — `rebuilt.manualFields` does not carry the key, but being
    // explicit means a future field added there cannot quietly wipe it.
    if (edited.length) manualFields[EDIT_LOCK_KEY] = edited;
  } catch {
    // Could not read it back: leave the blob ALONE rather than risk overwriting his notes with ours.
    // AND REPAIR NOTHING — without the list we cannot tell which fields are his, and reverting one
    // of his corrections is worse than leaving a broker field stale for one more cycle.
    await record({ brokerAccountId: trade.brokerAccountId, externalId: trade.externalId,
                   symbol: trade.symbol, stage: 'failed',
                   detail: 'skipped the rebuild — could not read the entry back to see which '
                         + 'fields he had corrected by hand' });
    return;
  }

  const patch: Record<string, any> = {
    direction:          rebuilt.direction,
    profitLoss:         rebuilt.profitLoss,
    pipsGainedLost:     rebuilt.pipsGainedLost,
    stopLoss:           rebuilt.stopLoss,
    takeProfit:         rebuilt.takeProfit,
    stopLossDistance:   rebuilt.stopLossDistance,
    takeProfitDistance: rebuilt.takeProfitDistance,
    riskReward:         rebuilt.riskReward,
    // THE PLAN, which this rebuild never carried. `riskReward` used to hold it; it now holds the
    // ACHIEVED multiple, to match what the manual form writes into that column.
    plannedRR:          (rebuilt as any).plannedRR,
    achievedRR:         rebuilt.achievedRR,
    outcome:            rebuilt.outcome,
    primaryExitReason:  rebuilt.primaryExitReason,
    orderType:          rebuilt.orderType,
    entryTF:            rebuilt.entryTF,
    // HOW FAR IT RAN EACH WAY. These were MISSING from this list, and that broke the feature end to
    // end (found by audit, 2026-09-04).
    //
    // The marks cannot exist when the entry is first written: the live feed stores a trade the
    // instant it closes and `marksFor` only runs on a LATER sync, in the already-seen branch of
    // `processIncomingTrades`. So every live-recorded trade was journaled with them blank, the sync
    // then filled them onto `synced_trades`, and **nothing ever carried them across**. His ask was
    // *"we can extend it to also record this MAE/MFE in the journal"* — they reached the trade row
    // and never the journal, and `metrics_calculator.py`'s breakdown had nothing to show.
    mae:                rebuilt.mae,
    mfe:                rebuilt.mfe,
  };

  // ANYTHING HE HAS CORRECTED IS REMOVED FROM THE WRITE ENTIRELY — not set to undefined and left to
  // the query builder to skip, which would make the whole fix depend on how Drizzle treats an
  // undefined value in .set(). Deleting the key is unambiguous whatever the builder does.
  for (const f of edited) delete patch[f];

  if (manualFields) patch.manualFields = manualFields;
  await storage.updateJournalEntry(trade.journalEntryId, patch);

  await record({
    brokerAccountId: trade.brokerAccountId, externalId: trade.externalId, symbol: trade.symbol,
    stage: 'backfilled',
    detail: `journal entry rebuilt — ${rebuilt.direction} ${rebuilt.outcome} `
            + `${rebuilt.profitLoss}, achieved ${rebuilt.achievedRR ?? '?'}`
            + ((rebuilt as any).plannedRR ? ` of a planned ${(rebuilt as any).plannedRR}` : '')
            + (rebuilt.primaryExitReason ? `, exit: ${rebuilt.primaryExitReason}` : ''),
  });
}

/**
 * FILL IN WHAT AN ENTRY NEVER RECEIVED — and never touch anything that already has a value.
 *
 * HIS REPORT, 2026-09-05: *"It does not record whether trade was bearish or bullish, it does not
 * record time, it does not record sessions. All that information comes from the live trade data
 * points."* He is right, and the reason is a hole between the two repair functions:
 *
 *   - `repairJournalDerived` rebuilds fifteen fields — but the ENTRY TIME, the session, the day of
 *     week and the holding time are not among them, and never were.
 *   - `repairJournalTiming` does write exactly those — but it fires from ONE place, and only at the
 *     instant the sweep first supplies an open time (`brokerSyncService`: `!existing.openTime &&
 *     raw.openTime`). Once the trade row HAS an open time that condition can never be true again.
 *
 * So an entry written by the live feed before its open time arrived — which is every live-recorded
 * trade, the feed stores a trade the moment it closes and that event carries no open time — kept a
 * blank entry time and holding time PERMANENTLY, and its session was the one derived from the close.
 * Nothing in the system would ever go back for them. The metrics page's session, day-of-week and
 * hold-time breakdowns then have nothing to group those trades by.
 *
 * The self-heal already in the sync asks `!entry.primaryExitReason` — one field standing in for the
 * question "is this entry stale?". This asks the question directly instead, of every field, so a
 * field added in future is covered without anyone remembering to add a proxy for it.
 *
 * THREE RULES, and they are what make it safe to run on every pass:
 *   1. ONLY FILLS A BLANK. A value already on the row is never overwritten — that is what
 *      `repairJournalDerived` is for, and it is called from the places that know a value is WRONG.
 *   2. A HAND EDIT IS UNTOUCHABLE, the same list and the same reason as the rebuild.
 *   3. SELF-LIMITING. Once a field is filled it stops matching, so this costs one read per trade
 *      until there is nothing left to fill and nothing at all after that.
 */
const HEALABLE_FIELDS = [
  // The clock — the gap this was written for.
  'entryTime', 'entryTimeUTC', 'exitTime', 'dayOfWeek', 'tradeDuration',
  'sessionName', 'sessionPhase',
  // Everything else the broker's own numbers can supply.
  'direction', 'instrument', 'entryPrice', 'lotSize', 'riskPercent',
  'stopLoss', 'takeProfit', 'stopLossDistance', 'takeProfitDistance',
  'riskReward', 'plannedRR', 'achievedRR', 'pipsGainedLost', 'outcome', 'profitLoss', 'commission',
  'primaryExitReason', 'orderType', 'entryTF', 'analysisTF', 'contextTF', 'mae', 'mfe',
  'monetaryRisk', 'potentialReward',
] as const;

/** Blank means "nothing was ever written here" — `0` and `"0"` are real values, not blanks. */
const isBlank = (v: unknown) => v === null || v === undefined || v === '';

export async function healJournalBlanks(trade: SyncedTrade, entry: any): Promise<void> {
  if (!trade.journalEntryId || !entry) return;

  const rebuilt: Record<string, any> = {
    ...buildJournalEntry(trade, null, await contextFor(trade)),
    // The real open time wins over the close-time substitute wherever it exists.
    ...timingFields(trade),
  };

  const lock   = ((entry.manualFields ?? {}) as Record<string, unknown>)[EDIT_LOCK_KEY];
  const edited = new Set(Array.isArray(lock) ? lock.filter((k): k is string => typeof k === 'string') : []);

  const patch: Record<string, any> = {};
  for (const f of HEALABLE_FIELDS) {
    if (edited.has(f)) continue;                 // his correction, never ours
    if (!isBlank(entry[f])) continue;            // already has a value — not our business
    if (isBlank(rebuilt[f])) continue;           // we have nothing better to offer
    patch[f] = rebuilt[f];
  }
  if (!Object.keys(patch).length) return;

  await storage.updateJournalEntry(trade.journalEntryId, patch);
  await record({
    brokerAccountId: trade.brokerAccountId, externalId: trade.externalId, symbol: trade.symbol,
    stage: 'backfilled',
    detail: `filled in ${Object.keys(patch).join(', ')} — the entry was written without them`,
  });
}
