/**
 * Broker Sync Service
 * ───────────────────
 * Converts raw broker trades (from webhook or future API poll) into
 * journal entries automatically. Designed for 3000+ users — each user's
 * data is isolated by userId; syncs run per-account in the background.
 *
 * Connection modes supported:
 *   webhook — MT5/MT4 EA posts closed trades to POST /api/broker/webhook/:token
 *   api     — Reserved for MetaStats / direct bridge polling (future)
 */
import { storage } from '../storage';
import type { InsertJournalEntry, SyncedTrade, BrokerAccount } from '../../shared/schema';
import { sessionAt } from '../lib/forexSession';
import { toPips } from '../lib/pipMath';
import { invalidateComputeCaches } from '../lib/cache';
import { enrichTradeWithBalance } from './balanceTracker';

// ── Session detection ─────────────────────────────────────────────────────────
type SessionName = 'SYDNEY' | 'TOKYO' | 'LONDON' | 'NEW YORK' | 'LONDON/NY OVERLAP';

// DST-aware via the shared session source (same logic as the screenshot/manual
// journaller). Keeps the existing uppercase label format so stored data and
// session-grouped views stay consistent.
function detectSession(at: Date | null): { session: SessionName; phase: string } {
  const r = at ? sessionAt(at) : null;
  if (!r) return { session: 'SYDNEY', phase: 'Open' };
  const MAP: Record<string, SessionName> = {
    Sydney: 'SYDNEY', Tokyo: 'TOKYO', London: 'LONDON',
    'New York': 'NEW YORK', Overlap: 'LONDON/NY OVERLAP',
  };
  return { session: MAP[r.sessionName] ?? 'SYDNEY', phase: r.sessionPhase };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function minutesBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 60_000);
}

