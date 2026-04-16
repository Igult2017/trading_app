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
// ─────────────────────────────────────────────────────────────────────────────

function runPython(mode: "calendar" | "rates"): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(PYTHON_BIN, [SCRIPT, mode], {
      cwd: process.cwd(),
      env: process.env,
    });

    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    child.on("error", reject);
    child.on("close", (code) => {
      if (stderr) console.log(`[homepageCalendar/${mode}]`, stderr.trim());
      if (code !== 0) return reject(new Error(`Python exited ${code}`));
      resolve(stdout);
    });

    setTimeout(() => {
      child.kill();
      reject(new Error("Python timeout (30s)"));
    }, 30_000);
  });
}

export async function getHomepageCalendar(): Promise<CalendarEvent[]> {
  if (_calendarCache && Date.now() - _calendarFetchedAt < CALENDAR_TTL) {
    return _calendarCache;
  }

  try {
    const raw = await runPython("calendar");
    const data = JSON.parse(raw) as CalendarEvent[];
    _calendarCache = data;
    _calendarFetchedAt = Date.now();
    return data;
  } catch (err) {
    console.error("[homepageCalendar] calendar fetch failed:", err);
    return _calendarCache ?? [];
  }
}

export async function getHomepageRates(): Promise<Record<string, RateEntry>> {
  if (_ratesCache && Date.now() - _ratesFetchedAt < RATES_TTL) {
    return _ratesCache;
  }

  try {
    const raw = await runPython("rates");
    const data = JSON.parse(raw) as Record<string, RateEntry>;
    _ratesCache = data;
    _ratesFetchedAt = Date.now();
    return data;
  } catch (err) {
    console.error("[homepageCalendar] rates fetch failed:", err);
    return _ratesCache ?? {};
  }
}

// ── Startup cache warm-up ─────────────────────────────────────────────────────
// Fire both scrapes immediately in the background so the cache is hot before
// any user navigates to the calendar page.
(function warmupOnStartup() {
  console.log("[homepageCalendar] Warming up calendar + rates cache in background…");
  getHomepageCalendar()
    .then(d  => console.log(`[homepageCalendar] Calendar cache ready (${d.length} events)`))
    .catch(() => {});
  getHomepageRates()
    .then(d  => console.log(`[homepageCalendar] Rates cache ready (${Object.keys(d).length} currencies)`))
    .catch(() => {});
})();
