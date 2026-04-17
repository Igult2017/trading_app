import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// COPY TRADING TABLES
// Shares the same PostgreSQL database as the journal. All IDs are UUIDs.
// ─────────────────────────────────────────────────────────────────────────────

/** MT5 / MT4 account credentials (encrypted at rest by the Python service). */
export const copyAccounts = pgTable("copy_accounts", {
  id:           varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:       varchar("user_id").references(() => users.id),
  nickname:     text("nickname").notNull(),
  platform:     text("platform").notNull(),          // MT4 | MT5 | cTrader | Proprietary
  brokerServer: text("broker_server"),
  loginId:      text("login_id").notNull(),
  passwordEnc:  text("password_enc").notNull(),      // AES-256 encrypted
  role:         text("role").notNull(),              // master | follower | source | target
  isActive:     boolean("is_active").default(true),
  symbolPrefix: text("symbol_prefix"),
  symbolSuffix: text("symbol_suffix"),
  createdAt:    timestamp("created_at").defaultNow(),
  updatedAt:    timestamp("updated_at").defaultNow(),
});

export const insertCopyAccountSchema = createInsertSchema(copyAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCopyAccount = z.infer<typeof insertCopyAccountSchema>;
export type CopyAccount = typeof copyAccounts.$inferSelect;

/** Signal providers / master accounts registered on the platform. */
export const copyMasters = pgTable("copy_masters", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:          varchar("user_id").references(() => users.id),
  accountId:       varchar("account_id").references(() => copyAccounts.id),
  sourceType:      text("source_type").notNull(),    // mt5 | telegram
  strategyName:    text("strategy_name"),
  description:     text("description"),
  tradingStyle:    text("trading_style"),            // scalp | intraday | swing | position | hft
  primaryMarket:   text("primary_market"),           // fx | crypto | stocks | commodities | mixed
  isPublic:        boolean("is_public").default(true),
  requireApproval: boolean("require_approval").default(false),
  showOpenTrades:  boolean("show_open_trades").default(true),
  isActive:        boolean("is_active").default(false),
  createdAt:       timestamp("created_at").defaultNow(),
  updatedAt:       timestamp("updated_at").defaultNow(),
});

export const insertCopyMasterSchema = createInsertSchema(copyMasters).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCopyMaster = z.infer<typeof insertCopyMasterSchema>;
export type CopyMaster = typeof copyMasters.$inferSelect;

/** Telegram signal source configuration. */
export const telegramSignalSources = pgTable("telegram_signal_sources", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  masterId:        varchar("master_id").references(() => copyMasters.id),
  botToken:        text("bot_token_enc"),             // encrypted
  phoneNumber:     text("phone_number"),
  apiId:           text("api_id"),
  apiHashEnc:      text("api_hash_enc"),              // encrypted
  channelName:     text("channel_name"),
  channelType:     text("channel_type"),              // public_channel | private_channel | group | bot
  multiChannel:    boolean("multi_channel").default(false),
  filterSender:    text("filter_sender"),
  entryKeyword:    text("entry_keyword"),
  slKeyword:       text("sl_keyword"),
  tpKeyword:       text("tp_keyword"),
  symbolKeyword:   text("symbol_keyword"),
  executeNoSl:     boolean("execute_no_sl").default(false),
  executeNoTp:     boolean("execute_no_tp").default(true),
  useFirstTpOnly:  boolean("use_first_tp_only").default(true),
  autoUpdate:      boolean("auto_update").default(false),
  isActive:        boolean("is_active").default(false),
  sessionFile:     text("session_file"),              // path to Telethon session file
  createdAt:       timestamp("created_at").defaultNow(),
  updatedAt:       timestamp("updated_at").defaultNow(),
});

export const insertTelegramSignalSourceSchema = createInsertSchema(telegramSignalSources).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTelegramSignalSource = z.infer<typeof insertTelegramSignalSourceSchema>;
export type TelegramSignalSource = typeof telegramSignalSources.$inferSelect;

