/**
 * Homepage economic calendar service.
 * Calls the newskeeper-based Python scraper (news_calendar.py) and caches results.
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

// ── In-memory cache ──────────────────────────────────────────────────────────
let _calendarCache: CalendarEvent[] | null = null;
let _calendarFetchedAt = 0;
const CALENDAR_TTL = 15 * 60 * 1000; // 15 minutes

let _ratesCache: Record<string, RateEntry> | null = null;
let _ratesFetchedAt = 0;
const RATES_TTL = 60 * 60 * 1000; // 1 hour

// In-flight promise deduplication — prevents spawning multiple Python processes
// for concurrent requests while one scrape is already running.
let _calendarInFlight: Promise<CalendarEvent[]> | null = null;
let _ratesInFlight: Promise<Record<string, RateEntry>> | null = null;
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
        reject(new Error("Python timeout (30s)"));
      }
    }, 30_000);

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
      resolve(stdout);
    });
  });
}

export async function getHomepageCalendar(): Promise<CalendarEvent[]> {
  if (_calendarCache && _calendarCache.length > 0 && Date.now() - _calendarFetchedAt < CALENDAR_TTL) {
    return _calendarCache;
  }

  // Return existing in-flight promise to avoid duplicate Python processes
  if (_calendarInFlight) return _calendarInFlight;

  _calendarInFlight = runPython("calendar")
    .then((raw) => {
      const data = JSON.parse(raw) as CalendarEvent[];
      // Only cache non-empty results — don't freeze the calendar on a bad scrape
      if (data.length > 0) {
        _calendarCache = data;
        _calendarFetchedAt = Date.now();
      }
      return data.length > 0 ? data : (_calendarCache ?? []);
    })
    .catch((err) => {
      console.error("[homepageCalendar] calendar fetch failed:", err);
      return _calendarCache ?? [];
    })
    .finally(() => { _calendarInFlight = null; });

  return _calendarInFlight;
}

export async function getHomepageRates(): Promise<Record<string, RateEntry>> {
  if (_ratesCache && Object.keys(_ratesCache).length > 0 && Date.now() - _ratesFetchedAt < RATES_TTL) {
    return _ratesCache;
  }

  if (_ratesInFlight) return _ratesInFlight;

  _ratesInFlight = runPython("rates")
    .then((raw) => {
      const data = JSON.parse(raw) as Record<string, RateEntry>;
      if (Object.keys(data).length > 0) {
        _ratesCache = data;
        _ratesFetchedAt = Date.now();
      }
      return Object.keys(data).length > 0 ? data : (_ratesCache ?? {});
    })
    .catch((err) => {
      console.error("[homepageCalendar] rates fetch failed:", err);
      return _ratesCache ?? {};
    })
    .finally(() => { _ratesInFlight = null; });

  return _ratesInFlight;
}

// ── Startup cache warm-up ─────────────────────────────────────────────────────
(function warmupOnStartup() {
  console.log("[homepageCalendar] Warming up calendar + rates cache in background…");
  getHomepageCalendar()
    .then(d  => console.log(`[homepageCalendar] Calendar cache ready (${d.length} events)`))
    .catch(() => {});
  getHomepageRates()
    .then(d  => console.log(`[homepageCalendar] Rates cache ready (${Object.keys(d).length} currencies)`))
    .catch(() => {});
})();
