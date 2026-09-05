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
import { db } from '../../db';
import { autotradeOrders, tradingSignals } from '../../../shared/schema';
import { eq, desc } from 'drizzle-orm';
import type { SyncedTrade } from '../../../shared/schema';
import { enrichTradeWithBalance } from '../balanceTracker';
import { buildJournalEntry, timingFields } from './fields';
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
] as const;

export { classifyOutcome, buildJournalEntry, timingFields } from './fields';
export { computeRisk } from './risk';
export { record, recordSoon } from './events';
export type { SyncStage } from './events';

/**
 * WHAT PLACED THIS TRADE, for a trade autotrade opened. Null for one he placed by hand.
 *
 * His report, 2026-09-03: *"some details of trades autosynced are not recorded there."* The metrics
 * page groups by strategy and by entry timeframe, and a synced trade had neither, so every one sat
 * in an "Unknown" bucket beside his typed trades.
 *
 * THE JOIN IS EXACT, not a guess: the position's OPENING deal carries the id of the order that
 * opened it, autotrade recorded that same id when it placed, and the order row carries the signal.
 *
 *     synced_trades.entry_order_id -> autotrade_orders.order_id -> .strategy
 *                                                              -> .signal_id -> trading_signals
 *
 * NEVER RAISES and never blocks the journal entry. A trade with no strategy is still a trade; the
 * fields are simply left blank, which is what a hand-placed trade correctly looks like.
 */
export async function contextFor(trade: SyncedTrade): Promise<{ strategy?: string; entryTF?: string }> {
  if (!trade.entryOrderId) return {};
  try {
    const [order] = await db.select().from(autotradeOrders)
      .where(eq(autotradeOrders.orderId, String(trade.entryOrderId)))
      .orderBy(desc(autotradeOrders.placedAt)).limit(1);
    if (!order) return {};
    const out: { strategy?: string; entryTF?: string } = {};
    if (order.strategy) out.strategy = order.strategy;
    if (order.signalId) {
      const [sig] = await db.select().from(tradingSignals)
        .where(eq(tradingSignals.id, order.signalId)).limit(1);
      // THE TIMEFRAME THE ENTRY WAS TAKEN ON — `executionTimeframe` is that by definition; the
      // primary one is the timeframe the setup was READ on, which is a different question and
      // belongs in `analysisTF`, not here.
      if (sig?.executionTimeframe) out.entryTF = sig.executionTimeframe;
    }
    return out;
  } catch (err: any) {
    console.warn(`[autoJournal] could not look up what placed ${trade.externalId}: `
                 + `${err?.message ?? err}`);
    return {};
  }
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

  try {
    const entry = buildJournalEntry(trade, sessionId, await contextFor(trade));

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
  const rebuilt = buildJournalEntry(trade, null, await contextFor(trade));

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
            + `${rebuilt.profitLoss}, ${rebuilt.achievedRR ?? '?'}R`
            + (rebuilt.primaryExitReason ? `, exit: ${rebuilt.primaryExitReason}` : ''),
  });
}