/** Follower account configuration for a specific master. */
export const copyFollowers = pgTable("copy_followers", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:          varchar("user_id").references(() => users.id),
  accountId:       varchar("account_id").references(() => copyAccounts.id),
  masterId:        varchar("master_id").references(() => copyMasters.id),
  lotMode:         text("lot_mode").notNull().default("mult"),  // mult | fixed | risk
  lotMultiplier:   decimal("lot_multiplier",  { precision: 6, scale: 2 }).default("1.0"),
  fixedLot:        decimal("fixed_lot",       { precision: 8, scale: 2 }),
  riskPercent:     decimal("risk_percent",    { precision: 5, scale: 2 }).default("1.0"),
  direction:       text("direction").default("same"),            // same | reverse | hedge
  symbolWhitelist: text("symbol_whitelist").array(),
  symbolBlacklist: text("symbol_blacklist").array(),
  maxOpenTrades:   integer("max_open_trades").default(10),
  tradeDelaySec:   integer("trade_delay_sec").default(0),
  pauseInactive:   boolean("pause_inactive").default(true),
  pauseOnDD:       boolean("pause_on_dd").default(true),
  sessionFilter:   boolean("session_filter").default(false),
  activeSessions:  text("active_sessions").array(),
  maxDdPercent:    decimal("max_dd_percent",  { precision: 5, scale: 2 }),
  maxDailyLoss:    decimal("max_daily_loss",  { precision: 10, scale: 2 }),
  notifDisconnect: boolean("notif_disconnect").default(true),
  notifExecFail:   boolean("notif_exec_fail").default(true),
  notifDdWarn:     boolean("notif_dd_warn").default(true),
  notifDailyWarn:  boolean("notif_daily_warn").default(true),
  isActive:        boolean("is_active").default(false),
  riskAccepted:    boolean("risk_accepted").default(false),
  deployedAt:      timestamp("deployed_at"),
  createdAt:       timestamp("created_at").defaultNow(),
  updatedAt:       timestamp("updated_at").defaultNow(),
});

export const insertCopyFollowerSchema = createInsertSchema(copyFollowers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCopyFollower = z.infer<typeof insertCopyFollowerSchema>;
export type CopyFollower = typeof copyFollowers.$inferSelect;

/** Normalised trade record from any signal source (before execution). */
export const copyTradesMaster = pgTable("copy_trades_master", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  masterId:    varchar("master_id").references(() => copyMasters.id),
  externalId:  text("external_id").notNull(),        // ticket from MT5 or message_id from Telegram
  source:      text("source").notNull(),             // mt5 | telegram
  symbol:      text("symbol").notNull(),
  action:      text("action").notNull(),             // BUY | SELL
  eventType:   text("event_type").notNull(),         // OPEN | MODIFY | CLOSE
  volume:      decimal("volume",      { precision: 10, scale: 2 }),
  entryPrice:  decimal("entry_price", { precision: 12, scale: 5 }),
  stopLoss:    decimal("stop_loss",   { precision: 12, scale: 5 }),
  takeProfit:  decimal("take_profit", { precision: 12, scale: 5 }),
  closedPrice: decimal("closed_price",{ precision: 12, scale: 5 }),
  rawPayload:  jsonb("raw_payload"),                 // original signal data for audit
  status:      text("status").default("pending"),    // pending | dispatched | failed
  createdAt:   timestamp("created_at").defaultNow(),
});

export const insertCopyTradeMasterSchema = createInsertSchema(copyTradesMaster).omit({ id: true, createdAt: true });
export type InsertCopyTradeMaster = z.infer<typeof insertCopyTradeMasterSchema>;
export type CopyTradeMaster = typeof copyTradesMaster.$inferSelect;

