import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTradeSchema, insertEconomicEventSchema, insertTradingSignalSchema } from "@shared/schema";
import { getEconomicCalendar } from "./services/fmp";
import { cacheService } from "./scrapers/cacheService";
import { economicCalendarScraper } from "./scrapers/economicCalendarScraper";
import { analyzeEventSentiment, updateEventWithSentiment } from "./services/sentimentAnalysis";
import { telegramNotificationService } from "./services/telegramNotification";
import { notificationService } from "./services/notificationService";
import { signalDetectionService } from "./services/signalDetection";
import { getInterestRateData, getInflationData, parseCurrencyPair, generateMockTimeframeData } from "./services/marketData";
import { getCachedPrice, getCachedMultiplePrices, pingPriceService } from "./lib/priceService";
import { analyzeWithGemini, quickAnalyzeWithGemini, testGeminiConnection, isGeminiConfigured } from "./services/geminiAnalysis";
import { generateTradingSignalChart, isChartGeneratorAvailable, cleanupOldCharts } from "./services/chartGenerator";

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
      if (filters.region) {
        filteredEvents = filteredEvents.filter(e => e.region === filters.region);
      }
      if (filters.impactLevel) {
        filteredEvents = filteredEvents.filter(e => e.impactLevel === filters.impactLevel);
      }
      if (filters.currency) {
        filteredEvents = filteredEvents.filter(e => e.currency === filters.currency);
      }
      
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
      if (filters.region) {
        filteredEvents = filteredEvents.filter(e => e.region === filters.region);
      }
      if (filters.impactLevel) {
        filteredEvents = filteredEvents.filter(e => e.impactLevel === filters.impactLevel);
      }
      if (filters.currency) {
        filteredEvents = filteredEvents.filter(e => e.currency === filters.currency);
      }
      
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
      if (filters.region) {
        filteredEvents = filteredEvents.filter(e => e.region === filters.region);
      }
      if (filters.impactLevel) {
        filteredEvents = filteredEvents.filter(e => e.impactLevel === filters.impactLevel);
      }
      if (filters.currency) {
        filteredEvents = filteredEvents.filter(e => e.currency === filters.currency);
      }
      
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
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      const eventWithSentiment = updateEventWithSentiment(event);
      res.json(eventWithSentiment);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch event" });
    }
  });

  app.get("/api/economic-events/:id/analysis", async (req, res) => {
    try {
      const event = await cacheService.getEventById(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      const analysis = analyzeEventSentiment(event);
      res.json({
        event: updateEventWithSentiment(event),
        analysis
      });
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
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  app.delete("/api/economic-events/:id", async (req, res) => {
    try {
      const success = await storage.deleteEconomicEvent(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  app.post("/api/notifications/signal", async (req, res) => {
    try {
      const signal = req.body;
      
      if (!signal.symbol || !signal.type || !signal.entry) {
        return res.status(400).json({ error: "Invalid signal data" });
      }

      const typeEmoji = signal.type === 'buy' ? '🟢' : '🔴';
      const title = `${typeEmoji} ${signal.symbol} - ${signal.type.toUpperCase()}`;
      const message = `Strategy: ${signal.strategy} | Entry: ${signal.entry} | SL: ${signal.stopLoss} | TP: ${signal.takeProfit} | R/R: 1:${signal.riskReward}`;
      
      await notificationService.createNotification({
        type: 'trading_signal',
        title,
        message,
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
      res.json({ 
        telegramBotActive: isReady,
        message: isReady 
          ? "Telegram notifications are active" 
          : "Telegram bot is not configured"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get notification status" });
    }
  });

  app.get("/api/notifications", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const notifications = await notificationService.getNotifications(limit);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread", async (req, res) => {
    try {
      const notifications = await notificationService.getUnreadNotifications();
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching unread notifications:", error);
      res.status(500).json({ error: "Failed to fetch unread notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      await notificationService.markAsRead(req.params.id);
      res.json({ success: true, message: "Notification marked as read" });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-all", async (req, res) => {
    try {
      await notificationService.markAllAsRead();
      res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      await notificationService.deleteNotification(req.params.id);
      res.json({ success: true, message: "Notification deleted" });
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  app.delete("/api/notifications/clear-all", async (req, res) => {
    try {
      await notificationService.clearAllNotifications();
      res.json({ success: true, message: "All notifications cleared" });
    } catch (error) {
      console.error("Error clearing all notifications:", error);
      res.status(500).json({ error: "Failed to clear all notifications" });
    }
  });

  app.get("/api/trading-signals", async (req, res) => {
    try {
      const filters = {
        status: req.query.status as string | undefined,
        assetClass: req.query.assetClass as string | undefined,
        symbol: req.query.symbol as string | undefined,
      };
      const signals = await storage.getTradingSignals(filters);
      res.json(signals);
    } catch (error) {
      console.error("Error fetching trading signals:", error);
      res.status(500).json({ error: "Failed to fetch trading signals" });
    }
  });

  app.get("/api/trading-signals/:id", async (req, res) => {
    try {
      const signal = await storage.getTradingSignalById(req.params.id);
      if (!signal) {
        return res.status(404).json({ error: "Signal not found" });
      }
      res.json(signal);
    } catch (error) {
      console.error("Error fetching signal:", error);
      res.status(500).json({ error: "Failed to fetch signal" });
    }
  });

  app.post("/api/trading-signals/generate", async (req, res) => {
    try {
      const { symbol, assetClass, trend } = req.body;
      
      if (!symbol || !assetClass) {
        return res.status(400).json({ error: "Symbol and assetClass are required" });
      }

      let interestRateData = undefined;
      let inflationData = undefined;

      if (assetClass === 'forex') {
        const pair = parseCurrencyPair(symbol);
        if (pair) {
          const baseIR = getInterestRateData(pair.base);
          const quoteIR = getInterestRateData(pair.quote);
          const baseInf = getInflationData(pair.base);
          const quoteInf = getInflationData(pair.quote);

          if (baseIR && quoteIR) {
            interestRateData = { base: baseIR, quote: quoteIR };
          }
          if (baseInf && quoteInf) {
            inflationData = { base: baseInf, quote: quoteInf };
          }
        }
      }

      const currentPrice = req.body.currentPrice || 1.0850;
      const trendBias = trend || 'bullish';

      const dailyData = generateMockTimeframeData(currentPrice, trendBias, 30);
      const h4Data = generateMockTimeframeData(currentPrice, trendBias, 25);
      const h1Data = generateMockTimeframeData(currentPrice, trendBias, 20);
      const m15Data = generateMockTimeframeData(currentPrice, trendBias, 15);

      const signal = signalDetectionService.generateTradingSignal({
        symbol,
        assetClass,
        interestRateData,
        inflationData,
        dailyData,
        h4Data,
        h1Data,
        m15Data,
      });

      if (!signal) {
        return res.status(400).json({ error: "Could not generate signal - confidence too low" });
      }

      const createdSignal = await storage.createTradingSignal(signal);

      await notificationService.createNotification({
        type: 'trading_signal',
        title: `${signal.type === 'buy' ? '🟢' : '🔴'} ${symbol} - ${signal.type.toUpperCase()}`,
        message: `Confidence: ${signal.overallConfidence}% | Entry: ${signal.entryPrice} | R:R: 1:${signal.riskRewardRatio}`,
        metadata: JSON.stringify(createdSignal),
      });

      res.json(createdSignal);
    } catch (error) {
      console.error("Error generating signal:", error);
      res.status(500).json({ error: "Failed to generate signal" });
    }
  });

  app.post("/api/trading-signals", async (req, res) => {
    try {
      const validatedData = insertTradingSignalSchema.parse(req.body);
      const signal = await storage.createTradingSignal(validatedData);
      res.status(201).json(signal);
    } catch (error) {
      console.error("Error creating signal:", error);
      res.status(400).json({ error: "Invalid signal data" });
    }
  });

  app.patch("/api/trading-signals/:id", async (req, res) => {
    try {
      const signal = await storage.updateTradingSignal(req.params.id, req.body);
      if (!signal) {
        return res.status(404).json({ error: "Signal not found" });
      }
      res.json(signal);
    } catch (error) {
      console.error("Error updating signal:", error);
      res.status(500).json({ error: "Failed to update signal" });
    }
  });

  app.delete("/api/trading-signals/:id", async (req, res) => {
    try {
      const success = await storage.deleteTradingSignal(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Signal not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting signal:", error);
      res.status(500).json({ error: "Failed to delete signal" });
    }
  });

  app.get("/api/pending-setups", async (req, res) => {
    try {
      const filters = {
        symbol: req.query.symbol as string | undefined,
        readyForSignal: req.query.readyForSignal === 'true' ? true : undefined,
        invalidated: req.query.invalidated === 'true' ? true : false,
      };
      const setups = await storage.getPendingSetups(filters);
      res.json(setups);
    } catch (error) {
      console.error("Error fetching pending setups:", error);
      res.status(500).json({ error: "Failed to fetch pending setups" });
    }
  });

  app.get("/api/pending-setups/:id", async (req, res) => {
    try {
      const setup = await storage.getPendingSetupById(req.params.id);
      if (!setup) {
        return res.status(404).json({ error: "Pending setup not found" });
      }
      res.json(setup);
    } catch (error) {
      console.error("Error fetching pending setup:", error);
      res.status(500).json({ error: "Failed to fetch pending setup" });
    }
  });

  // Real-time price data endpoints using Python/tessa
  app.get("/api/prices/status", async (req, res) => {
    try {
      const isOnline = await pingPriceService();
      res.json({ 
        status: isOnline ? "online" : "offline",
        message: isOnline ? "Price service is running" : "Price service is not available"
      });
    } catch (error) {
      res.json({ status: "offline", message: "Price service error" });
    }
  });

  app.get("/api/prices/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol;
      const assetClass = (req.query.assetClass as string) || "stock";
      
      const validAssetClasses = ["stock", "forex", "commodity", "crypto"];
      if (!validAssetClasses.includes(assetClass)) {
        return res.status(400).json({ error: "Invalid asset class" });
      }
      
      const priceData = await getCachedPrice(
        symbol, 
        assetClass as "stock" | "forex" | "commodity" | "crypto"
      );
      
      if (priceData.error) {
        return res.status(404).json({ error: priceData.error });
      }
      
      res.json(priceData);
    } catch (error) {
      console.error("Error fetching price:", error);
      res.status(500).json({ error: "Failed to fetch price" });
    }
  });

  app.post("/api/prices/batch", async (req, res) => {
    try {
      const { symbols } = req.body;
      
      if (!Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: "Symbols array is required" });
      }
      
      if (symbols.length > 50) {
        return res.status(400).json({ error: "Maximum 50 symbols per request" });
      }
      
      const priceData = await getCachedMultiplePrices(symbols);
      res.json(priceData);
    } catch (error) {
      console.error("Error fetching batch prices:", error);
      res.status(500).json({ error: "Failed to fetch prices" });
    }
  });

  // ============================================
  // GEMINI AI ANALYSIS ROUTES
  // ============================================

  // Test Gemini connection
  app.get("/api/gemini/status", async (req, res) => {
    try {
      const isConfigured = isGeminiConfigured();
      if (!isConfigured) {
        return res.json({ 
          configured: false, 
          connected: false, 
          message: "GOOGLE_API_KEY not configured" 
        });
      }

      const connectionTest = await testGeminiConnection();
      res.json({
        configured: true,
        connected: connectionTest.success,
        message: connectionTest.message,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to check Gemini status" });
    }
  });

  // Full Gemini analysis (SMC + Wyckoff)
  app.post("/api/gemini/analyze", async (req, res) => {
    try {
      const { symbol, priceData, chartImagePath } = req.body;

      if (!symbol || !priceData || !Array.isArray(priceData)) {
        return res.status(400).json({ error: "Symbol and priceData array are required" });
      }

      if (!isGeminiConfigured()) {
        return res.status(503).json({ error: "Gemini API not configured" });
      }

      const result = await analyzeWithGemini(symbol, priceData, chartImagePath);
      
      if (result.error) {
        return res.status(500).json({ error: result.error });
      }

      res.json(result);
    } catch (error) {
      console.error("Gemini analysis error:", error);
      res.status(500).json({ error: "Failed to analyze with Gemini" });
    }
  });

  // Quick scan (faster, single-pass analysis)
  app.post("/api/gemini/quick-scan", async (req, res) => {
    try {
      const { symbol, priceData } = req.body;

      if (!symbol || !priceData || !Array.isArray(priceData)) {
        return res.status(400).json({ error: "Symbol and priceData array are required" });
      }

      if (!isGeminiConfigured()) {
        return res.status(503).json({ error: "Gemini API not configured" });
      }

      const result = await quickAnalyzeWithGemini(symbol, priceData);
      
      if (!result) {
        return res.status(500).json({ error: "Quick scan failed" });
      }

      res.json(result);
    } catch (error) {
      console.error("Quick scan error:", error);
      res.status(500).json({ error: "Failed to perform quick scan" });
    }
  });

  // ============================================
  // CHART GENERATION ROUTES
  // ============================================

  // Check chart generator status
  app.get("/api/charts/status", async (req, res) => {
    try {
      const available = await isChartGeneratorAvailable();
      res.json({ available });
    } catch (error) {
      res.json({ available: false, error: "Failed to check chart generator status" });
    }
  });

  // Generate signal chart
  app.post("/api/charts/generate", async (req, res) => {
    try {
      const { symbol, timeframe, candles, signal, supplyZones, demandZones } = req.body;

      if (!symbol || !timeframe || !candles || !Array.isArray(candles)) {
        return res.status(400).json({ error: "Symbol, timeframe, and candles array are required" });
      }

      if (!signal || !signal.direction || !signal.entryPrice) {
        return res.status(400).json({ error: "Signal with direction and entryPrice is required" });
      }

      const result = await generateTradingSignalChart(
        symbol,
        timeframe,
        candles,
        signal,
        supplyZones || [],
        demandZones || []
      );

      if (!result.success) {
        return res.status(500).json({ error: result.error || "Chart generation failed" });
      }

      res.json({ success: true, path: result.path });
    } catch (error) {
      console.error("Chart generation error:", error);
      res.status(500).json({ error: "Failed to generate chart" });
    }
  });

  // Cleanup old charts
  app.post("/api/charts/cleanup", async (req, res) => {
    try {
      const maxAgeMs = req.body.maxAgeMs || 3600000; // Default 1 hour
      cleanupOldCharts(maxAgeMs);
      res.json({ success: true, message: "Old charts cleaned up" });
    } catch (error) {
      res.status(500).json({ error: "Failed to cleanup charts" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
