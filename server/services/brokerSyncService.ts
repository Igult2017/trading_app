/**
 * Broker Sync Service — INGESTION ONLY.
 * ─────────────────────────────────────
 * Takes raw closed trades from a broker (the live push feed, the 15-minute sweep, or an EA webhook),
 * de-duplicates them, and stores them in `synced_trades`. Each user's data is isolated by userId.
 *
 * WHAT IT DELIBERATELY NO LONGER DOES: decide anything about a JOURNAL ENTRY. That moved to
 * `./autoJournal/` on 2026-09-02, on his instruction: *"make it to be a separate pipeline from the
 * manual journal entry and calculations because the manual one is working fine so dont tamper with
 * it even a bit."* Journal-entry logic used to sit in this file, beside the ingestion code and
 * sharing helpers with the manual endpoint, so a change aimed at one could reach the other.
 *
 * The single call into that pipeline is `journalSyncedTrade`. Nothing else here computes a journal
 * field.
 *
 * Connection modes supported:
 *   webhook — MT5/MT4 EA posts closed trades to POST /api/broker/webhook/:token
 *   api     — the cTrader live feed and the 15-minute sweep
 */
import { storage } from '../storage';
import type { InsertJournalEntry, SyncedTrade, BrokerAccount } from '../../shared/schema';
import { invalidateComputeCaches } from '../lib/cache';
import { toPips } from '../lib/pipMath';
import { journalSyncedTrade, repairJournalTiming, repairJournalDerived, record } from './autoJournal';
import { marksFor } from './autoJournal/marks';

// ── Auto-journal one synced trade ─────────────────────────────────────────────
// ── Process a batch of incoming trades (from webhook or poll) ─────────────────
export interface RawBrokerTrade {
  externalId: string;            // broker ticket / order ID (must be unique per account)
  symbol:     string;
  direction:  'Long' | 'Short';  // or 'buy'/'sell' — normalised below
  lots?:      number;
  openPrice?:  number;
  closePrice?: number;
  stopLoss?:   number;
  takeProfit?: number;
  // THE RISK AS PLACED, from the broker's entry order — NOT the stop the position closed on. See
  // `synced_trades.original_stop_loss` in shared/schema.ts for why the two must not be confused.
  // The broker's POSITION id. The high-water marks (how far the trade ran each way) are measured by
  // the Python monitor and keyed by this, so it is the join back to them.
  positionId?:         string;
  entryOrderId?:       string;
  originalStopLoss?:   number;
  originalTakeProfit?: number;
  // How the trade was entered — "STOP", "LIMIT", "MARKET". The metrics page breaks trades down by
  // this and every synced one was landing in "Unknown".
  orderType?:          string;
  // An ISO date string, OR a Unix timestamp in EITHER seconds or milliseconds — `toDate` decides
  // by magnitude, so an adapter reports whatever its broker gave it and converts nothing. The old
  // comment said "seconds", seven of the eight adapters sent something else, and nothing complained.
  openTime?:   string | number;
  closeTime?:  string | number;
  profit?:     number;
  commission?: number;
  swap?:       number;
  comment?:    string;
  magic?:      number;
  rawData?:    Record<string, unknown>;
}

function normaliseDirection(d: string): 'Long' | 'Short' {
  const l = d.toLowerCase();
  if (l === 'buy' || l === 'long') return 'Long';
  return 'Short';
}

/**
 * A broker's timestamp -> a Date, or undefined when it cannot be read honestly.
 *
 * THE UNIT IS DECIDED BY MAGNITUDE, NOT BY TYPE, and that is the whole fix. This used to read
 * "number = Unix seconds, string = date string", and SEVEN OF THE EIGHT ADAPTERS disagreed with it:
 *
 *   ctrader      String(ms / 1000)  a numeric STRING of seconds -> `new Date("1788123600")`
 *                                   -> **Invalid Date**, which is TRUTHY, so every downstream
 *                                   `t ? t.toISOString() : undefined` guard sailed past it and threw
 *                                   `RangeError: Invalid time value`. That is the "Issues syncing"
 *                                   error on the accounts page, on the account the signal platform
 *                                   itself uses.
 *   binance, bitget, bitunix,       milliseconds passed as a number -> multiplied by 1000 again
 *   bybit, dxtrade, tradelocker     -> trades silently dated to the year 58,633. No error, no crash;
 *                                   just history that can never appear in any date-ranged view.
 *   coinbase                        an ISO string — the only one that matched the old rule.
 *
 * A Unix timestamp for any plausible trade is ~1e9 in seconds and ~1e12 in milliseconds, so the
 * magnitude separates them with three orders of magnitude to spare: 1e11 is the year 5138 read as
 * seconds and 1973 read as milliseconds. Nothing real lands near the boundary.
 *
 * IT NEVER RETURNS AN INVALID DATE. That is the property the callers actually rely on — they all
 * test `openTime ? ... : undefined`, and an Invalid Date passes that test. Returning undefined is
 * what makes those guards mean what they look like they mean.
 */
