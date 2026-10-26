/**
 * DELETING ONE JOURNAL ENTRY — the whole of it, in one place.
 *
 * ⚠ WHY IT IS ITS OWN FUNCTION. Deleting an entry is not a row removal. It also has to REMEMBER
 * that he chose to delete it, or the next sync sweep writes the trade straight back — his report,
 * 2026-10-04: *"I try deleting trades from my synced account and it keeps getting rerecorded."*
 *
 * On 2026-10-26 he asked for a way to delete several at once: *"Tradevault should allow me to
 * select more than one item then delete them once not one by one."* A second delete path is
 * exactly where that memory gets forgotten — one route marking the trade and the other not would
 * mean a bulk delete silently came back at the next sweep, and looked like a different bug.
 * So both routes call this.
 *
 * ⚠ WHAT IT DELIBERATELY DOES NOT DO: clear the computed caches. A bulk delete clears them ONCE
 * at the end instead of once per entry, which is why that step stays with the caller.
 */
import { storage } from '../storage';
import { record as recordSyncEvent } from '../services/autoJournal';
import type { JournalEntry } from '../../shared/schema';

export interface DeletedEntry {
  id: string;
  /** How many broker trades were released and marked as deleted on purpose. */
  released: number;
}

/**
 * Remove one entry and record that its absence was his decision.
 *
 * The caller has already proved the entry is his — this does not re-check ownership, because the
 * bulk route checks the whole batch in one query and re-reading each row would be the slow way to
 * reach the same answer.
 */
export async function deleteJournalEntryFully(entry: JournalEntry): Promise<DeletedEntry | null> {
  const ok = await storage.deleteJournalEntry(entry.id);
  if (!ok) return null;

  // THE MARK IS WHAT STOPS IT COMING BACK. Automatic paths — the sweep, the live feed, the
  // missed-close watcher — see it and never re-journal. Pressing Sync on the account clears it and
  // rebuilds, which is him asking explicitly. Both of his instructions are satisfied by the
  // TRIGGER differing, not by deletion behaving differently.
  const released = await storage.markSyncedTradeJournalDeleted(entry.id).catch(() => 0);
  if (released) {
    // ONE AUDIT ROW AT THE MOMENT OF THE DECISION — not one per sweep, which would add a row
    // every time the sweep passed over the same deleted trade, for ever.
    await recordSyncEvent({
      externalId: null,
      symbol: entry.instrument ?? null,
      stage: 'journal-deleted',
      detail: `he deleted the journal entry for ${released} synced trade(s) — automatic syncs `
            + `will not write it again`,
    }).catch(() => {});
  }
  return { id: entry.id, released };
}
