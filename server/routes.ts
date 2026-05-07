import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { supabaseAdmin, verifyToken } from "./lib/supabaseAdmin";
import { db, pool } from "./db";
import { userProfiles, adminAccessLogs } from "@shared/schema";
import { eq, desc, sql as drizzleSql } from "drizzle-orm";
import { encrypt, safeDecrypt, safeEncrypt } from "./lib/crypto";
import { processIncomingTrades } from "./services/brokerSyncService";
import { fetchTradesForAccount, API_PLATFORMS } from "./services/brokerAdapters/index";
import { getCTraderAuthUrl, exchangeCodeForTokens, getCTraderAccounts } from "./services/brokerAdapters/ctrader";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { insertTradeSchema, insertEconomicEventSchema, insertTradingSignalSchema, insertJournalEntrySchema, insertTradingSessionSchema } from "@shared/schema";
import { analyzeScreenshotWithOCR, isOCRAvailable } from "./services/ocrScreenshotAnalyzer";
import { analyzeScreenshotWithGemini, isGeminiScreenshotAvailable } from "./services/geminiScreenshotAnalyzer";
import { parseTradeText } from "./services/textTradeAnalyzer";
import { computeMetrics } from "./services/metricsCalculator";
import { computeCalendar } from "./services/calendarCalculator";
import { computeDrawdown } from "./services/drawdownCalculator";
import { computeTFMetrics, computeTFMatrix } from "./services/tfMetricsCalculator";
import { computeStrategyAudit } from "./services/strategyAuditCalculator";
import { computeAIAnalysis, computeAIStrategy, computeAIQuery } from "./services/aiEngineCalculator";
import { askTraderAI } from "./services/aiQAWorker";
import {
  listChats     as listAIChats,
  getChat       as getAIChat,
  getMessages   as getAIChatMessages,
  createChat    as createAIChat,
  appendMessage as appendAIChatMessage,
  renameChat    as renameAIChat,
  deleteChat    as deleteAIChat,
  titleFromQuestion,
} from "./services/aiChatStore";
import { remapJournalEntry } from "./lib/remapJournalEntry";
import { getEconomicCalendar } from "./services/fmp";
import { cacheService } from "./scrapers/cacheService";
import { economicCalendarScraper } from "./scrapers/economicCalendarScraper";
import { interestRateScraper } from "./scrapers/interestRateScraper";
import { analyzeEventSentiment, updateEventWithSentiment } from "./services/sentimentAnalysis";
import { telegramNotificationService } from "./services/telegramNotification";
import { notificationService } from "./services/notificationService";
import {
  createAdminNotification,
  getAdminNotifications,
  getAdminUnreadCounts,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  deleteAdminNotification,
  clearAdminNotifications,
} from "./services/adminNotificationService";
import fs from 'fs';
import path from 'path';
import { signalDetectionService } from "./services/signalDetection";
import { getInterestRateData, getInflationData, parseCurrencyPair, generateMockTimeframeData } from "./services/marketData";
import { getCachedPrice, getCachedMultiplePrices, pingPriceService, getCachedCandleData } from "./lib/priceService";
import { validateSignalWithGemini, quickMarketScan, testGeminiConnection, isGeminiConfigured, analyzeWithGemini, quickAnalyzeWithGemini } from "./services/geminiAnalysis";
import { generateTradingSignalChart, isChartGeneratorAvailable, cleanupOldCharts } from "./services/chartGenerator";
import os from "os";

// ── Module-level request tracking for real metrics ────────────────────────────
let _prevCpu = process.cpuUsage();
let _prevCpuTime = Date.now();
let _reqTimestamps: number[] = [];
let _errorCount = 0;

// ── In-memory server event log (ring buffer, max 100 entries) ─────────────────
interface ServerLog { id: number; time: string; level: 'error'|'warn'|'info'; service: string; message: string; }
let _serverLogs: ServerLog[] = [];
let _logIdCounter = 1;
const addServerLog = (level: ServerLog['level'], service: string, message: string) => {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  _serverLogs.push({ id: _logIdCounter++, time, level, service, message });
  if (_serverLogs.length > 100) _serverLogs = _serverLogs.slice(-80);
  if (level === 'error') _errorCount++;
};
import { signalMonitor } from "./services/signalMonitor";
// ── FIX: import balance tracker ───────────────────────────────────────────────
import { getCurrentBalance, enrichTradeWithBalance } from "./services/balanceTracker";
import { getHomepageCalendar, getHomepageRates, getCalendarServiceStatus } from "./services/homepageCalendar";
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

// ── AI response in-memory cache ───────────────────────────────────────────────
// Prevents hitting Gemini on every page visit — same trade count = cached reply.
// TTL: 30 minutes. Invalidated automatically when trade count changes.
interface AICacheEntry {
  result: any;
  entryCount: number;
  cachedAt: number;
}
const aiCache = new Map<string, AICacheEntry>();
const AI_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function aiCacheKey(type: "analysis" | "strategy", userId?: string, sessionId?: string): string {
  return `${type}:${userId ?? ""}:${sessionId ?? ""}`;
}

function getAICache(type: "analysis" | "strategy", userId?: string, sessionId?: string, currentCount?: number): any | null {
  const key = aiCacheKey(type, userId, sessionId);
  const entry = aiCache.get(key);
  if (!entry) return null;
  const expired = Date.now() - entry.cachedAt > AI_CACHE_TTL_MS;
  const stale   = currentCount !== undefined && entry.entryCount !== currentCount;
  if (expired || stale) { aiCache.delete(key); return null; }
  return entry.result;
}

