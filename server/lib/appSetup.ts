/**
 * appSetup.ts — the middleware BOTH server entry points must apply.
 *
 * WHY THIS FILE EXISTS. There are two entry files: `server/index.ts` (development, and the one every
 * change has been made to) and `server/index.prod.ts` (what the container actually runs —
 * `start.sh:69`, `node dist/index.prod.js`). They were kept in step BY HAND, and they drifted:
 * helmet and both rate limiters were added to `index.ts` on 2026-06-07 and never mirrored, so
 * production shipped for months with **no security headers and no brute-force limit on the login
 * endpoint**. Measured on the live site, not inferred — `X-Powered-By: Express` was still being sent,
 * which helmet removes, and no `RateLimit-*` header ever appeared.
 *
 * The split itself is legitimate and must stay: `index.ts` reaches Vite through
 * `await import("./vite")`, and because that is a RELATIVE path esbuild bundles it and ESM hoists its
 * package imports to the top of `dist/index.js`. `vite` and its plugins are devDependencies and the
 * production image runs `npm ci --omit=dev`, so running `dist/index.js` there dies at startup. The
 * fix is therefore not "one entry file" but "one copy of everything the entries share".
 *
 * So: anything that applies to `app` goes HERE, and both entries call it. The entries are left with
 * only what genuinely differs between them — Vite dev middleware versus `serveStatic`.
 */
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import path from "path";
import fs from "fs";
import { redis } from "./redis";
import { log } from "../static";

/** Shared by both limiters — falls back to per-process memory when REDIS_URL is unset. */
const store = () =>
  redis
    ? { store: new RedisStore({ sendCommand: ((...args: string[]) => (redis as any).call(...args)) as any }) }
    : {};

/**
 * Everything that must be on the app BEFORE routes are registered.
 * Call once, first thing, from every entry point.
 */
export function applyAppSetup(app: Express): void {
  // Must be first — ensures req.ip is the real client IP when behind nginx/load balancer.
  // It is also what makes the rate limiters below meaningful: without it every visitor shares
  // the proxy's address and 200/min becomes a site-wide ceiling rather than a per-client one.
  app.set('trust proxy', 1);

  // Security headers — X-Frame-Options, X-Content-Type-Options, HSTS, etc.
  app.use(helmet({
    contentSecurityPolicy: false, // CSP managed separately (app uses inline styles)
    crossOriginEmbedderPolicy: false,
  }));

  // Gzip all responses — cuts payload size 60-80%
  app.use(compression());

  // Strict rate limit on auth endpoints — 10 attempts per 15 min per IP
  app.use('/api/auth', rateLimit({
    windowMs: 15 * 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts, please try again later.' },
    ...store(),
  }));

  // General API rate limiting — 200 req/min per IP
  app.use('/api', rateLimit({
    windowMs: 60_000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again in a minute.' },
    ...store(),
  }));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: false, limit: '50mb' }));

  // Serve uploaded blog images
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  app.use(requestLogger);
}

/** One line per API request, truncated to 80 characters. */
function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";
      log(logLine);
    }
  });

  next();
}

/**
 * The error handler, registered AFTER routes.
 *
 * It logs and stops. The production entry used to `throw err` here after already sending the
 * response — an error raised inside an Express error handler is not caught by anything, so it
 * surfaced as an unhandled rejection and could take the process down while the client had already
 * had a clean 500. The `headersSent` guard exists for the same reason: writing a second response
 * throws `ERR_HTTP_HEADERS_SENT`.
 */
export function installErrorHandler(app: Express): void {
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (!res.headersSent) res.status(status).json({ message });
    log(`[Error] ${status}: ${message}`);
  });
}
