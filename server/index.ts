/**
 * index.ts — THE DEVELOPMENT ENTRY (`npm run dev`). The container does NOT run this file; it runs
 * `dist/index.prod.js`, built from `index.prod.ts`. See that file for why the split has to stay.
 *
 * Everything the two entries share now lives in `lib/appSetup.ts` (middleware) and
 * `lib/backgroundServices.ts` (long-running work), because keeping them in step by hand failed:
 * security middleware and the trade-recording services were both added here and never reached
 * production. Add shared things THERE, not here.
 *
 * What legitimately belongs only in this file: the Vite dev middleware, and the two Python child
 * processes — in the container `start.sh` spawns those itself under its own restart watchdogs.
 */
import "dotenv/config";
import express from "express";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./static";
import { scraperScheduler } from "./scrapers/scheduler";
import { startCopyPlatform, stopCopyPlatform } from "./services/copyPlatformProcess";
import { startSignalPlatform, stopSignalPlatform } from "./services/signalPlatformProcess";
import { initializeDatabase } from "./db-init";
import { getCachedMultiplePrices, pingPriceService } from "./lib/priceService";
import { PYTHON_BIN } from "./lib/pythonBin";
import { logServiceStatus } from "./lib/serviceCheck";
import { applyAppSetup, installErrorHandler } from "./lib/appSetup";
import { startBackgroundServices, isPrimaryWorker } from "./lib/backgroundServices";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── API key ──────────────────────────────────────────────────────────────────
// GOOGLE_API_KEY is the only key used. Nothing to bridge.

/** Poll the price daemon until it responds, then resolve. */
async function waitForDaemon(maxWaitMs = 30_000, intervalMs = 500): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await pingPriceService()) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  log('[PriceDaemon] Did not become ready within timeout — warmup skipped');
}

// ── Price Daemon (Python) ────────────────────────────────────────────────────
let priceDaemon: ChildProcess | null = null;
let daemonRestarting = false;

function startPriceDaemon() {
  const daemonScript = path.join(__dirname, "python", "price_daemon.py");
  log(`[PriceDaemon] Starting ${PYTHON_BIN} ${daemonScript}`);

  priceDaemon = spawn(PYTHON_BIN, [daemonScript], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  priceDaemon.stdout?.on("data", (chunk: Buffer) => {
    log(`[PriceDaemon] ${chunk.toString().trim()}`);
  });
  priceDaemon.stderr?.on("data", (chunk: Buffer) => {
    log(`[PriceDaemon] ERR: ${chunk.toString().trim()}`);
  });

  priceDaemon.on("exit", (code, signal) => {
    if (daemonRestarting) return;
    log(`[PriceDaemon] Exited (code=${code}, signal=${signal}) — restarting in 5 s`);
    setTimeout(() => { if (!daemonRestarting) startPriceDaemon(); }, 5000);
  });
}


const app = express();
applyAppSetup(app);

(async () => {
  if (isPrimaryWorker) {
    try {
      await initializeDatabase();
    } catch (dbInitError) {
      log('[Database] Warning: Database initialization had issues, proceeding anyway');
      log(String(dbInitError));
    }
  }

  // DISABLED — Assets panel coming soon; uncomment to re-enable price daemon
  // if (isPrimaryWorker) startPriceDaemon();

  const server = await registerRoutes(app);

  installErrorHandler(app);

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
    // Windows does not implement SO_REUSEPORT: Node throws ENOTSUP from listen() and the process
    // dies before binding, so `npm run dev` could not start on Windows at all. Production runs
    // Linux containers where it still applies (it is what lets the cluster workers share the port).
    reusePort: process.platform !== "win32",
  }, () => {
    log(`serving on port ${port}`);
    logServiceStatus();
    log(`[Signal] Platform status: GET /api/signal-platform/status  (cTrader + last signal + 24h count)`);
    startBackgroundServices();
    // DEV-ONLY, and deliberately not in `backgroundServices`: in the container `start.sh` spawns
    // both Python processes itself under its own restart watchdogs. `startSignalPlatform` guards
    // itself with SIGNAL_PLATFORM_MANAGED; `startCopyPlatform` has NO such guard, so calling it
    // from the shared module would run a second copy engine in production and duplicate every
    // copied trade.
    if (isPrimaryWorker) startCopyPlatform();
    if (isPrimaryWorker && !process.env.SIGNAL_PLATFORM_MANAGED) startSignalPlatform();

    // DISABLED — price daemon warmup commented out to avoid slow boot / failed requests
    /*
    // Wait for the price daemon to be ready, then pre-warm the cache
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
    waitForDaemon().then(() => {
      log('[PriceDaemon] Ready — starting price cache warmup');
      return getCachedMultiplePrices(WARMUP_SYMBOLS);
    }).then(() => log("[PriceCache] Warmup complete — sidebar prices ready"))
      .catch((err) => log(`[PriceCache] Warmup error: ${err}`));
    */
  });

  function shutdown(signal: string) {
    log(`${signal} received: shutting down`);
    daemonRestarting = true;
    priceDaemon?.kill();
    stopSignalPlatform();
    scraperScheduler.stop();
    stopCopyPlatform();
    server.close(() => log("HTTP server closed"));
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
})();