function setAICache(type: "analysis" | "strategy", result: any, userId?: string, sessionId?: string, entryCount?: number): void {
  aiCache.set(aiCacheKey(type, userId, sessionId), { result, entryCount: entryCount ?? 0, cachedAt: Date.now() });
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Auth helper for user-data routes ─────────────────────────────────────────
// Verifies a Supabase JWT and returns the authenticated user id.
// Sends a 401 response and returns null when authentication fails so that
// callers can simply `if (!auth) return;`.
async function requireAuth(
  req: Request,
  res: Response,
): Promise<{ id: string } | null> {
  // Try Supabase JWT verification first
  const user = await verifyToken(req.headers.authorization);
  if (user) {
    ensureUserProfile(user).catch((err) =>
      console.warn('[ensureUserProfile] failed:', err?.message),
    );
    return { id: user.id };
  }

  // Fallback: local admin token when Supabase is not configured.
  // The local-login route issues the ADMIN_SECRET as the bearer token.
  if (!supabaseAdmin) {
    const adminSecret = process.env.ADMIN_SECRET;
    const adminEmail  = process.env.ADMIN_EMAIL ?? '';
    const bearer = req.headers.authorization;
    if (adminSecret && bearer === `Bearer ${adminSecret}`) {
      const localAdminId = 'local-admin';
      ensureUserProfile({ id: localAdminId, email: adminEmail }).catch(() => {});
      return { id: localAdminId };
    }
  }

  res.status(401).json({ error: "Authentication required" });
  return null;
}

// Cache of user IDs we've already upserted this process lifetime so we don't
// hit the database on every authenticated request.
const _profileEnsured = new Set<string>();

function extractFullName(user: any): string {
  const meta = user?.user_metadata ?? {};
  const candidates = [
    meta.full_name,
    meta.fullName,
    meta.name,
    [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim(),
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

async function ensureUserProfile(user: { id: string; email?: string | null; user_metadata?: any }) {
  if (!user?.id || _profileEnsured.has(user.id)) return;
  const email    = (user.email ?? '').toString();
  const fullName = extractFullName(user);
  await pool.query(
    `INSERT INTO user_profiles (id, email, full_name, role, status, plan, country)
     VALUES ($1, $2, $3, 'user', 'Active', 'Free', '')
     ON CONFLICT (id) DO UPDATE SET
       email     = COALESCE(NULLIF(EXCLUDED.email, ''), user_profiles.email),
       full_name = CASE
         WHEN COALESCE(user_profiles.full_name, '') = '' THEN EXCLUDED.full_name
         ELSE user_profiles.full_name
       END`,
    [user.id, email, fullName],
  );
  _profileEnsured.add(user.id);
}

// Backfill user_profiles rows for any user IDs missing a profile by looking
// them up in Supabase. Used by the public leaderboard so traders show with
// their real name/email even if they haven't visited an authed endpoint yet.
async function backfillProfilesFromSupabase(userIds: string[]) {
  if (!supabaseAdmin || userIds.length === 0) return;
  await Promise.all(userIds.map(async (id) => {
    if (_profileEnsured.has(id)) return;
    try {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
      if (error || !data?.user) return;
      await ensureUserProfile(data.user as any);
    } catch (err: any) {
      console.warn('[backfillProfiles] lookup failed for', id, err?.message);
    }
  }));
}

export async function registerRoutes(app: Express): Promise<Server> {
  addServerLog('info', 'Server', `API server started — Node ${process.version}`);

  // Count every request for real req/sec metrics
  app.use((_req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    _reqTimestamps.push(now);
    if (_reqTimestamps.length > 5000) _reqTimestamps = _reqTimestamps.slice(-2000);
    res.on('finish', () => {
      if (res.statusCode >= 500) {
        _errorCount++;
        addServerLog('error', 'HTTP', `${_req.method} ${_req.path} → ${res.statusCode}`);
      }
    });
    next();
  });

  app.get("/api/trades", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const trades = await storage.getTrades(auth.id);
      res.json(trades);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  app.get("/api/trades/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const trade = await storage.getTradeById(req.params.id);
      if (!trade || (trade as any).userId !== auth.id) {
        return res.status(404).json({ error: "Trade not found" });
      }
      res.json(trade);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trade" });
    }
  });

  app.post("/api/trades", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const validatedData = insertTradeSchema.parse({ ...req.body, userId: auth.id });
      const trade = await storage.createTrade({ ...validatedData, userId: auth.id } as any);
      res.status(201).json(trade);
    } catch (error) {
      res.status(400).json({ error: "Invalid trade data" });
    }
  });

  app.put("/api/trades/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const existing = await storage.getTradeById(req.params.id);
      if (!existing || (existing as any).userId !== auth.id) {
        return res.status(404).json({ error: "Trade not found" });
      }
      const { userId: _ignored, ...rest } = req.body ?? {};
      const trade = await storage.updateTrade(req.params.id, rest);
      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }
      res.json(trade);
    } catch (error) {
      res.status(500).json({ error: "Failed to update trade" });
    }
  });

  app.delete("/api/trades/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const existing = await storage.getTradeById(req.params.id);
      if (!existing || (existing as any).userId !== auth.id) {
        return res.status(404).json({ error: "Trade not found" });
      }
      const success = await storage.deleteTrade(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Trade not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete trade" });
    }
  });

  // --- Current user profile + login streak ---
  app.get("/api/me/profile", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const { rows: profileRows } = await pool.query(
        `SELECT id, email, role, full_name, country, plan, status, avatar_url, created_at,
                subscription_status, subscription_ends_at, journal_access_ends_at, journal_access_granted_by
         FROM user_profiles WHERE id = $1 LIMIT 1`,
        [auth.id],
      );
      const profile = profileRows[0] || null;

      // Login streak = number of consecutive days (ending today, in UTC) the
      // user has logged at least one journal entry. Uses je.created_at and
      // resolves user via session for legacy NULL-user_id rows.
      const { rows: dayRows } = await pool.query(
        `SELECT DISTINCT (je.created_at AT TIME ZONE 'UTC')::date AS day
         FROM journal_entries je
         LEFT JOIN trading_sessions ts ON ts.id = je.session_id
         WHERE COALESCE(je.user_id, ts.user_id) = $1
         ORDER BY day DESC
         LIMIT 365`,
        [auth.id],
      );

      let streak = 0;
      if (dayRows.length > 0) {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const oneDay = 24 * 60 * 60 * 1000;
        let cursor = today.getTime();
        const mostRecent = new Date(dayRows[0].day).getTime();
        // Allow streak to start either today or yesterday so a user who
        // hasn't logged today yet still sees their current streak.
        if (mostRecent === cursor || mostRecent === cursor - oneDay) {
          cursor = mostRecent;
          for (const r of dayRows) {
            const d = new Date(r.day).getTime();
            if (d === cursor) {
              streak += 1;
              cursor -= oneDay;
            } else if (d < cursor) {
              break;
            }
          }
        }
      }

      res.json({
        id:          auth.id,
        email:       profile?.email ?? null,
        fullName:    profile?.full_name ?? '',
        plan:        profile?.plan   ?? 'Free',
        subscriptionStatus: profile?.subscription_status ?? 'free',
        subscriptionEndsAt: profile?.subscription_ends_at ?? null,
        journalAccessEndsAt: profile?.journal_access_ends_at ?? null,
        journalAccessGrantedBy: profile?.journal_access_granted_by ?? null,
        role:        profile?.role   ?? 'user',
        status:      profile?.status ?? 'Active',
        country:     profile?.country ?? '',
        avatarUrl:   profile?.avatar_url ?? null,
        loginStreak: streak,
      });
    } catch (err: any) {
      console.error('[Me/Profile] Error:', err?.message);
      res.status(500).json({ error: 'Failed to load profile' });
    }
  });

  // --- Avatar upload ---
  app.post("/api/me/avatar", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const { avatarUrl } = req.body;
      if (!avatarUrl || typeof avatarUrl !== 'string') {
        return res.status(400).json({ error: 'Invalid avatar data' });
      }
      if (!avatarUrl.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Must be an image data URL' });
      }
      if (avatarUrl.length > 300000) {
        return res.status(400).json({ error: 'Image too large. Please use a smaller image.' });
      }
      await pool.query(
        `UPDATE user_profiles SET avatar_url = $1 WHERE id = $2`,
        [avatarUrl, auth.id]
      );
      res.json({ success: true, avatarUrl });
    } catch (err: any) {
      console.error('[Me/Avatar] Error:', err?.message);
      res.status(500).json({ error: 'Failed to save avatar' });
    }
  });

  // --- Leaderboard (public — no auth required) ---
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const period = (req.query.period as string) || 'all';
      let dateFilter = '';
      if (period === 'daily')   dateFilter = `AND je.created_at >= NOW() - INTERVAL '1 day'`;
      if (period === 'weekly')  dateFilter = `AND je.created_at >= NOW() - INTERVAL '7 days'`;
      if (period === 'monthly') dateFilter = `AND je.created_at >= NOW() - INTERVAL '30 days'`;

      // NOTE: rankings are per-USER, not per-session. A user may have many
      // trading sessions; we combine the performance of all their sessions
      // into a single row.
      //
      // Some legacy journal_entries rows have a NULL user_id but a valid
      // session_id, so we resolve the owning user via trading_sessions when
      // je.user_id is missing: COALESCE(je.user_id, ts.user_id).
      const { rows } = await pool.query(`
        WITH resolved AS (
          SELECT
            COALESCE(je.user_id, ts.user_id) AS user_id,
            je.profit_loss,
            je.created_at
          FROM journal_entries je
          LEFT JOIN trading_sessions ts ON ts.id = je.session_id
          WHERE je.profit_loss IS NOT NULL
            ${dateFilter.replace(/je\./g, 'je.')}
        )
        SELECT
          r.user_id,
          MAX(up.full_name)                                                               AS full_name,
          MAX(up.email)                                                                   AS email,
          MAX(up.country)                                                                 AS country,
          COUNT(*)                                                                        AS total_trades,
          COUNT(*) FILTER (WHERE COALESCE(r.profit_loss, 0) > 0)                          AS wins,
          ROUND(CAST(SUM(COALESCE(r.profit_loss, 0)) AS numeric), 2)                      AS total_pnl,
          ROUND(CAST(
            SUM(CASE WHEN r.profit_loss > 0 THEN r.profit_loss ELSE 0 END) /
            NULLIF(ABS(SUM(CASE WHEN r.profit_loss < 0 THEN r.profit_loss ELSE 0 END)), 0)
          AS numeric), 2)                                                                 AS profit_factor
        FROM resolved r
        LEFT JOIN user_profiles up ON up.id = r.user_id
        WHERE r.user_id IS NOT NULL
        GROUP BY r.user_id
        HAVING COUNT(*) >= 1
        ORDER BY SUM(COALESCE(r.profit_loss, 0)) DESC
        LIMIT 50
      `);

      // Backfill profiles for any user that doesn't have one yet by looking
      // up their email + full name from Supabase. This makes the leaderboard
      // show real names even for users who've never hit an authed endpoint.
      const missing = rows
        .filter((r: any) => !r.full_name && !r.email)
        .map((r: any) => r.user_id)
        .filter(Boolean);
      if (missing.length > 0) {
        await backfillProfilesFromSupabase(missing);
        const { rows: refreshed } = await pool.query(
          `SELECT id, email, full_name FROM user_profiles WHERE id = ANY($1::varchar[])`,
          [missing],
        );
        const lookup = new Map(refreshed.map((p: any) => [p.id, p]));
        for (const r of rows as any[]) {
          const p = lookup.get(r.user_id);
          if (p) {
            r.full_name = r.full_name || p.full_name;
            r.email     = r.email     || p.email;
          }
        }
      }

      // Fetch sparkline data (last 10 trade PnL values) for each user
      const userIds = rows.map((r: any) => r.user_id).filter(Boolean);
      let sparklines: Record<string, number[]> = {};
      if (userIds.length > 0) {
        const placeholders = userIds.map((_: any, i: number) => `$${i + 1}`).join(',');
        // Resolve user_id via session for legacy entries with NULL user_id,
        // so the sparkline reflects all sessions belonging to the user.
        const { rows: sparkRows } = await pool.query(`
          SELECT user_id, profit_loss, created_at
          FROM (
            SELECT
              COALESCE(je.user_id, ts.user_id) AS user_id,
              je.profit_loss,
              je.created_at,
              ROW_NUMBER() OVER (
                PARTITION BY COALESCE(je.user_id, ts.user_id)
                ORDER BY je.created_at DESC
              ) AS rn
            FROM journal_entries je
            LEFT JOIN trading_sessions ts ON ts.id = je.session_id
            WHERE COALESCE(je.user_id, ts.user_id) IN (${placeholders})
              AND je.profit_loss IS NOT NULL
          ) sub
          WHERE rn <= 10
          ORDER BY user_id, created_at ASC
        `, userIds);

        for (const row of sparkRows) {
          if (!sparklines[row.user_id]) sparklines[row.user_id] = [];
          sparklines[row.user_id].push(parseFloat(row.profit_loss));
        }
      }

      // Display the trader's real name as managed in the Admin Panel
      // (user_profiles.full_name). Fall back to the email local-part if
      // no full name is set, and finally to a short trader id.
      function displayFor(userId: string, fullName: string | null, email: string | null): string {
        if (fullName && fullName.trim()) {
          return fullName.trim();
        }
        if (email) {
          const [local] = email.split('@');
          return local || email;
        }
        const suffix = (userId || '').replace(/-/g, '').slice(-4).toUpperCase();
        return suffix ? `Trader #${suffix}` : 'Trader';
      }

      function avatarFor(name: string): string {
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        const cleaned = name.replace(/[^A-Za-z0-9]/g, '');
        return cleaned.slice(0, 2).toUpperCase() || 'TR';
      }

      const leaderboard = rows.map((r: any, index: number) => {
        const trades   = parseInt(r.total_trades);
        const wins     = parseInt(r.wins);
        const winRate  = trades > 0 ? Math.round((wins / trades) * 100) : 0;
        const rawPnl   = parseFloat(r.total_pnl) || 0;
        const pf       = parseFloat(r.profit_factor) || 0;
        const growth   = sparklines[r.user_id] || [0];
        const name     = displayFor(r.user_id, r.full_name, r.email);

        return {
          rank:         index + 1,
          userId:       r.user_id,
          name,
          avatar:       avatarFor(name),
          country:      r.country || '',
          pnl:          rawPnl,
          winRate,
          trades,
          profitFactor: parseFloat(pf.toFixed(2)),
          growth,
        };
      });

      const totalPnl     = leaderboard.reduce((s: number, t: any) => s + t.pnl, 0);
      const avgWinRate   = leaderboard.length ? Math.round(leaderboard.reduce((s: number, t: any) => s + t.winRate, 0) / leaderboard.length) : 0;
      const totalTrades  = leaderboard.reduce((s: number, t: any) => s + t.trades, 0);

      res.json({ leaderboard, summary: { totalPnl, avgWinRate, totalTrades, activeTraders: leaderboard.length } });
    } catch (error) {
      console.error('[Leaderboard] Error:', error);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  });

  // --- Session Routes ---
  app.get("/api/sessions", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const sessions = await storage.getSessions(auth.id);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const session = await storage.getSessionById(req.params.id);
      if (!session || session.userId !== auth.id) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  // ── FIX 1: GET /api/sessions/:id/balance ─────────────────────────────────
  // Returns the current running balance for a session.
  // Used by useSessionBalance hook in the frontend.
  app.get("/api/sessions/:id/balance", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const session = await storage.getSessionById(req.params.id);
      if (!session || session.userId !== auth.id) {
        return res.status(404).json({ error: "Session not found" });
      }
      const summary = await getCurrentBalance(req.params.id);
      res.json(summary);
    } catch (error: any) {
      console.error("[Routes] Balance fetch error:", error);
      res.status(404).json({ error: error?.message ?? "Failed to fetch balance" });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      // Always bind the session to the authenticated user — never trust a
      // client-supplied userId.
      const validatedData = insertTradingSessionSchema.parse({
        ...req.body,
        userId: auth.id,
      });
      const session = await storage.createSession({ ...validatedData, userId: auth.id });
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
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const existing = await storage.getSessionById(req.params.id);
      if (!existing || existing.userId !== auth.id) {
        return res.status(404).json({ error: "Session not found" });
      }
      const { userId: _ignored, ...rest } = req.body ?? {};
      const session = await storage.updateSession(req.params.id, rest);
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  app.delete("/api/sessions/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const existing = await storage.getSessionById(req.params.id);
      if (!existing || existing.userId !== auth.id) {
        return res.status(404).json({ error: "Session not found" });
      }
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

      // Normalize timestamps to YYYY-MM-DDTHH:MM format required by datetime-local inputs.
      // OCR pipeline returns space-separated 'YYYY-MM-DD HH:MM'; Gemini may include seconds.
      const normTs = (s: any): any => {
        if (!s || typeof s !== "string") return s;
        return s.replace(" ", "T").substring(0, 16);
      };

      // Field normalization applied to any result (OCR or Gemini).
      // Bridges naming differences between the two pipelines and the frontend form.
      const normalizeFields = (f: Record<string, any>): Record<string, any> => {
        // Pips: OCR uses stopLossPips / takeProfitPips; frontend reads stopLossDistancePips / takeProfitDistancePips
        if (f.stopLossDistancePips == null && f.stopLossPips != null)   f.stopLossDistancePips   = f.stopLossPips;
        if (f.takeProfitDistancePips == null && f.takeProfitPips != null) f.takeProfitDistancePips = f.takeProfitPips;
        // Timestamps: must be YYYY-MM-DDTHH:MM for datetime-local inputs
        f.entryTime = normTs(f.entryTime);
        f.exitTime  = normTs(f.exitTime);
        return f;
      };

      // ── Prefer Gemini when GOOGLE_API_KEY is available ──────────────────────
      if (isGeminiScreenshotAvailable()) {
        console.log("[Screenshot] Using Gemini vision extraction");
        const geminiResult = await analyzeScreenshotWithGemini(image);
        if (geminiResult.success && geminiResult.fields) {
          geminiResult.fields = normalizeFields(geminiResult.fields);
          const f = geminiResult.fields;
          console.log(`[Gemini] instrument:${f.instrument} direction:${f.direction} lotSize:${f.lotSize} entryPrice:${f.entryPrice} entryTime:${f.entryTime} exitTime:${f.exitTime} slPips:${f.stopLossDistancePips} tpPips:${f.takeProfitDistancePips}`);
          return res.json({ ...geminiResult, method: "gemini", confidence: "high" });
        }
        console.error(`[Screenshot] Gemini failed: ${geminiResult.error} — falling back to OCR`);
        // Return gemini error to client so user sees it; still try OCR below
      }

      // ── Fallback: local OCR pipeline ────────────────────────────────────────
      const ocrResult = await analyzeScreenshotWithOCR(image);

      if (ocrResult.success && ocrResult.fields) {
        ocrResult.fields = normalizeFields(ocrResult.fields);
        const f = ocrResult.fields;
        console.log(`[OCR] instrument:${f.instrument} entryTime:${f.entryTime} exitTime:${f.exitTime} slPips:${f.stopLossDistancePips} tpPips:${f.takeProfitDistancePips}`);
        return res.json({ ...ocrResult, method: "ocr", confidence: "medium" });
      }

      return res.status(422).json({
        error: isGeminiScreenshotAvailable()
          ? "Gemini analysis failed and OCR fallback also failed. Check server logs for details."
          : "Screenshot analysis failed. No recognisable trade data found.",
        details: ocrResult.error,
        method: isGeminiScreenshotAvailable() ? "gemini" : "ocr",
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
      const geminiAvailable = isGeminiScreenshotAvailable();
      const ocrAvailable    = await isOCRAvailable();

      res.json({
        gemini: {
          available: geminiAvailable,
          provider: "Google Gemini Vision",
          note: geminiAvailable
            ? "Active — best for full chart screenshots with timestamps and P&L panels"
            : "Set GOOGLE_API_KEY to enable Gemini vision extraction",
        },
        ocr: {
          available: ocrAvailable,
          provider: "Tesseract OCR",
          note: ocrAvailable
            ? "Available as fallback — calibrated for JForex dark-theme screenshots"
            : "Tesseract or Python dependencies not installed",
        },
        activeMethod: geminiAvailable ? "gemini" : ocrAvailable ? "ocr" : "none",
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to check analysis status" });
    }
  });

  app.get("/api/journal/entries", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const sessionId = req.query.sessionId as string | undefined;
      // If a sessionId is supplied, make sure the session belongs to the
      // authenticated user before returning its entries.
      if (sessionId) {
        const session = await storage.getSessionById(sessionId);
        if (!session || session.userId !== auth.id) {
          return res.json([]);
        }
      }
      const entries = await storage.getJournalEntries(auth.id, sessionId);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch journal entries" });
    }
  });

  app.get("/api/journal/entries/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const entry = await storage.getJournalEntryById(req.params.id);
      if (!entry || entry.userId !== auth.id) {
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
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const decimalFields = [
        'entryPrice', 'stopLoss', 'takeProfit', 'stopLossDistance', 'takeProfitDistance',
        'lotSize', 'riskReward', 'riskPercent', 'spreadAtEntry', 'profitLoss',
        'pipsGainedLost', 'accountBalance', 'commission', 'mae', 'mfe',
        'monetaryRisk', 'potentialReward'
      ];
      // Always bind the entry to the authenticated user — never trust
      // a client-supplied userId.
      const sanitized: Record<string, any> = { ...req.body, userId: auth.id };
      for (const field of decimalFields) {
        if (sanitized[field] !== undefined && sanitized[field] !== null && sanitized[field] !== '') {
          const raw = String(sanitized[field]);
          const match = raw.match(/-?\d+(\.\d+)?/);
          sanitized[field] = match ? match[0] : null;
        }
      }

      // If a sessionId is supplied, ensure it belongs to the authenticated user.
      const sessionId = sanitized.sessionId as string | undefined;
      if (sessionId) {
        const session = await storage.getSessionById(sessionId);
        if (!session || session.userId !== auth.id) {
          return res.status(404).json({ error: "Session not found" });
        }
      }

      // ── Enrich with balance if profitLoss/accountBalance are missing ──────
      // enrichTradeWithBalance is a no-op when profitLoss is already present,
      // so this is safe to call unconditionally.
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
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const existing = await storage.getJournalEntryById(req.params.id);
      if (!existing || existing.userId !== auth.id) {
        return res.status(404).json({ error: "Journal entry not found" });
      }

      const { userId: _ignored, ...rest } = req.body ?? {};
      const updates: Record<string, any> = { ...rest };

      // ── Merge JSONB blob columns instead of replacing them ──────────────
      // Drizzle's .set() on a JSONB column REPLACES the entire object. Without
      // this merge, sending `manualFields: { strategy: "X" }` from the trade
      // vault would wipe every other manual field on the entry (marketRegime,
      // volatilityState, scores, etc.), causing those trades to fall back to
      // "Unknown" in the metrics breakdowns.
      for (const blobKey of ["manualFields", "aiExtracted"] as const) {
        if (updates[blobKey] !== undefined && updates[blobKey] !== null) {
          const incoming = updates[blobKey];
          if (typeof incoming === "object" && !Array.isArray(incoming)) {
            const current = (existing as any)[blobKey];
            const base = current && typeof current === "object" && !Array.isArray(current)
              ? current
              : {};
            updates[blobKey] = { ...base, ...incoming };
          }
        }
      }

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
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const existing = await storage.getJournalEntryById(req.params.id);
      if (!existing || existing.userId !== auth.id) {
        return res.status(404).json({ error: "Journal entry not found" });
      }
      const success = await storage.deleteJournalEntry(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Journal entry not found" });
      }
      invalidateMetricsCache(existing.sessionId ?? undefined, existing.userId ?? undefined);
      invalidateCalendarCache(existing.sessionId ?? undefined, existing.userId ?? undefined);
      invalidateDrawdownCache(existing.sessionId ?? undefined, existing.userId ?? undefined);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete journal entry" });
    }
  });

  // ── Helper: resolve userId + sessionId for compute routes, enforcing
  // ownership. Returns null when the session does not belong to the user.
  async function resolveComputeScope(
    auth: { id: string },
    req: Request,
  ): Promise<{ entries: any[]; startingBalance?: number; sessionId?: string } | null> {
    const sessionId = req.query.sessionId as string | undefined;
    let startingBalance: number | undefined;
    if (sessionId) {
      const session = await storage.getSessionById(sessionId);
      if (!session || session.userId !== auth.id) return null;
      startingBalance = parseFloat(session.startingBalance);
    }
    const entries = await storage.getJournalEntries(auth.id, sessionId);
    return { entries, startingBalance, sessionId };
  }

  app.get("/api/metrics/compute", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const scope = await resolveComputeScope(auth, req);
      if (!scope) return res.json({ success: true, metrics: {}, entries: [] });
      const { entries, startingBalance, sessionId } = scope;

      const key = metricsKey(auth.id, sessionId);
      const cached = metricsCache.get(key);
      const now = Date.now();

      if (
        cached &&
        cached.entryCount === entries.length &&
        now - cached.cachedAt < METRICS_CACHE_TTL_MS
      ) {
        return res.json(cached.result);
      }

      // Fast path: skip the Python spawn entirely when there are no trades.
      if (!entries || entries.length === 0) {
        const empty = { success: true, metrics: {} };
        metricsCache.set(key, { result: empty, entryCount: 0, cachedAt: now });
        return res.json(empty);
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
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const scope = await resolveComputeScope(auth, req);
      if (!scope) return res.json({ success: true, days: [] });
      const { entries, sessionId } = scope;

      const cacheKey = metricsKey(auth.id, sessionId);
      const cached = calendarCache.get(cacheKey);
      const now = Date.now();
      if (cached && cached.entryCount === entries.length && now - cached.cachedAt < CALENDAR_CACHE_TTL_MS) {
        return res.json(cached.result);
      }

      if (!entries || entries.length === 0) {
        const empty = { success: true, days: [] };
        calendarCache.set(cacheKey, { result: empty, entryCount: 0, cachedAt: now });
        return res.json(empty);
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
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const scope = await resolveComputeScope(auth, req);
      if (!scope) return res.json({ success: true, drawdown: {} });
      const { entries, startingBalance, sessionId } = scope;

      const cacheKey = metricsKey(auth.id, sessionId);
      const cached = drawdownCache.get(cacheKey);
      const now = Date.now();
      if (cached && cached.entryCount === entries.length && now - cached.cachedAt < DRAWDOWN_CACHE_TTL_MS) {
        return res.json(cached.result);
      }

      if (!entries || entries.length === 0) {
        const empty = { success: true, drawdown: {} };
        drawdownCache.set(cacheKey, { result: empty, entryCount: 0, cachedAt: now });
        return res.json(empty);
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
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const scope = await resolveComputeScope(auth, req);
      if (!scope) return res.json({ success: true, metrics: {} });
      const { entries, startingBalance } = scope;
      if (!entries || entries.length === 0) {
        return res.json({ success: true, metrics: {} });
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
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const scope = await resolveComputeScope(auth, req);
      if (!scope) return res.json({ success: true, matrix: {} });
      const result = await computeTFMatrix(scope.entries);
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
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const scope = await resolveComputeScope(auth, req);
      if (!scope) return res.json({ success: true, audit: {} });
      const { entries, startingBalance } = scope;
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
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const scope = await resolveComputeScope(auth, req);
      if (!scope) return res.json({ success: true, analysis: {} });
      const sessionId = req.query.sessionId as string | undefined;
      const entryCount = scope.entries.length;

      // Return cached result if trades haven't changed
      const cached = getAICache("analysis", auth.id, sessionId, entryCount);
      if (cached) { console.log("[AI] Analysis cache hit"); return res.json(cached); }

      const remapped = scope.entries.map((e) => remapJournalEntry(e as Record<string, any>));
      const startingBal = scope.startingBalance ?? 10000;

      // Fetch all three context sources in parallel — all non-fatal
      const [metricsRes, drawdownRes, auditRes] = await Promise.allSettled([
        computeMetrics(remapped),
        computeDrawdown(remapped, startingBal),
        computeStrategyAudit(remapped, startingBal),
      ]);
      const metricsContext  = metricsRes.status  === "fulfilled" && metricsRes.value.success  ? metricsRes.value.metrics        : undefined;
      const drawdownContext = drawdownRes.status === "fulfilled" && drawdownRes.value.success ? drawdownRes.value                : undefined;
      const auditContext    = auditRes.status    === "fulfilled" && auditRes.value.success    ? auditRes.value                  : undefined;

      const result = await computeAIAnalysis(remapped, metricsContext as any, drawdownContext as any, auditContext as any);
      if (result.success) setAICache("analysis", result, auth.id, sessionId, entryCount);
      res.json(result);
    } catch (error) {
      console.error("[Routes] AI analysis error:", error);
      res.status(500).json({ success: false, error: "AI analysis failed" });
    }
  });

  // ── AI Engine — Strategy ────────────────────────────────────────────────────
  app.get("/api/ai/strategy", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const scope = await resolveComputeScope(auth, req);
      if (!scope) return res.json({ success: true, strategy: {} });
      const sessionId = req.query.sessionId as string | undefined;
      const entryCount = scope.entries.length;

      // Return cached result if trades haven't changed
      const cached = getAICache("strategy", auth.id, sessionId, entryCount);
      if (cached) { console.log("[AI] Strategy cache hit"); return res.json(cached); }

      const remapped = scope.entries.map((e) => remapJournalEntry(e as Record<string, any>));
      const startingBal = scope.startingBalance ?? 10000;

      const [metricsRes, drawdownRes, auditRes] = await Promise.allSettled([
        computeMetrics(remapped),
        computeDrawdown(remapped, startingBal),
        computeStrategyAudit(remapped, startingBal),
      ]);
      const metricsContext  = metricsRes.status  === "fulfilled" && metricsRes.value.success  ? metricsRes.value.metrics        : undefined;
      const drawdownContext = drawdownRes.status === "fulfilled" && drawdownRes.value.success ? drawdownRes.value                : undefined;
      const auditContext    = auditRes.status    === "fulfilled" && auditRes.value.success    ? auditRes.value                  : undefined;

      const result = await computeAIStrategy(remapped, metricsContext as any, drawdownContext as any, auditContext as any);
      if (result.success) setAICache("strategy", result, auth.id, sessionId, entryCount);
      res.json(result);
    } catch (error) {
      console.error("[Routes] AI strategy error:", error);
      res.status(500).json({ success: false, error: "AI strategy failed" });
    }
  });

  app.get("/api/analytics", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const trades = await storage.getTrades(auth.id);
      
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
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const { messages, sessionId, chatId: chatIdInput, model: modelParam } = req.body as {
        messages: Array<{ role: string; content: string }>;
        sessionId?: string;
        chatId?:   string;
        model?:    string;
      };
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array required" });
      }

      const apiKey = process.env.GOOGLE_API_KEY || "";
      if (!apiKey) {
        return res.status(503).json({ error: "GOOGLE_API_KEY is not configured on this server." });
      }

      // Verify the session, if any, belongs to the authenticated user.
      if (sessionId) {
        const session = await storage.getSessionById(sessionId);
        if (!session || session.userId !== auth.id) {
          return res.status(404).json({ error: "Session not found" });
        }
      }

      // Fetch and remap trade data for this session, scoped to the user.
      const rawTrades = await storage.getJournalEntries(auth.id, sessionId || undefined);
      const trades    = rawTrades.map((e) => remapJournalEntry(e as Record<string, any>));

      const question = messages[messages.length - 1].content;

      if (trades.length === 0) {
        return res.json({
          reply: "No trades found for this session yet. Record some trades first and I'll be able to give you data-driven analysis.",
        });
      }

      // Pre-compute metrics, drawdown, and strategy audit so the AI has the
      // same rich context as every analytics panel.
      let metricsContext: Record<string, any> | undefined;
      let drawdownContext: Record<string, any> | undefined;
      let auditContext: Record<string, any> | undefined;

      const sessionObj = sessionId ? await storage.getSessionById(sessionId) : null;
      const startingBal: number = (sessionObj as any)?.startingBalance ?? 10_000;

      try {
        const m = await computeMetrics(rawTrades);
        if (m && m.success && (m as any).result) {
          metricsContext = (m as any).result;
        }
      } catch (mErr: any) {
        console.warn("[TraderAI] Metrics computation failed:", mErr?.message);
      }
      try {
        const d = await computeDrawdown(rawTrades, startingBal);
        if (d && (d as any).success) {
          drawdownContext = d as any;
        }
      } catch (dErr: any) {
        console.warn("[TraderAI] Drawdown computation failed:", dErr?.message);
      }
      try {
        const a = await computeStrategyAudit(rawTrades, startingBal);
        if (a && (a as any).success) {
          auditContext = a as any;
        }
      } catch (aErr: any) {
        console.warn("[TraderAI] Audit computation failed:", aErr?.message);
      }

      // Resolve / create the persistent chat record before calling the LLM
      // so the user message is durable even if the AI call fails.
      let chatId: string | null = chatIdInput || null;
      if (chatId) {
        const existing = await getAIChat(chatId, auth.id);
        if (!existing) chatId = null;     // unknown / wrong owner — start fresh
      }
      if (!chatId) {
        const created = await createAIChat(
          auth.id,
          sessionId || null,
          titleFromQuestion(question),
        );
        chatId = created.id;
      }
      await appendAIChatMessage(chatId, "user", question);

      // Route through the warm Python QA worker — grounded in real data,
      // multi-turn aware, with metrics context for richer answers.
      try {
        const answer = await askTraderAI({
          trades,
          question,
          messages,
          metrics_context:   metricsContext,
          drawdown_context:  drawdownContext,
          audit_context:     auditContext,
          model: modelParam || undefined,
        });
        await appendAIChatMessage(chatId, "model", answer ?? "");
        return res.json({ reply: answer ?? "", chatId });
      } catch (engineErr: any) {
        console.error("[TraderAI] AI worker error:", engineErr?.message);
        return res.status(500).json({
          error:  engineErr?.message || "AI engine failed",
          chatId,
        });
      }
    } catch (err: any) {
      console.error("[TraderAI] Error:", err.message);
      return res.status(500).json({ error: err.message || "AI request failed" });
    }
  });

  // ── Trader-AI chat history (CRUD) ───────────────────────────────────────────
  app.get("/api/trader-ai/chats", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const sessionId = (req.query.sessionId as string | undefined) || undefined;
      const chats = await listAIChats(auth.id, sessionId);
      return res.json({ chats });
    } catch (err: any) {
      console.error("[TraderAI] listChats error:", err.message);
      return res.status(500).json({ error: err.message || "Failed to list chats" });
    }
  });

  app.get("/api/trader-ai/chats/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const chat = await getAIChat(req.params.id, auth.id);
      if (!chat) return res.status(404).json({ error: "Chat not found" });
      const messages = await getAIChatMessages(chat.id);
      return res.json({ chat, messages });
    } catch (err: any) {
      console.error("[TraderAI] getChat error:", err.message);
      return res.status(500).json({ error: err.message || "Failed to load chat" });
    }
  });

  app.post("/api/trader-ai/chats", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const { sessionId, title } = req.body as { sessionId?: string; title?: string };
      const chat = await createAIChat(
        auth.id,
        sessionId || null,
        (title && title.trim()) || "New chat",
      );
      return res.status(201).json({ chat });
    } catch (err: any) {
      console.error("[TraderAI] createChat error:", err.message);
      return res.status(500).json({ error: err.message || "Failed to create chat" });
    }
  });

  app.patch("/api/trader-ai/chats/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const { title } = req.body as { title?: string };
      if (!title || !title.trim()) {
        return res.status(400).json({ error: "title is required" });
      }
      const chat = await renameAIChat(req.params.id, auth.id, title.trim());
      if (!chat) return res.status(404).json({ error: "Chat not found" });
      return res.json({ chat });
    } catch (err: any) {
      console.error("[TraderAI] renameChat error:", err.message);
      return res.status(500).json({ error: err.message || "Failed to rename chat" });
    }
  });

  app.delete("/api/trader-ai/chats/:id", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const ok = await deleteAIChat(req.params.id, auth.id);
      if (!ok) return res.status(404).json({ error: "Chat not found" });
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[TraderAI] deleteChat error:", err.message);
      return res.status(500).json({ error: err.message || "Failed to delete chat" });
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
      const passwordEnc = safeEncrypt(password);
      const account = await storage.createCopyAccount({ nickname: nickname || loginId, platform, brokerServer, loginId, passwordEnc, role, symbolPrefix, symbolSuffix, userId, isActive: true });
      const { passwordEnc: _, ...safe } = account;
      return res.status(201).json(safe);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.put("/api/copy/accounts/:id", async (req, res) => {
    try {
      const { password, ...rest } = req.body;
      const updates: any = { ...rest };
      if (password) updates.passwordEnc = safeEncrypt(password);
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

  // ── Subscribe to a public signal provider ────────────────────────────────────
  // POST body: { accountId, lotMode?, lotMultiplier?, fixedLot?, riskPercent? }
  app.post("/api/copy/masters/:masterId/subscribe", async (req: Request, res: Response) => {
    try {
      const user = await verifyToken(req.headers.authorization);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const { masterId } = req.params;
      const { accountId, lotMode, lotMultiplier, fixedLot, riskPercent } = req.body;

      if (!accountId) return res.status(400).json({ error: "accountId is required" });

      // Verify master exists and is publicly visible
      const masterRow = await pool.query<{
        id: string; is_public: boolean; require_approval: boolean; strategy_name: string | null;
      }>(`SELECT id, is_public, require_approval, strategy_name FROM copy_masters WHERE id = $1`, [masterId]);

      if (!masterRow.rows.length) return res.status(404).json({ error: "Master not found" });
      const master = masterRow.rows[0];
      if (!master.is_public) return res.status(403).json({ error: "This provider is not public" });

      // Prevent duplicate subscriptions
      const existing = await pool.query(
        `SELECT id FROM copy_followers WHERE master_id = $1 AND user_id = $2 AND account_id = $3`,
        [masterId, user.id, accountId],
      );
      if (existing.rows.length) return res.status(409).json({ error: "Already subscribed with this account" });

      const follower = await storage.createCopyFollower({
        userId:        user.id,
        accountId,
        masterId,
        lotMode:       lotMode       || "mult",
        lotMultiplier: lotMultiplier || "1.0",
        fixedLot:      fixedLot      || null,
        riskPercent:   riskPercent   || "1.0",
        isActive:      !master.require_approval,  // auto-activate unless approval required
        riskAccepted:  false,
      });

      return res.status(201).json({
        follower,
        requiresApproval: master.require_approval,
        message: master.require_approval
          ? "Subscription submitted — awaiting provider approval"
          : "Subscribed — trades will start copying within 60 seconds",
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
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
        passwordEnc:  ac.password ? safeEncrypt(ac.password) : "",
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
          // Remap apiHash → apiHashEnc (schema field name) and encrypt it.
          // The wizard sends { apiHash, apiId, phoneNumber, channelName, ... }
          // The schema expects { apiHashEnc, apiId, phoneNumber, channelName, ... }
          const { apiHash, ...tgRest } = telegramConfig;
          await storage.upsertTelegramSource({
            ...tgRest,
            masterId:   masterRecord.id,
            apiHashEnc: apiHash ? safeEncrypt(apiHash) : undefined,
          });
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

  // ── Telegram journal: executed Telegram trades with manual outcome ────────────
  app.get("/api/copy/telegram-journal", async (req: Request, res: Response) => {
    try {
      const { userId, limit = '200' } = req.query as Record<string, string>;
      const rows = await pool.query(`
        SELECT
          ctf.id,
          ctf.follower_id,
          ctf.master_trade_id,
          ctf.external_id,
          ctf.symbol,
          ctf.action,
          ctf.event_type,
          ctf.volume,
          ctf.entry_price,
          ctf.stop_loss,
          ctf.take_profit,
          ctf.closed_price,
          ctf.status,
          ctf.error_message,
          ctf.executed_at,
          ctf.created_at,
          ctf.manual_outcome,
          ctm.source,
          ctm.raw_payload,
          cf.user_id
        FROM copy_trades_follower ctf
        JOIN copy_trades_master   ctm ON ctm.id = ctf.master_trade_id
        JOIN copy_followers       cf  ON cf.id  = ctf.follower_id
        WHERE ctm.source = 'telegram'
          AND ctf.status = 'executed'
          ${userId ? `AND cf.user_id = '${userId.replace(/'/g, "''")}'` : ''}
        ORDER BY ctf.created_at DESC
        LIMIT ${parseInt(limit) || 200}
      `);
      return res.json(rows.rows);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // Mark a telegram trade as win / loss / clear
  app.patch("/api/copy/telegram-journal/:id/outcome", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { outcome } = req.body as { outcome: 'win' | 'loss' | null };
      if (outcome !== 'win' && outcome !== 'loss' && outcome !== null) {
        return res.status(400).json({ error: 'outcome must be win, loss, or null' });
      }
      await pool.query(
        `UPDATE copy_trades_follower SET manual_outcome = $1 WHERE id = $2`,
        [outcome, id]
      );
      return res.json({ ok: true, id, outcome });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // Telegram win-rate stats for a user
  app.get("/api/copy/telegram-journal/stats", async (req: Request, res: Response) => {
    try {
      const { userId } = req.query as { userId?: string };
      const rows = await pool.query(`
        SELECT
          COUNT(*)                                              AS total,
          COUNT(*) FILTER (WHERE ctf.manual_outcome = 'win')   AS wins,
          COUNT(*) FILTER (WHERE ctf.manual_outcome = 'loss')  AS losses,
          COUNT(*) FILTER (WHERE ctf.manual_outcome IS NULL)   AS unmarked
        FROM copy_trades_follower ctf
        JOIN copy_trades_master   ctm ON ctm.id = ctf.master_trade_id
        JOIN copy_followers       cf  ON cf.id  = ctf.follower_id
        WHERE ctm.source = 'telegram'
          AND ctf.status = 'executed'
          ${userId ? `AND cf.user_id = '${userId.replace(/'/g, "''")}'` : ''}
      `);
      const r = rows.rows[0];
      const marked = Number(r.wins) + Number(r.losses);
      return res.json({
        total:    Number(r.total),
        wins:     Number(r.wins),
        losses:   Number(r.losses),
        unmarked: Number(r.unmarked),
        winRate:  marked > 0 ? +((Number(r.wins) / marked) * 100).toFixed(1) : null,
      });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── Admin: aggregated copy-trading overview ──────────────────────────────────
  app.get("/api/admin/copy/all-trades", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          ctf.id,
          ctf.symbol,
          ctf.action,
          ctf.event_type,
          ctf.volume,
          ctf.entry_price,
          ctf.stop_loss,
          ctf.take_profit,
          ctf.closed_price,
          ctf.status,
          ctf.error_message,
          ctf.executed_at,
          ctf.created_at,
          ctf.manual_outcome,
          ctm.source,
          cf.user_id  AS follower_user_id,
          cm.user_id  AS master_user_id,
          cm.strategy_name,
          cm.source_type,
          CASE WHEN cf.user_id = cm.user_id THEN true ELSE false END AS is_self_copy
        FROM copy_trades_follower ctf
        JOIN copy_trades_master  ctm ON ctm.id  = ctf.master_trade_id
        JOIN copy_followers      cf  ON cf.id   = ctf.follower_id
        JOIN copy_masters        cm  ON cm.id   = cf.master_id
        WHERE ctf.status = 'executed'
        ORDER BY ctf.created_at DESC
        LIMIT 500
      `);
      return res.json(rows);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.get("/api/admin/copy/overview", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [mastersRes, followersRes, tgStatsRes, selfCopyRes] = await Promise.all([
        pool.query(`
          SELECT
            m.id, m.strategy_name, m.source_type, m.trading_style, m.primary_market,
            m.is_active, m.created_at, m.user_id,
            COUNT(DISTINCT f.id) FILTER (WHERE f.is_active = true)::int  AS follower_count,
            COUNT(t.id) FILTER (WHERE t.event_type = 'close')::int       AS total_trades,
            COUNT(t.id) FILTER (
              WHERE t.event_type = 'close'
                AND t.closed_price IS NOT NULL AND t.entry_price IS NOT NULL
                AND ((t.action='BUY' AND t.closed_price::numeric>t.entry_price::numeric)
                  OR (t.action='SELL' AND t.closed_price::numeric<t.entry_price::numeric))
            )::int AS win_count,
            GREATEST(1,FLOOR(EXTRACT(EPOCH FROM (NOW()-m.created_at))/2592000))::int AS months_active
          FROM copy_masters m
          LEFT JOIN copy_followers f ON f.master_id = m.id
          LEFT JOIN copy_trades_master t ON t.master_id = m.id
          GROUP BY m.id ORDER BY m.created_at DESC
        `),
        pool.query(`
          SELECT
            cf.id, cf.user_id, cf.master_id, cf.lot_mode, cf.lot_multiplier,
            cf.risk_percent, cf.direction, cf.max_open_trades, cf.pause_on_dd,
            cf.is_active, cf.deployed_at, cf.created_at,
            cm.strategy_name, cm.source_type,
            CASE WHEN cf.user_id = cm.user_id THEN true ELSE false END AS is_self_copy
          FROM copy_followers cf
          JOIN copy_masters cm ON cm.id = cf.master_id
          ORDER BY cf.created_at DESC
        `),
        pool.query(`
          SELECT
            COUNT(*)                                              AS total,
            COUNT(*) FILTER (WHERE ctf.manual_outcome='win')     AS wins,
            COUNT(*) FILTER (WHERE ctf.manual_outcome='loss')    AS losses,
            COUNT(*) FILTER (WHERE ctf.manual_outcome IS NULL)   AS unmarked
          FROM copy_trades_follower ctf
          JOIN copy_trades_master ctm ON ctm.id = ctf.master_trade_id
          WHERE ctm.source = 'telegram' AND ctf.status = 'executed'
        `),
        pool.query(`
          SELECT COUNT(*)::int AS self_copy_count
          FROM copy_followers cf
          JOIN copy_masters cm ON cm.id = cf.master_id
          WHERE cf.user_id = cm.user_id AND cf.is_active = true
        `),
      ]);

      const tg = tgStatsRes.rows[0];
      const tgMarked = Number(tg.wins) + Number(tg.losses);

      return res.json({
        masters:        mastersRes.rows,
        followers:      followersRes.rows,
        selfCopyCount:  selfCopyRes.rows[0]?.self_copy_count ?? 0,
        telegramStats: {
          total:    Number(tg.total),
          wins:     Number(tg.wins),
          losses:   Number(tg.losses),
          unmarked: Number(tg.unmarked),
          winRate:  tgMarked > 0 ? +((Number(tg.wins) / tgMarked) * 100).toFixed(1) : null,
        },
      });
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
      // Auto-create a trading session for this broker account so auto-journaled
      // trades are immediately visible in all session-filtered views.
      const startingBal = req.body.startingBalance ?? '0.00';
      const session = await storage.createSession({
        userId:          user.id,
        sessionName:     name,
        startingBalance: String(parseFloat(String(startingBal)).toFixed(2)),
        status:          'active',
      });

      const account = await storage.createBrokerAccount({
        userId:           user.id,
        name,
        loginId,
        passwordEnc,
        server,
        platform,
        accountType:      accountType    ?? 'demo',
        connectionType:   connectionType ?? 'webhook',
        currency:         currency       ?? 'USD',
        webhookToken,
        defaultSessionId: session.id,
        syncStatus:       'pending',
      });

      const { passwordEnc: _, ...safe } = account;
      return res.status(201).json({ ...safe, webhookUrl: `/api/broker/webhook/${webhookToken}`, sessionId: session.id });
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

    if (!API_PLATFORMS.has(account.platform.toLowerCase())) {
      return res.status(400).json({ error: `No API adapter for platform: ${account.platform}` });
    }

    try {
      // Default: sync last 30 days; caller can override with ?days=N
      const days  = Math.min(parseInt(String(req.query.days ?? '30')), 365);
      const toMs  = Date.now();
      const fromMs = toMs - days * 86_400_000;

      await storage.updateBrokerAccountSyncStatus(account.id, 'syncing', 0);

      const rawTrades = await fetchTradesForAccount(account, fromMs, toMs);
      const result    = await processIncomingTrades(account.id, account.userId, rawTrades);

      return res.json({ ...result, platform: account.platform, daysScanned: days });
    } catch (err: any) {
      await storage.updateBrokerAccountSyncStatus(account.id, 'error', 0);
      return res.status(500).json({ error: err.message ?? 'Sync failed' });
    }
  });

  // ── cTrader OAuth2 flow ───────────────────────────────────────────────────────

  /** Step 1: redirect user to cTrader authorization page. */
  app.get("/api/broker/ctrader/connect", async (req: Request, res: Response) => {
    const user = await verifyToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const accountId = String(req.query.accountId ?? '');
    if (!accountId) return res.status(400).json({ error: "accountId required" });

    try {
      const url = getCTraderAuthUrl(accountId);
      return res.json({ url });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  /** Step 2: OAuth callback — exchange code, store tokens, fetch cTrader accounts. */
  app.get("/api/broker/ctrader/callback", async (req: Request, res: Response) => {
    const { code, state: accountId, error: oauthError } = req.query as Record<string, string>;

    if (oauthError) {
      return res.redirect(`/accounts?ctrader_error=${encodeURIComponent(oauthError)}`);
    }
    if (!code || !accountId) {
      return res.redirect('/accounts?ctrader_error=missing_code');
    }

    try {
      const tokens   = await exchangeCodeForTokens(code);
      const ctAccounts = await getCTraderAccounts(tokens.accessToken);

      // Pick the first cTrader account (or let user choose later)
      const ct = ctAccounts[0];
      const ctraderId = String(ct?.ctidTraderAccountId ?? '');

      // Store tokens encrypted in passwordEnc as JSON
      const credJson = JSON.stringify({
        accessToken:  tokens.accessToken,
        refreshToken: tokens.refreshToken,
        ctraderId,
      });

      await storage.updateBrokerAccount(accountId, {
        loginId:     ctraderId || accountId,
        passwordEnc: encrypt(credJson),
        syncStatus:  'ok',
      });

      return res.redirect('/accounts?ctrader_connected=1');
    } catch (err: any) {
      console.error('[cTrader OAuth]', err);
      return res.redirect(`/accounts?ctrader_error=${encodeURIComponent(err.message)}`);
    }
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

  // ── Auth: registration setup (idempotent) ────────────────────────────────────
  // Called by the client after every sign-in/sign-up.
  // On the FIRST call for a given user, a profile is created with a role assigned
  // atomically. On every subsequent call the existing role is returned unchanged —
  // an admin can never be demoted by logging in again.
  //
  // Role assignment priority (first match wins):
  //   1. ADMIN_EMAIL env var — explicit, zero race condition.
  //   2. Atomic DB check: if no admin exists yet → first registrant becomes admin.
  //   3. Everyone else → 'user'.
  // ── Local admin login (fallback when Supabase is not configured) ────────────
  app.post("/api/auth/local-login", async (req: Request, res: Response) => {
    const adminEmail  = process.env.ADMIN_EMAIL;
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminEmail || !adminSecret) {
      return res.status(503).json({ error: 'Local auth not configured' });
    }
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (email.toLowerCase() !== adminEmail.toLowerCase() || password !== adminSecret) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    return res.json({ token: adminSecret, role: 'admin', email: adminEmail });
  });

  app.post("/api/auth/setup", async (req: Request, res: Response) => {
    const authUser = await verifyToken(req.headers.authorization);
    if (!authUser) {
      console.warn('[Auth/setup] Unauthorized request', {
        hasAuthHeader: Boolean(req.headers.authorization),
        authPrefix: req.headers.authorization?.slice(0, 20) ?? null,
      });
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      console.log('[Auth/setup] start', { id: authUser.id, email: authUser.email ?? null });
      // ── 1. Check if this user already has a profile ───────────────────────
      const existing = await db
        .select({ role: userProfiles.role })
        .from(userProfiles)
        .where(eq(userProfiles.id, authUser.id))
        .limit(1);

      if (existing.length > 0) {
        const existingRole = existing[0].role as 'admin' | 'user';
        console.log('[Auth/setup] existing profile found', { id: authUser.id, role: existingRole });
        // Sync Supabase app_metadata so the client JWT stays accurate
        if (supabaseAdmin) {
          await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
            app_metadata: { role: existingRole },
          });
        }
        return res.json({ role: existingRole });
      }

      // ── 2. New user — determine role atomically ───────────────────────────
      const email = authUser.email ?? '';
      let assignedRole: 'admin' | 'user' = 'user';

      const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      if (adminEmail && email.toLowerCase() === adminEmail) {
        // Explicit env-var admin — no DB query needed, no race condition.
        assignedRole = 'admin';
      } else {
        // Atomic check: promote first registrant to admin using FOR UPDATE lock
        // so two simultaneous sign-ups cannot both pass the zero-admin check.
        await db.transaction(async (tx) => {
          const countResult = await tx.execute(
            drizzleSql`SELECT COUNT(*)::int AS cnt FROM user_profiles WHERE role = 'admin' FOR UPDATE`
          );
          const adminCount = (countResult.rows?.[0] as any)?.cnt ?? 0;
          console.log('[Auth/setup] admin count', { adminCount });
          if (Number(adminCount) === 0) assignedRole = 'admin';
        });
      }

      // ── 3. Insert the profile ─────────────────────────────────────────────
      console.log('[Auth/setup] inserting profile', { id: authUser.id, email, role: assignedRole });
      await db.insert(userProfiles).values({
        id:    authUser.id,
        email,
        role:  assignedRole,
      });

      // ── 4. Sync role to Supabase app_metadata so the client JWT is correct ─
      if (supabaseAdmin) {
        await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
          app_metadata: { role: assignedRole },
        });
      }

      if (assignedRole === 'user') {
        createAdminNotification({
          category: 'signup',
          title: 'New user signed up',
          body: `${email || 'Unknown email'} just created an account.`,
          meta: { userId: authUser.id, email },
        }).catch(() => {});
      }

      console.log('[Auth/setup] success', { id: authUser.id, role: assignedRole });
      return res.json({
        role: assignedRole,
        ...(assignedRole === 'admin' ? { message: 'Admin role granted.' } : {}),
      });
    } catch (err: any) {
      console.error('[Auth/setup] failed', {
        id: authUser.id,
        email: authUser.email ?? null,
        message: err?.message ?? String(err),
        stack: err?.stack ?? null,
      });
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin middleware ──────────────────────────────────────────────────────────
  // Reads role from the DB — never from the JWT — so stale or manipulated tokens
  // cannot escalate privileges.
  // ── IP geolocation (ip-api.com — free, no key required) ────────────────────
  async function geolocateIp(ip: string): Promise<{
    country: string; countryCode: string; region: string; city: string; isp: string;
  } | null> {
    if (!ip || ip === 'unknown' || ip.startsWith('127.') || ip.startsWith('::')) return null;
    try {
      const res = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,isp`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return null;
      const d = await res.json() as any;
      if (d.status !== 'success') return null;
      return { country: d.country, countryCode: d.countryCode, region: d.regionName, city: d.city, isp: d.isp };
    } catch {
      return null;
    }
  }

  // ── Log admin access (fire-and-forget) ───────────────────────────────────────
  function logAdminAccess(userId: string, email: string, ip: string) {
    geolocateIp(ip).then(geo => {
      db.insert(adminAccessLogs).values({
        userId, email, ip,
        country:     geo?.country     ?? null,
        countryCode: geo?.countryCode ?? null,
        region:      geo?.region      ?? null,
        city:        geo?.city        ?? null,
        isp:         geo?.isp         ?? null,
      }).catch(() => {});
    }).catch(() => {});
  }

  async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    // Option 1: ADMIN_SECRET bypass — accepts both X-Admin-Secret header and
    // Bearer <adminSecret> token (so local-login clients work without Supabase)
    const adminSecret = process.env.ADMIN_SECRET;
    const bearerToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    if (
      adminSecret &&
      (
        req.headers['x-admin-secret'] === adminSecret ||
        (!supabaseAdmin && bearerToken === adminSecret)
      )
    ) {
      const adminUser = { id: 'admin', email: process.env.ADMIN_EMAIL ?? 'admin@local' };
      (req as any).adminUser = adminUser;
      logAdminAccess(adminUser.id, adminUser.email, getClientIp(req));
      return next();
    }

    // Option 2: Supabase JWT
    const authUser = await verifyToken(req.headers.authorization);
    if (!authUser) return res.status(401).json({ error: "Unauthorized" });

    const profile = await db
      .select({ role: userProfiles.role })
      .from(userProfiles)
      .where(eq(userProfiles.id, authUser.id))
      .limit(1);

    if (!profile.length || profile[0].role !== 'admin') {
      return res.status(403).json({ error: "Forbidden — admins only" });
    }

    (req as any).adminUser = authUser;
    logAdminAccess(authUser.id, authUser.email ?? '', getClientIp(req));
    next();
  }

  // ── Admin: list all users ─────────────────────────────────────────────────────
  app.get("/api/admin/users", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [supabaseResult, dbProfiles, recentAccessLogs] = await Promise.all([
        supabaseAdmin
          ? supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
          : Promise.resolve({ data: { users: [] }, error: null } as any),
        db.select().from(userProfiles),
        db.select().from(adminAccessLogs),
      ]);

      if (supabaseResult?.error) return res.status(500).json({ error: supabaseResult.error.message });

      const safeProfiles = Array.isArray(dbProfiles) ? dbProfiles : [];
      const safeAccessLogs = Array.isArray(recentAccessLogs) ? recentAccessLogs : [];
      const profileMap = new Map(safeProfiles.map((p: any) => [p.id, p]));
      const countryBackfillMap = new Map<string, string>();
      for (const log of safeAccessLogs) {
        if (!countryBackfillMap.has(log.userId) && log.country) {
          countryBackfillMap.set(log.userId, log.country);
        }
      }

      const supabaseUsers = Array.isArray(supabaseResult?.data?.users) ? supabaseResult.data.users : [];
      const dbOnlyUsers = safeProfiles
        .filter(p => !supabaseUsers.some((u: any) => u.id === p.id))
        .map(p => ({
          id: p.id,
          email: '',
          user_metadata: {},
          created_at: null,
          last_sign_in_at: null,
        }));

      const result = [...supabaseUsers, ...dbOnlyUsers].map((u: any) => {
        const profile = profileMap.get(u.id);
        const country = profile?.country || countryBackfillMap.get(u.id) || '';
        return {
          id:              u.id,
          email:           u.email ?? '',
          full_name:       u.user_metadata?.full_name ?? '',
          role:            profile?.role ?? 'user',
          country,
          plan:            profile?.plan ?? 'Free',
          status:          profile?.status ?? 'Active',
          win_rate:        profile?.winRate ?? '',
          created_at:      u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
        };
      });

      return res.json(result);
    } catch (err: any) {
      const message = err?.message ?? String(err);
      if (message.includes("desc")) {
        console.error("[Admin/users] ORDER BY error detected:", err);
      }
      if (message.includes("syntax error")) {
        console.error("[Admin/users] SQL syntax issue:", err);
      }
      console.error("[Admin/users] Failed to load users", {
        message,
        stack: err?.stack ?? null,
        raw: err,
      });
      return res.status(500).json({
        error: "Admin users query failed",
        detail: message,
      });
    }
  });

  // ── Admin: update trader profile (plan, status, country, win_rate) ─────────────
  app.patch("/api/admin/users/:userId/profile", requireAdmin, async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { country, plan, status, win_rate, subscriptionStatus, journalAccessDays } = req.body as Record<string, string>;
    const allowed = ['Free', 'Pro', 'Enterprise'];
    const allowedStatus = ['Active', 'Inactive', 'Banned'];
    if (plan && !allowed.includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
    if (status && !allowedStatus.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    try {
      if (journalAccessDays) {
        const days = Math.max(1, Math.min(3650, parseInt(journalAccessDays, 10) || 0));
        await db.update(userProfiles)
          .set({
            journalAccessEndsAt: drizzleSql`NOW() + (${days} || ' days')::interval`,
            journalAccessGrantedBy: ((req as any).adminUser?.id ?? 'admin') as any,
          } as any)
          .where(eq(userProfiles.id, userId));
      }
      await db.update(userProfiles)
        .set({
          ...(country !== undefined && { country }),
          ...(plan    !== undefined && { plan }),
          ...(status  !== undefined && { status }),
          ...(subscriptionStatus !== undefined && { subscriptionStatus }),
          ...(win_rate !== undefined && { winRate: win_rate }),
        })
        .where(eq(userProfiles.id, userId));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/me/entitlement", async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    try {
      const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.VITE_STRIPE_PRICE_ID);
      const { rows } = await pool.query(
        `SELECT subscription_status, subscription_ends_at, journal_access_ends_at, journal_access_granted_by
         FROM user_profiles WHERE id = $1 LIMIT 1`,
        [auth.id],
      );
      const p = rows[0] || {};
      const now = Date.now();
      const subEnds = p.subscription_ends_at ? new Date(p.subscription_ends_at).getTime() : null;
      const journalEnds = p.journal_access_ends_at ? new Date(p.journal_access_ends_at).getTime() : null;
      const paidAccess = Boolean(
        (p.subscription_status && p.subscription_status !== 'free' && (!subEnds || subEnds > now)) ||
        (journalEnds && journalEnds > now)
      );
      res.json({
        subscriptionStatus: p.subscription_status ?? 'free',
        subscriptionEndsAt: p.subscription_ends_at ?? null,
        journalAccessEndsAt: p.journal_access_ends_at ?? null,
        journalAccessGrantedBy: p.journal_access_granted_by ?? null,
        stripeConfigured,
        hasJournalAccess: stripeConfigured ? paidAccess : true,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: overview stats ─────────────────────────────────────────────────────
  app.get("/api/admin/stats", requireAdmin, async (_req: Request, res: Response) => {
    try {
      if (!supabaseAdmin) return res.status(503).json({ error: "Auth service not configured" });

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const adminIpSet = await getAllAdminIps();
      const adminIpList = [...adminIpSet];

      // Build visitor query via pool.query so we can safely bind a text[] parameter
      const visitorSql = adminIpList.length > 0
        ? `SELECT date_trunc('month', viewed_at) AS month,
                  COUNT(DISTINCT session_id)     AS unique_visitors,
                  AVG(duration_seconds)          AS avg_duration
           FROM page_views
           WHERE viewed_at >= NOW() - INTERVAL '3 months'
             AND (ip_address IS NULL OR ip_address != ALL($1::text[]))
           GROUP BY month ORDER BY month DESC`
        : `SELECT date_trunc('month', viewed_at) AS month,
                  COUNT(DISTINCT session_id)     AS unique_visitors,
                  AVG(duration_seconds)          AS avg_duration
           FROM page_views
           WHERE viewed_at >= NOW() - INTERVAL '3 months'
           GROUP BY month ORDER BY month DESC`;
      const visitorParams = adminIpList.length > 0 ? [adminIpList] : [];

      const [supabaseResult, allPosts, roleProfiles, visitorResult] = await Promise.all([
        supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
        storage.getBlogPosts(),
        db.select({ role: userProfiles.role }).from(userProfiles),
        pool.query(visitorSql, visitorParams),
      ]);

      if (supabaseResult.error) return res.status(500).json({ error: supabaseResult.error.message });

      const users = supabaseResult.data.users;
      const adminCount = roleProfiles.filter(p => p.role === 'admin').length;

      // Monthly signups for current calendar year
      const signupsByMonth = Array(12).fill(0);
      users.forEach(u => {
        const d = new Date(u.created_at);
        if (d.getFullYear() === currentYear) signupsByMonth[d.getMonth()]++;
      });

      // Daily signups for last 30 days
      const signupsByDay = Array(30).fill(0);
      users.forEach(u => {
        const daysAgo = Math.floor((now.getTime() - new Date(u.created_at).getTime()) / 86400000);
        if (daysAgo >= 0 && daysAgo < 30) signupsByDay[29 - daysAgo]++;
      });

      // Visitor stats from page_views
      const rows = visitorResult.rows ?? [];
      const thisMonthRow = rows.find((r: any) => {
        const d = new Date(r.month);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      const lastMonthRow = rows.find((r: any) => {
        const d = new Date(r.month);
        const lm = currentMonth === 0 ? 11 : currentMonth - 1;
        const ly = currentMonth === 0 ? currentYear - 1 : currentYear;
        return d.getMonth() === lm && d.getFullYear() === ly;
      });

      const monthlyVisitors = Number(thisMonthRow?.unique_visitors ?? 0);
      const lastMonthVisitors = Number(lastMonthRow?.unique_visitors ?? 0);
      const visitorChange = lastMonthVisitors > 0
        ? ((monthlyVisitors - lastMonthVisitors) / lastMonthVisitors * 100).toFixed(1)
        : null;

      const avgSessionSeconds = thisMonthRow?.avg_duration ? Math.round(Number(thisMonthRow.avg_duration)) : null;

      // User growth %: signups this month vs last month
      const thisMonthSignups = signupsByMonth[currentMonth];
      const lastMonthSignups = signupsByMonth[currentMonth === 0 ? 11 : currentMonth - 1];
      const userChange = lastMonthSignups > 0
        ? ((thisMonthSignups - lastMonthSignups) / lastMonthSignups * 100).toFixed(1)
        : null;

      // Recent activity
      const recentUsers = [...users]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)
        .map(u => ({ type: 'signup', text: `New signup: ${(u.user_metadata as any)?.full_name || u.email}`, ts: u.created_at }));

      const recentPosts = (allPosts as any[])
        .filter(p => p.status === 'Published')
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 5)
        .map(p => ({ type: 'post', text: `Post published: ${p.title}`, ts: p.createdAt }));

      const recentActivity = [...recentUsers, ...recentPosts]
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
        .slice(0, 5);

      return res.json({
        totalUsers: users.length,
        userChange,
        adminCount,
        publishedPosts: (allPosts as any[]).filter(p => p.status === 'Published').length,
        draftPosts: (allPosts as any[]).filter(p => p.status === 'Draft').length,
        monthlyVisitors,
        visitorChange,
        avgSessionSeconds,
        signupsByMonth,
        signupsByDay,
        recentActivity,
        adminIps: adminIpList,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: invite user by email ───────────────────────────────────────────────
  app.post("/api/admin/invite", requireAdmin, async (req: Request, res: Response) => {
    const { email } = req.body as { email: string };
    if (!email?.trim()) return res.status(400).json({ error: 'email is required' });
    if (!supabaseAdmin) return res.status(503).json({ error: 'Auth service not configured' });
    try {
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email.trim());
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: real server metrics ────────────────────────────────────────────────
  app.get("/api/admin/metrics", requireAdmin, (_req: Request, res: Response) => {
    const now = Date.now();
    const curr = process.cpuUsage();
    const elapsed = (now - _prevCpuTime) * 1000;
    const cpuDelta = (curr.user - _prevCpu.user) + (curr.system - _prevCpu.system);
    const cpu = elapsed > 0 ? Math.min(Math.round((cpuDelta / elapsed) * 1000) / 10, 100) : 0;
    _prevCpu = curr; _prevCpuTime = now;

    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const memory   = Math.round((1 - freeMem / totalMem) * 1000) / 10;
    const uptimeSec = Math.floor(process.uptime());
    const recentReqs = _reqTimestamps.filter(t => t > now - 60000);
    const reqPerSec  = Math.round(recentReqs.length / 60 * 10) / 10;
    const loadAvg    = os.loadavg()[0];

    return res.json({ cpu, memory, uptimeSec, reqPerSec, loadAvg: Math.round(loadAvg * 100) / 100, totalMemGB: (totalMem / 1073741824).toFixed(1), freeMemGB: (freeMem / 1073741824).toFixed(1) });
  });

  // ── Support tickets (public submit) ──────────────────────────────────────────
  app.post("/api/support/ticket", async (req: Request, res: Response) => {
    try {
      const { user_name = '', user_email = '', subject, message = '', priority = 'Medium', channel = 'email' } = req.body as Record<string, string>;
      if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });
      const result = await db.execute(drizzleSql`
        INSERT INTO support_tickets (user_name, user_email, subject, message, priority, channel)
        VALUES (${user_name}, ${user_email}, ${subject.trim()}, ${message}, ${priority}, ${channel})
        RETURNING *
      `);
      const row = (result as any).rows?.[0] ?? result;
      createAdminNotification({
        category: 'message',
        title: `New ticket: ${subject.trim()}`,
        body: `From ${user_name || 'Anonymous'} (${user_email || 'no email'}) — ${priority} priority`,
        meta: { user_name, user_email, priority, channel },
      }).catch(() => {});
      return res.status(201).json(row);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: list all support tickets ──────────────────────────────────────────
  app.get("/api/admin/tickets", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await db.execute(drizzleSql`SELECT * FROM support_tickets ORDER BY created_at DESC`);
      return res.json((result as any).rows ?? result);
    } catch (err: any) {
      console.error("[Admin/tickets] Failed to load tickets", {
        message: err?.message ?? String(err),
        stack: err?.stack ?? null,
        raw: err,
      });
      return res.status(500).json({
        error: "Admin tickets query failed",
        detail: err?.message ?? "Failed to load tickets",
      });
    }
  });

  // ── Admin: update ticket (status, reply) ──────────────────────────────────────
  app.patch("/api/admin/tickets/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, reply } = req.body as { status?: string; reply?: string };
      await db.execute(drizzleSql`
        UPDATE support_tickets
        SET status = COALESCE(${status ?? null}, status),
            reply  = COALESCE(${reply  ?? null}, reply),
            updated_at = NOW()
        WHERE id = ${id}::uuid
      `);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[Admin/tickets] Failed to update ticket", {
        message: err?.message ?? String(err),
        stack: err?.stack ?? null,
        raw: err,
      });
      return res.status(500).json({
        error: "Admin ticket update failed",
        detail: err?.message ?? "Failed to update ticket",
      });
    }
  });

  // ── Admin: send campaign (In-App notifications) ───────────────────────────────
  app.post("/api/admin/campaigns", requireAdmin, async (req: Request, res: Response) => {
    try {
      if (!supabaseAdmin) return res.status(503).json({ error: 'Auth service not configured' });
      const { subject, message, channels = [], audience = 'all' } = req.body as { subject?: string; message: string; channels: string[]; audience?: string };
      if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

      const { data: usersData, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (error) return res.status(500).json({ error: error.message });

      let targets = usersData.users;
      if (audience === 'inactive') {
        const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
        targets = targets.filter(u => !u.last_sign_in_at || u.last_sign_in_at < cutoff);
      }

      let notifCount = 0;
      if (channels.includes('In-App') || channels.includes('in-app')) {
        for (const u of targets) {
          await db.execute(drizzleSql`
            INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
            VALUES (${u.id}, 'announcement', ${subject?.trim() || 'Announcement'}, ${message.trim()}, false, NOW())
          `);
          notifCount++;
        }
      }

      await db.execute(drizzleSql`
        INSERT INTO support_tickets (user_name, user_email, subject, message, priority, channel, status)
        VALUES ('Admin', 'admin@system', ${`Campaign: ${subject || 'Broadcast'}`}, ${`Sent to ${targets.length} users via ${channels.join(', ')}`}, 'Low', 'email', 'Resolved')
      `);

      createAdminNotification({
        category: 'campaign',
        title: `Campaign sent: ${subject || 'Broadcast'}`,
        body: `Sent to ${targets.length} users via ${channels.join(', ')}. In-app: ${notifCount} notifications created.`,
        meta: { targets: targets.length, channels, audience },
      }).catch(() => {});
      return res.json({ ok: true, sent: targets.length, notificationsCreated: notifCount, emailNote: channels.includes('Email') ? 'Email delivery requires SMTP configuration (SMTP_HOST, SMTP_USER, SMTP_PASS env vars)' : undefined });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: campaign statistics (real DB data) ─────────────────────────────────
  app.get("/api/admin/campaign-stats", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

      // Total in-app announcements sent in last 30d
      const sentRes = await db.execute(drizzleSql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE is_read = true)::int AS read_count
        FROM notifications
        WHERE type = 'announcement' AND created_at >= ${since30}
      `);
      const sentRow = (sentRes.rows ?? [])[0] as any;
      const totalSent: number = +(sentRow?.total ?? 0);
      const readCount: number = +(sentRow?.read_count ?? 0);
      const readRate: number = totalSent > 0 ? Math.round((readCount / totalSent) * 1000) / 10 : 0;

      // Number of campaigns dispatched in last 30d (logged as tickets)
      const campaignRes = await db.execute(drizzleSql`
        SELECT COUNT(*)::int AS total
        FROM support_tickets
        WHERE subject LIKE 'Campaign:%' AND created_at >= ${since30}
      `);
      const campaignCount: number = +((campaignRes.rows ?? [])[0] as any)?.total || 0;

      // Previous 30d for change calculation
      const prev60 = new Date(Date.now() - 60 * 86400000).toISOString();
      const prevRes = await db.execute(drizzleSql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE is_read = true)::int AS read_count
        FROM notifications
        WHERE type = 'announcement' AND created_at >= ${prev60} AND created_at < ${since30}
      `);
      const prevRow = (prevRes.rows ?? [])[0] as any;
      const prevTotal: number = +(prevRow?.total ?? 0);
      const prevRead: number = +(prevRow?.read_count ?? 0);
      const prevReadRate: number = prevTotal > 0 ? Math.round((prevRead / prevTotal) * 1000) / 10 : 0;

      const sentChange = prevTotal > 0 ? `${totalSent >= prevTotal ? '+' : ''}${totalSent - prevTotal}` : totalSent > 0 ? `+${totalSent}` : '—';
      const readChange = prevReadRate > 0 ? `${readRate >= prevReadRate ? '+' : ''}${(readRate - prevReadRate).toFixed(1)}%` : readRate > 0 ? `+${readRate}%` : '—';

      return res.json({
        inAppSent: totalSent,
        readRate,
        campaignCount,
        sentChange,
        readChange,
        sentChangePct: totalSent > 0 ? Math.min(totalSent, 100) : 0,
        readChangePct: readRate,
      });
    } catch (err: any) {
      console.error("[Admin/campaign-stats] Failed to load stats", {
        message: err?.message ?? String(err),
        stack: err?.stack ?? null,
        raw: err,
      });
      return res.status(500).json({
        error: "Campaign stats query failed",
        detail: err?.message ?? "Failed to load campaign stats",
      });
    }
  });

  // ── Admin: notification CRUD ──────────────────────────────────────────────────
  app.get("/api/admin/notifications", requireAdmin, async (_req: Request, res: Response) => {
    return res.json(await getAdminNotifications(80));
  });

  app.get("/api/admin/notifications/counts", requireAdmin, async (_req: Request, res: Response) => {
    return res.json(await getAdminUnreadCounts());
  });

  app.patch("/api/admin/notifications/:id/read", requireAdmin, async (req: Request, res: Response) => {
    await markAdminNotificationRead(req.params.id);
    return res.json({ ok: true });
  });

  app.patch("/api/admin/notifications/read-all", requireAdmin, async (req: Request, res: Response) => {
    const cat = req.query.category as string | undefined;
    await markAllAdminNotificationsRead(cat as any);
    return res.json({ ok: true });
  });

  app.delete("/api/admin/notifications/:id", requireAdmin, async (req: Request, res: Response) => {
    await deleteAdminNotification(req.params.id);
    return res.json({ ok: true });
  });

  app.delete("/api/admin/notifications/clear", requireAdmin, async (req: Request, res: Response) => {
    const cat = req.query.category as string | undefined;
    await clearAdminNotifications(cat as any);
    return res.json({ ok: true });
  });

  // ── Admin: ban / unban user ───────────────────────────────────────────────────
  app.patch("/api/admin/users/:userId/ban", requireAdmin, async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { action = 'ban' } = req.body as { action?: string };
    const newStatus = action === 'unban' ? 'Active' : 'Banned';
    try {
      await db.execute(drizzleSql`
        INSERT INTO user_profiles (id, email, role, status, country)
        VALUES (${userId}, '', 'user', ${newStatus}, '')
        ON CONFLICT (id) DO UPDATE SET status = ${newStatus}
      `);
      addServerLog('warn', 'Admin', `User ${userId} ${newStatus === 'Banned' ? 'banned' : 'unbanned'} by admin`);
      createAdminNotification({
        category: 'alert',
        title: `User ${newStatus === 'Banned' ? 'banned' : 'unbanned'}`,
        body: `User ID ${userId} status changed to ${newStatus}.`,
        meta: { userId, status: newStatus },
      }).catch(() => {});
      return res.json({ ok: true, userId, status: newStatus });
    } catch (err: any) {
      addServerLog('error', 'Admin', `Ban user failed: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: CC agents (persistent) ────────────────────────────────────────────
  app.get("/api/admin/cc-agents", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const r = await db.execute(drizzleSql`SELECT * FROM cc_agents ORDER BY created_at ASC`);
      return res.json(r.rows ?? []);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.post("/api/admin/cc-agents", requireAdmin, async (req: Request, res: Response) => {
    const { name, email, functions = [], status = 'Active' } = req.body as { name: string; email: string; functions?: string[]; status?: string };
    if (!name?.trim() || !email?.trim()) return res.status(400).json({ error: 'name and email required' });
    try {
      const r = await db.execute(drizzleSql`
        INSERT INTO cc_agents (name, email, functions, status)
        VALUES (${name.trim()}, ${email.trim()}, ${JSON.stringify(functions)}::jsonb, ${status})
        RETURNING *
      `);
      return res.json((r.rows ?? [])[0]);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/admin/cc-agents/:id", requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, email, functions, status } = req.body as { name?: string; email?: string; functions?: string[]; status?: string };
    try {
      await db.execute(drizzleSql`
        UPDATE cc_agents SET
          name      = COALESCE(${name ?? null}, name),
          email     = COALESCE(${email ?? null}, email),
          functions = CASE WHEN ${functions != null ? 'true' : 'false'} = 'true' THEN ${functions != null ? JSON.stringify(functions) : '[]'}::jsonb ELSE functions END,
          status    = COALESCE(${status ?? null}, status)
        WHERE id = ${id}::uuid
      `);
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/admin/cc-agents/:id", requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      await db.execute(drizzleSql`DELETE FROM cc_agents WHERE id = ${id}::uuid`);
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── Admin: task scheduler (persistent) ───────────────────────────────────────
  app.get("/api/admin/tasks", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const r = await db.execute(drizzleSql`SELECT * FROM admin_tasks ORDER BY created_at ASC`);
      return res.json(r.rows ?? []);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.post("/api/admin/tasks", requireAdmin, async (req: Request, res: Response) => {
    const { title, assignee, due = '' } = req.body as { title: string; assignee: string; due?: string };
    if (!title?.trim() || !assignee?.trim()) return res.status(400).json({ error: 'title and assignee required' });
    try {
      const r = await db.execute(drizzleSql`
        INSERT INTO admin_tasks (title, assignee, due, status)
        VALUES (${title.trim()}, ${assignee.trim()}, ${due}, 'Pending')
        RETURNING *
      `);
      return res.json((r.rows ?? [])[0]);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/admin/tasks/:id", requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, title, assignee, due } = req.body as { status?: string; title?: string; assignee?: string; due?: string };
    try {
      await db.execute(drizzleSql`
        UPDATE admin_tasks SET
          status   = COALESCE(${status ?? null}, status),
          title    = COALESCE(${title ?? null}, title),
          assignee = COALESCE(${assignee ?? null}, assignee),
          due      = COALESCE(${due ?? null}, due)
        WHERE id = ${id}::uuid
      `);
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/admin/tasks/:id", requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      await db.execute(drizzleSql`DELETE FROM admin_tasks WHERE id = ${id}::uuid`);
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ── Admin: real service health ────────────────────────────────────────────────
  app.get("/api/admin/health", requireAdmin, async (_req: Request, res: Response) => {
    const probe = async (name: string, fn: () => Promise<void>, label?: string): Promise<any> => {
      const t = Date.now();
      try {
        await fn();
        return { name: label ?? name, status: 'operational', latency: `${Date.now()-t}ms` };
      } catch (e: any) {
        return { name: label ?? name, status: 'degraded', latency: 'error', error: e?.message?.slice(0,80) };
      }
    };

    const checks = await Promise.all([

      // ── Infrastructure ──────────────────────────────────────────────────
      probe('db', async () => { await db.execute(drizzleSql`SELECT 1`); }, 'Database'),

      probe('auth', async () => {
        if (!supabaseAdmin) throw new Error('Supabase admin not configured');
        await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
      }, 'Auth / Logins'),

      probe('price-feed', async () => { await pingPriceService(); }, 'Price Feed'),

      // ── App pages / features ────────────────────────────────────────────
      probe('blog', async () => {
        const rows = await pool.query(`SELECT id FROM blog_posts WHERE status='Published' LIMIT 1`);
        // just checking DB table is accessible — no error = operational
        void rows;
      }, 'Blog'),

      probe('journal', async () => {
        await pool.query(`SELECT id FROM journal_entries LIMIT 1`);
      }, 'Journal'),

      probe('calendar', async () => {
        const rows = await pool.query(`SELECT id FROM economic_events LIMIT 1`);
        void rows;
      }, 'Economic Calendar'),

      probe('tsc', async () => {
        // TSC page is static React — if DB is up and server process is alive, it's serving fine
        if (process.uptime() < 0) throw new Error('unreachable');
      }, 'TSC Page'),

      probe('app-loading', async () => {
        // Verify Node process is serving — measure internal round-trip
        const t0 = Date.now();
        await pool.query(`SELECT NOW()`);
        if (Date.now() - t0 > 3000) throw new Error('slow response');
      }, 'App Loading'),

      // ── Services ────────────────────────────────────────────────────────
      probe('gemini', async () => {
        if (!isGeminiConfigured()) throw new Error('API key not set');
      }, 'Gemini AI'),

      probe('telegram', async () => {
        const ready = (telegramNotificationService as any)?.isReady?.() ?? false;
        if (!ready) throw new Error('not configured');
      }, 'Telegram Bot'),

      probe('cache', async () => {
        await cacheService.isCacheFresh();
      }, 'Cache Layer'),

      probe('copy-bridge', async () => {
        const bridgeUrl = process.env.COPY_BRIDGE_URL ?? 'http://bridge:8001';
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 2000);
        try {
          const r = await fetch(`${bridgeUrl}/health`, { signal: ctrl.signal });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        } finally { clearTimeout(tid); }
      }, 'Copy Trading Bridge'),
    ]);

    return res.json({ services: checks, uptimeSec: Math.floor(process.uptime()) });
  });

  // ── Admin: background services state ─────────────────────────────────────────
  app.get("/api/admin/services-state", requireAdmin, (_req: Request, res: Response) => {
    const calStatus = getCalendarServiceStatus();
    const sigStatus = signalMonitor.getStatus();
    const dbPool = pool as any;
    return res.json({
      calendar: calStatus.calendar,
      rates:    calStatus.rates,
      signals:  sigStatus,
      dbPool: {
        total:   dbPool.totalCount   ?? null,
        idle:    dbPool.idleCount    ?? null,
        waiting: dbPool.waitingCount ?? null,
      },
    });
  });

  // ── Admin: server event log ───────────────────────────────────────────────────
  app.get("/api/admin/logs", requireAdmin, (_req: Request, res: Response) => {
    return res.json({ logs: [..._serverLogs].reverse() });
  });

  // ── Admin: change a user's role ───────────────────────────────────────────────
  app.patch("/api/admin/users/:userId/role", requireAdmin, async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { role } = req.body as { role: string };

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: "role must be 'admin' or 'user'" });
    }

    try {
      // Update DB — this is the authoritative source
      await db
        .update(userProfiles)
        .set({ role })
        .where(eq(userProfiles.id, userId));

      // Sync to Supabase app_metadata so the client JWT reflects the change on next login
      if (supabaseAdmin) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          app_metadata: { role },
        });
      }

      return res.json({ success: true, userId, role });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Ensure blog_posts table exists ───────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        title       TEXT NOT NULL,
        excerpt     TEXT DEFAULT '',
        content     TEXT DEFAULT '',
        category    TEXT DEFAULT 'Analysis',
        author      TEXT DEFAULT 'Admin',
        author_id   VARCHAR,
        date        TEXT NOT NULL,
        read_time   TEXT DEFAULT '5 min',
        image_url   TEXT DEFAULT '',
        status      TEXT DEFAULT 'Draft',
        section     TEXT DEFAULT 'blog',
        signal_data JSONB,
        author_data JSONB,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
      -- add author_data column if table was created before this change
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS author_data JSONB;
      -- add summary column if table was created before this change
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS summary TEXT DEFAULT '';
      -- add video_url column added for YouTube embed support
      ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT '';
    `);
  } catch (e: any) {
    console.warn('[Blog] Could not ensure blog_posts table:', e.message);
  }

  // ── Ensure admin_access_logs table exists ─────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_access_logs (
        id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id      VARCHAR,
        email        TEXT,
        ip           TEXT NOT NULL,
        country      TEXT,
        country_code TEXT,
        region       TEXT,
        city         TEXT,
        isp          TEXT,
        accessed_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS admin_access_logs_ip_idx ON admin_access_logs (ip);
    `);
  } catch (e: any) {
    console.warn('[Admin] Could not ensure admin_access_logs table:', e.message);
  }

  // ── Ensure user_profiles has trader profile columns ──────────────────────────
  try {
    await pool.query(`
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS full_name   TEXT DEFAULT '';
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS country     TEXT DEFAULT '';
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS plan        TEXT DEFAULT 'Free';
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS status      TEXT DEFAULT 'Active';
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS win_rate    TEXT DEFAULT '';
    `);
  } catch (e: any) {
    console.warn('[UserProfiles] Could not add trader columns:', e.message);
  }

  // ── Ensure page_views table exists ───────────────────────────────────────────
  try {
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS page_views (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        page            TEXT NOT NULL,
        session_id      TEXT,
        duration_seconds INTEGER,
        viewed_at       TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS page_views_viewed_at_idx ON page_views (viewed_at);
    `);
    // Add ip_address column if it doesn't exist yet (migration)
    await db.execute(drizzleSql`
      ALTER TABLE page_views ADD COLUMN IF NOT EXISTS ip_address TEXT;
      CREATE INDEX IF NOT EXISTS page_views_ip_idx ON page_views (ip_address);
    `);
  } catch (e: any) {
    console.warn('[PageViews] Could not ensure page_views table:', e.message);
  }

  // ── Ensure support_tickets table exists ──────────────────────────────────────
  try {
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_name    TEXT NOT NULL DEFAULT '',
        user_email   TEXT NOT NULL DEFAULT '',
        subject      TEXT NOT NULL,
        message      TEXT NOT NULL DEFAULT '',
        priority     TEXT NOT NULL DEFAULT 'Medium',
        status       TEXT NOT NULL DEFAULT 'Open',
        channel      TEXT NOT NULL DEFAULT 'email',
        reply        TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  } catch (e: any) {
    console.warn('[SupportTickets] Could not ensure table:', e.message);
  }

  // ── Ensure notifications has user_id column ───────────────────────────────────
  try {
    await db.execute(drizzleSql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id VARCHAR`);
  } catch (e: any) { console.warn('[Notifications] Could not add user_id column:', e.message); }

  // ── Ensure copy_trades_follower has manual_outcome column ─────────────────────
  try {
    await pool.query(`ALTER TABLE copy_trades_follower ADD COLUMN IF NOT EXISTS manual_outcome TEXT`);
  } catch (e: any) { console.warn('[CopyTrades] Could not add manual_outcome column:', e.message); }

  // ── Ensure cc_agents table exists ─────────────────────────────────────────────
  try {
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS cc_agents (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name       TEXT NOT NULL,
        email      TEXT NOT NULL,
        functions  JSONB DEFAULT '[]',
        status     TEXT NOT NULL DEFAULT 'Active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    addServerLog('info', 'DB', 'cc_agents table ready');
  } catch (e: any) { console.warn('[CCAgents] Could not ensure table:', e.message); }

  // ── Ensure admin_tasks table exists ───────────────────────────────────────────
  try {
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS admin_tasks (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title      TEXT NOT NULL,
        assignee   TEXT NOT NULL DEFAULT '',
        due        TEXT DEFAULT '',
        status     TEXT NOT NULL DEFAULT 'Pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    addServerLog('info', 'DB', 'admin_tasks table ready');
  } catch (e: any) { console.warn('[AdminTasks] Could not ensure table:', e.message); }

  // ── IP helpers ───────────────────────────────────────────────────────────────
  function getClientIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) {
      const first = (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim();
      if (first) return normalizeIp(first);
    }
    return normalizeIp((req.headers['x-real-ip'] as string) ?? req.socket?.remoteAddress ?? req.ip ?? 'unknown');
  }

  function normalizeIp(ip: string): string {
    return ip
      .trim()
      .replace(/^::ffff:/, '')
      .replace(/^\[|\]$/g, '')
      .toLowerCase();
  }

  function getAdminIps(): string[] {
    const raw = process.env.ADMIN_IPS ?? '';
    return raw.split(',').map(s => normalizeIp(s)).filter(Boolean);
  }

  // Merged admin IP set: env var + every IP that has ever made a successful admin login.
  // Cached for 5 minutes so page-view checks are cheap.
  let _adminIpCache: Set<string> | null = null;
  let _adminIpCachedAt = 0;
  async function getAllAdminIps(): Promise<Set<string>> {
    if (_adminIpCache && Date.now() - _adminIpCachedAt < 5 * 60 * 1000) return _adminIpCache;
    const envIps = getAdminIps();
    try {
      const rows = await db.select({ ip: adminAccessLogs.ip }).from(adminAccessLogs);
      const set = new Set<string>([...envIps, ...rows.map(r => normalizeIp(r.ip))]);
      _adminIpCache = set;
      _adminIpCachedAt = Date.now();
      return set;
    } catch {
      return new Set(envIps);
    }
  }

  // ── Page-view tracking — skip admin IPs automatically ───────────────────────
  app.post("/api/track", async (req: Request, res: Response) => {
    try {
      const { page, sessionId, durationSeconds } = req.body as { page: string; sessionId?: string; durationSeconds?: number };
      if (!page?.trim()) {
        console.warn('[Track] Missing page', {
          body: req.body ?? null,
          contentType: req.headers['content-type'] ?? null,
          ip: getClientIp(req),
        });
        return res.status(400).json({ error: 'page required' });
      }
      const ip = getClientIp(req);
      // Don't count admin traffic in visitor stats
      const adminIps = await getAllAdminIps();
      if (adminIps.has(normalizeIp(ip))) return res.json({ ok: true, skipped: true });
      await db.execute(drizzleSql`
        INSERT INTO page_views (page, session_id, duration_seconds, ip_address)
        VALUES (${page.trim()}, ${sessionId ?? null}, ${durationSeconds ?? null}, ${ip})
      `);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Return the caller's IP + geolocation + whether it's excluded ─────────────
  app.get("/api/track/my-ip", async (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const [adminIps, geo] = await Promise.all([getAllAdminIps(), geolocateIp(ip)]);
    res.json({ ip, isExcluded: adminIps.has(normalizeIp(ip)), configuredAdminIps: [...adminIps], geo });
  });

  // ── Admin access log (last 50 entries) ───────────────────────────────────────
  app.get("/api/admin/access-log", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(adminAccessLogs)
        .orderBy(drizzleSql`accessed_at DESC`)
        .limit(50);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Upload image (blog cover / inline) ───────────────────────────────────────
  app.post("/api/upload/image", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { data: b64, mimeType } = req.body as { data: string; mimeType: string };
      if (!b64) return res.status(400).json({ error: 'data is required' });
      const ext = (mimeType || 'image/jpeg').split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const uploadsDir = path.resolve(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(b64, 'base64'));
      return res.json({ url: `/uploads/${filename}` });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Blog: public list (published only) ───────────────────────────────────────
  app.get("/api/blog", async (req: Request, res: Response) => {
    try {
      const { section } = req.query as { section?: string };
      const filters: { status?: string; section?: string } = { status: 'Published' };
      if (section) filters.section = section;
      const posts = await storage.getBlogPosts(filters);
      return res.json(posts);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Blog: admin list (all posts) ─────────────────────────────────────────────
  app.get("/api/blog/all", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { section } = req.query as { section?: string };
      const posts = await storage.getBlogPosts(section ? { section } : undefined);
      return res.json(posts);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Blog: single post (public) ───────────────────────────────────────────────
  app.get("/api/blog/:id", async (req: Request, res: Response) => {
    try {
      const post = await storage.getBlogPostById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      return res.json(post);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/blog/:id/comments", async (req: Request, res: Response) => {
    try {
      const comments = await storage.getBlogComments(req.params.id);
      return res.json(comments);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/blog/:id/comments", async (req: Request, res: Response) => {
    try {
      const { name = '', message = '' } = req.body as { name?: string; message?: string };
      if (!message.trim()) return res.status(400).json({ error: 'message is required' });
      const comment = await storage.createBlogComment({
        postId: req.params.id,
        name: name.trim() || 'Anonymous',
        message: message.trim(),
        reply: null,
        repliedAt: null,
      });
      createAdminNotification({
        category: 'message',
        title: 'New blog comment',
        body: `${name.trim() || 'Anonymous'} commented on a blog post`,
        meta: { post_id: req.params.id, name: name.trim() || 'Anonymous' },
      }).catch(() => {});
      return res.status(201).json(comment);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/blog/comments/:id/reply", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { reply = '' } = req.body as { reply?: string };
      if (!reply.trim()) return res.status(400).json({ error: 'reply is required' });
      const updated = await storage.updateBlogCommentReply(req.params.id, reply.trim());
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Blog: create post ─────────────────────────────────────────────────────────
  app.post("/api/blog", requireAdmin, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const { title, excerpt, content, summary, category, author, date, readTime, imageUrl, videoUrl, status, section, signalData, authorData } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
      const post = await storage.createBlogPost({
        title: title.trim(),
        excerpt: excerpt ?? '',
        content: content ?? '',
        summary: summary ?? '',
        category: category ?? 'Analysis',
        author: author || adminUser?.user_metadata?.full_name || adminUser?.email || 'Admin',
        authorId: adminUser?.id,
        date: date || new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' }),
        readTime: readTime ?? '5 min',
        imageUrl: imageUrl ?? '',
        videoUrl: videoUrl ?? '',
        status: status ?? 'Draft',
        section: section ?? 'blog',
        signalData: signalData ?? null,
        authorData: authorData ?? null,
      });
      return res.status(201).json(post);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Blog: update post ─────────────────────────────────────────────────────────
  app.patch("/api/blog/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updated = await storage.updateBlogPost(id, req.body);
      if (!updated) return res.status(404).json({ error: 'Post not found' });
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Blog: delete post ─────────────────────────────────────────────────────────
  app.delete("/api/blog/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const ok = await storage.deleteBlogPost(id);
      if (!ok) return res.status(404).json({ error: 'Post not found' });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Internal bridge API (Python bridge → Node.js) ──────────────────────────
  // All routes under /api/internal are protected by BRIDGE_SECRET.
  // Only the copy trading bridge container calls these — never the browser.

  const requireBridgeSecret = (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env.BRIDGE_SECRET;
    if (!secret || req.headers['x-bridge-secret'] !== secret)
      return res.status(403).json({ error: 'Forbidden' });
    next();
  };

  // Bridge fetches this on startup to know which MT5 master accounts to monitor.
  app.get('/api/internal/active-providers', requireBridgeSecret, async (req: Request, res: Response) => {
    try {
      const rows = await pool.query<{
        id: string; login_id: string; broker_server: string; password_enc: string;
      }>(`
        SELECT cm.id, ca.login_id, ca.broker_server, ca.password_enc
        FROM   copy_masters  cm
        JOIN   copy_accounts ca ON ca.id = cm.account_id
        WHERE  cm.is_active = TRUE AND cm.source_type = 'mt5'
      `);
      const providers = rows.rows.map(r => ({
        id:       r.id,
        login:    r.login_id,
        server:   r.broker_server,
        password: safeDecrypt(r.password_enc) ?? '',
      }));
      return res.json(providers);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
