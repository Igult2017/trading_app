import express, { type Request, Response, NextFunction } from "express";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./static";
import { scraperScheduler } from "./scrapers/scheduler";
import { initializeDatabase } from "./db-init";
import { PYTHON_BIN } from "./lib/pythonBin";

// ── Price daemon ───────────────────────────────────────────────────────────────
// Starts price_daemon.py as a persistent child process.
// The daemon streams crypto via Binance WebSocket and polls forex/stocks/indices/
// commodities via yfinance, writing everything to an in-memory cache served on
// http://127.0.0.1:8765.  If it crashes it restarts automatically.

let priceDaemon: ChildProcess | null = null;
let daemonRestarting = false;

function startPriceDaemon() {
  const script = path.join(process.cwd(), "server", "python", "price_daemon.py");
  priceDaemon = spawn(PYTHON_BIN, [script], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  priceDaemon.stdout?.on("data", (d: Buffer) =>
    process.stdout.write(d)
  );
  priceDaemon.stderr?.on("data", (d: Buffer) =>
    process.stderr.write(d)
  );

  priceDaemon.on("exit", (code) => {
    if (daemonRestarting) return;
    log(`[price-daemon] exited (code ${code}) — restarting in 3 s`);
    setTimeout(startPriceDaemon, 3000);
  });

  log("[price-daemon] started");
}

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

    res.status(status).json({ message });
    throw err;
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
