import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { supabaseAdmin, verifyToken } from "./lib/supabaseAdmin";
import { encrypt, safeDecrypt } from "./lib/crypto";
import { processIncomingTrades } from "./services/brokerSyncService";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { insertTradeSchema, insertEconomicEventSchema, insertTradingSignalSchema, insertJournalEntrySchema, insertTradingSessionSchema } from "@shared/schema";
import { analyzeScreenshotWithOCR, isOCRAvailable } from "./services/ocrScreenshotAnalyzer";
import { parseTradeText } from "./services/textTradeAnalyzer";
import { computeMetrics } from "./services/metricsCalculator";
import { computeCalendar } from "./services/calendarCalculator";
import { computeDrawdown } from "./services/drawdownCalculator";
import { computeTFMetrics, computeTFMatrix } from "./services/tfMetricsCalculator";
import { computeStrategyAudit } from "./services/strategyAuditCalculator";
import { computeAIAnalysis, computeAIStrategy, computeAIQuery } from "./services/aiEngineCalculator";
import { remapJournalEntry } from "./lib/remapJournalEntry";
import { getEconomicCalendar } from "./services/fmp";
import { cacheService } from "./scrapers/cacheService";
import { economicCalendarScraper } from "./scrapers/economicCalendarScraper";
import { interestRateScraper } from "./scrapers/interestRateScraper";
import { analyzeEventSentiment, updateEventWithSentiment } from "./services/sentimentAnalysis";
import { telegramNotificationService } from "./services/telegramNotification";
import { notificationService } from "./services/notificationService";
import { signalDetectionService } from "./services/signalDetection";
import { getInterestRateData, getInflationData, parseCurrencyPair, generateMockTimeframeData } from "./services/marketData";
import { getCachedPrice, getCachedMultiplePrices, pingPriceService, getCachedCandleData } from "./lib/priceService";
import { validateSignalWithGemini, quickMarketScan, testGeminiConnection, isGeminiConfigured, analyzeWithGemini, quickAnalyzeWithGemini } from "./services/geminiAnalysis";
import { generateTradingSignalChart, isChartGeneratorAvailable, cleanupOldCharts } from "./services/chartGenerator";
import { signalMonitor } from "./services/signalMonitor";
// ── FIX: import balance tracker ───────────────────────────────────────────────
import { getCurrentBalance, enrichTradeWithBalance } from "./services/balanceTracker";
import { getHomepageCalendar, getHomepageRates } from "./services/homepageCalendar";
import { getCryptoData } from "./services/cryptoService";

// ── Metrics in-memory cache ───────────────────────────────────────────────────
// Avoids spawning a Python process on every request when data hasn't changed.
interface MetricsCacheEntry {
  result: Awaited<ReturnType<typeof computeMetrics>>;
  entryCount: number;
  cachedAt: number;
}
const metricsCache = new Map<string, MetricsCacheEntry>();
const METRICS_CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute safety TTL

function metricsKey(userId?: string, sessionId?: string): string {
  return `${userId ?? ""}:${sessionId ?? ""}`;
}

function invalidateMetricsCache(sessionId?: string, userId?: string): void {
  if (sessionId || userId) {
    metricsCache.delete(metricsKey(userId, sessionId));
  } else {
    metricsCache.clear();
  }
}

// ── Calendar in-memory cache ──────────────────────────────────────────────────
interface CalendarCacheEntry {
  result: Awaited<ReturnType<typeof computeCalendar>>;
  entryCount: number;
  cachedAt: number;
}
const calendarCache = new Map<string, CalendarCacheEntry>();
const CALENDAR_CACHE_TTL_MS = 5 * 60 * 1000;

function invalidateCalendarCache(sessionId?: string, userId?: string): void {
  if (sessionId || userId) {
    calendarCache.delete(metricsKey(userId, sessionId));
  } else {
    calendarCache.clear();
  }
}

// ── Drawdown in-memory cache ──────────────────────────────────────────────────
interface DrawdownCacheEntry {
  result: Awaited<ReturnType<typeof computeDrawdown>>;
  entryCount: number;
  cachedAt: number;
}
const drawdownCache = new Map<string, DrawdownCacheEntry>();
const DRAWDOWN_CACHE_TTL_MS = 5 * 60 * 1000;

