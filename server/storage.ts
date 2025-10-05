import { type User, type InsertUser, type Trade, type InsertTrade } from "@shared/schema";
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private trades: Map<string, Trade>;

  constructor() {
    this.users = new Map();
    this.trades = new Map();
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
}

export const storage = new MemStorage();
