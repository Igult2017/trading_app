/**
 * Homepage economic calendar service — MyFXBook only.
 *
 * Strategy:
 *  - The Python scraper targets MyFXBook exclusively (no TradingView fallback).
 *  - We keep a "last good" in-memory cache that is NEVER expired on its own.
 *    If MyFXBook is blocked or unreachable, every API request gets the stale
 *    cache until a successful scrape comes in.
 *  - A background refresh runs every CALENDAR_RETRY_INTERVAL ms.  It only
 *    updates the cache when MyFXBook actually returns data.
 *  - In-flight deduplication prevents multiple Python processes running at once.
 */

import { spawn } from "child_process";
import * as path from "path";
import { PYTHON_BIN } from "../lib/pythonBin";
import { cacheGet, cacheSet } from "../lib/cache";

const SCRIPT = path.join(process.cwd(), "server", "python", "news_calendar.py");

export interface CalendarEvent {
  date: string;
  time: string;
  currency: string;
  event: string;
  importance: "High" | "Medium" | "Low";
  actual: string;
  forecast: string;
  previous: string;
  eventTime: string;
  category: string;
}

export interface RateEntry {
  nominal: number;
  inflation: number;
  bank: string;
  live: boolean;
}

// ── Cache keys & TTLs ────────────────────────────────────────────────────────
const CAL_KEY   = "homepage:calendar";
const RATES_KEY = "homepage:rates";
const CAL_TTL_SECS   = 24 * 60 * 60; // 24h — updated on successful fetch; stale is fine
const RATES_TTL_SECS = 60 * 60;       // 1h

let _calendarLastAttemptAt = 0;
const CALENDAR_RETRY_INTERVAL = 15 * 60 * 1000;

// In-flight deduplication (process-local).
let _calendarInFlight: Promise<CalendarEvent[]> | null = null;
let _ratesInFlight: Promise<Record<string, RateEntry>> | null = null;
// ─────────────────────────────────────────────────────────────────────────────

// ── In-process status (not shared across workers — informational only) ────────
let _calendarSource: 'myfxbook' | 'unknown' = 'unknown';
let _calendarEventCount = 0;
let _calendarLastError: string | null = null;
let _ratesLiveCount     = 0;
let _ratesFallbackCount = 0;
let _ratesLastError: string | null = null;

export function getCalendarServiceStatus() {
  return {
    calendar: {
      lastAttemptAt: _calendarLastAttemptAt || null,
      eventCount:    _calendarEventCount,
      source:        _calendarSource,
      inFlight:      _calendarInFlight !== null,
      lastError:     _calendarLastError,
    },
    rates: {
      liveCount:     _ratesLiveCount,
      fallbackCount: _ratesFallbackCount,
      inFlight:      _ratesInFlight !== null,
      lastError:     _ratesLastError,
    },
  };
}
// ─────────────────────────────────────────────────────────────────────────────

function runPython(mode: "calendar" | "rates"): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(PYTHON_BIN, [SCRIPT, mode], {
      cwd: process.cwd(),
      env: process.env,
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error("Python timeout (60s)"));
      }
    }, 60_000);

    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    child.on("error", (err) => {
      if (!settled) { settled = true; clearTimeout(timer); reject(err); }
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stderr) console.log(`[homepageCalendar/${mode}]`, stderr.trim());
      if (code !== 0) return reject(new Error(`Python exited ${code}`));
      resolve(JSON.stringify({ stdout, stderr }));
    });
  });
}

async function _attemptCalendarRefresh(): Promise<CalendarEvent[]> {
  _calendarLastAttemptAt = Date.now();
  try {
    const envelope = await runPython("calendar");
    const { stdout, stderr } = JSON.parse(envelope);
    const data = JSON.parse(stdout) as CalendarEvent[];

    if (data.length > 0) {
      await cacheSet(CAL_KEY, data, CAL_TTL_SECS);
      _calendarEventCount = data.length;
      _calendarSource     = 'myfxbook';
      _calendarLastError  = null;
      console.log(`[homepageCalendar] MyFXBook: ${data.length} events cached`);
    } else {
      const reason = stderr.includes('Cloudflare') ? 'Cloudflare challenge'
                   : stderr.includes('0 rows')     ? '0 rows scraped'
                   : 'no data';
      _calendarLastError = `MyFXBook unavailable (${reason}) — serving stale cache`;
      console.warn(`[homepageCalendar] ${_calendarLastError}`);
    }
  } catch (err: any) {
    _calendarLastError = err.message;
    console.error("[homepageCalendar] calendar fetch failed:", err.message);
  }

  return (await cacheGet<CalendarEvent[]>(CAL_KEY)) ?? [];
}

export async function getHomepageCalendar(): Promise<CalendarEvent[]> {
  const now = Date.now();
  const due = now - _calendarLastAttemptAt >= CALENDAR_RETRY_INTERVAL;

  if (due && !_calendarInFlight) {
    _calendarInFlight = _attemptCalendarRefresh()
      .finally(() => { _calendarInFlight = null; });
  }

  const cached = await cacheGet<CalendarEvent[]>(CAL_KEY);
  if (cached) return cached;
  if (_calendarInFlight) return _calendarInFlight;
  return [];
}

export async function getHomepageRates(): Promise<Record<string, RateEntry>> {
  const cached = await cacheGet<Record<string, RateEntry>>(RATES_KEY);
  if (cached && Object.keys(cached).length > 0) return cached;

  if (_ratesInFlight) return _ratesInFlight;

  _ratesInFlight = runPython("rates")
    .then(async (envelope) => {
      const { stdout } = JSON.parse(envelope);
      const data = JSON.parse(stdout) as Record<string, RateEntry>;
      if (Object.keys(data).length > 0) {
        await cacheSet(RATES_KEY, data, RATES_TTL_SECS);
        _ratesLiveCount     = Object.values(data).filter(r => r.live).length;
        _ratesFallbackCount = Object.values(data).filter(r => !r.live).length;
        _ratesLastError     = null;
      }
      return Object.keys(data).length > 0 ? data : ((await cacheGet<Record<string, RateEntry>>(RATES_KEY)) ?? {});
    })
    .catch(async (err) => {
      _ratesLastError = err.message;
      console.error("[homepageCalendar] rates fetch failed:", err);
      return (await cacheGet<Record<string, RateEntry>>(RATES_KEY)) ?? {};
    })
    .finally(() => { _ratesInFlight = null; });

  return _ratesInFlight;
}

// ── Startup warm-up ───────────────────────────────────────────────────────────
(function warmupOnStartup() {
  console.log("[homepageCalendar] Warming up calendar + rates cache in background…");
  getHomepageCalendar()
    .then(d  => console.log(`[homepageCalendar] Calendar cache ready (${d.length} events)`))
    .catch(() => {});
  getHomepageRates()
    .then(d  => console.log(`[homepageCalendar] Rates cache ready (${Object.keys(d).length} currencies)`))
    .catch(() => {});
})();
