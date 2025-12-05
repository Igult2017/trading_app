import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, boolean, integer, jsonb } from "drizzle-orm/pg-core";
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
  entryPrice: decimal("entry_price", { precision: 12, scale: 5 }).notNull(),
  exitPrice: decimal("exit_price", { precision: 12, scale: 5 }).notNull(),
  stopLoss: decimal("stop_loss", { precision: 12, scale: 5 }),
  takeProfit: decimal("take_profit", { precision: 12, scale: 5 }),
  quantity: decimal("quantity", { precision: 10, scale: 5 }).notNull(),
  pnl: decimal("pnl", { precision: 10, scale: 2 }).notNull(),
  pnlPercent: decimal("pnl_percent", { precision: 10, scale: 2 }).notNull(),
  riskReward: text("risk_reward"),
  outcome: text("outcome").notNull(),
  timeframe: text("timeframe").notNull(),
  entryReason: text("entry_reason").notNull(),
  lesson: text("lesson"),
  signalId: varchar("signal_id"),
  entryDate: timestamp("entry_date"),
  exitDate: timestamp("exit_date").notNull(),
  duration: text("duration").notNull(),
  assetClass: text("asset_class"),
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

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  impactLevel: text("impact_level"),
  metadata: text("metadata"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  isRead: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const tradingSignals = pgTable("trading_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  assetClass: text("asset_class").notNull(),
  type: text("type").notNull(),
  strategy: text("strategy").notNull(),
  
  entryPrice: decimal("entry_price", { precision: 12, scale: 5 }).notNull(),
  stopLoss: decimal("stop_loss", { precision: 12, scale: 5 }).notNull(),
  takeProfit: decimal("take_profit", { precision: 12, scale: 5 }).notNull(),
  riskRewardRatio: decimal("risk_reward_ratio", { precision: 5, scale: 2 }).notNull(),
  
  primaryTimeframe: text("primary_timeframe").notNull(),
  confirmationTimeframe: text("confirmation_timeframe"),
  executionTimeframe: text("execution_timeframe"),
  
  overallConfidence: integer("overall_confidence").notNull(),
  
  interestRateDiffScore: decimal("interest_rate_diff_score", { precision: 5, scale: 2 }),
  interestRateDiffValue: decimal("interest_rate_diff_value", { precision: 5, scale: 2 }),
  interestRateNotes: text("interest_rate_notes"),
  
  inflationImpactScore: decimal("inflation_impact_score", { precision: 5, scale: 2 }),
  inflationDifferential: decimal("inflation_differential", { precision: 5, scale: 2 }),
  inflationNotes: text("inflation_notes"),
  
  trendScore: decimal("trend_score", { precision: 5, scale: 2 }),
  trendDirection: text("trend_direction"),
  trendStrength: text("trend_strength"),
  trendTimeframes: text("trend_timeframes").array(),
  
  smcScore: decimal("smc_score", { precision: 5, scale: 2 }),
  institutionalCandleDetected: boolean("institutional_candle_detected").default(false),
  institutionalCandleData: jsonb("institutional_candle_data"),
  orderBlockType: text("order_block_type"),
  orderBlockLevel: decimal("order_block_level", { precision: 12, scale: 5 }),
  fvgDetected: boolean("fvg_detected").default(false),
  fvgLevel: decimal("fvg_level", { precision: 12, scale: 5 }),
  liquiditySweep: boolean("liquidity_sweep").default(false),
  liquiditySweepLevel: decimal("liquidity_sweep_level", { precision: 12, scale: 5 }),
  breakerBlockDetected: boolean("breaker_block_detected").default(false),
  bocChochDetected: text("boc_choch_detected"),
  smcFactors: text("smc_factors").array(),
  
  technicalReasons: text("technical_reasons").array(),
  marketContext: text("market_context"),
  
  status: text("status").notNull().default('active'),
  strength: text("strength"),
  zonesTested: integer("zones_tested").default(0),
  
  expiresAt: timestamp("expires_at"),
  executedAt: timestamp("executed_at"),
  invalidatedAt: timestamp("invalidated_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTradingSignalSchema = createInsertSchema(tradingSignals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTradingSignal = z.infer<typeof insertTradingSignalSchema>;
export type TradingSignal = typeof tradingSignals.$inferSelect;

export const pendingSetups = pgTable("pending_setups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  assetClass: text("asset_class").notNull(),
  type: text("type").notNull(),
  
  setupStage: text("setup_stage").notNull(),
  
  potentialStrategy: text("potential_strategy"),
  currentPrice: decimal("current_price", { precision: 12, scale: 5 }).notNull(),
  
  primaryTimeframe: text("primary_timeframe").notNull(),
  confirmationTimeframe: text("confirmation_timeframe"),
  
  interestRateBias: text("interest_rate_bias"),
  inflationBias: text("inflation_bias"),
  trendBias: text("trend_bias"),
  
  chochDetected: boolean("choch_detected").default(false),
  chochDirection: text("choch_direction"),
  liquiditySweepDetected: boolean("liquidity_sweep_detected").default(false),
  supplyDemandZoneTargeted: boolean("supply_demand_zone_targeted").default(false),
  zoneLevel: decimal("zone_level", { precision: 12, scale: 5 }),
  zoneMitigated: boolean("zone_mitigated").default(false),
  
  levelsBroken: integer("levels_broken").default(0),
  confirmationsPending: text("confirmations_pending").array(),
  
  setupNotes: text("setup_notes").array(),
  marketContext: text("market_context"),
  
  lastCheckedPrice: decimal("last_checked_price", { precision: 12, scale: 5 }),
  lastCheckedAt: timestamp("last_checked_at").defaultNow(),
  
  readyForSignal: boolean("ready_for_signal").default(false),
  invalidated: boolean("invalidated").default(false),
  invalidationReason: text("invalidation_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPendingSetupSchema = createInsertSchema(pendingSetups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPendingSetup = z.infer<typeof insertPendingSetupSchema>;
export type PendingSetup = typeof pendingSetups.$inferSelect;
