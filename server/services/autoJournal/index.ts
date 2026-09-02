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
import { buildJournalEntry, timingFields } from './fields';
import { record } from './events';

export { classifyOutcome, buildJournalEntry, timingFields } from './fields';
export { computeRisk } from './risk';
export { record, recordSoon } from './events';
export type { SyncStage } from './events';

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

  try {
    const entry = buildJournalEntry(trade, sessionId);

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

    const journalEntry = await storage.createJournalEntry(finalEntry);
    await storage.markSyncedTradeJournaled(trade.id, journalEntry.id);

    await record({
      brokerAccountId: trade.brokerAccountId, externalId: trade.externalId, symbol: trade.symbol,
      stage: 'journaled',
      detail: `${finalEntry.outcome} ${finalEntry.profitLoss}`
              + (finalEntry.achievedRR != null ? ` · ${finalEntry.achievedRR}R` : ' · no R (no original stop)')
              + (finalEntry.riskReward != null ? ` of a planned ${finalEntry.riskReward}R` : ''),
    });
    return journalEntry.id;
  } catch (err: any) {
    await record({ brokerAccountId: trade.brokerAccountId, externalId: trade.externalId,
                   symbol: trade.symbol, stage: 'failed',
                   detail: `could not journal: ${err?.message ?? err}` });
    return null;
  }
}

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
  const fields = timingFields(trade);
  if (!Object.keys(fields).length) return;
  await storage.updateJournalEntry(trade.journalEntryId, fields);
  await record({
    brokerAccountId: trade.brokerAccountId, externalId: trade.externalId, symbol: trade.symbol,
    stage: 'backfilled',
    detail: `journal timing corrected — held ${fields.tradeDuration ?? '?'} min, ${fields.sessionName}`,
  });
}

/**
 * Recompute an existing entry's risk numbers once the ORIGINAL stop is known.
 *
 * Same shape as the timing repair and for the same reason: the live feed cannot supply the original
 * stop (it only ever sees the position as it closes), so an entry written from it has the wrong risk
 * — or, for a trade taken to breakeven, none at all. The sweep reads the entry order, which has it.
 */
export async function repairJournalRisk(trade: SyncedTrade): Promise<void> {
  if (!trade.journalEntryId || !trade.originalStopLoss) return;
  const rebuilt = buildJournalEntry(trade, null);
  await storage.updateJournalEntry(trade.journalEntryId, {
    stopLoss:           rebuilt.stopLoss,
    takeProfit:         rebuilt.takeProfit,
    stopLossDistance:   rebuilt.stopLossDistance,
    takeProfitDistance: rebuilt.takeProfitDistance,
    riskReward:         rebuilt.riskReward,
    achievedRR:         rebuilt.achievedRR,
  });
  await record({
    brokerAccountId: trade.brokerAccountId, externalId: trade.externalId, symbol: trade.symbol,
    stage: 'backfilled',
    detail: `risk corrected from the entry order — risked ${rebuilt.stopLossDistance ?? '?'} pips, `
            + `achieved ${rebuilt.achievedRR ?? '?'}R of a planned ${rebuilt.riskReward ?? '?'}R`,
  });
}
