/**
 * PUTTING RIGHT THE ROWS A SCALED-OUT TRADE ALREADY LEFT BEHIND.
 *
 * His report, 2026-09-26: *"Auto sync journal has a gap. In one trade, if i took profit at different
 * points, it is recording each profit taken as an individual trade."* The recording itself is fixed
 * where it was broken — `brokerAdapters/ctraderPositions.ts` now emits one trade per POSITION and only
 * once the position is finished. That stops it happening again. It does nothing about the rows already
 * in his journal, and those are what he is actually looking at.
 *
 * So this module does the other half, from the ordinary 15-minute sweep, with no migration to run and
 * nothing for him to press:
 *
 *   reconcileAggregate     the row that SURVIVES is restated from the whole position. The old code
 *                          keyed the trade on the last closing deal and sized it at that slice, so a
 *                          0.9-lot trade scaled out in three ended up recorded as 0.3 lots with a
 *                          third of the money. Same externalId, so the sweep finds it as a duplicate;
 *                          this is what makes that duplicate correct.
 *   retireSupersededParts  the rows for the SAME position under a different externalId were the other
 *                          take-profits. They are slices, not trades, and they are deleted with the
 *                          journal entries they created.
 *
 * WHY THE SURVIVOR IS THE FINAL SLICE'S ROW. The aggregate is keyed on the final closing deal's id
 * (see `ctraderPositions`), which for a position closed in ONE deal is byte-for-byte the id the old
 * code produced. So nothing already recorded correctly is touched, moved or re-created — the only
 * rows that change are the ones that were wrong.
 *
 * THREE THINGS IT WILL NOT DO.
 *   - It never deletes an entry he has TOUCHED. `manualFields.__editedByHand` is the same lock every
 *     repair in ./autoJournal respects, and his own note on a row is worth more than the tidiness of
 *     the list. Such a row is left alone and said out loud, in the log and in `sync_events`.
 *   - It never deletes an entry the automatic pipeline did not write (`manualFields.autoJournaled`).
 *     A trade he typed in himself is not ours to remove, whatever position id it happens to carry.
 *   - It never runs off a guess. A row is only ever retired when THIS sweep has aggregated the whole
 *     position from the broker's own deals and that aggregate says the trade came off in parts.
 *
 * Every deletion is written to `sync_events` first, so "where did that entry go?" has an answer that
 * survives the next deploy — the container log does not.
 */
import { storage } from '../storage';
import type { SyncedTrade } from '../../shared/schema';
import type { RawBrokerTrade } from './brokerSyncService';
import { record, EDIT_LOCK_KEY, repairJournalDerived, repairJournalTiming } from './autoJournal';

/** Two stored decimals compared as numbers — `"0.81"` and `"0.81000"` are the same size. */
function differs(stored: unknown, incoming: number | undefined, tolerance: number): boolean {
  if (incoming === undefined) return false;
  if (stored == null || stored === '') return true;
  const n = parseFloat(String(stored));
  if (!Number.isFinite(n)) return true;
  return Math.abs(n - incoming) > tolerance;
}

function sameTime(stored: unknown, incoming: Date | undefined): boolean {
  if (!incoming) return true;
  if (!stored) return false;
  return new Date(stored as any).getTime() === incoming.getTime();
}

/**
 * Restate a stored row from the WHOLE position, and rebuild its journal entry if anything moved.
 *
 * Returns true when it changed something. Only ever called with an aggregate the sweep built from the
 * broker's own deals, and only for a row whose externalId that aggregate owns.
 */