/** Execution record on each follower account mapped to a master trade. */
export const copyTradesFollower = pgTable("copy_trades_follower", {
  id:            varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  masterTradeId: varchar("master_trade_id").references(() => copyTradesMaster.id),
  followerId:    varchar("follower_id").references(() => copyFollowers.id),
  externalId:    text("external_id"),                // ticket on follower MT5 account
  symbol:        text("symbol").notNull(),
  action:        text("action").notNull(),
  eventType:     text("event_type").notNull(),
  volume:        decimal("volume",      { precision: 10, scale: 2 }),
  entryPrice:    decimal("entry_price", { precision: 12, scale: 5 }),
  stopLoss:      decimal("stop_loss",   { precision: 12, scale: 5 }),
  takeProfit:    decimal("take_profit", { precision: 12, scale: 5 }),
  closedPrice:   decimal("closed_price",{ precision: 12, scale: 5 }),
  status:        text("status").default("pending"),  // pending | executed | failed | skipped
  errorMessage:  text("error_message"),
  retryCount:    integer("retry_count").default(0),
  executedAt:    timestamp("executed_at"),
  createdAt:     timestamp("created_at").defaultNow(),
});

export const insertCopyTradeFollowerSchema = createInsertSchema(copyTradesFollower).omit({ id: true, createdAt: true });
export type InsertCopyTradeFollower = z.infer<typeof insertCopyTradeFollowerSchema>;
export type CopyTradeFollower = typeof copyTradesFollower.$inferSelect;

/** Full audit log — every action the copy trading engine performs. */
export const copyExecutionLogs = pgTable("copy_execution_logs", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  followerId:  varchar("follower_id").references(() => copyFollowers.id),
  tradeId:     varchar("trade_id"),
  level:       text("level").notNull(),              // INFO | WARN | ERROR
  event:       text("event").notNull(),              // OPEN | CLOSE | MODIFY | SKIP | RETRY | FAIL
  message:     text("message").notNull(),
  metadata:    jsonb("metadata"),
  createdAt:   timestamp("created_at").defaultNow(),
});

export const insertCopyExecutionLogSchema = createInsertSchema(copyExecutionLogs).omit({ id: true, createdAt: true });
export type InsertCopyExecutionLog = z.infer<typeof insertCopyExecutionLogSchema>;
export type CopyExecutionLog = typeof copyExecutionLogs.$inferSelect;

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

/**
 * Maps Supabase auth UUIDs → application roles.
 * This is the single source of truth for authorization.
 * Roles are written once at registration and only changed by an admin.
 */