const _SECONDS_CEILING = 1e11;   // above this the number must already be milliseconds

export function toDate(v: string | number | undefined | null): Date | undefined {
  if (v === null || v === undefined || v === '') return undefined;

  // A numeric string is a NUMBER that happened to be stringified — cTrader's adapter does exactly
  // this. Reading it as a date string is what produced the Invalid Date.
  let n: number | undefined;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) n = Number(v.trim());

  const d = n !== undefined
    ? new Date(Math.abs(n) < _SECONDS_CEILING ? n * 1000 : n)
    : new Date(v as string);

  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** The risk this trade actually took, in pips — the denominator its R multiples were measured on. */
function pipsOf(t: { symbol: string; openPrice: unknown; originalStopLoss: unknown }): number | null {
  const ep = parseFloat(String(t.openPrice ?? ''));
  const sl = parseFloat(String(t.originalStopLoss ?? ''));
  if (!Number.isFinite(ep) || !Number.isFinite(sl)) return null;
  return toPips(Math.abs(ep - sl), t.symbol) ?? null;
}

export async function processIncomingTrades(
  brokerAccountId: string,
  userId: string,
  trades: RawBrokerTrade[],
): Promise<{ created: number; duplicates: number; journaled: number; healed: number;
             backfilled: number }> {
  let created = 0, duplicates = 0, journaled = 0, healed = 0, backfilled = 0, corrected = 0;

  // Get the account's default session so auto-journaled trades are visible
  // in session-filtered views (metrics, drawdown, audit)
  const account = await storage.getBrokerAccountById(brokerAccountId);
  const defaultSessionId = account?.defaultSessionId ?? null;

  for (const raw of trades) {
    // De-duplicate by externalId + brokerAccountId
    const existing = await storage.getSyncedTradeByExternal(brokerAccountId, raw.externalId);
    if (existing) {
      duplicates++;
      // "ALREADY HAD" IS NOT AN ANSWER — it hides WHEN, and when is the whole question.
      //
      // On 02 Sep the log said "2 closed trade(s) -> 0 recorded, 2 already had" and that was true
      // of a sync working perfectly AND of one that had missed both trades for hours until someone
      // pressed the button. Those are opposite diagnoses and the line could not tell them apart.
      // The gap between the moment the broker closed the trade and the moment we stored it is what
      // separates them: seconds means the live feed caught it, hours means every automatic path
      // missed it and something else filed it later.
      if (existing.closeTime && existing.createdAt) {
        const lagMin = Math.round(
          (new Date(existing.createdAt).getTime() - new Date(existing.closeTime).getTime()) / 60000);
        console.log(`[Sync] had ${existing.symbol} ${existing.externalId} — closed `
                    + `${new Date(existing.closeTime).toISOString()}, stored `
                    + `${new Date(existing.createdAt).toISOString()} (${lagMin} min later), `
                    + `openTime ${existing.openTime ? 'yes' : 'MISSING'}, `
                    + `journal entry ${existing.journalEntryId ? 'yes' : 'NO'}`
                    // WHAT THE SWEEP IS OFFERING, not only what we hold. The backfill did not fire
                    // on 02 Sep and reading the code could not tell me why: the sweep's pairing sets
                    // `openTime` from the opening deal, so it should have had one. This prints the
                    // incoming value so the next sweep answers it instead of me inferring again.
                    + ` | broker offers openTime=${JSON.stringify(raw.openTime ?? null)}`);
      }
      // A TRADE STORED BUT NEVER JOURNALED USED TO STAY THAT WAY FOR EVER.
      //
      // This branch was `{ duplicates++; continue; }` — it asked only "have I seen this trade?",
      // never "did it reach his journal?". Storing the trade and writing the journal entry are two
      // separate steps, so anything that stopped the second one (an error mid-way, a trade stored
      // by a path that does not journal, a row saved before auto-journaling existed) left the trade
      // permanently invisible: every later sync recognised it and skipped it, reporting "already
      // had" while the journal stayed empty. The journal is what he actually looks at, so that
      // reads exactly like "the sync is not working".
      //
      // `journalSyncedTrade` refuses to journal twice on its own (it returns early when
      // `journalEntryId` is set), so this cannot create a duplicate entry.
      // NOTE THE MISSING `openTime` TEST — deliberately. The first version of this heal copied the
      // create path's condition and therefore skipped exactly the trades it existed to rescue.
      // BACKFILL WHAT THE LIVE FEED COULD NOT SUPPLY.
      //
      // The live feed stores a trade the instant it closes, from the single closing event — and that
      // event has arrived with NO OPEN TIME (measured 02 Sep: both trades logged `openTime MISSING`).
      // The 15-minute sweep knows it: it pairs the opening deal with the closing one, so
      // `openTime: open.executionTimestamp` is real. But the sweep saw the trade already existed and
      // skipped it, so the blank stayed blank for ever — costing the journal the holding time, the
      // day of week, and the correct session on every live-recorded trade.
      //
      // Only ever FILLS A BLANK. A value we already hold is never overwritten by this, so the live
      // feed's own data (which carries the stop and target the sweep cannot see) always wins.
      if (!existing.openTime && raw.openTime) {
        const filled = toDate(raw.openTime);
        if (!filled) {
          console.warn(`[Sync] ${existing.externalId}: the broker sent an open time this code could `
                       + `not read — ${JSON.stringify(raw.openTime)}`);
        } else {
          await storage.updateSyncedTradeOpenTime(existing.id, filled);
          existing.openTime = filled as any;
          backfilled++;
          console.log(`[Sync] backfilled the open time on ${existing.symbol} ${existing.externalId}`
                      + ` — ${filled.toISOString()} (the live feed never received it)`);
          // The journal entry was written without it too, so its holding time, day and session are
          // all wrong-or-blank until they are recomputed from the real open time.
          if (existing.journalEntryId) {
            await repairJournalTiming(existing).catch(err =>
              console.error(`[Sync] could not correct the journal entry for `
                            + `${existing.externalId}: ${err?.message ?? err}`));
          }
        }
      }

      // A WRONG DIRECTION IS NOT A BLANK, AND IT POISONS EVERYTHING DOWNSTREAM.
      //
      // The live feed files every trade as a SHORT when the position's `tradeData` is absent — the
      // side lives only in there and `ProtoOAPosition` has no other copy of it. The same flag signs
      // the money, so his EUR/USD LONG of 01 Sep was stored as a short AND its $51 loss was recorded
      // as a $51 win.
      //
      // The sweep knows better: it pairs the position's two real deals, so the OPENING deal's side
      // is the direction, and its detailed half carries the broker's own signed grossProfit. Where
      // the two disagree, the sweep wins. This CORRECTS rather than fills — the only place in this
      // function that overwrites a value — because a wrong direction is worse than a missing one.
      const wrongWay = raw.direction && existing.direction
                       && normaliseDirection(raw.direction) !== existing.direction;
      const wrongPl  = raw.profit != null && existing.profitLoss != null
                       && Math.abs(Number(existing.profitLoss) - raw.profit) > 0.01;
      if (wrongWay || wrongPl) {
        const was = { direction: existing.direction, profitLoss: existing.profitLoss };
        await storage.correctSyncedTrade(existing.id, {
          direction:  normaliseDirection(raw.direction),
          profitLoss: raw.profit != null ? String(raw.profit) : undefined,
        });
        (existing as any).direction  = normaliseDirection(raw.direction);
        if (raw.profit != null) (existing as any).profitLoss = String(raw.profit);
        corrected++;
        await record({ brokerAccountId, externalId: existing.externalId, symbol: existing.symbol,
                       stage: 'backfilled',
                       detail: `CORRECTED from the broker's own deals: `
                               + `direction ${was.direction} -> ${existing.direction}`
                               + (wrongPl ? `, P/L ${was.profitLoss} -> ${existing.profitLoss}` : '') });
        // The entry was written from the wrong direction, so its P&L, pips and R are all wrong too.
        if (existing.journalEntryId) {
          await repairJournalDerived(existing).catch(err =>
            console.error(`[Sync] could not rebuild the journal entry for `
                          + `${existing.externalId}: ${err?.message ?? err}`));
        }
      }

      // THE RISK AS PLACED, onto a row that never had it. Same rule as the open time above: only
      // ever fills a blank. A trade recorded by the live feed cannot have this — the feed sees the
      // position as it CLOSES, by which point the ladder has moved the stop — so every live-recorded
      // trade needs it filled in here or its R stays wrong for ever.
      if (!existing.originalStopLoss && raw.originalStopLoss) {
        await storage.updateSyncedTradeOriginalRisk(existing.id, {
          entryOrderId:       raw.entryOrderId ?? null,
          originalStopLoss:   String(raw.originalStopLoss),
          originalTakeProfit: raw.originalTakeProfit != null ? String(raw.originalTakeProfit) : null,
        });
        (existing as any).originalStopLoss   = String(raw.originalStopLoss);
        (existing as any).originalTakeProfit = raw.originalTakeProfit != null
          ? String(raw.originalTakeProfit) : null;
        (existing as any).entryOrderId = raw.entryOrderId ?? null;
        backfilled++;
        await record({ brokerAccountId, externalId: existing.externalId, symbol: existing.symbol,
                       stage: 'backfilled',
                       detail: `original risk from entry order ${raw.entryOrderId}: `
                               + `stop ${raw.originalStopLoss}`
                               + (raw.originalTakeProfit ? ` target ${raw.originalTakeProfit}` : '') });
        // The entry was written with the WRONG risk (or none). Correct it now that the truth exists.
        if (existing.journalEntryId) {
          await repairJournalDerived(existing).catch(err =>
            console.error(`[Sync] could not correct the risk on the journal entry for `
                          + `${existing.externalId}: ${err?.message ?? err}`));
        }
      }

      // HOW FAR IT RAN EACH WAY, from the marks the monitor measured while it was open. Only ever
      // filled once — they are a record of a journey that is over, so they never change afterwards.
      if (existing.mae == null && existing.positionId) {
        const riskPips = pipsOf(existing);
        const m = await marksFor(existing.positionId, riskPips);
        if (m) {
          await storage.correctSyncedTrade(existing.id,
            { mae: String(m.mae), mfe: String(m.mfe), maeMfeSource: m.source });
          (existing as any).mae = String(m.mae);
          (existing as any).mfe = String(m.mfe);
          (existing as any).maeMfeSource = m.source;
          backfilled++;
          await record({ brokerAccountId, externalId: existing.externalId, symbol: existing.symbol,
                         stage: 'backfilled',
                         detail: `ran to +${m.mfe} pips and -${m.mae} pips while open `
                                 + `(measured on the ${m.source === 'fix' ? '0.5s FIX' : '30s'} clock)` });
        }
      }

      // HOW IT WAS ENTERED, onto a row that predates the column. Same only-fill-a-blank rule.
      if (!existing.orderType && raw.orderType) {
        await storage.correctSyncedTrade(existing.id, { orderType: raw.orderType });
        (existing as any).orderType = raw.orderType;
        backfilled++;
      }

      // AND AN ENTRY WRITTEN BEFORE THESE FIELDS EXISTED STILL NEEDS THEM.
      //
      // The corrections above only fire when something DISAGREES. A trade that was recorded
      // correctly all along — his GBP/USD, which really was short — needs no correction and so got
      // no rebuild, and would have kept sitting in the metrics page's "Unknown" buckets for ever
      // despite everything now being knowable.
      //
      // This asks the opposite question: does the entry LACK something we can now supply? It is
      // self-limiting — once the field is there the condition stops matching, so it costs one read
      // per trade until it is done and nothing after that.
      if (existing.journalEntryId && existing.originalStopLoss) {
        const entry = await storage.getJournalEntryById(existing.journalEntryId).catch(() => null);
        if (entry && !entry.primaryExitReason) {
          await repairJournalDerived(existing).catch(err =>
            console.error(`[Sync] could not fill the missing fields on the journal entry for `
                          + `${existing.externalId}: ${err?.message ?? err}`));
        }
      }

      if (!existing.journalEntryId && existing.closeTime) {
        const fixedId = await journalSyncedTrade(existing, defaultSessionId);
        if (fixedId) {
          healed++;
          await record({ brokerAccountId, externalId: existing.externalId, symbol: existing.symbol,
                         stage: 'healed',
                         detail: 'it was stored but had no journal entry until now' });
          console.log(`[Sync] healed ${existing.symbol} ${existing.externalId} — it was stored `
                      + `${existing.createdAt ? 'on ' + new Date(existing.createdAt).toISOString() : ''} `
                      + `but had no journal entry`);
        }
      }
      continue;
    }

    const openTime  = toDate(raw.openTime);
    const closeTime = toDate(raw.closeTime);

    const synced = await storage.createSyncedTrade({
      brokerAccountId,
      userId,
      externalId:  raw.externalId,
      symbol:      raw.symbol,
      direction:   normaliseDirection(raw.direction),
      lots:        raw.lots != null ? String(raw.lots) : undefined,
      openPrice:   raw.openPrice  != null ? String(raw.openPrice)  : undefined,
      closePrice:  raw.closePrice != null ? String(raw.closePrice) : undefined,
      stopLoss:    raw.stopLoss   != null ? String(raw.stopLoss)   : undefined,
      takeProfit:  raw.takeProfit != null ? String(raw.takeProfit) : undefined,
      positionId:         raw.positionId,
      entryOrderId:       raw.entryOrderId,
      orderType:          raw.orderType,
      originalStopLoss:   raw.originalStopLoss   != null ? String(raw.originalStopLoss)   : undefined,
      originalTakeProfit: raw.originalTakeProfit != null ? String(raw.originalTakeProfit) : undefined,
      openTime,
      closeTime,
      profitLoss:  raw.profit     != null ? String(raw.profit)     : undefined,
      commission:  raw.commission != null ? String(raw.commission) : undefined,
      swap:        raw.swap       != null ? String(raw.swap)       : undefined,
      comment:     raw.comment,
      magic:       raw.magic,
      rawData:     raw.rawData ?? raw as unknown as Record<string, unknown>,
    });

    created++;
    await record({ brokerAccountId, externalId: raw.externalId, symbol: raw.symbol,
                   stage: 'recorded',
                   detail: `${raw.direction} ${raw.lots ?? '?'} lots, P/L ${raw.profit ?? '?'}`
                           + (raw.originalStopLoss ? ` · risk as placed ${raw.originalStopLoss}` : '') });

    // A TRADE THAT HAS CLOSED BELONGS IN THE JOURNAL. This required an open time as well, and that
    // one word is what kept his trades off the page: the live feed stored GBPUSD 317367514 **110
    // milliseconds** after it closed on 02 Sep and EURUSD 317231950 the same way on 01 Sep, and
    // BOTH were refused a journal entry. Capture was never the problem — the journal was.
    //
    // The close time is what makes a trade complete and is the only thing genuinely required; the
    // open time only enriches it (duration, day, session) and every use of it above is already
    // guarded. Refusing to record a real, closed, profit-and-loss-bearing trade because we do not
    // know when it started makes it invisible, which is far worse than an entry with a blank
    // duration.
    if (closeTime) {
      const journalId = await journalSyncedTrade(synced, defaultSessionId);
      if (journalId) journaled++;
    }
  }

  // Update account trade count + lastSyncAt
  await storage.updateBrokerAccountSyncStatus(brokerAccountId, 'ok', created);

  // CLEAR THE CACHED PAGES, or the trade is invisible for up to five minutes. Every journal page —
  // calendar, drawdown, metrics, timeframe matrix — is built from one cached list of entries, and
  // only the manual create/update/delete endpoints used to clear it. So a trade typed into the form
  // appeared at once and the same trade arriving from the broker did not appear at all until the
  // cache expired, which reads exactly like "the sync is not working".
  // A HEALED TRADE IS A NEW JOURNAL ENTRY TOO, so the cached pages must be cleared for it as well —
  // otherwise the entry exists and every page keeps showing the old list for up to five minutes.
  if (created > 0 || healed > 0 || backfilled > 0) {
    await invalidateComputeCaches(defaultSessionId ?? undefined, userId).catch(() => {});
  }

  return { created, duplicates, journaled, healed, backfilled };
}