// ── Auto-journal one synced trade ─────────────────────────────────────────────
export async function autoJournalTrade(trade: SyncedTrade, sessionId?: string | null): Promise<string | null> {
  if (trade.journalEntryId) return trade.journalEntryId; // already journaled

  const openTime  = trade.openTime  ? new Date(trade.openTime)  : null;
  const closeTime = trade.closeTime ? new Date(trade.closeTime) : null;

  const pl      = parseFloat(String(trade.profitLoss ?? '0'));
  const comm    = parseFloat(String(trade.commission  ?? '0'));
  const sw      = parseFloat(String(trade.swap        ?? '0'));
  const netPl   = Math.round((pl + comm + sw) * 100) / 100;
  const outcome = classifyOutcome(netPl, trade);

  const { session, phase } = detectSession(openTime);
  const dayOfWeek   = openTime ? DAY_NAMES[openTime.getDay()] : undefined;
  const tradeDuration = openTime && closeTime ? String(minutesBetween(openTime, closeTime)) : undefined;

  // PIPS COME FROM THE INSTRUMENT'S OWN PRECISION, not from how big its price happens to be. The
  // old rule (`price > 100 ? 100 : 10000`) is right for the four currency pairs by luck and wrong
  // for gold, which quotes to 2 decimals: every gold trade was recorded with TEN TIMES its pips.
  const ep = parseFloat(String(trade.openPrice  ?? '0'));
  const xp = parseFloat(String(trade.closePrice ?? '0'));
  const pips = (ep && xp)
    ? toPips(trade.direction === 'Long' ? xp - ep : ep - xp, trade.symbol)
    : undefined;

  // THE RISK NUMBERS ARE DERIVED WHEN THE BROKER GAVE US A STOP, and left blank when it did not.
  // The drawdown and metrics pages both read `riskReward`, and a synced trade never carried one —
  // so a broker trade sat in those views with its risk column empty while a form-entered trade
  // beside it was complete.
  const sl = parseFloat(String(trade.stopLoss   ?? ''));
  const tp = parseFloat(String(trade.takeProfit ?? ''));
  const riskDistance   = (ep && Number.isFinite(sl)) ? Math.abs(ep - sl) : 0;
  const rewardDistance = (ep && Number.isFinite(tp)) ? Math.abs(tp - ep) : 0;
  const stopLossDistance   = riskDistance   ? toPips(riskDistance,   trade.symbol) : undefined;
  const takeProfitDistance = rewardDistance ? toPips(rewardDistance, trade.symbol) : undefined;
  const riskReward = (riskDistance && rewardDistance)
    ? Math.round((rewardDistance / riskDistance) * 100) / 100
    : undefined;
  // ACHIEVED R IS WHAT THE TRADE REALLY RETURNED, in units of the risk it really took — the number
  // the ladder work is judged on, and it is only honest when a real stop was recorded.
  const achievedRR = (riskDistance && ep && xp)
    ? String(Math.round(((trade.direction === 'Long' ? xp - ep : ep - xp) / riskDistance) * 100) / 100)
    : undefined;

  const entry: InsertJournalEntry = {
    userId:      trade.userId,
    sessionId:   sessionId ?? undefined,  // links to auto-created session for this broker account
    instrument:  trade.symbol,
    direction:   trade.direction,
    lotSize:     trade.lots ?? undefined,
    entryPrice:  trade.openPrice  ?? undefined,
    stopLoss:    trade.stopLoss   ?? undefined,
    takeProfit:  trade.takeProfit ?? undefined,
    stopLossDistance:   stopLossDistance   != null ? String(stopLossDistance)   : undefined,
    takeProfitDistance: takeProfitDistance != null ? String(takeProfitDistance) : undefined,
    riskReward:  riskReward != null ? String(riskReward) : undefined,
    achievedRR,
    // EVERY TRADE MUST RECORD A RISK — the same rule and the same 1% default the manual endpoint
    // applies, so a broker trade and a typed one are weighted identically by the risk analytics.
    riskPercent: '1',
    entryTime:   openTime  ? openTime.toISOString()  : undefined,
    exitTime:    closeTime ? closeTime.toISOString() : undefined,
    dayOfWeek,
    tradeDuration,
    outcome,
    profitLoss:  String(netPl),
    commission:  trade.commission ?? undefined,
    pipsGainedLost: pips != null ? String(pips) : undefined,
    sessionName: session,
    sessionPhase: phase,
    entryTimeUTC: openTime ? openTime.toISOString() : undefined,
    manualFields: {
      brokerTicket: trade.externalId,
      brokerAccountId: trade.brokerAccountId,
      magic: trade.magic,
      comment: trade.comment,
      autoJournaled: true,
    },
  };

  try {
    // THE SAME ENRICHMENT THE JOURNAL FORM GETS. `POST /api/journal/entries` calls this before
    // inserting, and this path did not — so every synced trade had a blank `accountBalance` and
    // `monetaryRisk` while a typed trade had both. It is a no-op on `profitLoss`, which is already
    // the broker's real figure and must never be overwritten by an estimate.
    //
    // AND IT MUST NEVER COST US THE TRADE. `getCurrentBalance` THROWS on a session that has been
    // deleted, which would propagate to the catch below and drop the trade entirely — trading a
    // blank balance column for a missing trade, which is the wrong way round. On failure the entry
    // is written exactly as it was built.
    const finalEntry = sessionId
      ? await enrichTradeWithBalance(sessionId, entry as Record<string, any>)
          .then(e => e as InsertJournalEntry)
          .catch((e: any) => {
            console.warn(`[BrokerSync] balance enrichment skipped for ${trade.externalId}: ${e?.message}`);
            return entry;
          })
      : entry;

    const journalEntry = await storage.createJournalEntry(finalEntry);

    // Mark the synced trade as journaled
    await storage.markSyncedTradeJournaled(trade.id, journalEntry.id);

    return journalEntry.id;
  } catch (err) {
    console.error(`[BrokerSync] Failed to journal trade ${trade.id}:`, err);
    return null;
  }
}