export async function reconcileAggregate(
  existing: SyncedTrade,
  raw: RawBrokerTrade,
  openTime?: Date,
  closeTime?: Date,
): Promise<boolean> {
  // PRICES TO HALF THE LAST STORED DECIMAL, money to the cent, size to a hundredth of a lot. Looser
  // than equality because the stored value is a `decimal` round-trip, tighter than anything that could
  // hide a slice being mistaken for the whole trade — a third of a position differs by a third.
  const changed =
       differs(existing.lots,       raw.lots,       0.00001)
    || differs(existing.openPrice,  raw.openPrice,  0.000005)
    || differs(existing.closePrice, raw.closePrice, 0.000005)
    || differs(existing.profitLoss, raw.profit,     0.01)
    || differs(existing.commission, raw.commission, 0.01)
    || differs(existing.swap,       raw.swap,       0.01)
    || !sameTime(existing.openTime,  openTime)
    || !sameTime(existing.closeTime, closeTime);
  if (!changed) return false;

  const was = `${existing.lots ?? '?'} lots ${existing.openPrice ?? '?'} -> `
            + `${existing.closePrice ?? '?'}, P/L ${existing.profitLoss ?? '?'}`;

  await storage.resizeSyncedTrade(existing.id, {
    lots:       raw.lots       != null ? String(raw.lots)       : undefined,
    openPrice:  raw.openPrice  != null ? String(raw.openPrice)  : undefined,
    closePrice: raw.closePrice != null ? String(raw.closePrice) : undefined,
    profitLoss: raw.profit     != null ? String(raw.profit)     : undefined,
    commission: raw.commission != null ? String(raw.commission) : undefined,
    swap:       raw.swap       != null ? String(raw.swap)       : undefined,
    openTime, closeTime,
    // THE LADDER, ONTO THE ROW ITSELF. `rawData` is what every later question about this trade is
    // answered from, and the slices are not recoverable once the window has moved on.
    rawData:    raw.rawData ?? (raw as unknown as Record<string, unknown>),
  });

  // The in-memory row is what the journal rebuild below reads, so it has to move too.
  const next = existing as any;
  if (raw.lots       != null) next.lots       = String(raw.lots);
  if (raw.openPrice  != null) next.openPrice  = String(raw.openPrice);
  if (raw.closePrice != null) next.closePrice = String(raw.closePrice);
  if (raw.profit     != null) next.profitLoss = String(raw.profit);
  if (raw.commission != null) next.commission = String(raw.commission);
  if (raw.swap       != null) next.swap       = String(raw.swap);
  if (openTime)  next.openTime  = openTime;
  if (closeTime) next.closeTime = closeTime;

  await record({ brokerAccountId: existing.brokerAccountId, externalId: existing.externalId,
                 symbol: existing.symbol, stage: 'backfilled',
                 detail: `RESTATED from the whole position (${raw.closedInParts ?? 1} exit(s)): `
                       + `was ${was}; now ${raw.lots ?? '?'} lots ${raw.openPrice ?? '?'} -> `
                       + `${raw.closePrice ?? '?'}, P/L ${raw.profit ?? '?'}` });
  console.log(`[ScaleOut] ${existing.symbol} ${existing.externalId}: restated from the whole `
              + `position — was ${was}; now ${raw.lots ?? '?'} lots, P/L ${raw.profit ?? '?'}`);

  if (existing.journalEntryId) {
    await repairJournalDerived(existing).catch(err =>
      console.error(`[ScaleOut] could not rebuild the journal entry for ${existing.externalId}: `
                    + `${err?.message ?? err}`));
    // AND THE CLOCK, WHICH THE REBUILD DOES NOT CARRY. `repairJournalDerived` writes fifteen fields and
    // the entry time, session, day of week and holding time are not among them — that is
    // `repairJournalTiming`, and it is the same hole that left every live-recorded trade with a blank
    // duration for ever (see ./autoJournal/repair). A restatement moves BOTH ends of the trade: the open
    // time becomes the first opening deal's and the close time the LAST slice's, so a 46-minute trade
    // recorded from its final partial had the wrong duration and possibly the wrong session. Both
    // repairs stop at a field he has corrected by hand.
    await repairJournalTiming(existing).catch(err =>
      console.error(`[ScaleOut] could not correct the timing on the journal entry for `
                    + `${existing.externalId}: ${err?.message ?? err}`));
  }
  return true;
}

