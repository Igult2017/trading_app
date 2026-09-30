/**
 * THE ONE WAY A BROKER TRADE BECOMES A JOURNAL ENTRY.
 *
 * The sync calls `journalSyncedTrade` and nothing else. Everything the automatic path decides about
 * a trade lives in this folder; see ./fields for the isolation rule this exists to enforce.
 *
 * WHY THIS IS A SEPARATE MODULE AT ALL, in his words (2026-09-02): *"the manual one is working fine
 * so dont tamper with it even a bit. Just create a different pipeline for autojournaling."* Before
 * this, automatic journaling lived inside `brokerSyncService.ts` next to the ingestion code and
 * shared its helpers with the manual endpoint, so a change aimed at one could reach the other.
 * `brokerSyncService.ts` now does ingestion only — fetch, de-duplicate, store.
 */
import { storage } from '../../storage';
import type { SyncedTrade } from '../../../shared/schema';
import { enrichTradeWithBalance } from '../balanceTracker';
import { buildJournalEntry } from './fields';
import { contextFor, newsEnvironmentAt } from './context';
import { record } from './events';

export { classifyOutcome, buildJournalEntry, timingFields } from './fields';
export { computeRisk } from './risk';
export { record, recordSoon } from './events';
export type { SyncStage } from './events';
export { contextFor, marketContextFor, newsEnvironmentAt } from './context';
export type { TradeContext } from './context';
// THE REPAIRS LIVE IN ./repair — re-exported here so every existing caller and test keeps working.
export {
  EDIT_LOCK_KEY, EDIT_LOCKABLE_FIELDS, EDIT_LOCKABLE_TIMING_FIELDS, EDIT_LOCKABLE_ALL,
  repairJournalTiming, repairJournalDerived, healJournalBlanks,
} from './repair';

