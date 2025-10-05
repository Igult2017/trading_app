import { type User, type InsertUser, type Trade, type InsertTrade, type EconomicEvent, type InsertEconomicEvent } from "@shared/schema";
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private trades: Map<string, Trade>;
  private economicEvents: Map<string, EconomicEvent>;

  constructor() {
    this.users = new Map();
    this.trades = new Map();
    this.economicEvents = new Map();
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
      affectedCurrencies: insertEvent.affectedCurrencies ?? null,
      affectedStocks: insertEvent.affectedStocks ?? null,
      description: insertEvent.description ?? null,
      expectedValue: insertEvent.expectedValue ?? null,
      previousValue: insertEvent.previousValue ?? null,
      actualValue: insertEvent.actualValue ?? null,
      unit: insertEvent.unit ?? null,
      futuresImpliedExpectation: insertEvent.futuresImpliedExpectation ?? null,
      surpriseFactor: insertEvent.surpriseFactor ?? null,
      marketImpactAnalysis: insertEvent.marketImpactAnalysis ?? null,
      isReleased: insertEvent.isReleased ?? false,
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
}

export const storage = new MemStorage();