/**
 * WHY A SUPERSEDED PART-EXIT ROW MUST BE KEPT, or null when it is safe to delete.
 *
 * Pure, and separate from the deleting, because this is the one decision in the change that DESTROYS
 * something. A rule that can only be exercised through the database is a rule nobody can test, and an
 * untested rule guarding his own corrections is not a guard.
 *
 * `entry` is the journal entry the row created, or null/undefined when it never got one — a row with no
 * entry has nothing of his on it and is a straightforward delete.
 */
export function whyKeep(entry: { manualFields?: unknown } | null | undefined): string | null {
  if (!entry) return null;
  const fields = (entry.manualFields ?? {}) as Record<string, unknown>;
  const lock = fields[EDIT_LOCK_KEY];
  // A FIELD HE HAS CORRECTED BY HAND PINS THE WHOLE ROW. The same lock every repair in ./autoJournal
  // respects: his note on a trade is worth more than the tidiness of the list, and a row he has touched
  // is one he has read.
  if (Array.isArray(lock) && lock.length > 0) return 'he has corrected it by hand';
  // AND A TRADE HE TYPED IN HIMSELF IS NOT OURS TO REMOVE, whatever position id it happens to carry.
  // Only the automatic pipeline stamps `autoJournaled`.
  if (fields.autoJournaled !== true) return 'it was not written by the auto-journal';
  return null;
}

/**
 * Delete the rows that were the OTHER take-profits of this position, and their journal entries.
 *
 * Returns how many trades it retired. A no-op unless the aggregate says the position came off in more
 * than one piece — a trade closed in one deal has no siblings and must not pay for a lookup.
 */
export async function retireSupersededParts(
  brokerAccountId: string,
  keepExternalId: string,
  raw: RawBrokerTrade,
): Promise<number> {
  if (!raw.positionId || (raw.closedInParts ?? 1) < 2) return 0;

  const siblings = (await storage.getSyncedTradesByPosition(brokerAccountId, raw.positionId)
    .catch(() => [] as SyncedTrade[]))
    .filter(t => t.externalId !== keepExternalId);
  if (!siblings.length) return 0;

  let retired = 0;
  for (const part of siblings) {
    const entry = part.journalEntryId
      ? await storage.getJournalEntryById(part.journalEntryId).catch(() => undefined)
      : undefined;

    // HIS WORK IS NOT OURS TO DELETE — see `whyKeep`. The row stays, wrong size and all, and the
    // reason is recorded where he can find it.
    const keepBecause = whyKeep(entry);
    if (keepBecause) {
      console.warn(`[ScaleOut] ${part.symbol} ${part.externalId} is one take-profit of position `
                   + `${raw.positionId}, which is now recorded whole as ${keepExternalId} — but `
                   + `${keepBecause}, so it is LEFT IN PLACE. Delete it yourself if it is a duplicate.`);
      await record({ brokerAccountId, externalId: part.externalId, symbol: part.symbol,
                     stage: 'skipped',
                     detail: `a superseded partial exit of position ${raw.positionId}, left in `
                           + `place because ${keepBecause}. The whole trade is ${keepExternalId}.` });
      continue;
    }
    // RECORDED BEFORE IT IS DELETED, never after. `sync_events` is in Postgres and the container log is
    // not, so this is the only answer to "where did that entry go?" that survives the next deploy — and
    // a write that happens after the delete is a write that a crash can skip.
    await record({ brokerAccountId, externalId: part.externalId, symbol: part.symbol,
                   stage: 'retired',
                   detail: `it was one of ${raw.closedInParts} take-profits on position `
                         + `${raw.positionId}, recorded as a trade of its own before the aggregation `
                         + `of 2026-09-26. The whole trade is ${keepExternalId}.` });
    if (entry) await storage.deleteJournalEntry(entry.id).catch(() => false);

    await storage.deleteSyncedTrade(part.id).catch(() => false);
    retired++;
    console.log(`[ScaleOut] retired ${part.symbol} ${part.externalId} — a partial exit of position `
                + `${raw.positionId}; the whole trade is ${keepExternalId}`);
  }
  return retired;
}