/** `"1:2"` or `"2"` -> 2. Same shape as the form's own `parseRRNum` (JournalForm.tsx:1383). */
function parseRRNum(v: unknown): number {
  const s = String(v ?? '');
  if (!s) return 0;
  const n = parseFloat(s.includes(':') ? s.split(':').pop()! : s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Write the journal entry for one synced trade. Returns its id, or null if it was not written.
 *
 * NEVER THROWS. A trade that is stored but cannot be journaled must not take the sync down with it —
 * the other trades in the batch still need recording.
 */
export async function journalSyncedTrade(
  trade: SyncedTrade,
  sessionId?: string | null,
): Promise<string | null> {
  if (trade.journalEntryId) return trade.journalEntryId;   // already journaled — never write twice

  // AND ASK THE ENTRIES THEMSELVES, because the pointer above can be null while an entry exists.
  //
  // ONE DEMO TRADE WAS JOURNALED THREE TIMES (321984806, at 21:58, 22:17 and 22:58 on 2026-09-29), each
  // pass reporting "it was stored but had no journal entry until now". Every guard in the pipeline asked
  // the same question — is `synced_trades.journal_entry_id` set? — so the instant that column was null
  // for any reason, the whole pipeline agreed the trade had never been journaled and wrote another entry.
  // Nothing compared against the entries that already existed.
  //
  // This is the question that cannot be wrong: does an entry already NAME this trade? If one does, the
  // pointer is simply re-stamped and that entry returned, which repairs the row instead of duplicating it.
  const already = await storage.getJournalEntryBySyncedTrade(trade.id).catch(() => null);
  if (already) {
    await storage.markSyncedTradeJournaled(trade.id, already.id).catch(() => {});
    console.warn(`[autoJournal] ${trade.symbol} ${trade.externalId} already had journal entry `
                 + `${already.id} but the trade had lost its pointer to it — re-linked instead of `
                 + `writing a second entry`);
    await record({ brokerAccountId: trade.brokerAccountId, externalId: trade.externalId,
                   symbol: trade.symbol, stage: 'relinked',
                   detail: `the trade had lost its pointer to entry ${already.id}; re-linked rather `
                           + `than journaling it twice` });
    return already.id;
  }

  try {
    const at = trade.openTime ? new Date(trade.openTime)
                              : (trade.closeTime ? new Date(trade.closeTime) : null);
    const entry = buildJournalEntry(trade, sessionId, await contextFor(trade),
                                    await newsEnvironmentAt(trade.symbol, at));

    // THE SAME ENRICHMENT THE JOURNAL FORM GETS — called, never modified. `POST /api/journal/entries`
    // runs this before inserting and this path did not, so every synced trade had a blank
    // `accountBalance` and `monetaryRisk` while a typed trade had both. It is a no-op on
    // `profitLoss`, which is already the broker's real figure and must never be overwritten.
    //
    // AND IT MUST NEVER COST US THE TRADE. `getCurrentBalance` throws on a session that has been
    // deleted, which would drop the trade entirely — trading a blank balance column for a missing
    // trade, which is the wrong way round.
    const finalEntry = sessionId
      ? await enrichTradeWithBalance(sessionId, entry as Record<string, any>)
          .then(e => e as typeof entry)
          .catch(async (e: any) => {
            await record({ brokerAccountId: trade.brokerAccountId, externalId: trade.externalId,
                           symbol: trade.symbol, stage: 'failed',
                           detail: `balance enrichment skipped: ${e?.message ?? e}` });
            return entry;
          })
      : entry;

    // WHAT WAS ON THE TABLE IF IT HAD RUN TO TARGET. His form derives exactly this, at
    // `JournalForm.tsx:1461`: `potentialReward = monetaryRisk × plannedRR`. The enrichment above
    // supplies `monetaryRisk` (the money one R is worth); the plan is on the entry we just built.
    // Computed HERE rather than in `buildJournalEntry` because it needs the balance, which that
    // function deliberately knows nothing about.
    const risked = parseFloat(String((finalEntry as any).monetaryRisk ?? ''));
    const planned = parseRRNum((finalEntry as any).plannedRR);
    if (Number.isFinite(risked) && risked > 0 && planned > 0)
      (finalEntry as any).potentialReward = (risked * planned).toFixed(2);

    // THE ENTRY CARRIES THE TRADE'S IDENTITY. This is what `journal_entries_synced_trade_key` enforces,
    // and what makes the duplicate impossible rather than merely unlikely.
    const journalEntry = await storage.createJournalEntry({ ...finalEntry, syncedTradeId: trade.id } as any);

    // WRITING THE ENTRY AND BOOKMARKING IT ARE TWO SEPARATE WRITES, and if the second fails the
    // first is left ORPHANED: the trade still reads as un-journaled, so the next sync journals it
    // again and he ends up with the SAME TRADE TWICE in his journal — silently doubling it in every
    // metric. Nothing prevented that: the unique pair `externalId + brokerAccountId` is on
    // `synced_trades`, not on `journal_entries`. (Found by audit, 2026-09-04.)
    //
    // SO A FAILED BOOKMARK UNDOES THE ENTRY. The trade is then simply un-journaled, which the heal
    // in `brokerSyncService` already repairs on the next pass — the pipeline's own self-correcting
    // path, and a state it handles well. Deleting is safe precisely BECAUSE the bookmark failed:
    // nothing points at this entry, so nothing can be lost by removing it.
    try {
      await storage.markSyncedTradeJournaled(trade.id, journalEntry.id);
    } catch (markErr: any) {
      await storage.deleteJournalEntry(journalEntry.id).catch(() => {});
      throw new Error(`the entry was written but could not be bookmarked, so it was removed to `
                      + `avoid journaling this trade twice: ${markErr?.message ?? markErr}`);
    }

    await record({
      brokerAccountId: trade.brokerAccountId, externalId: trade.externalId, symbol: trade.symbol,
      stage: 'journaled',
      detail: `${finalEntry.outcome} ${finalEntry.profitLoss}`
              + (finalEntry.achievedRR != null ? ` · ${finalEntry.achievedRR}R` : ' · no R (no original stop)')
              + ((finalEntry as any).plannedRR != null ? ` of a planned ${(finalEntry as any).plannedRR}` : ''),
    });
    return journalEntry.id;
  } catch (err: any) {
    await record({ brokerAccountId: trade.brokerAccountId, externalId: trade.externalId,
                   symbol: trade.symbol, stage: 'failed',
                   detail: `could not journal: ${err?.message ?? err}` });
    return null;
  }
}

