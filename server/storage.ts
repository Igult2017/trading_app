import { type User, type InsertUser, type Trade, type InsertTrade, type EconomicEvent, type InsertEconomicEvent, type TradingSignal, type InsertTradingSignal, type PendingSetup, type InsertPendingSetup, type InterestRate, type InsertInterestRate, type JournalEntry, type InsertJournalEntry, type TradingSession, type InsertTradingSession, trades, users, tradingSignals, pendingSetups, interestRates, journalEntries, tradingSessions, type CopyAccount, type InsertCopyAccount, type CopyMaster, type InsertCopyMaster, type TelegramSignalSource, type InsertTelegramSignalSource, type CopyFollower, type InsertCopyFollower, type CopyTradeMaster, type InsertCopyTradeMaster, type CopyTradeFollower, type InsertCopyTradeFollower, type CopyExecutionLog, type InsertCopyExecutionLog, copyAccounts, copyMasters, telegramSignalSources, copyFollowers, copyTradesMaster, copyTradesFollower, copyExecutionLogs } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

/**
 * If an entry has entryTime + exitTime but no tradeDuration, compute and
 * store it as a plain minute string (e.g. "90"). This ensures the metrics
 * calculator always has duration data available from the DB without relying
 * on the user manually typing it.
 */
function deriveTradeDuration<T extends { entryTime?: string | null; exitTime?: string | null; tradeDuration?: string | null }>(entry: T): T {
  if (!entry.tradeDuration && entry.entryTime && entry.exitTime) {
    try {
      const diffMs = new Date(entry.exitTime).getTime() - new Date(entry.entryTime).getTime();
      if (diffMs > 0) {
        return { ...entry, tradeDuration: String(Math.round(diffMs / 60_000)) };
      }
    } catch {
      // unparseable timestamps — leave tradeDuration as-is
    }
  }
  return entry;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getTrades(userId?: string): Promise<Trade[]>;
  getTradeById(id: string): Promise<Trade | undefined>;
  createTrade(trade: InsertTrade): Promise<Trade>;
  updateTrade(id: string, trade: Partial<InsertTrade>): Promise<Trade | undefined>;
  deleteTrade(id: string): Promise<boolean>;
  
  getEconomicEvents(filters?: { region?: string; impactLevel?: string; currency?: string }): Promise<EconomicEvent[]>;
  getEconomicEventById(id: string): Promise<EconomicEvent | undefined>;
  createEconomicEvent(event: InsertEconomicEvent): Promise<EconomicEvent>;
  updateEconomicEvent(id: string, event: Partial<InsertEconomicEvent>): Promise<EconomicEvent | undefined>;
  deleteEconomicEvent(id: string): Promise<boolean>;
  
  getTradingSignals(filters?: { status?: string; assetClass?: string; symbol?: string }): Promise<TradingSignal[]>;
  getTradingSignalById(id: string): Promise<TradingSignal | undefined>;
  createTradingSignal(signal: InsertTradingSignal): Promise<TradingSignal>;
  updateTradingSignal(id: string, signal: Partial<InsertTradingSignal>): Promise<TradingSignal | undefined>;
  deleteTradingSignal(id: string): Promise<boolean>;
  cleanupExpiredSignals(): Promise<number>;
  
  getPendingSetups(filters?: { symbol?: string; readyForSignal?: boolean; invalidated?: boolean }): Promise<PendingSetup[]>;
  getPendingSetupById(id: string): Promise<PendingSetup | undefined>;
  createPendingSetup(setup: InsertPendingSetup): Promise<PendingSetup>;
  updatePendingSetup(id: string, setup: Partial<InsertPendingSetup>): Promise<PendingSetup | undefined>;
  deletePendingSetup(id: string): Promise<boolean>;
  
  getInterestRates(): Promise<InterestRate[]>;
  getInterestRateByCurrency(currency: string): Promise<InterestRate | undefined>;
  upsertInterestRate(rate: InsertInterestRate): Promise<InterestRate>;

  getJournalEntries(userId?: string, sessionId?: string): Promise<JournalEntry[]>;
  getJournalEntryById(id: string): Promise<JournalEntry | undefined>;
  createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry>;
  updateJournalEntry(id: string, entry: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined>;
  deleteJournalEntry(id: string): Promise<boolean>;

  getSessions(userId?: string): Promise<TradingSession[]>;
  getSessionById(id: string): Promise<TradingSession | undefined>;
  createSession(session: InsertTradingSession): Promise<TradingSession>;
  updateSession(id: string, session: Partial<InsertTradingSession>): Promise<TradingSession | undefined>;
  deleteSession(id: string): Promise<boolean>;

  // ── Copy Trading ────────────────────────────────────────────────────────────
  getCopyAccounts(userId?: string): Promise<CopyAccount[]>;
  getCopyAccountById(id: string): Promise<CopyAccount | undefined>;
  createCopyAccount(account: InsertCopyAccount): Promise<CopyAccount>;
  updateCopyAccount(id: string, account: Partial<InsertCopyAccount>): Promise<CopyAccount | undefined>;
  deleteCopyAccount(id: string): Promise<boolean>;

  getCopyMasters(userId?: string): Promise<CopyMaster[]>;
  getCopyMasterById(id: string): Promise<CopyMaster | undefined>;
  createCopyMaster(master: InsertCopyMaster): Promise<CopyMaster>;
  updateCopyMaster(id: string, master: Partial<InsertCopyMaster>): Promise<CopyMaster | undefined>;
  deleteCopyMaster(id: string): Promise<boolean>;

  getTelegramSource(masterId: string): Promise<TelegramSignalSource | undefined>;
  upsertTelegramSource(src: InsertTelegramSignalSource): Promise<TelegramSignalSource>;

  getCopyFollowers(userId?: string, masterId?: string): Promise<CopyFollower[]>;
  getCopyFollowerById(id: string): Promise<CopyFollower | undefined>;
  createCopyFollower(follower: InsertCopyFollower): Promise<CopyFollower>;
  updateCopyFollower(id: string, follower: Partial<InsertCopyFollower>): Promise<CopyFollower | undefined>;
  deleteCopyFollower(id: string): Promise<boolean>;

  getCopyMasterTrades(masterId: string, limit?: number): Promise<CopyTradeMaster[]>;
  createCopyMasterTrade(trade: InsertCopyTradeMaster): Promise<CopyTradeMaster>;
  updateCopyMasterTrade(id: string, trade: Partial<InsertCopyTradeMaster>): Promise<CopyTradeMaster | undefined>;

  getCopyFollowerTrades(followerId: string, limit?: number): Promise<CopyTradeFollower[]>;
  createCopyFollowerTrade(trade: InsertCopyTradeFollower): Promise<CopyTradeFollower>;
  updateCopyFollowerTrade(id: string, trade: Partial<InsertCopyTradeFollower>): Promise<CopyTradeFollower | undefined>;

  getCopyExecutionLogs(followerId: string, limit?: number): Promise<CopyExecutionLog[]>;
  createCopyExecutionLog(log: InsertCopyExecutionLog): Promise<CopyExecutionLog>;
}

export class DbStorage implements IStorage {
  private economicEvents: Map<string, EconomicEvent>;
  private tradingSignalsCache: Map<string, TradingSignal>;
  private pendingSetupsCache: Map<string, PendingSetup>;

  constructor() {
    this.economicEvents = new Map();
    this.tradingSignalsCache = new Map();
    this.pendingSetupsCache = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async getTrades(userId?: string): Promise<Trade[]> {
    try {
      let result;
      if (userId) {
        result = await db.select().from(trades).where(eq(trades.userId, userId)).orderBy(desc(trades.createdAt));
      } else {
        result = await db.select().from(trades).orderBy(desc(trades.createdAt));
      }
      return result;
    } catch (error) {
      console.error('[Storage] Error fetching trades:', error);
      return [];
    }
  }

  async getTradeById(id: string): Promise<Trade | undefined> {
    try {
      const result = await db.select().from(trades).where(eq(trades.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error('[Storage] Error fetching trade by id:', error);
      return undefined;
    }
  }

  async createTrade(insertTrade: InsertTrade): Promise<Trade> {
    try {
      const result = await db.insert(trades).values(insertTrade).returning();
      console.log(`[Storage] Trade created: ${result[0].symbol} - ${result[0].outcome}`);
      return result[0];
    } catch (error) {
      console.error('[Storage] Error creating trade:', error);
      throw error;
    }
  }

  async updateTrade(id: string, updateData: Partial<InsertTrade>): Promise<Trade | undefined> {
    try {
      const result = await db.update(trades).set(updateData).where(eq(trades.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error('[Storage] Error updating trade:', error);
      return undefined;
    }
  }

  async deleteTrade(id: string): Promise<boolean> {
    try {
      const result = await db.delete(trades).where(eq(trades.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error('[Storage] Error deleting trade:', error);
      return false;
    }
  }

  async getEconomicEvents(filters?: { region?: string; impactLevel?: string; currency?: string }): Promise<EconomicEvent[]> {
    let events = Array.from(this.economicEvents.values());
    
    if (filters) {
      if (filters.region) {
        events = events.filter(e => e.region === filters.region);
      }
      if (filters.impactLevel) {
        events = events.filter(e => e.impactLevel === filters.impactLevel);
      }
      if (filters.currency) {
        events = events.filter(e => e.currency === filters.currency);
      }
    }
    
    return events.sort((a, b) => 
      new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime()
    );
  }

  async getEconomicEventById(id: string): Promise<EconomicEvent | undefined> {
    return this.economicEvents.get(id);
  }

  async createEconomicEvent(insertEvent: InsertEconomicEvent): Promise<EconomicEvent> {
    const id = randomUUID();
    const event: EconomicEvent = {
      ...insertEvent,
      id,
      countryCode: insertEvent.countryCode ?? null,
      affectedCurrencies: insertEvent.affectedCurrencies ?? [],
      affectedStocks: insertEvent.affectedStocks ?? [],
      description: insertEvent.description ?? null,
      expectedValue: insertEvent.expectedValue ?? null,
      previousValue: insertEvent.previousValue ?? null,
      actualValue: insertEvent.actualValue ?? null,
      unit: insertEvent.unit ?? null,
      futuresImpliedExpectation: insertEvent.futuresImpliedExpectation ?? null,
      surpriseFactor: insertEvent.surpriseFactor ?? null,
      marketImpactAnalysis: insertEvent.marketImpactAnalysis ?? null,
      expertSentiment: insertEvent.expertSentiment ?? null,
      preReleaseSentiment: insertEvent.preReleaseSentiment ?? null,
      postReleaseSentiment: insertEvent.postReleaseSentiment ?? null,
      currencyPairImpacts: insertEvent.currencyPairImpacts ?? null,
      stockImpacts: insertEvent.stockImpacts ?? null,
      sourceSite: insertEvent.sourceSite ?? null,
      sourceUrl: insertEvent.sourceUrl ?? null,
      isReleased: insertEvent.isReleased ?? false,
      telegramNotified: false,
      lastScraped: new Date(),
      createdAt: new Date(),
    };
    this.economicEvents.set(id, event);
    return event;
  }

  async updateEconomicEvent(id: string, updateData: Partial<InsertEconomicEvent>): Promise<EconomicEvent | undefined> {
    const event = this.economicEvents.get(id);
    if (!event) {
      return undefined;
    }
    const updatedEvent = { ...event, ...updateData };
    this.economicEvents.set(id, updatedEvent);
    return updatedEvent;
  }

  async deleteEconomicEvent(id: string): Promise<boolean> {
    return this.economicEvents.delete(id);
  }

  async getTradingSignals(filters?: { status?: string; assetClass?: string; symbol?: string }): Promise<TradingSignal[]> {
    let signals = Array.from(this.tradingSignalsCache.values());
    
    if (filters) {
      if (filters.status) {
        signals = signals.filter(s => s.status === filters.status);
      }
      if (filters.assetClass) {
        signals = signals.filter(s => s.assetClass === filters.assetClass);
      }
      if (filters.symbol) {
        signals = signals.filter(s => s.symbol === filters.symbol);
      }
    }
    
    return signals.sort((a, b) => 
      new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
    );
  }

  async getTradingSignalById(id: string): Promise<TradingSignal | undefined> {
    return this.tradingSignalsCache.get(id);
  }

  async createTradingSignal(insertSignal: InsertTradingSignal): Promise<TradingSignal> {
    const id = randomUUID();
    const signal: TradingSignal = {
      ...insertSignal,
      id,
      status: insertSignal.status ?? 'active',
      confirmationTimeframe: insertSignal.confirmationTimeframe ?? null,
      executionTimeframe: insertSignal.executionTimeframe ?? null,
      interestRateDiffScore: insertSignal.interestRateDiffScore ?? null,
      interestRateDiffValue: insertSignal.interestRateDiffValue ?? null,
      interestRateNotes: insertSignal.interestRateNotes ?? null,
      inflationImpactScore: insertSignal.inflationImpactScore ?? null,
      inflationDifferential: insertSignal.inflationDifferential ?? null,
      inflationNotes: insertSignal.inflationNotes ?? null,
      trendScore: insertSignal.trendScore ?? null,
      trendDirection: insertSignal.trendDirection ?? null,
      trendStrength: insertSignal.trendStrength ?? null,
      trendTimeframes: insertSignal.trendTimeframes ?? [],
      smcScore: insertSignal.smcScore ?? null,
      institutionalCandleDetected: insertSignal.institutionalCandleDetected ?? false,
      institutionalCandleData: insertSignal.institutionalCandleData ?? null,
      orderBlockType: insertSignal.orderBlockType ?? null,
      orderBlockLevel: insertSignal.orderBlockLevel ?? null,
      fvgDetected: insertSignal.fvgDetected ?? false,
      fvgLevel: insertSignal.fvgLevel ?? null,
      liquiditySweep: insertSignal.liquiditySweep ?? false,
      liquiditySweepLevel: insertSignal.liquiditySweepLevel ?? null,
      breakerBlockDetected: insertSignal.breakerBlockDetected ?? false,
      bocChochDetected: insertSignal.bocChochDetected ?? null,
      smcFactors: insertSignal.smcFactors ?? [],
      technicalReasons: insertSignal.technicalReasons ?? [],
      marketContext: insertSignal.marketContext ?? null,
      strength: insertSignal.strength ?? null,
      zonesTested: insertSignal.zonesTested ?? 0,
      expiresAt: insertSignal.expiresAt ?? null,
      executedAt: insertSignal.executedAt ?? null,
      invalidatedAt: insertSignal.invalidatedAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tradingSignalsCache.set(id, signal);
    return signal;
  }

  async updateTradingSignal(id: string, updateData: Partial<InsertTradingSignal>): Promise<TradingSignal | undefined> {
    const signal = this.tradingSignalsCache.get(id);
    if (!signal) {
      return undefined;
    }
    const updatedSignal = { ...signal, ...updateData, updatedAt: new Date() };
    this.tradingSignalsCache.set(id, updatedSignal);
    return updatedSignal;
  }

  async deleteTradingSignal(id: string): Promise<boolean> {
    return this.tradingSignalsCache.delete(id);
  }

  async cleanupExpiredSignals(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;
    const entries = Array.from(this.tradingSignalsCache.entries());
    
    for (const [id, signal] of entries) {
      if (signal.status === 'expired' || signal.status === 'stopped_out' || signal.status === 'target_hit') {
        this.tradingSignalsCache.delete(id);
        cleanedCount++;
      } else if (signal.expiresAt && new Date(signal.expiresAt) < now && signal.status === 'active') {
        this.tradingSignalsCache.delete(id);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[Storage] Cleaned up ${cleanedCount} expired/completed signals`);
    }
    
    return cleanedCount;
  }

  async getPendingSetups(filters?: { symbol?: string; readyForSignal?: boolean; invalidated?: boolean }): Promise<PendingSetup[]> {
    let setups = Array.from(this.pendingSetupsCache.values());
    
    if (filters) {
      if (filters.symbol) {
        setups = setups.filter(s => s.symbol === filters.symbol);
      }
      if (filters.readyForSignal !== undefined) {
        setups = setups.filter(s => s.readyForSignal === filters.readyForSignal);
      }
      if (filters.invalidated !== undefined) {
        setups = setups.filter(s => s.invalidated === filters.invalidated);
      }
    }
    
    return setups.sort((a, b) => 
      new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
    );
  }

  async getPendingSetupById(id: string): Promise<PendingSetup | undefined> {
    return this.pendingSetupsCache.get(id);
  }

  async createPendingSetup(insertSetup: InsertPendingSetup): Promise<PendingSetup> {
    const id = randomUUID();
    const setup: PendingSetup = {
      ...insertSetup,
      id,
      potentialStrategy: insertSetup.potentialStrategy ?? null,
      confirmationTimeframe: insertSetup.confirmationTimeframe ?? null,
      interestRateBias: insertSetup.interestRateBias ?? null,
      inflationBias: insertSetup.inflationBias ?? null,
      trendBias: insertSetup.trendBias ?? null,
      chochDetected: insertSetup.chochDetected ?? false,
      chochDirection: insertSetup.chochDirection ?? null,
      liquiditySweepDetected: insertSetup.liquiditySweepDetected ?? false,
      supplyDemandZoneTargeted: insertSetup.supplyDemandZoneTargeted ?? false,
      zoneLevel: insertSetup.zoneLevel ?? null,
      zoneMitigated: insertSetup.zoneMitigated ?? false,
      levelsBroken: insertSetup.levelsBroken ?? 0,
      confirmationsPending: insertSetup.confirmationsPending ?? [],
      setupNotes: insertSetup.setupNotes ?? [],
      marketContext: insertSetup.marketContext ?? null,
      lastCheckedPrice: insertSetup.lastCheckedPrice ?? null,
      lastCheckedAt: new Date(),
      readyForSignal: insertSetup.readyForSignal ?? false,
      invalidated: insertSetup.invalidated ?? false,
      invalidationReason: insertSetup.invalidationReason ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.pendingSetupsCache.set(id, setup);
    return setup;
  }

  async updatePendingSetup(id: string, updateData: Partial<InsertPendingSetup>): Promise<PendingSetup | undefined> {
    const setup = this.pendingSetupsCache.get(id);
    if (!setup) {
      return undefined;
    }
    const updatedSetup = { ...setup, ...updateData, updatedAt: new Date(), lastCheckedAt: new Date() };
    this.pendingSetupsCache.set(id, updatedSetup);
    return updatedSetup;
  }

  async deletePendingSetup(id: string): Promise<boolean> {
    return this.pendingSetupsCache.delete(id);
  }

  async getInterestRates(): Promise<InterestRate[]> {
    try {
      const result = await db.select().from(interestRates);
      return result;
    } catch (error) {
      console.error('[Storage] Error fetching interest rates:', error);
      return [];
    }
  }

  async getInterestRateByCurrency(currency: string): Promise<InterestRate | undefined> {
    try {
      const result = await db.select().from(interestRates).where(eq(interestRates.currency, currency.toUpperCase())).limit(1);
      return result[0];
    } catch (error) {
      console.error('[Storage] Error fetching interest rate:', error);
      return undefined;
    }
  }

  async upsertInterestRate(rate: InsertInterestRate): Promise<InterestRate> {
    try {
      const existing = await this.getInterestRateByCurrency(rate.currency);
      if (existing) {
        const result = await db.update(interestRates)
          .set({ ...rate, lastUpdated: new Date() })
          .where(eq(interestRates.currency, rate.currency))
          .returning();
        return result[0];
      } else {
        const result = await db.insert(interestRates).values(rate).returning();
        return result[0];
      }
    } catch (error) {
      console.error('[Storage] Error upserting interest rate:', error);
      throw error;
    }
  }

  async getJournalEntries(userId?: string, sessionId?: string): Promise<JournalEntry[]> {
    try {
      const conditions = [];
      if (userId) conditions.push(eq(journalEntries.userId, userId));
      if (sessionId) conditions.push(eq(journalEntries.sessionId, sessionId));
      if (conditions.length > 0) {
        return await db.select().from(journalEntries).where(and(...conditions)).orderBy(desc(journalEntries.createdAt));
      }
      return await db.select().from(journalEntries).orderBy(desc(journalEntries.createdAt));
    } catch (error) {
      console.error('[Storage] Error fetching journal entries:', error);
      return [];
    }
  }

  async getJournalEntryById(id: string): Promise<JournalEntry | undefined> {
    try {
      const result = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
      return result[0];
    } catch (error) {
      console.error('[Storage] Error fetching journal entry:', error);
      return undefined;
    }
  }

  async createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry> {
    try {
      const result = await db.insert(journalEntries).values(deriveTradeDuration(entry)).returning();
      return result[0];
    } catch (error) {
      console.error('[Storage] Error creating journal entry:', error);
      throw error;
    }
  }

  async updateJournalEntry(id: string, entry: Partial<InsertJournalEntry>): Promise<JournalEntry | undefined> {
    try {
      const result = await db.update(journalEntries).set(deriveTradeDuration(entry)).where(eq(journalEntries.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error('[Storage] Error updating journal entry:', error);
      return undefined;
    }
  }

  async deleteJournalEntry(id: string): Promise<boolean> {
    try {
      const result = await db.delete(journalEntries).where(eq(journalEntries.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error('[Storage] Error deleting journal entry:', error);
      return false;
    }
  }

  async getSessions(userId?: string): Promise<TradingSession[]> {
    try {
      if (userId) {
        return await db.select().from(tradingSessions).where(eq(tradingSessions.userId, userId)).orderBy(desc(tradingSessions.createdAt));
      }
      return await db.select().from(tradingSessions).orderBy(desc(tradingSessions.createdAt));
    } catch (error) {
      console.error('[Storage] Error fetching sessions:', error);
      return [];
    }
  }

  async getSessionById(id: string): Promise<TradingSession | undefined> {
    try {
      const result = await db.select().from(tradingSessions).where(eq(tradingSessions.id, id));
      return result[0];
    } catch (error) {
      console.error('[Storage] Error fetching session:', error);
      return undefined;
    }
  }

  async createSession(session: InsertTradingSession): Promise<TradingSession> {
    try {
      const result = await db.insert(tradingSessions).values(session).returning();
      return result[0];
    } catch (error) {
      console.error('[Storage] Error creating session:', error);
      throw error;
    }
  }

  async updateSession(id: string, session: Partial<InsertTradingSession>): Promise<TradingSession | undefined> {
    try {
      const result = await db.update(tradingSessions).set(session).where(eq(tradingSessions.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error('[Storage] Error updating session:', error);
      return undefined;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      await db.delete(journalEntries).where(eq(journalEntries.sessionId, id));
      const result = await db.delete(tradingSessions).where(eq(tradingSessions.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error('[Storage] Error deleting session:', error);
      return false;
    }
  }

  // ── Copy Trading ─────────────────────────────────────────────────────────────

  async getCopyAccounts(userId?: string): Promise<CopyAccount[]> {
    if (userId) return db.select().from(copyAccounts).where(eq(copyAccounts.userId, userId)).orderBy(desc(copyAccounts.createdAt));
    return db.select().from(copyAccounts).orderBy(desc(copyAccounts.createdAt));
  }

  async getCopyAccountById(id: string): Promise<CopyAccount | undefined> {
    const r = await db.select().from(copyAccounts).where(eq(copyAccounts.id, id)).limit(1);
    return r[0];
  }

  async createCopyAccount(account: InsertCopyAccount): Promise<CopyAccount> {
    const r = await db.insert(copyAccounts).values({ ...account, id: randomUUID() }).returning();
    return r[0];
  }

  async updateCopyAccount(id: string, account: Partial<InsertCopyAccount>): Promise<CopyAccount | undefined> {
    const r = await db.update(copyAccounts).set({ ...account, updatedAt: new Date() }).where(eq(copyAccounts.id, id)).returning();
    return r[0];
  }

  async deleteCopyAccount(id: string): Promise<boolean> {
    const r = await db.delete(copyAccounts).where(eq(copyAccounts.id, id)).returning();
    return r.length > 0;
  }

  async getCopyMasters(userId?: string): Promise<CopyMaster[]> {
    if (userId) return db.select().from(copyMasters).where(eq(copyMasters.userId, userId)).orderBy(desc(copyMasters.createdAt));
    return db.select().from(copyMasters).orderBy(desc(copyMasters.createdAt));
  }

  async getCopyMasterById(id: string): Promise<CopyMaster | undefined> {
    const r = await db.select().from(copyMasters).where(eq(copyMasters.id, id)).limit(1);
    return r[0];
  }

  async createCopyMaster(master: InsertCopyMaster): Promise<CopyMaster> {
    const r = await db.insert(copyMasters).values({ ...master, id: randomUUID() }).returning();
    return r[0];
  }

  async updateCopyMaster(id: string, master: Partial<InsertCopyMaster>): Promise<CopyMaster | undefined> {
    const r = await db.update(copyMasters).set({ ...master, updatedAt: new Date() }).where(eq(copyMasters.id, id)).returning();
    return r[0];
  }

  async deleteCopyMaster(id: string): Promise<boolean> {
    const r = await db.delete(copyMasters).where(eq(copyMasters.id, id)).returning();
    return r.length > 0;
  }

  async getTelegramSource(masterId: string): Promise<TelegramSignalSource | undefined> {
    const r = await db.select().from(telegramSignalSources).where(eq(telegramSignalSources.masterId, masterId)).limit(1);
    return r[0];
  }

  async upsertTelegramSource(src: InsertTelegramSignalSource): Promise<TelegramSignalSource> {
    if (src.masterId) {
      const existing = await this.getTelegramSource(src.masterId);
      if (existing) {
        const r = await db.update(telegramSignalSources).set({ ...src, updatedAt: new Date() }).where(eq(telegramSignalSources.id, existing.id)).returning();
        return r[0];
      }
    }
    const r = await db.insert(telegramSignalSources).values({ ...src, id: randomUUID() }).returning();
    return r[0];
  }

  async getCopyFollowers(userId?: string, masterId?: string): Promise<CopyFollower[]> {
    if (userId && masterId) return db.select().from(copyFollowers).where(and(eq(copyFollowers.userId, userId), eq(copyFollowers.masterId, masterId))).orderBy(desc(copyFollowers.createdAt));
    if (userId)   return db.select().from(copyFollowers).where(eq(copyFollowers.userId, userId)).orderBy(desc(copyFollowers.createdAt));
    if (masterId) return db.select().from(copyFollowers).where(eq(copyFollowers.masterId, masterId)).orderBy(desc(copyFollowers.createdAt));
    return db.select().from(copyFollowers).orderBy(desc(copyFollowers.createdAt));
  }

  async getCopyFollowerById(id: string): Promise<CopyFollower | undefined> {
    const r = await db.select().from(copyFollowers).where(eq(copyFollowers.id, id)).limit(1);
    return r[0];
  }

  async createCopyFollower(follower: InsertCopyFollower): Promise<CopyFollower> {
    const r = await db.insert(copyFollowers).values({ ...follower, id: randomUUID() }).returning();
    return r[0];
  }

  async updateCopyFollower(id: string, follower: Partial<InsertCopyFollower>): Promise<CopyFollower | undefined> {
    const r = await db.update(copyFollowers).set({ ...follower, updatedAt: new Date() }).where(eq(copyFollowers.id, id)).returning();
    return r[0];
  }

  async deleteCopyFollower(id: string): Promise<boolean> {
    const r = await db.delete(copyFollowers).where(eq(copyFollowers.id, id)).returning();
    return r.length > 0;
  }

  async getCopyMasterTrades(masterId: string, limit = 100): Promise<CopyTradeMaster[]> {
    return db.select().from(copyTradesMaster).where(eq(copyTradesMaster.masterId, masterId)).orderBy(desc(copyTradesMaster.createdAt)).limit(limit);
  }

  async createCopyMasterTrade(trade: InsertCopyTradeMaster): Promise<CopyTradeMaster> {
    const r = await db.insert(copyTradesMaster).values({ ...trade, id: randomUUID() }).returning();
    return r[0];
  }

  async updateCopyMasterTrade(id: string, trade: Partial<InsertCopyTradeMaster>): Promise<CopyTradeMaster | undefined> {
    const r = await db.update(copyTradesMaster).set(trade).where(eq(copyTradesMaster.id, id)).returning();
    return r[0];
  }

  async getCopyFollowerTrades(followerId: string, limit = 100): Promise<CopyTradeFollower[]> {
    return db.select().from(copyTradesFollower).where(eq(copyTradesFollower.followerId, followerId)).orderBy(desc(copyTradesFollower.createdAt)).limit(limit);
  }

  async createCopyFollowerTrade(trade: InsertCopyTradeFollower): Promise<CopyTradeFollower> {
    const r = await db.insert(copyTradesFollower).values({ ...trade, id: randomUUID() }).returning();
    return r[0];
  }

  async updateCopyFollowerTrade(id: string, trade: Partial<InsertCopyTradeFollower>): Promise<CopyTradeFollower | undefined> {
    const r = await db.update(copyTradesFollower).set(trade).where(eq(copyTradesFollower.id, id)).returning();
    return r[0];
  }

  async getCopyExecutionLogs(followerId: string, limit = 200): Promise<CopyExecutionLog[]> {
    return db.select().from(copyExecutionLogs).where(eq(copyExecutionLogs.followerId, followerId)).orderBy(desc(copyExecutionLogs.createdAt)).limit(limit);
  }

  async createCopyExecutionLog(log: InsertCopyExecutionLog): Promise<CopyExecutionLog> {
    const r = await db.insert(copyExecutionLogs).values({ ...log, id: randomUUID() }).returning();
    return r[0];
  }
}

export const storage = new DbStorage();
