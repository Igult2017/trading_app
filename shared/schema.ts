import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  symbol: text("symbol").notNull(),
  type: text("type").notNull(),
  strategy: text("strategy").notNull(),
  entryPrice: decimal("entry_price", { precision: 10, scale: 5 }).notNull(),
  exitPrice: decimal("exit_price", { precision: 10, scale: 5 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 5 }).notNull(),
  pnl: decimal("pnl", { precision: 10, scale: 2 }).notNull(),
  pnlPercent: decimal("pnl_percent", { precision: 10, scale: 2 }).notNull(),
  outcome: text("outcome").notNull(),
  timeframe: text("timeframe").notNull(),
  entryReason: text("entry_reason").notNull(),
  exitDate: timestamp("exit_date").notNull(),
  duration: text("duration").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  createdAt: true,
});

export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;

export const economicEvents = pgTable("economic_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  eventType: text("event_type").notNull(),
  country: text("country").notNull(),
  countryCode: text("country_code"),
  region: text("region").notNull(),
  currency: text("currency").notNull(),
  impactLevel: text("impact_level").notNull(),
  eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
  expectedValue: text("expected_value"),
  previousValue: text("previous_value"),
  actualValue: text("actual_value"),
  unit: text("unit"),
  futuresImpliedExpectation: text("futures_implied_expectation"),
  expertSentiment: text("expert_sentiment"),
  preReleaseSentiment: text("pre_release_sentiment"),
  postReleaseSentiment: text("post_release_sentiment"),
  surpriseFactor: text("surprise_factor"),
  marketImpactAnalysis: text("market_impact_analysis"),
  currencyPairImpacts: text("currency_pair_impacts"),
  stockImpacts: text("stock_impacts"),
  affectedCurrencies: text("affected_currencies").array(),
  affectedStocks: text("affected_stocks").array(),
  isReleased: boolean("is_released").default(false),
  telegramNotified: boolean("telegram_notified").default(false),
  sourceSite: text("source_site"),
  sourceUrl: text("source_url"),
  lastScraped: timestamp("last_scraped").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEconomicEventSchema = createInsertSchema(economicEvents).omit({
  id: true,
  createdAt: true,
  lastScraped: true,
  telegramNotified: true,
});

export type InsertEconomicEvent = z.infer<typeof insertEconomicEventSchema>;
export type EconomicEvent = typeof economicEvents.$inferSelect;

export const telegramSubscribers = pgTable("telegram_subscribers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: text("chat_id").notNull().unique(),
  phoneNumber: text("phone_number"),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTelegramSubscriberSchema = createInsertSchema(telegramSubscribers).omit({
  id: true,
  createdAt: true,
});

export type InsertTelegramSubscriber = z.infer<typeof insertTelegramSubscriberSchema>;
export type TelegramSubscriber = typeof telegramSubscribers.$inferSelect;
