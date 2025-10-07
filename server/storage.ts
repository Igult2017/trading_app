import { type User, type InsertUser, type Trade, type InsertTrade, type EconomicEvent, type InsertEconomicEvent, type TradingSignal, type InsertTradingSignal, type PendingSetup, type InsertPendingSetup } from "@shared/schema";
import { randomUUID } from "crypto";

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
  
  getPendingSetups(filters?: { symbol?: string; readyForSignal?: boolean; invalidated?: boolean }): Promise<PendingSetup[]>;
  getPendingSetupById(id: string): Promise<PendingSetup | undefined>;
  createPendingSetup(setup: InsertPendingSetup): Promise<PendingSetup>;
  updatePendingSetup(id: string, setup: Partial<InsertPendingSetup>): Promise<PendingSetup | undefined>;
  deletePendingSetup(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private trades: Map<string, Trade>;
  private economicEvents: Map<string, EconomicEvent>;
  private tradingSignals: Map<string, TradingSignal>;
  private pendingSetups: Map<string, PendingSetup>;

  constructor() {
    this.users = new Map();
    this.trades = new Map();
    this.economicEvents = new Map();
    this.tradingSignals = new Map();
    this.pendingSetups = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getTrades(userId?: string): Promise<Trade[]> {
    const allTrades = Array.from(this.trades.values());
    if (userId) {
      return allTrades.filter(trade => trade.userId === userId);
    }
    return allTrades;
  }

  async getTradeById(id: string): Promise<Trade | undefined> {
    return this.trades.get(id);
  }

  async createTrade(insertTrade: InsertTrade): Promise<Trade> {
    const id = randomUUID();
    const trade: Trade = {
      ...insertTrade,
      id,
      userId: insertTrade.userId ?? null,
      createdAt: new Date(),
    };
    this.trades.set(id, trade);
    return trade;
  }

  async updateTrade(id: string, updateData: Partial<InsertTrade>): Promise<Trade | undefined> {
    const trade = this.trades.get(id);
    if (!trade) {
      return undefined;
    }
    const updatedTrade = { ...trade, ...updateData };
    this.trades.set(id, updatedTrade);
    return updatedTrade;
  }

  async deleteTrade(id: string): Promise<boolean> {
    return this.trades.delete(id);
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
    let signals = Array.from(this.tradingSignals.values());
    
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
    return this.tradingSignals.get(id);
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
    this.tradingSignals.set(id, signal);
    return signal;
  }

  async updateTradingSignal(id: string, updateData: Partial<InsertTradingSignal>): Promise<TradingSignal | undefined> {
    const signal = this.tradingSignals.get(id);
    if (!signal) {
      return undefined;
    }
    const updatedSignal = { ...signal, ...updateData, updatedAt: new Date() };
    this.tradingSignals.set(id, updatedSignal);
    return updatedSignal;
  }

  async deleteTradingSignal(id: string): Promise<boolean> {
    return this.tradingSignals.delete(id);
  }

  async getPendingSetups(filters?: { symbol?: string; readyForSignal?: boolean; invalidated?: boolean }): Promise<PendingSetup[]> {
    let setups = Array.from(this.pendingSetups.values());
    
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
    return this.pendingSetups.get(id);
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
    this.pendingSetups.set(id, setup);
    return setup;
  }

  async updatePendingSetup(id: string, updateData: Partial<InsertPendingSetup>): Promise<PendingSetup | undefined> {
    const setup = this.pendingSetups.get(id);
    if (!setup) {
      return undefined;
    }
    const updatedSetup = { ...setup, ...updateData, updatedAt: new Date(), lastCheckedAt: new Date() };
    this.pendingSetups.set(id, updatedSetup);
    return updatedSetup;
  }

  async deletePendingSetup(id: string): Promise<boolean> {
    return this.pendingSetups.delete(id);
  }
}

export const storage = new MemStorage();