export const userProfiles = pgTable("user_profiles", {
  id:        varchar("id").primaryKey(),
  email:     text("email").notNull(),
  role:      text("role").notNull().default("user"),
  fullName:  text("full_name").default(''),
  country:   text("country").default(''),
  plan:      text("plan").default('Free'),
  status:    text("status").default('Active'),
  winRate:   text("win_rate").default(''),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UserProfile = typeof userProfiles.$inferSelect;

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
  userId: varchar("user_id"),
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

export const interestRates = pgTable("interest_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  country: text("country").notNull(),
  currency: text("currency").notNull().unique(),
  centralBank: text("central_bank").notNull(),
  centralBankCode: text("central_bank_code").notNull(),
  currentRate: decimal("current_rate", { precision: 6, scale: 3 }).notNull(),
  previousRate: decimal("previous_rate", { precision: 6, scale: 3 }),
  changeInBps: integer("change_in_bps").default(0),
  lastMeeting: text("last_meeting"),
  nextMeeting: text("next_meeting"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInterestRateSchema = createInsertSchema(interestRates).omit({
  id: true,
  createdAt: true,
});

export type InsertInterestRate = z.infer<typeof insertInterestRateSchema>;
export type InterestRate = typeof interestRates.$inferSelect;

export const tradingSessions = pgTable("trading_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),  // Supabase auth UID — no FK constraint
  sessionName: text("session_name").notNull(),
  startingBalance: decimal("starting_balance", { precision: 12, scale: 2 }).notNull(),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ✅ FIX: Override drizzle-zod's auto-generated decimal validator for startingBalance.
// drizzle-zod generates inconsistent Zod types for decimal columns across versions —
// it may expect a branded string, reject plain "10000", or reject "0".
// We explicitly accept number | string, coerce to a valid 2dp decimal string,
// and validate the result so the DB always receives e.g. "10000.00".
export const insertTradingSessionSchema = createInsertSchema(tradingSessions)
  .omit({ id: true, createdAt: true })
  .extend({
    startingBalance: z
      .union([z.string(), z.number()])
      .transform((val) => {
        const num = typeof val === 'number' ? val : parseFloat(val);
        if (isNaN(num) || num < 0) throw new Error('Invalid starting balance');
        return num.toFixed(2);
      }),
    sessionName: z.string().min(1, 'Session name is required').trim(),
  });

export type InsertTradingSession = z.infer<typeof insertTradingSessionSchema>;
export type TradingSession = typeof tradingSessions.$inferSelect;

export const journalEntries = pgTable("journal_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),        // Supabase auth UID — no FK, supports both legacy and Supabase users
  sessionId: varchar("session_id"),  // soft reference to trading_sessions.id

  instrument: text("instrument"),
  pairCategory: text("pair_category"),
  direction: text("direction"),
  orderType: text("order_type"),
  entryPrice: decimal("entry_price", { precision: 12, scale: 5 }),
  stopLoss: decimal("stop_loss", { precision: 12, scale: 5 }),
  takeProfit: decimal("take_profit", { precision: 12, scale: 5 }),
  stopLossDistance: decimal("stop_loss_distance", { precision: 10, scale: 2 }),
  takeProfitDistance: decimal("take_profit_distance", { precision: 10, scale: 2 }),
  lotSize: decimal("lot_size", { precision: 10, scale: 5 }),
  riskReward: decimal("risk_reward", { precision: 6, scale: 2 }),
  riskPercent: decimal("risk_percent", { precision: 5, scale: 2 }),
  spreadAtEntry: decimal("spread_at_entry", { precision: 6, scale: 2 }),

  entryTime: text("entry_time"),
  exitTime: text("exit_time"),
  dayOfWeek: text("day_of_week"),
  tradeDuration: text("trade_duration"),
  entryTF: text("entry_tf"),
  analysisTF: text("analysis_tf"),
  contextTF: text("context_tf"),

  outcome: text("outcome"),
  profitLoss: decimal("profit_loss", { precision: 10, scale: 2 }),
  pipsGainedLost: decimal("pips_gained_lost", { precision: 10, scale: 2 }),
  accountBalance: decimal("account_balance", { precision: 12, scale: 2 }),
  commission: decimal("commission", { precision: 8, scale: 2 }),
  mae: decimal("mae", { precision: 10, scale: 2 }),
  mfe: decimal("mfe", { precision: 10, scale: 2 }),
  plannedRR: text("planned_rr"),
  achievedRR: text("achieved_rr"),
  monetaryRisk: decimal("monetary_risk", { precision: 10, scale: 2 }),
  potentialReward: decimal("potential_reward", { precision: 10, scale: 2 }),
  primaryExitReason: text("primary_exit_reason"),

  sessionName: text("session_name"),
  sessionPhase: text("session_phase"),
  entryTimeUTC: text("entry_time_utc"),
  timingContext: text("timing_context"),

  aiExtracted: jsonb("ai_extracted"),
  manualFields: jsonb("manual_fields"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({
  id: true,
  createdAt: true,
});

export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// BROKER ACCOUNT SYNC
// Allows users to connect their broker accounts and auto-journal trades.
// Supports MT5/MT4 via EA webhook, and API-based polling.
// Scales to 3000+ users — each account isolated by userId (Supabase UID).
// ─────────────────────────────────────────────────────────────────────────────

/** Connected broker account per user. Passwords stored AES-256 encrypted. */
export const brokerAccounts = pgTable("broker_accounts", {
  id:             varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:         varchar("user_id").notNull(),          // Supabase auth UID
  name:           text("name").notNull(),                // display name
  loginId:        text("login_id").notNull(),            // MT5 account number
  passwordEnc:    text("password_enc"),                  // AES-256 encrypted (null for webhook-only)
  server:         text("server"),                        // MT5 broker server
  platform:       text("platform").notNull(),            // mt4|mt5|ctrader|matchtrader|dxtrade|tradelocker|binance|bybit|bitget
  accountType:    text("account_type").default("demo"),  // demo|live|funded
  connectionType: text("connection_type").default("webhook"), // api|webhook
  currency:       text("currency").default("USD"),
  balance:        decimal("balance",  { precision: 14, scale: 2 }),
  equity:         decimal("equity",   { precision: 14, scale: 2 }),
  leverage:       integer("leverage"),
  isActive:       boolean("is_active").default(true),
  syncStatus:     text("sync_status").default("pending"), // pending|syncing|ok|error
  lastSyncAt:     timestamp("last_sync_at"),
  lastSyncError:  text("last_sync_error"),
  webhookToken:      text("webhook_token"),              // secret token for EA webhook
  defaultSessionId:  varchar("default_session_id"),      // auto-created session for this account
  tradeCount:        integer("trade_count").default(0),
  createdAt:         timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
});

export const insertBrokerAccountSchema = createInsertSchema(brokerAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBrokerAccount = z.infer<typeof insertBrokerAccountSchema>;
export type BrokerAccount = typeof brokerAccounts.$inferSelect;

/**
 * Raw trades synced from broker (via webhook or API poll).
 * Each record maps 1-to-1 to a journal entry once journaled.
 * externalId + brokerAccountId is a unique pair — prevents duplicate journaling.
 */
export const syncedTrades = pgTable("synced_trades", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brokerAccountId: varchar("broker_account_id").notNull().references(() => brokerAccounts.id, { onDelete: "cascade" }),
  userId:          varchar("user_id").notNull(),
  externalId:      text("external_id").notNull(),         // broker ticket / order ID
  symbol:          text("symbol").notNull(),
  direction:       text("direction").notNull(),           // Long|Short
  lots:            decimal("lots",        { precision: 10, scale: 5 }),
  openPrice:       decimal("open_price",  { precision: 12, scale: 5 }),
  closePrice:      decimal("close_price", { precision: 12, scale: 5 }),
  stopLoss:        decimal("stop_loss",   { precision: 12, scale: 5 }),
  takeProfit:      decimal("take_profit", { precision: 12, scale: 5 }),
  openTime:        timestamp("open_time"),
  closeTime:       timestamp("close_time"),
  profitLoss:      decimal("profit_loss", { precision: 10, scale: 2 }),
  commission:      decimal("commission",  { precision: 8,  scale: 2 }),
  swap:            decimal("swap",        { precision: 8,  scale: 2 }),
  comment:         text("comment"),
  magic:           integer("magic"),
  journalEntryId:  varchar("journal_entry_id"),           // null until auto-journaled
  journaledAt:     timestamp("journaled_at"),
  rawData:         jsonb("raw_data"),
  createdAt:       timestamp("created_at").defaultNow(),
});

export const insertSyncedTradeSchema = createInsertSchema(syncedTrades).omit({ id: true, createdAt: true });
export type InsertSyncedTrade = z.infer<typeof insertSyncedTradeSchema>;
export type SyncedTrade = typeof syncedTrades.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// BLOG POSTS
// ─────────────────────────────────────────────────────────────────────────────
export const blogPosts = pgTable("blog_posts", {
  id:         varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title:      text("title").notNull(),
  excerpt:    text("excerpt").default(''),
  content:    text("content").default(''),
  category:   text("category").default('Analysis'),    // Equities | Forex | Digital Assets | Analysis | Backtested Strategies
  author:     text("author").default('Admin'),
  authorId:   varchar("author_id"),
  date:       text("date").notNull(),
  readTime:   text("read_time").default('5 min'),
  imageUrl:   text("image_url").default(''),
  status:     text("status").default('Draft'),          // Published | Draft
  section:    text("section").default('blog'),           // blog | verified-strategies | trade-signals
  signalData: jsonb("signal_data"),
  authorData: jsonb("author_data"),            // { bio, expertise[], twitter, linkedin, telegram }
  createdAt:  timestamp("created_at").defaultNow(),
  updatedAt:  timestamp("updated_at").defaultNow(),
});

export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;
export type BlogPost = typeof blogPosts.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// PAGE VIEWS
// ─────────────────────────────────────────────────────────────────────────────
export const pageViews = pgTable("page_views", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  page:            text("page").notNull(),
  sessionId:       text("session_id"),
  durationSeconds: integer("duration_seconds"),
  viewedAt:        timestamp("viewed_at").defaultNow(),
});
