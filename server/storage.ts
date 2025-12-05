import { type User, type InsertUser, type Trade, type InsertTrade, type EconomicEvent, type InsertEconomicEvent, type TradingSignal, type InsertTradingSignal, type PendingSetup, type InsertPendingSetup, trades, users, tradingSignals, pendingSetups } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

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
}

export const storage = new DbStorage();
