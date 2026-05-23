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

// ── Cache ─────────────────────────────────────────────────────────────────────
// Calendar: never expires for serving — only replaced on successful MyFXBook fetch.
let _calendarCache: CalendarEvent[] | null = null;
let _calendarFetchedAt = 0;           // timestamp of last SUCCESSFUL fetch
let _calendarLastAttemptAt = 0;       // timestamp of last fetch ATTEMPT
const CALENDAR_RETRY_INTERVAL = 15 * 60 * 1000; // retry every 15 min

// Rates: refreshed hourly.
let _ratesCache: Record<string, RateEntry> | null = null;
let _ratesFetchedAt = 0;
const RATES_TTL = 60 * 60 * 1000;

// In-flight deduplication.
let _calendarInFlight: Promise<CalendarEvent[]> | null = null;
let _ratesInFlight: Promise<Record<string, RateEntry>> | null = null;
// ─────────────────────────────────────────────────────────────────────────────

// ── Status ────────────────────────────────────────────────────────────────────
let _calendarSource: 'myfxbook' | 'unknown' = 'unknown';
let _calendarEventCount = 0;
let _calendarLastError: string | null = null;
let _ratesLiveCount     = 0;
let _ratesFallbackCount = 0;
let _ratesLastError: string | null = null;

export function getCalendarServiceStatus() {
  return {
    calendar: {
      fetchedAt:     _calendarFetchedAt || null,
      lastAttemptAt: _calendarLastAttemptAt || null,
      eventCount:    _calendarEventCount,
      source:        _calendarSource,
      inFlight:      _calendarInFlight !== null,
      lastError:     _calendarLastError,
    },
    rates: {
      fetchedAt:     _ratesFetchedAt || null,
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

/**
 * Attempt one MyFXBook scrape.
 * - Updates _calendarCache only if MyFXBook returned actual events.
 * - Always returns whatever is in _calendarCache (stale or fresh).
 */
async function _attemptCalendarRefresh(): Promise<CalendarEvent[]> {
  _calendarLastAttemptAt = Date.now();
  try {
    const envelope = await runPython("calendar");
    const { stdout, stderr } = JSON.parse(envelope);
    const data = JSON.parse(stdout) as CalendarEvent[];

    if (data.length > 0) {
      // MyFXBook succeeded — update the cache.
      _calendarCache    = data;
      _calendarFetchedAt = Date.now();
      _calendarEventCount = data.length;
      _calendarSource   = 'myfxbook';
      _calendarLastError = null;
      console.log(`[homepageCalendar] MyFXBook: ${data.length} events cached`);
    } else {
      // MyFXBook returned 0 events (blocked / challenge page).
      // Log the reason but DO NOT touch the cache — stale data keeps serving.
      const reason = stderr.includes('Cloudflare') ? 'Cloudflare challenge'
                   : stderr.includes('0 rows')     ? '0 rows scraped'
                   : 'no data';
      _calendarLastError = `MyFXBook unavailable (${reason}) — serving stale cache`;
      console.warn(`[homepageCalendar] ${_calendarLastError}`);
    }
  } catch (err: any) {
    _calendarLastError = err.message;
    console.error("[homepageCalendar] calendar fetch failed:", err.message);
    // Cache remains untouched — stale data keeps serving.
  }

  return _calendarCache ?? [];
}

export function getHomepageCalendar(): Promise<CalendarEvent[]> {
  const now = Date.now();
  const due = now - _calendarLastAttemptAt >= CALENDAR_RETRY_INTERVAL;

  // Always fire a background refresh when due — never block the caller.
  if (due && !_calendarInFlight) {
    _calendarInFlight = _attemptCalendarRefresh()
      .finally(() => { _calendarInFlight = null; });
  }

  // Return whatever is in cache right now (may be empty on very first startup).
  return Promise.resolve(_calendarCache ?? []);
}

export async function getHomepageRates(): Promise<Record<string, RateEntry>> {
  if (_ratesCache && Object.keys(_ratesCache).length > 0 && Date.now() - _ratesFetchedAt < RATES_TTL) {
    return _ratesCache;
  }

  if (_ratesInFlight) return _ratesInFlight;

  _ratesInFlight = runPython("rates")
    .then((envelope) => {
      const { stdout } = JSON.parse(envelope);
      const data = JSON.parse(stdout) as Record<string, RateEntry>;
      if (Object.keys(data).length > 0) {
        _ratesCache         = data;
        _ratesFetchedAt     = Date.now();
        _ratesLiveCount     = Object.values(data).filter(r => r.live).length;
        _ratesFallbackCount = Object.values(data).filter(r => !r.live).length;
        _ratesLastError     = null;
      }
      return Object.keys(data).length > 0 ? data : (_ratesCache ?? {});
    })
    .catch((err) => {
      _ratesLastError = err.message;
      console.error("[homepageCalendar] rates fetch failed:", err);
      return _ratesCache ?? {};
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
