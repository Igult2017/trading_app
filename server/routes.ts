import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTradeSchema, insertEconomicEventSchema, insertTradingSignalSchema, insertJournalEntrySchema, insertTradingSessionSchema } from "@shared/schema";
import { analyzeScreenshotWithOCR, isOCRAvailable } from "./services/ocrScreenshotAnalyzer";
import { parseTradeText } from "./services/textTradeAnalyzer";
import { computeMetrics } from "./services/metricsCalculator";
import { computeCalendar } from "./services/calendarCalculator";
import { computeDrawdown } from "./services/drawdownCalculator";
import { computeTFMetrics, computeTFMatrix } from "./services/tfMetricsCalculator";
import { computeStrategyAudit } from "./services/strategyAuditCalculator";
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
      res.status(201).json(entry);
    } catch (error) {
      console.error("[Routes] Create journal entry error:", error);
      res.status(400).json({ error: "Invalid journal entry data" });
    }
  });

  app.put("/api/journal/entries/:id", async (req, res) => {
    try {
      const entry = await storage.updateJournalEntry(req.params.id, req.body);
      if (!entry) {
        return res.status(404).json({ error: "Journal entry not found" });
      }
      invalidateMetricsCache(entry.sessionId ?? undefined, entry.userId ?? undefined);
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
      const result = await computeCalendar(entries);
      if (result.success) {
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
      let startingBalance: number | undefined;
      if (sessionId) {
        const session = await storage.getSessionById(sessionId);
        if (session) startingBalance = parseFloat(session.startingBalance);
      }
      const result = await computeDrawdown(entries, startingBalance);
      if (result.success) {
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

  app.get("/api/prices/status", async (req, res) => {
    try {
      const isOnline = await pingPriceService();
      res.json({ status: isOnline ? "online" : "offline" });
    } catch (error) {
      res.json({ status: "offline" });
    }
  });

  app.get("/api/prices/:symbol/candles", async (req, res) => {
    try {
      const { symbol } = req.params;
      const assetClass = (req.query.assetClass as string) || "stock";
      const interval = (req.query.interval as string) || "5m";
      const period = (req.query.period as string) || "5d";
      const validAssetClasses = ["stock", "forex", "commodity", "crypto"];
      if (!validAssetClasses.includes(assetClass)) return res.status(400).json({ error: "Invalid asset class" });
      const data = await getCachedCandleData(symbol, assetClass as any, interval, period);
      if (data.error) return res.status(404).json({ error: data.error });
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch candle data" });
    }
  });

  app.get("/api/prices/:symbol", async (req, res) => {
    try {
      const assetClass = (req.query.assetClass as string) || "stock";
      const validAssetClasses = ["stock", "forex", "commodity", "crypto"];
      if (!validAssetClasses.includes(assetClass)) return res.status(400).json({ error: "Invalid asset class" });
      const priceData = await getCachedPrice(req.params.symbol, assetClass as any);
      if (priceData.error) {
        const status = priceData.error.includes('not yet in cache') ? 404 : 503;
        return res.status(status).json({ error: priceData.error });
      }
      res.json(priceData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch price" });
    }
  });

  app.post("/api/prices/batch", async (req, res) => {
    try {
      const { symbols } = req.body;
      if (!Array.isArray(symbols) || symbols.length === 0) return res.status(400).json({ error: "Symbols array is required" });
      if (symbols.length > 100) return res.status(400).json({ error: "Maximum 100 symbols per request" });
      res.json(await getCachedMultiplePrices(symbols));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prices" });
    }
  });

  app.get("/api/gemini/status", async (req, res) => {
    try {
      const isConfigured = isGeminiConfigured();
      if (!isConfigured) return res.json({ configured: false, connected: false, message: "GOOGLE_API_KEY not configured" });
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
      const { messages } = req.body as { messages: Array<{ role: string; content: string }> };
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "messages array required" });
      }

      const SYSTEM_PROMPT = `You are an elite trading coach and performance analyst connected directly to the trader's TradeLog journal database. You have full access to all their trade entries.

Your role is to:
- Query and analyse the trader's data to give sharp, specific, actionable insights.
- Point out weaknesses without sugarcoating.
- Reference specific data points and statistics.
- Keep responses focused, structured, and professional. Use markdown tables or lists for data.

Always respond as if you have already retrieved the relevant data from the database.`;

      const { GoogleGenAI } = await import("@google/genai");
      const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || "" });

      const history = messages.slice(0, -1).map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      }));
      const lastMsg = messages[messages.length - 1];

      const chat = genai.chats.create({
        model: "gemini-2.0-flash",
        config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 1000 },
        history,
      });
      const result = await chat.sendMessage({ message: lastMsg.content });
      const text = result.text ?? "";
      return res.json({ reply: text });
    } catch (err: any) {
      console.error("[TraderAI] Error:", err.message);
      return res.status(500).json({ error: err.message || "AI request failed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
