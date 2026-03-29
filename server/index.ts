import express, { type Request, Response, NextFunction } from "express";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./static";
import { scraperScheduler } from "./scrapers/scheduler";
import { initializeDatabase } from "./db-init";
import { getCachedMultiplePrices } from "./lib/priceService";

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    await initializeDatabase();
  } catch (dbInitError) {
    log('[Database] Warning: Database initialization had issues, proceeding anyway');
    log(String(dbInitError));
  }

  // Start price daemon before routes so it has time to warm up
  startPriceDaemon();

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    log(`[Error] ${status}: ${message}`);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    scraperScheduler.start();

    // Pre-warm price cache in the background so the sidebar is ready on first page load
    const WARMUP_SYMBOLS: Array<{ symbol: string; assetClass: string }> = [
      // Crypto
      { symbol: "BTC/USDT", assetClass: "crypto" }, { symbol: "ETH/USDT", assetClass: "crypto" },
      { symbol: "SOL/USDT", assetClass: "crypto" }, { symbol: "XRP/USDT", assetClass: "crypto" },
      { symbol: "BNB/USDT", assetClass: "crypto" }, { symbol: "ADA/USDT", assetClass: "crypto" },
      { symbol: "DOGE/USDT", assetClass: "crypto" }, { symbol: "MATIC/USDT", assetClass: "crypto" },
      { symbol: "LINK/USDT", assetClass: "crypto" }, { symbol: "DOT/USDT", assetClass: "crypto" },
      { symbol: "AVAX/USDT", assetClass: "crypto" }, { symbol: "ATOM/USDT", assetClass: "crypto" },
      { symbol: "UNI/USDT", assetClass: "crypto" },
      // Forex major
      { symbol: "EUR/USD", assetClass: "forex" }, { symbol: "GBP/USD", assetClass: "forex" },
      { symbol: "USD/JPY", assetClass: "forex" }, { symbol: "AUD/USD", assetClass: "forex" },
      { symbol: "USD/CAD", assetClass: "forex" }, { symbol: "USD/CHF", assetClass: "forex" },
      { symbol: "NZD/USD", assetClass: "forex" },
      // Forex cross
      { symbol: "EUR/GBP", assetClass: "forex" }, { symbol: "EUR/JPY", assetClass: "forex" },
      { symbol: "EUR/AUD", assetClass: "forex" }, { symbol: "EUR/CAD", assetClass: "forex" },
      { symbol: "EUR/CHF", assetClass: "forex" }, { symbol: "GBP/JPY", assetClass: "forex" },
      { symbol: "GBP/AUD", assetClass: "forex" }, { symbol: "GBP/CAD", assetClass: "forex" },
      { symbol: "AUD/JPY", assetClass: "forex" }, { symbol: "AUD/CAD", assetClass: "forex" },
      { symbol: "AUD/CHF", assetClass: "forex" }, { symbol: "CHF/JPY", assetClass: "forex" },
      { symbol: "CAD/JPY", assetClass: "forex" },
      // Commodities
      { symbol: "XAU/USD", assetClass: "commodity" }, { symbol: "XAG/USD", assetClass: "commodity" },
      { symbol: "WTI", assetClass: "commodity" },
      // Indices
      { symbol: "US100", assetClass: "stock" }, { symbol: "US500", assetClass: "stock" },
      { symbol: "US30", assetClass: "stock" }, { symbol: "UK100", assetClass: "stock" },
      { symbol: "GER40", assetClass: "stock" },
      // Stocks
      { symbol: "AAPL", assetClass: "stock" }, { symbol: "MSFT", assetClass: "stock" },
      { symbol: "GOOGL", assetClass: "stock" }, { symbol: "AMZN", assetClass: "stock" },
      { symbol: "TSLA", assetClass: "stock" }, { symbol: "NVDA", assetClass: "stock" },
      { symbol: "AMD", assetClass: "stock" }, { symbol: "JPM", assetClass: "stock" },
      { symbol: "DIS", assetClass: "stock" }, { symbol: "BAC", assetClass: "stock" },
      { symbol: "META", assetClass: "stock" },
    ];
    getCachedMultiplePrices(WARMUP_SYMBOLS)
      .then(() => log("[PriceCache] Warmup complete — sidebar prices ready"))
      .catch((err) => log(`[PriceCache] Warmup error: ${err}`));
  });

  function shutdown(signal: string) {
    log(`${signal} received: shutting down`);
    daemonRestarting = true;
    priceDaemon?.kill();
    scraperScheduler.stop();
    server.close(() => log("HTTP server closed"));
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
})();