function invalidateDrawdownCache(sessionId?: string, userId?: string): void {
  if (sessionId || userId) {
    drawdownCache.delete(metricsKey(userId, sessionId));
  } else {
    drawdownCache.clear();
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/trades", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const trades = await storage.getTrades(userId);
      res.json(trades);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  app.get("/api/trades/:id", async (req, res) => {
    try {
      const trade = await storage.getTradeById(req.params.id);
      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }
      res.json(trade);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trade" });
    }
  });

  app.post("/api/trades", async (req, res) => {
    try {
      const validatedData = insertTradeSchema.parse(req.body);
      const trade = await storage.createTrade(validatedData);
      res.status(201).json(trade);
    } catch (error) {
      res.status(400).json({ error: "Invalid trade data" });
    }
  });

  app.put("/api/trades/:id", async (req, res) => {
    try {
      const trade = await storage.updateTrade(req.params.id, req.body);
      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }
      res.json(trade);
    } catch (error) {
      res.status(500).json({ error: "Failed to update trade" });
    }
  });

  app.delete("/api/trades/:id", async (req, res) => {
    try {
      const success = await storage.deleteTrade(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Trade not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete trade" });
    }
  });

  // --- Session Routes ---
  app.get("/api/sessions", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const sessions = await storage.getSessions(userId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getSessionById(req.params.id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  // ── FIX 1: GET /api/sessions/:id/balance ─────────────────────────────────
  // Returns the current running balance for a session.
  // Used by useSessionBalance hook in the frontend.
  app.get("/api/sessions/:id/balance", async (req, res) => {
    try {
      const summary = await getCurrentBalance(req.params.id);
      res.json(summary);
    } catch (error: any) {
      console.error("[Routes] Balance fetch error:", error);
      res.status(404).json({ error: error?.message ?? "Failed to fetch balance" });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const validatedData = insertTradingSessionSchema.parse(req.body);
      const session = await storage.createSession(validatedData);
      res.status(201).json(session);
    } catch (error) {
      console.error("[Routes] Create session error:", error);
      res.status(400).json({
        error: "Invalid session data",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.put("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.updateSession(req.params.id, req.body);
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  app.delete("/api/sessions/:id", async (req, res) => {
    try {
      const success = await storage.deleteSession(req.params.id);
      if (!success) return res.status(404).json({ error: "Session not found" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  // --- Journal Entry Routes ---

  app.post("/api/journal/analyze-screenshot", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "No image provided" });
      }

      const ocrResult = await analyzeScreenshotWithOCR(image);

      if (ocrResult.success) {
        const f = ocrResult.fields || {};
        console.log("[OCR fields] stopLossPoints:", f.stopLossPoints, "stopLossPips:", f.stopLossPips, "takeProfitPoints:", f.takeProfitPoints, "takeProfitPips:", f.takeProfitPips, "instrument:", f.instrument, "pairCategory:", f.pairCategory);
        return res.json(ocrResult);
      }

      return res.status(500).json({
        error: "Screenshot analysis failed",
        details: ocrResult.error,
      });
    } catch (error) {
      console.error("[Routes] Screenshot analysis error:", error);
      res.status(500).json({ error: "Screenshot analysis service unavailable" });
    }
  });

  app.post("/api/journal/analyze-text", (req, res) => {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "No text provided" });
    }
    const result = parseTradeText(text);
    if (!result.success) {
      return res.status(422).json({ error: "No recognisable trade fields found in the pasted text", fieldCount: 0 });
    }
    res.json(result);
  });

  app.get("/api/journal/analyze-screenshot/status", async (_req, res) => {
    try {
      const ocrAvailable = await isOCRAvailable();

      res.json({
        ocr: {
          available: ocrAvailable,
          provider: "Tesseract OCR",
          note: ocrAvailable
            ? "Active — best for screenshots with visible text labels"
            : "Tesseract or Python dependencies not installed",
        },
        activeMethod: ocrAvailable ? "ocr" : "none",
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to check analysis status" });
    }
  });

  app.get("/api/journal/entries", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const sessionId = req.query.sessionId as string | undefined;
      const entries = await storage.getJournalEntries(userId, sessionId);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch journal entries" });
    }
  });

  app.get("/api/journal/entries/:id", async (req, res) => {
    try {
      const entry = await storage.getJournalEntryById(req.params.id);
      if (!entry) {
        return res.status(404).json({ error: "Journal entry not found" });
      }
      res.json(entry);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch journal entry" });
    }
  });

  // ── FIX 2: POST /api/journal/entries — wire enrichTradeWithBalance ────────
  // Before saving to DB, if profitLoss is missing/zero the server computes it
  // from riskPercent + outcome so monetary data is always correct in the DB.
  app.post("/api/journal/entries", async (req, res) => {
    try {
      const decimalFields = [
        'entryPrice', 'stopLoss', 'takeProfit', 'stopLossDistance', 'takeProfitDistance',
        'lotSize', 'riskReward', 'riskPercent', 'spreadAtEntry', 'profitLoss',
        'pipsGainedLost', 'accountBalance', 'commission', 'mae', 'mfe',
        'monetaryRisk', 'potentialReward'
      ];
      const sanitized = { ...req.body };
      for (const field of decimalFields) {
        if (sanitized[field] !== undefined && sanitized[field] !== null && sanitized[field] !== '') {
          const raw = String(sanitized[field]);
          const match = raw.match(/-?\d+(\.\d+)?/);
          sanitized[field] = match ? match[0] : null;
        }
      }

      // ── Enrich with balance if profitLoss/accountBalance are missing ──────
      // enrichTradeWithBalance is a no-op when profitLoss is already present,
      // so this is safe to call unconditionally.
      const sessionId = sanitized.sessionId as string | undefined;
      const enriched = sessionId
        ? await enrichTradeWithBalance(sessionId, sanitized)
        : sanitized;

      // Re-sanitise any newly computed decimal fields from enrichment
      for (const field of ['profitLoss', 'accountBalance']) {
        if (enriched[field] !== undefined && enriched[field] !== null && enriched[field] !== '') {
          const raw = String(enriched[field]);
          const match = raw.match(/-?\d+(\.\d+)?/);
          enriched[field] = match ? match[0] : null;
        }
      }

      const validatedData = insertJournalEntrySchema.parse(enriched);
      const entry = await storage.createJournalEntry(validatedData);
      invalidateMetricsCache(entry.sessionId ?? undefined, entry.userId ?? undefined);
      invalidateCalendarCache(entry.sessionId ?? undefined, entry.userId ?? undefined);
      invalidateDrawdownCache(entry.sessionId ?? undefined, entry.userId ?? undefined);
      res.status(201).json(entry);
    } catch (error) {
      console.error("[Routes] Create journal entry error:", error);
      res.status(400).json({ error: "Invalid journal entry data" });
    }
  });

  app.put("/api/journal/entries/:id", async (req, res) => {
    try {
      const existing = await storage.getJournalEntryById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Journal entry not found" });

      const updates: Record<string, any> = { ...req.body };

      // When profitLoss is being corrected, recalculate accountBalance for this entry
      // so that the equity displayed for the trade stays consistent.
      // Formula: balanceBefore = existingAccountBalance - existingProfitLoss
      //          newAccountBalance = balanceBefore + newProfitLoss
      if (updates.profitLoss !== undefined && existing.accountBalance != null) {
        const oldPnL = parseFloat(String(existing.profitLoss ?? '0')) || 0;
        const newPnL = parseFloat(String(updates.profitLoss)) || 0;
        const balanceBefore = parseFloat(String(existing.accountBalance)) - oldPnL;
        updates.accountBalance = String(Math.round((balanceBefore + newPnL) * 100) / 100);
      }

      const entry = await storage.updateJournalEntry(req.params.id, updates);
      if (!entry) return res.status(404).json({ error: "Journal entry not found" });

      invalidateMetricsCache(entry.sessionId ?? undefined, entry.userId ?? undefined);
      invalidateCalendarCache(entry.sessionId ?? undefined, entry.userId ?? undefined);
      invalidateDrawdownCache(entry.sessionId ?? undefined, entry.userId ?? undefined);
      res.json(entry);
    } catch (error) {
      res.status(500).json({ error: "Failed to update journal entry" });
    }
  });

  app.delete("/api/journal/entries/:id", async (req, res) => {
    try {
      const success = await storage.deleteJournalEntry(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Journal entry not found" });
      }
      metricsCache.clear();
      calendarCache.clear();
      drawdownCache.clear();
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete journal entry" });
    }
  });

  app.get("/api/metrics/compute", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const sessionId = req.query.sessionId as string | undefined;
      const entries = await storage.getJournalEntries(userId, sessionId);

      const key = metricsKey(userId, sessionId);
      const cached = metricsCache.get(key);
      const now = Date.now();

      if (
        cached &&
        cached.entryCount === entries.length &&
        now - cached.cachedAt < METRICS_CACHE_TTL_MS
      ) {
        return res.json(cached.result);
      }

      let startingBalance: number | undefined;
      if (sessionId) {
        const session = await storage.getSessionById(sessionId);
        if (session) startingBalance = parseFloat(session.startingBalance);
      }
      const result = await computeMetrics(entries, startingBalance);
      if (result.success) {
        metricsCache.set(key, { result, entryCount: entries.length, cachedAt: now });
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error("[Routes] Metrics computation error:", error);
      res.status(500).json({ success: false, error: "Metrics computation failed" });
    }
  });

  app.get("/api/calendar/compute", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const sessionId = req.query.sessionId as string | undefined;
      const entries = await storage.getJournalEntries(userId, sessionId);

      const cacheKey = metricsKey(userId, sessionId);
      const cached = calendarCache.get(cacheKey);
      const now = Date.now();
      if (cached && cached.entryCount === entries.length && now - cached.cachedAt < CALENDAR_CACHE_TTL_MS) {
        return res.json(cached.result);
      }

      const result = await computeCalendar(entries);
      if (result.success) {
        calendarCache.set(cacheKey, { result, entryCount: entries.length, cachedAt: now });
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error("[Routes] Calendar computation error:", error);
      res.status(500).json({ success: false, error: "Calendar computation failed" });
    }
  });

  app.get("/api/drawdown/compute", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const sessionId = req.query.sessionId as string | undefined;
      const entries = await storage.getJournalEntries(userId, sessionId);

      const cacheKey = metricsKey(userId, sessionId);
      const cached = drawdownCache.get(cacheKey);
      const now = Date.now();
      if (cached && cached.entryCount === entries.length && now - cached.cachedAt < DRAWDOWN_CACHE_TTL_MS) {
        return res.json(cached.result);
      }

      let startingBalance: number | undefined;
      if (sessionId) {
        const session = await storage.getSessionById(sessionId);
        if (session) startingBalance = parseFloat(session.startingBalance);
      }
      const result = await computeDrawdown(entries, startingBalance);
      if (result.success) {
        drawdownCache.set(cacheKey, { result, entryCount: entries.length, cachedAt: now });
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error("[Routes] Drawdown computation error:", error);
      res.status(500).json({ success: false, error: "Drawdown computation failed" });
    }
  });

  app.get("/api/tf-metrics/compute", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const sessionId = req.query.sessionId as string | undefined;
      const entries = await storage.getJournalEntries(userId, sessionId);
      let startingBalance: number | undefined;
      if (sessionId) {
        const session = await storage.getSessionById(sessionId);
        if (session) startingBalance = parseFloat(session.startingBalance);
      }
      const result = await computeTFMetrics(entries, startingBalance);
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error("[Routes] TF metrics computation error:", error);
      res.status(500).json({ success: false, error: "TF metrics computation failed" });
    }
  });

  app.get("/api/tf-metrics/matrix", async (req, res) => {
    try {
      const userId    = req.query.userId    as string | undefined;
      const sessionId = req.query.sessionId as string | undefined;
      const entries   = await storage.getJournalEntries(userId, sessionId);
      const result    = await computeTFMatrix(entries);
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error("[Routes] TF matrix computation error:", error);
      res.status(500).json({ success: false, error: "TF matrix computation failed" });
    }
  });

  app.get("/api/strategy-audit/compute", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const sessionId = req.query.sessionId as string | undefined;
      const entries = await storage.getJournalEntries(userId, sessionId);
      let startingBalance: number | undefined;
      if (sessionId) {
        const session = await storage.getSessionById(sessionId);
        if (session) startingBalance = parseFloat(session.startingBalance);
      }
      const result = await computeStrategyAudit(entries, startingBalance);
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      console.error("[Routes] Strategy audit computation error:", error);
      res.status(500).json({ success: false, error: "Strategy audit computation failed" });
    }
  });

  // ── AI Engine — Analysis ────────────────────────────────────────────────────
  app.get("/api/ai/analysis", async (req, res) => {
    try {
      const userId    = req.query.userId    as string | undefined;
      const sessionId = req.query.sessionId as string | undefined;
      const entries   = await storage.getJournalEntries(userId, sessionId);
      const remapped  = entries.map((e) => remapJournalEntry(e as Record<string, any>));

      // Fetch rich metrics from the existing calculator and pass alongside trades
      let metricsContext: Record<string, any> | undefined;
      try {
        const m = await computeMetrics(remapped);
        if (m.success && m.metrics) metricsContext = m.metrics;
      } catch { /* non-fatal — AI works without metrics context */ }

      const result = await computeAIAnalysis(remapped, metricsContext);
      res.json(result);
    } catch (error) {
      console.error("[Routes] AI analysis error:", error);
      res.status(500).json({ success: false, error: "AI analysis failed" });
    }
  });

  // ── AI Engine — Strategy ────────────────────────────────────────────────────
  app.get("/api/ai/strategy", async (req, res) => {
    try {
      const userId    = req.query.userId    as string | undefined;
      const sessionId = req.query.sessionId as string | undefined;
      const entries   = await storage.getJournalEntries(userId, sessionId);
      const remapped  = entries.map((e) => remapJournalEntry(e as Record<string, any>));

      let metricsContext: Record<string, any> | undefined;
      try {
        const m = await computeMetrics(remapped);
        if (m.success && m.metrics) metricsContext = m.metrics;
      } catch { /* non-fatal */ }

      const result = await computeAIStrategy(remapped, metricsContext);
      res.json(result);
    } catch (error) {
      console.error("[Routes] AI strategy error:", error);
      res.status(500).json({ success: false, error: "AI strategy failed" });
    }
  });

  app.get("/api/analytics", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const trades = await storage.getTrades(userId);
      
      const totalTrades = trades.length;
      const winningTrades = trades.filter(t => t.outcome === 'win');
      const losingTrades = trades.filter(t => t.outcome === 'loss');
      
      const totalPnL = trades.reduce((sum, t) => sum + parseFloat(t.pnl), 0);
      const averagePnL = totalTrades > 0 ? totalPnL / totalTrades : 0;
      const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
      
      const averageWin = winningTrades.length > 0 
        ? winningTrades.reduce((sum, t) => sum + parseFloat(t.pnl), 0) / winningTrades.length 
        : 0;
      const averageLoss = losingTrades.length > 0 
        ? losingTrades.reduce((sum, t) => sum + parseFloat(t.pnl), 0) / losingTrades.length 
        : 0;

      const analytics = {
        totalTrades,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        totalPnL: totalPnL.toFixed(2),
        averagePnL: averagePnL.toFixed(2),
        winRate: winRate.toFixed(2),
        averageWin: averageWin.toFixed(2),
        averageLoss: averageLoss.toFixed(2),
      };

      res.json(analytics);
    } catch (error) {
      res.status(500).json({ error: "Failed to calculate analytics" });
    }
  });

  app.get("/api/calendar/today", async (req, res) => {
    try {
      const events = await cacheService.getOrFetchEvents('today', economicCalendarScraper);
      
      const filters = {
        region: req.query.region as string | undefined,
        impactLevel: req.query.impactLevel as string | undefined,
        currency: req.query.currency as string | undefined,
      };
      
      let filteredEvents = events;
      if (filters.region) filteredEvents = filteredEvents.filter(e => e.region?.toLowerCase() === filters.region!.toLowerCase());
      if (filters.impactLevel) filteredEvents = filteredEvents.filter(e => e.impactLevel?.toLowerCase() === filters.impactLevel!.toLowerCase());
      if (filters.currency) filteredEvents = filteredEvents.filter(e => e.currency?.toLowerCase() === filters.currency!.toLowerCase());

      res.json(filteredEvents);
    } catch (error) {
      console.error('Error in /api/calendar/today:', error);
      res.json([]);
    }
  });

  app.get("/api/calendar/week", async (req, res) => {
    try {
      const events = await cacheService.getOrFetchEvents('week', economicCalendarScraper);
      
      const filters = {
        region: req.query.region as string | undefined,
        impactLevel: req.query.impactLevel as string | undefined,
        currency: req.query.currency as string | undefined,
      };
      
      let filteredEvents = events;
      if (filters.region) filteredEvents = filteredEvents.filter(e => e.region?.toLowerCase() === filters.region!.toLowerCase());
      if (filters.impactLevel) filteredEvents = filteredEvents.filter(e => e.impactLevel?.toLowerCase() === filters.impactLevel!.toLowerCase());
      if (filters.currency) filteredEvents = filteredEvents.filter(e => e.currency?.toLowerCase() === filters.currency!.toLowerCase());

      res.json(filteredEvents);
    } catch (error) {
      console.error('Error in /api/calendar/week:', error);
      res.json([]);
    }
  });

  app.get("/api/economic-events", async (req, res) => {
    try {
      const events = await cacheService.getOrFetchEvents('upcoming', economicCalendarScraper);
      
      const filters = {
        region: req.query.region as string | undefined,
        impactLevel: req.query.impactLevel as string | undefined,
        currency: req.query.currency as string | undefined,
      };
      
      let filteredEvents = events;
      if (filters.region) filteredEvents = filteredEvents.filter(e => e.region?.toLowerCase() === filters.region!.toLowerCase());
      if (filters.impactLevel) filteredEvents = filteredEvents.filter(e => e.impactLevel?.toLowerCase() === filters.impactLevel!.toLowerCase());
      if (filters.currency) filteredEvents = filteredEvents.filter(e => e.currency?.toLowerCase() === filters.currency!.toLowerCase());

      const eventsWithSentiment = filteredEvents.map(event => updateEventWithSentiment(event));
      res.json(eventsWithSentiment);
    } catch (error) {
      console.error('Error in /api/economic-events:', error);
      res.json([]);
    }
  });

  app.get("/api/economic-events/:id", async (req, res) => {
    try {
      const event = await cacheService.getEventById(req.params.id);
      if (!event) return res.status(404).json({ error: "Event not found" });
      res.json(updateEventWithSentiment(event));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch event" });
    }
  });

  app.get("/api/economic-events/:id/analysis", async (req, res) => {
    try {
      const event = await cacheService.getEventById(req.params.id);
      if (!event) return res.status(404).json({ error: "Event not found" });
      res.json({ event: updateEventWithSentiment(event), analysis: analyzeEventSentiment(event) });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch event analysis" });
    }
  });

  app.post("/api/economic-events", async (req, res) => {
    try {
      const validatedData = insertEconomicEventSchema.parse(req.body);
      const event = await storage.createEconomicEvent(validatedData);
      res.status(201).json(event);
    } catch (error) {
      res.status(400).json({ error: "Invalid event data" });
    }
  });

  app.put("/api/economic-events/:id", async (req, res) => {
    try {
      const event = await storage.updateEconomicEvent(req.params.id, req.body);
      if (!event) return res.status(404).json({ error: "Event not found" });
      res.json(event);
    } catch (error) {
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  app.delete("/api/economic-events/:id", async (req, res) => {
    try {
      const success = await storage.deleteEconomicEvent(req.params.id);
      if (!success) return res.status(404).json({ error: "Event not found" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  // ── Homepage economic calendar (newskeeper scraper) ──────────────────────
  app.get("/api/homepage/calendar", async (_req, res) => {
    try {
      const events = await getHomepageCalendar();
      res.json(events);
    } catch (error) {
      console.error("[homepage/calendar]", error);
      res.json([]);
    }
  });

  app.get("/api/homepage/rates", async (_req, res) => {
    try {
      const rates = await getHomepageRates();
      res.json(rates);
    } catch (error) {
      console.error("[homepage/rates]", error);
      res.json({});
    }
  });
  // ─────────────────────────────────────────────────────────────────────────

  // ── Crypto market data ────────────────────────────────────────────────────
  app.get("/api/crypto/market", async (_req, res) => {
    try {
      const data = await getCryptoData();
      res.json(data.market);
    } catch (error) {
      console.error("[crypto/market]", error);
      res.json([]);
    }
  });

  app.get("/api/crypto/global", async (_req, res) => {
    try {
      const data = await getCryptoData();
      res.json(data.global);
    } catch (error) {
      console.error("[crypto/global]", error);
      res.json({});
    }
  });

  app.get("/api/crypto/fear-greed", async (_req, res) => {
    try {
      const data = await getCryptoData();
      res.json(data.fearGreed);
    } catch (error) {
      console.error("[crypto/fear-greed]", error);
      res.json({});
    }
  });

  app.get("/api/crypto/trending", async (_req, res) => {
    try {
      const data = await getCryptoData();
      res.json(data.trending);
    } catch (error) {
      console.error("[crypto/trending]", error);
      res.json([]);
    }
  });

  app.get("/api/crypto/all", async (_req, res) => {
    try {
      const data = await getCryptoData();
      res.json(data);
    } catch (error) {
      console.error("[crypto/all]", error);
      res.json({ market: [], global: {}, fearGreed: {}, trending: [] });
    }
  });
  // ─────────────────────────────────────────────────────────────────────────

  app.get("/api/interest-rates", async (req, res) => {
    try {
      let rates = await storage.getInterestRates();
      if (rates.length === 0) {
        const scrapedRates = await interestRateScraper.scrape();
        const liveRates = scrapedRates.filter(r => r.isLiveData);
        if (liveRates.length === 0) {
          return res.status(503).json({ error: "Interest rates temporarily unavailable - no live data" });
        }
        return res.json(liveRates);
      }
      res.json(rates);
    } catch (error) {
      console.error('Error fetching interest rates:', error);
      res.status(500).json({ error: "Failed to fetch interest rates" });
    }
  });

  app.get("/api/interest-rates/:currency", async (req, res) => {
    try {
      let rate = await storage.getInterestRateByCurrency(req.params.currency);
      if (!rate) {
        const scrapedRate = await interestRateScraper.getInterestRateForCurrency(req.params.currency);
        if (!scrapedRate || !scrapedRate.isLiveData) {
          return res.status(404).json({ error: "Interest rate not found for currency" });
        }
        return res.json(scrapedRate);
      }
      res.json(rate);
    } catch (error) {
      console.error('Error fetching interest rate:', error);
      res.status(500).json({ error: "Failed to fetch interest rate" });
    }
  });

  app.get("/api/interest-rates/differential/:pair", async (req, res) => {
    try {
      const pair = req.params.pair.toUpperCase();
      const [base, quote] = pair.includes('/') ? pair.split('/') : [pair.substring(0, 3), pair.substring(3, 6)];
      if (!base || !quote) return res.status(400).json({ error: "Invalid currency pair format" });
      const differential = await interestRateScraper.getInterestRateDifferential(base, quote);
      if (!differential) return res.status(404).json({ error: "Could not calculate differential for this pair" });
      res.json({
        pair: `${base}/${quote}`,
        ...differential,
        carryTradeDirection: differential.differential > 0 ? `Long ${base}/${quote}` : `Short ${base}/${quote}`,
      });
    } catch (error) {
      console.error('Error calculating interest rate differential:', error);
      res.status(500).json({ error: "Failed to calculate differential" });
    }
  });

  app.post("/api/notifications/signal", async (req, res) => {
    try {
      const signal = req.body;
      if (!signal.symbol || !signal.type || !signal.entry) {
        return res.status(400).json({ error: "Invalid signal data" });
      }
      const typeEmoji = signal.type === 'buy' ? '🟢' : '🔴';
      await notificationService.createNotification({
        type: 'trading_signal',
        title: `${typeEmoji} ${signal.symbol} - ${signal.type.toUpperCase()}`,
        message: `Strategy: ${signal.strategy} | Entry: ${signal.entry} | SL: ${signal.stopLoss} | TP: ${signal.takeProfit} | R/R: 1:${signal.riskReward}`,
        metadata: JSON.stringify(signal),
      });
      res.json({ success: true, message: "Signal notification created" });
    } catch (error) {
      console.error("Error creating signal notification:", error);
      res.status(500).json({ error: "Failed to create signal notification" });
    }
  });

  app.get("/api/notifications/status", async (req, res) => {
    try {
      const isReady = telegramNotificationService.isReady();
      res.json({ telegramBotActive: isReady, message: isReady ? "Telegram notifications are active" : "Telegram bot is not configured" });
    } catch (error) {
      res.status(500).json({ error: "Failed to get notification status" });
    }
  });

  app.get("/api/notifications", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      res.json(await notificationService.getNotifications(limit));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread", async (req, res) => {
    try {
      res.json(await notificationService.getUnreadNotifications());
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch unread notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      await notificationService.markAsRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-all", async (req, res) => {
    try {
      await notificationService.markAllAsRead();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      await notificationService.deleteNotification(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  app.delete("/api/notifications/clear-all", async (req, res) => {
    try {
      await notificationService.clearAllNotifications();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear all notifications" });
    }
  });

  app.get("/api/trading-signals", async (_req, res) => { res.json([]); });
  app.get("/api/trading-signals/:id", async (_req, res) => { res.status(503).json({ error: "Signal generation is disabled" }); });
  app.post("/api/trading-signals/generate", async (_req, res) => { res.status(503).json({ error: "Signal generation is disabled" }); });
  app.post("/api/trading-signals", async (_req, res) => { res.status(503).json({ error: "Signal generation is disabled" }); });
  app.patch("/api/trading-signals/:id", async (_req, res) => { res.status(503).json({ error: "Signal generation is disabled" }); });
  app.delete("/api/trading-signals/:id", async (_req, res) => { res.status(503).json({ error: "Signal generation is disabled" }); });

  app.get("/api/signals/watchlist", async (_req, res) => { res.json([]); });
  app.get("/api/signals/active", async (_req, res) => { res.json([]); });
  app.post("/api/signals/:id/promote", async (_req, res) => { res.status(503).json({ error: "Signal generation is disabled" }); });
  app.post("/api/signals/:id/watchlist", async (_req, res) => { res.status(503).json({ error: "Signal generation is disabled" }); });
  app.post("/api/signals/check-outcomes", async (_req, res) => { res.json({ checked: 0, outcomes: [], message: "Signal generation is disabled" }); });
  app.get("/api/signals/monitor/status", async (_req, res) => { res.json({ status: "disabled" }); });

  app.get("/api/pending-setups", async (req, res) => {
    try {
      const filters = {
        symbol: req.query.symbol as string | undefined,
        readyForSignal: req.query.readyForSignal === 'true' ? true : undefined,
        invalidated: req.query.invalidated === 'true' ? true : false,
      };
      res.json(await storage.getPendingSetups(filters));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending setups" });
    }
  });

  app.get("/api/pending-setups/:id", async (req, res) => {
    try {
      const setup = await storage.getPendingSetupById(req.params.id);
      if (!setup) return res.status(404).json({ error: "Pending setup not found" });
      res.json(setup);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending setup" });
    }
  });

  // DISABLED — Assets panel coming soon. To re-enable, restore all four handlers below.
  app.get("/api/prices/status",          (_req, res) => res.status(503).json({ error: "Assets panel is currently disabled." }));
  app.get("/api/prices/:symbol/candles", (_req, res) => res.status(503).json({ error: "Assets panel is currently disabled." }));
  app.get("/api/prices/:symbol",         (_req, res) => res.status(503).json({ error: "Assets panel is currently disabled." }));
  app.post("/api/prices/batch",          (_req, res) => res.status(503).json({ error: "Assets panel is currently disabled." }));

  app.get("/api/gemini/status", async (req, res) => {
    try {
      const isConfigured = isGeminiConfigured();
      if (!isConfigured) return res.json({ configured: false, connected: false, message: "GEMINI_API_KEY (or GOOGLE_API_KEY) not configured" });
      const connectionTest = await testGeminiConnection();
      res.json({ configured: true, connected: connectionTest.success, message: connectionTest.message });
    } catch (error) {
      res.status(500).json({ error: "Failed to check Gemini status" });
    }
  });

  app.post("/api/gemini/validate", async (_req, res) => { res.status(503).json({ error: "Signal generation is disabled" }); });
  app.post("/api/gemini/scan",     async (_req, res) => { res.status(503).json({ error: "Signal generation is disabled" }); });
  app.post("/api/gemini/analyze",  async (_req, res) => { res.status(503).json({ error: "Signal generation is disabled" }); });
  app.post("/api/gemini/quick-scan", async (_req, res) => { res.status(503).json({ error: "Signal generation is disabled" }); });

  app.get("/api/charts/status",     async (_req, res) => { res.json({ available: false }); });
  app.post("/api/charts/generate",  async (_req, res) => { res.status(503).json({ error: "Signal generation is disabled" }); });
  app.post("/api/charts/cleanup",   async (_req, res) => { res.json({ success: true }); });

  console.log('[Server] Signal monitor: DISABLED');

  app.post("/api/trader-ai/chat", async (req, res) => {
    try {
      const { messages, sessionId } = req.body as {
        messages: Array<{ role: string; content: string }>;
        sessionId?: string;
      };
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array required" });
      }

      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
      if (!apiKey) {
        return res.status(503).json({ error: "GEMINI_API_KEY is not configured on this server." });
      }

      // Fetch and remap trade data for this session
      const rawTrades = await storage.getJournalEntries(undefined, sessionId || undefined);
      const trades    = rawTrades.map((e) => remapJournalEntry(e as Record<string, any>));

      const question = messages[messages.length - 1].content;

      if (trades.length === 0) {
        return res.json({
          reply: "No trades found for this session yet. Record some trades first and I'll be able to give you data-driven analysis.",
        });
      }

      // Route through the Python AI engine (QA mode) — grounded in real data
      const result = await computeAIQuery(trades, question);

      if (!result.success) {
        console.error("[TraderAI] AI engine error:", result.error);
        return res.status(500).json({ error: result.error || "AI engine failed" });
      }

      return res.json({ reply: result.answer ?? "" });
    } catch (err: any) {
      console.error("[TraderAI] Error:", err.message);
      return res.status(500).json({ error: err.message || "AI request failed" });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // COPY TRADING API
  // All routes under /api/copy — shares the existing PostgreSQL database.
  // The Python microservices (FastAPI on port 8001) consume the same tables.
  // ════════════════════════════════════════════════════════════════════════════

  // ── Accounts ─────────────────────────────────────────────────────────────────
  app.get("/api/copy/accounts", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const accounts = await storage.getCopyAccounts(userId);
      const safe = accounts.map(({ passwordEnc: _, ...a }) => a);
      return res.json(safe);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.get("/api/copy/accounts/:id", async (req, res) => {
    try {
      const account = await storage.getCopyAccountById(req.params.id);
      if (!account) return res.status(404).json({ error: "Account not found" });
      const { passwordEnc: _, ...safe } = account;
      return res.json(safe);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.post("/api/copy/accounts", async (req, res) => {
    try {
      const { nickname, platform, brokerServer, loginId, password, role, symbolPrefix, symbolSuffix, userId } = req.body;
      if (!loginId || !password || !role || !platform) return res.status(400).json({ error: "Missing required fields: loginId, password, role, platform" });
      // Base64 placeholder — the Python bridge replaces this with AES-256 on first connect
      const passwordEnc = Buffer.from(password).toString("base64");
      const account = await storage.createCopyAccount({ nickname: nickname || loginId, platform, brokerServer, loginId, passwordEnc, role, symbolPrefix, symbolSuffix, userId, isActive: true });
      const { passwordEnc: _, ...safe } = account;
      return res.status(201).json(safe);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.put("/api/copy/accounts/:id", async (req, res) => {
    try {
      const { password, ...rest } = req.body;
      const updates: any = { ...rest };
      if (password) updates.passwordEnc = Buffer.from(password).toString("base64");
      const updated = await storage.updateCopyAccount(req.params.id, updates);
      if (!updated) return res.status(404).json({ error: "Account not found" });
      const { passwordEnc: _, ...safe } = updated;
      return res.json(safe);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/copy/accounts/:id", async (req, res) => {
    try {
      return res.json({ success: await storage.deleteCopyAccount(req.params.id) });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── Masters ───────────────────────────────────────────────────────────────────
  app.get("/api/copy/masters/public", async (req, res) => {
    try {
      return res.json(await storage.getPublicMastersWithStats());
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.get("/api/copy/masters", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      return res.json(await storage.getCopyMasters(userId));
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.get("/api/copy/masters/:id", async (req, res) => {
    try {
      const master = await storage.getCopyMasterById(req.params.id);
      if (!master) return res.status(404).json({ error: "Master not found" });
      return res.json(master);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.post("/api/copy/masters", async (req, res) => {
    try {
      return res.status(201).json(await storage.createCopyMaster(req.body));
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.put("/api/copy/masters/:id", async (req, res) => {
    try {
      const updated = await storage.updateCopyMaster(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Master not found" });
      return res.json(updated);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/copy/masters/:id", async (req, res) => {
    try {
      return res.json({ success: await storage.deleteCopyMaster(req.params.id) });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── Telegram source ───────────────────────────────────────────────────────────
  app.get("/api/copy/masters/:masterId/telegram", async (req, res) => {
    try {
      const src = await storage.getTelegramSource(req.params.masterId);
      if (!src) return res.status(404).json({ error: "No Telegram source configured" });
      const { apiHashEnc: _, ...safe } = src as any;
      return res.json(safe);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.put("/api/copy/masters/:masterId/telegram", async (req, res) => {
    try {
      const src = await storage.upsertTelegramSource({ ...req.body, masterId: req.params.masterId });
      const { apiHashEnc: _, ...safe } = src as any;
      return res.json(safe);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── Followers ─────────────────────────────────────────────────────────────────
  app.get("/api/copy/followers", async (req, res) => {
    try {
      const { userId, masterId } = req.query as { userId?: string; masterId?: string };
      return res.json(await storage.getCopyFollowers(userId, masterId));
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.get("/api/copy/followers/:id", async (req, res) => {
    try {
      const follower = await storage.getCopyFollowerById(req.params.id);
      if (!follower) return res.status(404).json({ error: "Follower not found" });
      return res.json(follower);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.post("/api/copy/followers", async (req, res) => {
    try {
      return res.status(201).json(await storage.createCopyFollower(req.body));
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.put("/api/copy/followers/:id", async (req, res) => {
    try {
      const updated = await storage.updateCopyFollower(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: "Follower not found" });
      return res.json(updated);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/copy/followers/:id", async (req, res) => {
    try {
      return res.json({ success: await storage.deleteCopyFollower(req.params.id) });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── Deploy — persists full wizard config and queues the bridge start ──────────
  app.post("/api/copy/deploy", async (req, res) => {
    try {
      const { role, accountConfig, masterConfig, followerConfig, telegramConfig, userId } = req.body;
      if (!role) return res.status(400).json({ error: "role is required" });

      // 1. Save broker account
      const ac = accountConfig || {};
      const account = await storage.createCopyAccount({
        nickname:     ac.nickname || ac.loginId || "My Account",
        platform:     ac.platform || "MT5",
        brokerServer: ac.brokerServer,
        loginId:      ac.loginId || "unknown",
        passwordEnc:  ac.password ? Buffer.from(ac.password).toString("base64") : "",
        role:         role === "provider" ? "master" : "follower",
        symbolPrefix: ac.symbolPrefix,
        symbolSuffix: ac.symbolSuffix,
        userId,
        isActive:     true,
      });

      let masterRecord: any = null;
      let followerRecord: any = null;

      // 2. Master record for provider / self / telegram roles
      if (["provider", "self", "telegram"].includes(role)) {
        masterRecord = await storage.createCopyMaster({
          userId,
          accountId:       account.id,
          sourceType:      role === "telegram" ? "telegram" : "mt5",
          strategyName:    masterConfig?.strategyName,
          description:     masterConfig?.description,
          tradingStyle:    masterConfig?.tradingStyle,
          primaryMarket:   masterConfig?.primaryMarket,
          isPublic:        masterConfig?.isPublic ?? true,
          requireApproval: masterConfig?.requireApproval ?? false,
          showOpenTrades:  masterConfig?.showOpenTrades ?? true,
          isActive:        true,
        });
        if (role === "telegram" && telegramConfig) {
          await storage.upsertTelegramSource({ ...telegramConfig, masterId: masterRecord.id });
        }
      }

      // 3. Follower record for follower / self roles
      if (["follower", "self"].includes(role)) {
        const fc = followerConfig || {};
        followerRecord = await storage.createCopyFollower({
          userId,
          accountId:       account.id,
          masterId:        fc.masterId || masterRecord?.id,
          lotMode:         fc.lotMode || "mult",
          lotMultiplier:   fc.lotMultiplier || "1.0",
          fixedLot:        fc.fixedLot,
          riskPercent:     fc.riskPercent || "1.0",
          direction:       fc.direction || "same",
          symbolWhitelist: fc.symbolWhitelist,
          symbolBlacklist: fc.symbolBlacklist,
          maxOpenTrades:   fc.maxOpenTrades || 10,
          tradeDelaySec:   fc.tradeDelaySec || 0,
          pauseInactive:   fc.pauseInactive ?? true,
          pauseOnDD:       fc.pauseOnDD ?? true,
          maxDdPercent:    fc.maxDdPercent,
          maxDailyLoss:    fc.maxDailyLoss,
          isActive:        true,
          riskAccepted:    fc.riskAccepted ?? false,
          deployedAt:      new Date(),
        });
      }

      return res.status(201).json({
        success:  true,
        role,
        account:  { id: account.id },
        master:   masterRecord   ? { id: masterRecord.id }   : null,
        follower: followerRecord ? { id: followerRecord.id } : null,
        message:  "Configuration saved. Start the Python bridge service to begin copying.",
      });
    } catch (err: any) {
      console.error("[CopyTrade] Deploy error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Trade history & execution logs ────────────────────────────────────────────
  app.get("/api/copy/trades/master/:masterId", async (req, res) => {
    try {
      return res.json(await storage.getCopyMasterTrades(req.params.masterId, parseInt(req.query.limit as string) || 100));
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.get("/api/copy/trades/follower/:followerId", async (req, res) => {
    try {
      return res.json(await storage.getCopyFollowerTrades(req.params.followerId, parseInt(req.query.limit as string) || 100));
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.get("/api/copy/logs/:followerId", async (req, res) => {
    try {
      return res.json(await storage.getCopyExecutionLogs(req.params.followerId, parseInt(req.query.limit as string) || 200));
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── Broker Account Sync ───────────────────────────────────────────────────────
  // All routes require a valid Supabase JWT (Authorization: Bearer <token>).
  // Data is strictly isolated per userId extracted from the JWT.

  /** List the calling user's broker accounts (passwords stripped). */
  app.get("/api/broker-accounts", async (req: Request, res: Response) => {
    const user = await verifyToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const accounts = await storage.getBrokerAccounts(user.id);
    // Never return encrypted password to client
    const safe = accounts.map(({ passwordEnc: _, ...a }) => a);
    return res.json(safe);
  });

  /** Add a broker account. Encrypts password before storing. */
  app.post("/api/broker-accounts", async (req: Request, res: Response) => {
    const user = await verifyToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { name, loginId, password, server, platform, accountType, connectionType, currency } = req.body as {
      name: string; loginId: string; password?: string; server?: string;
      platform: string; accountType?: string; connectionType?: string; currency?: string;
    };

    if (!name || !loginId || !platform) {
      return res.status(400).json({ error: "name, loginId, and platform are required" });
    }

    const passwordEnc = password ? encrypt(password) : undefined;
    const webhookToken = randomBytes(24).toString('hex');

    try {
      const account = await storage.createBrokerAccount({
        userId:         user.id,
        name,
        loginId,
        passwordEnc,
        server,
        platform,
        accountType:    accountType    ?? 'demo',
        connectionType: connectionType ?? 'webhook',
        currency:       currency       ?? 'USD',
        webhookToken,
        syncStatus: 'pending',
      });

      const { passwordEnc: _, ...safe } = account;
      return res.status(201).json({ ...safe, webhookUrl: `/api/broker/webhook/${webhookToken}` });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /** Update a broker account (rename, change type, etc.). */
  app.put("/api/broker-accounts/:id", async (req: Request, res: Response) => {
    const user = await verifyToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const account = await storage.getBrokerAccountById(req.params.id);
    if (!account || account.userId !== user.id) return res.status(404).json({ error: "Not found" });

    const { name, server, accountType, currency, password } = req.body as Record<string, string>;
    const updates: Record<string, unknown> = {};
    if (name)        updates.name        = name;
    if (server)      updates.server      = server;
    if (accountType) updates.accountType = accountType;
    if (currency)    updates.currency    = currency;
    if (password)    updates.passwordEnc = encrypt(password);

    const updated = await storage.updateBrokerAccount(req.params.id, updates as any);
    const { passwordEnc: _, ...safe } = updated!;
    return res.json(safe);
  });

  /** Delete a broker account (cascades to synced trades). */
  app.delete("/api/broker-accounts/:id", async (req: Request, res: Response) => {
    const user = await verifyToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const account = await storage.getBrokerAccountById(req.params.id);
    if (!account || account.userId !== user.id) return res.status(404).json({ error: "Not found" });

    await storage.deleteBrokerAccount(req.params.id);
    return res.json({ success: true });
  });

  /** Get raw synced trades for an account. */
  app.get("/api/broker-accounts/:id/trades", async (req: Request, res: Response) => {
    const user = await verifyToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const account = await storage.getBrokerAccountById(req.params.id);
    if (!account || account.userId !== user.id) return res.status(404).json({ error: "Not found" });

    const trades = await storage.getSyncedTrades(req.params.id, parseInt(String(req.query.limit)) || 200);
    return res.json(trades);
  });

  /**
   * EA Webhook — receives closed trades from an MT5/MT4 Expert Advisor.
   *
   * The EA posts JSON to:
   *   POST /api/broker/webhook/:token
   *
   * Payload (single trade or array):
   * {
   *   externalId: "12345678",
   *   symbol: "EURUSD",
   *   direction: "buy",        // buy|sell|Long|Short
   *   lots: 0.10,
   *   openPrice: 1.08500,
   *   closePrice: 1.09000,
   *   stopLoss: 1.08000,
   *   takeProfit: 1.09500,
   *   openTime: "2024-01-15T08:00:00Z",   // ISO string or Unix seconds
   *   closeTime: "2024-01-15T14:00:00Z",
   *   profit: 50.00,
   *   commission: -1.50,
   *   swap: 0,
   *   comment: "EA trade"
   * }
   *
   * No auth header needed — the secret token in the URL authenticates the EA.
   */
  app.post("/api/broker/webhook/:token", async (req: Request, res: Response) => {
    const account = await storage.getBrokerAccountByWebhookToken(req.params.token);
    if (!account) return res.status(401).json({ error: "Invalid webhook token" });
    if (!account.isActive) return res.status(403).json({ error: "Account is inactive" });

    const body = req.body;
    const trades = Array.isArray(body) ? body : [body];

    if (trades.length === 0) return res.json({ created: 0, duplicates: 0, journaled: 0 });
    if (trades.length > 500) return res.status(400).json({ error: "Max 500 trades per request" });

    try {
      await storage.updateBrokerAccount(account.id, { syncStatus: 'syncing' });
      const result = await processIncomingTrades(account.id, account.userId, trades);
      return res.json(result);
    } catch (err: any) {
      await storage.updateBrokerAccount(account.id, { syncStatus: 'error', lastSyncError: err.message });
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * Manual sync trigger (for API-connected accounts in future).
   * Currently marks the account as syncing and returns instructions.
   */
  app.post("/api/broker-accounts/:id/sync", async (req: Request, res: Response) => {
    const user = await verifyToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const account = await storage.getBrokerAccountById(req.params.id);
    if (!account || account.userId !== user.id) return res.status(404).json({ error: "Not found" });

    if (account.connectionType === 'webhook') {
      return res.json({
        message: "This account uses EA webhook sync. Trades are pushed automatically when your EA closes a position.",
        webhookUrl: `/api/broker/webhook/${account.webhookToken}`,
        connectionType: 'webhook',
      });
    }

    // API polling (placeholder — connect to MetaStats or bridge here)
    return res.json({
      message: "API sync queued",
      status: 'pending',
    });
  });

  /** Get the EA webhook URL for an account. */
  app.get("/api/broker-accounts/:id/webhook-url", async (req: Request, res: Response) => {
    const user = await verifyToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const account = await storage.getBrokerAccountById(req.params.id);
    if (!account || account.userId !== user.id) return res.status(404).json({ error: "Not found" });

    return res.json({
      webhookUrl: `${req.protocol}://${req.get('host')}/api/broker/webhook/${account.webhookToken}`,
      token: account.webhookToken,
    });
  });

  // ── Auth: first-user admin setup ─────────────────────────────────────────────
  // Called by the client right after a new account is created.
  // If no admin exists yet, this user becomes admin.
  app.post("/api/auth/setup", async (req: Request, res: Response) => {
    const user = await verifyToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    try {
      // List all users to check if an admin already exists
      const { data: { users: allUsers }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (error) return res.status(500).json({ error: error.message });

      const adminExists = allUsers.some(u => u.app_metadata?.role === 'admin');

      if (!adminExists) {
        // Promote this user to admin
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          app_metadata: { role: 'admin' },
        });
        return res.json({ role: 'admin', message: 'You are the first user — admin role granted.' });
      }

      // Regular user
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        app_metadata: { role: 'user' },
      });
      return res.json({ role: 'user' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin middleware ──────────────────────────────────────────────────────────
  async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const user = await verifyToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (user.app_metadata?.role !== 'admin') return res.status(403).json({ error: "Forbidden — admins only" });
    (req as any).adminUser = user;
    next();
  }

  // ── Admin: list all users ─────────────────────────────────────────────────────
  app.get("/api/admin/users", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (error) return res.status(500).json({ error: error.message });

      const result = users.map(u => ({
        id:             u.id,
        email:          u.email ?? '',
        full_name:      u.user_metadata?.full_name ?? '',
        role:           u.app_metadata?.role ?? 'user',
        created_at:     u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      }));

      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: change a user's role ───────────────────────────────────────────────
  app.patch("/api/admin/users/:userId/role", requireAdmin, async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { role } = req.body as { role: string };

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: "role must be 'admin' or 'user'" });
    }

    try {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: { role },
      });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true, userId, role });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
