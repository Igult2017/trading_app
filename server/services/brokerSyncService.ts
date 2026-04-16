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

// ── Session detection ─────────────────────────────────────────────────────────
type SessionName = 'SYDNEY' | 'TOKYO' | 'LONDON' | 'NEW YORK' | 'LONDON/NY OVERLAP';

function detectSession(utcHour: number): { session: SessionName; phase: string } {
  // Approximate session boundaries (UTC):
  // Sydney:   21:00–06:00
  // Tokyo:    00:00–09:00
  // London:   07:00–16:00
  // New York: 12:00–21:00
  // Overlap:  12:00–16:00
  if (utcHour >= 12 && utcHour < 16) return { session: 'LONDON/NY OVERLAP', phase: 'Mid' };
  if (utcHour >= 7  && utcHour < 12) return { session: 'LONDON',   phase: utcHour < 9  ? 'Open' : 'Mid' };
  if (utcHour >= 16 && utcHour < 21) return { session: 'NEW YORK', phase: utcHour < 19 ? 'Mid'  : 'Close' };
  if (utcHour >= 0  && utcHour < 7)  return { session: 'TOKYO',    phase: utcHour < 3  ? 'Open' : utcHour < 6 ? 'Mid' : 'Close' };
  return { session: 'SYDNEY', phase: utcHour >= 21 ? 'Open' : 'Close' };
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
  const outcome = netPl >= 0 ? 'WIN' : 'LOSS';

  const utcHour     = openTime ? openTime.getUTCHours() : 0;
  const { session, phase } = detectSession(utcHour);
  const dayOfWeek   = openTime ? DAY_NAMES[openTime.getDay()] : undefined;
  const tradeDuration = openTime && closeTime ? String(minutesBetween(openTime, closeTime)) : undefined;

  // Calculate pips (rough — 4/5 decimal instruments vs 2 decimal commodities)
  const ep = parseFloat(String(trade.openPrice  ?? '0'));
  const xp = parseFloat(String(trade.closePrice ?? '0'));
  let pips: number | undefined;
  if (ep && xp) {
    const diff = trade.direction === 'Long' ? xp - ep : ep - xp;
    // Detect pip multiplier: metals/crypto use 2 decimals, forex uses 4-5
    const pipMultiplier = ep > 100 ? 100 : 10000;
    pips = Math.round(diff * pipMultiplier * 100) / 100;
  }

  const entry: InsertJournalEntry = {
    userId:      trade.userId,
    sessionId:   sessionId ?? undefined,  // links to auto-created session for this broker account
    instrument:  trade.symbol,
    direction:   trade.direction,
    lotSize:     trade.lots ?? undefined,
    entryPrice:  trade.openPrice  ?? undefined,
    stopLoss:    trade.stopLoss   ?? undefined,
    takeProfit:  trade.takeProfit ?? undefined,
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
    const journalEntry = await storage.createJournalEntry(entry);

    // Mark the synced trade as journaled
    await storage.markSyncedTradeJournaled(trade.id, journalEntry.id);

    return journalEntry.id;
  } catch (err) {
    console.error(`[BrokerSync] Failed to journal trade ${trade.id}:`, err);
    return null;
  }
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
  openTime?:   string | number;  // ISO string or Unix timestamp (seconds)
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

function toDate(v: string | number | undefined): Date | undefined {
  if (!v) return undefined;
  if (typeof v === 'number') return new Date(v * 1000); // Unix seconds
  return new Date(v);
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

  return { created, duplicates, journaled };
}