// A trade can end FLAT, and the journal has always had a word for it — the form offers Win/Loss/BE
// and both analytics engines carry a breakeven class (`metrics_calculator.BE_OUTCOMES`, whose own
// comment says omitting BE "inflates the mean" and leaves "a phantom run" in the streaks).
//
// The sync could never produce one: `netPl >= 0 ? 'WIN' : 'LOSS'` files a dead-flat trade as a WIN
// and, once costs are subtracted, files a stop-moved-to-breakeven exit as a LOSS. That matters more
// now than it used to — VIX.1's ladder moves the stop to breakeven at 0.4R, so this is the ordinary
// outcome of a managed trade, not an edge case.
//
// THE BAND IS THE TRADE'S OWN NUMBERS, NEVER A FIXED SUM. "Within $1" is breakeven on a $5,000 stop
// and a real loss on a $10 one. Two measures, whichever is larger:
//
//   the RISK band  — a twentieth of the money the stop was actually risking. Needs a recorded stop.
//   the COST band  — the round-trip commission and swap. A trade whose entire net result is smaller
//                    than what it cost to place went nowhere; that is a scratch, not a loss.
//
// THE COST BAND IS THE ONE THAT MATTERS FOR THE LADDER. A trade stopped out at its entry price moved
// zero, so the risk band collapses to nothing and commission alone would file it as a LOSS — and
// that is precisely what VIX.1 does at 0.4R, so the commonest managed outcome would have been
// mislabelled. With no stop and no costs recorded, only an exactly-flat result is called breakeven.
const BE_FRACTION_OF_RISK = 0.05;

export function classifyOutcome(netPl: number, trade: SyncedTrade): 'WIN' | 'LOSS' | 'BE' {
  const ep    = parseFloat(String(trade.openPrice  ?? ''));
  const xp    = parseFloat(String(trade.closePrice ?? ''));
  const sl    = parseFloat(String(trade.stopLoss   ?? ''));
  const gross = parseFloat(String(trade.profitLoss ?? ''));
  const costs = Math.abs(parseFloat(String(trade.commission ?? '0')) || 0)
              + Math.abs(parseFloat(String(trade.swap       ?? '0')) || 0);

  let band = costs;
  const moved = (Number.isFinite(ep) && Number.isFinite(xp)) ? Math.abs(xp - ep) : 0;
  if (Number.isFinite(ep) && Number.isFinite(sl) && Number.isFinite(gross) && moved > 0 && gross !== 0) {
    // What one unit of price movement was worth on this trade, times the stop distance = money risked.
    const riskMoney = Math.abs(gross / moved) * Math.abs(ep - sl);
    band = Math.max(band, riskMoney * BE_FRACTION_OF_RISK);
  }

  if (Math.abs(netPl) <= band) return 'BE';
  return netPl > 0 ? 'WIN' : 'LOSS';
}

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

export async function processIncomingTrades(
  brokerAccountId: string,
  userId: string,
  trades: RawBrokerTrade[],
): Promise<{ created: number; duplicates: number; journaled: number }> {
  let created = 0, duplicates = 0, journaled = 0;

  // Get the account's default session so auto-journaled trades are visible
  // in session-filtered views (metrics, drawdown, audit)
  const account = await storage.getBrokerAccountById(brokerAccountId);
  const defaultSessionId = account?.defaultSessionId ?? null;

  for (const raw of trades) {
    // De-duplicate by externalId + brokerAccountId
    const existing = await storage.getSyncedTradeByExternal(brokerAccountId, raw.externalId);
    if (existing) { duplicates++; continue; }

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

    // Only auto-journal closed trades (both open + close time present)
    if (openTime && closeTime) {
      const journalId = await autoJournalTrade(synced, defaultSessionId);
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
  if (created > 0) {
    await invalidateComputeCaches(defaultSessionId ?? undefined, userId).catch(() => {});
  }

  return { created, duplicates, journaled };
}
