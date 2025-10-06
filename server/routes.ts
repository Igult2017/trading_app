import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTradeSchema, insertEconomicEventSchema } from "@shared/schema";
import { getEconomicCalendar } from "./services/fmp";
import { cacheService } from "./scrapers/cacheService";
import { economicCalendarScraper } from "./scrapers/economicCalendarScraper";
import { analyzeEventSentiment, updateEventWithSentiment } from "./services/sentimentAnalysis";

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

  const httpServer = createServer(app);

  return httpServer;
}
