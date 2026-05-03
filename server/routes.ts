import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { supabaseAdmin, verifyToken } from "./lib/supabaseAdmin";
import { db, pool } from "./db";
import { userProfiles, adminAccessLogs } from "@shared/schema";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { encrypt, safeDecrypt, safeEncrypt } from "./lib/crypto";
import { processIncomingTrades } from "./services/brokerSyncService";
import { fetchTradesForAccount, API_PLATFORMS } from "./services/brokerAdapters/index";
import { getCTraderAuthUrl, exchangeCodeForTokens, getCTraderAccounts } from "./services/brokerAdapters/ctrader";
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
// ─────────────────────────────────────────────────────────────────────────────

// ── Auth helper for user-data routes ─────────────────────────────────────────
// Verifies a Supabase JWT and returns the authenticated user id.
// Sends a 401 response and returns null when authentication fails so that
// callers can simply `if (!auth) return;`.
async function requireAuth(
  req: Request,
  res: Response,
): Promise<{ id: string } | null> {
  const user = await verifyToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  // Make sure this user has a profile row so the leaderboard, admin panel
  // and other consumers can show their real name/email.
  ensureUserProfile(user).catch((err) =>
    console.warn('[ensureUserProfile] failed:', err?.message),
  );
  return { id: user.id };
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

  // ── Admin: campaign statistics (real DB data) ─────────────────────────────────
  app.get("/api/admin/campaign-stats", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const campaignCount = Number(((await db.execute(drizzleSql`
        SELECT COUNT(*)::int AS total
        FROM support_tickets
        WHERE subject LIKE 'Campaign:%' AND created_at >= ${since30}
      `)).rows ?? [])[0]?.total ?? 0);
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
      return res.status(500).json({ error: err.message });
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
      return res.status(201).json((r.rows ?? [])[0] ?? r);
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  });

  // ... remaining file unchanged ...
}