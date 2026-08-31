/**
 * index.prod.ts — THE ENTRY THE CONTAINER ACTUALLY RUNS (`start.sh:69`, `node dist/index.prod.js`).
 *
 * WHY A SECOND ENTRY FILE AT ALL, since one would be simpler: `server/index.ts` reaches Vite through
 * `await import("./vite")`. That is a RELATIVE path, so esbuild bundles the module and ESM hoists its
 * package imports to the top of `dist/index.js` — `vite`, `@vitejs/plugin-react` and
 * `@replit/vite-plugin-runtime-error-modal` all end up evaluated at startup even though the branch
 * that uses them never runs in production. Those three are devDependencies and the production image
 * installs with `npm ci --omit=dev` (Dockerfile:29), so `node dist/index.js` would die immediately
 * with ERR_MODULE_NOT_FOUND. The split is load-bearing; do not merge the two files.
 *
 * WHAT WENT WRONG BECAUSE OF IT. The two files were kept in step by hand and drifted badly. Helmet
 * and both rate limiters were added to `index.ts` in June and never mirrored, so production ran with
 * no security headers and **no brute-force limit on the login endpoint**. The trade-recording
 * services were added later and never mirrored either, so production had **no periodic sync and no
 * live cTrader feed** — nothing recorded a broker trade at all, which is why a connected account's
 * session sat at `Trades 0`.
 *
 * THE RULE NOW: everything the two entries share lives in `lib/appSetup.ts` (middleware) and
 * `lib/backgroundServices.ts` (long-running work). This file may differ from `index.ts` in ONE
 * respect only — it serves static files where `index.ts` mounts Vite. Anything else added here is
 * the drift coming back; `lib/entryParity.test.ts` fails if it does.
 */
import "dotenv/config";
import express from "express";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./static";
import { logServiceStatus } from "./lib/serviceCheck";
import { applyAppSetup, installErrorHandler } from "./lib/appSetup";
import { startBackgroundServices } from "./lib/backgroundServices";

const app = express();
applyAppSetup(app);

(async () => {
  // Ensure all DB tables exist before accepting requests
  const { initializeDatabase } = await import("./db-init");
  await initializeDatabase();

  const server = await registerRoutes(app);
  installErrorHandler(app);

  // Production mode: serve static files only — this is the one line that differs from index.ts
  serveStatic(app);

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    logServiceStatus();
    startBackgroundServices();
  });

  const shutdown = (signal: string) => {
    log(`${signal} signal received: closing HTTP server`);
    server.close(() => log('HTTP server closed'));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
})();
