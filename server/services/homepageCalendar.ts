import { spawn } from "child_process";
import * as path from "path";
import { PYTHON_BIN } from "../lib/pythonBin";
import { cacheGet, cacheSet } from "../lib/cache";
import { upsertCalendarEvents, loadCalendarFromDb } from "./calendarDb";
export type { CalendarEvent, RateEntry } from "./calendarDb";
import type { CalendarEvent, RateEntry } from "./calendarDb";

const CAL_KEY   = "homepage:calendar";
const RATES_KEY = "homepage:rates";
const CAL_TTL   = 24 * 60 * 60;       // 24h — scraper keeps it fresh
const RATES_TTL = 60 * 60;            // 1h
const RETRY_MS  = 15 * 60 * 1000;     // minimum interval between scraper runs
const SCRIPT    = path.join(process.cwd(), "server", "python", "news_calendar.py");

let _lastAttemptAt  = 0;
let _calInFlight:   Promise<CalendarEvent[]>           | null = null;
let _ratesInFlight: Promise<Record<string, RateEntry>> | null = null;
let _source = "unknown";
let _count  = 0;
let _calErr: string | null = null;

export function getCalendarServiceStatus() {
  return {
    lastAttemptAt: _lastAttemptAt || null,
    eventCount:    _count,
    source:        _source,
    inFlight:      _calInFlight !== null,
    lastError:     _calErr,
  };
}

function runPython(mode: "calendar" | "rates"): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = "", err = "", done = false;
    const child = spawn(PYTHON_BIN, [SCRIPT, mode], { cwd: process.cwd(), env: process.env });
    const t = setTimeout(() => {
      if (!done) { done = true; child.kill(); reject(new Error("Python timeout (60s)")); }
    }, 60_000);
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { err += d; });
    child.on("error", e => { if (!done) { done = true; clearTimeout(t); reject(e); } });
    child.on("close", code => {
      if (done) return;
      done = true; clearTimeout(t);
      if (err) console.log(`[homepageCalendar/${mode}]`, err.trim());
      if (code !== 0) return reject(new Error(`Python exited ${code}`));
      resolve(JSON.stringify({ stdout: out, stderr: err }));
    });
  });
}

async function _refreshCalendar(): Promise<CalendarEvent[]> {
  _lastAttemptAt = Date.now();
  try {
    const { stdout } = JSON.parse(await runPython("calendar"));
    const data: CalendarEvent[] = JSON.parse(stdout);
    if (data.length > 0) {
      await cacheSet(CAL_KEY, data, CAL_TTL);
      // Persist to DB fire-and-forget — never blocks the cache update
      upsertCalendarEvents(data).catch(e => console.error("[calendarDb] upsert failed:", e.message));
      _count = data.length; _source = "myfxbook"; _calErr = null;
      console.log(`[homepageCalendar] scraped ${data.length} events`);
    } else {
      _calErr = "0 events returned — serving cache";
      console.warn("[homepageCalendar]", _calErr);
    }
  } catch (e: any) {
    _calErr = e.message;
    console.error("[homepageCalendar] scrape failed:", e.message);
  }
  return (await cacheGet<CalendarEvent[]>(CAL_KEY)) ?? [];
}

export async function getHomepageCalendar(): Promise<CalendarEvent[]> {
  const due = Date.now() - _lastAttemptAt >= RETRY_MS;
  if (due && !_calInFlight) {
    _calInFlight = _refreshCalendar().finally(() => { _calInFlight = null; });
  }
  const cached = await cacheGet<CalendarEvent[]>(CAL_KEY);
  if (cached) return cached;
  if (_calInFlight) return _calInFlight;
  return [];
}

export async function getHomepageRates(): Promise<Record<string, RateEntry>> {
  const cached = await cacheGet<Record<string, RateEntry>>(RATES_KEY);
  if (cached && Object.keys(cached).length > 0) return cached;
  if (_ratesInFlight) return _ratesInFlight;
  _ratesInFlight = runPython("rates")
    .then(async env => {
      const data: Record<string, RateEntry> = JSON.parse(JSON.parse(env).stdout);
      if (Object.keys(data).length > 0) await cacheSet(RATES_KEY, data, RATES_TTL);
      return Object.keys(data).length > 0 ? data : (await cacheGet<Record<string, RateEntry>>(RATES_KEY)) ?? {};
    })
    .catch(async e => {
      console.error("[homepageCalendar/rates]", e.message);
      return (await cacheGet<Record<string, RateEntry>>(RATES_KEY)) ?? {};
    })
    .finally(() => { _ratesInFlight = null; });
  return _ratesInFlight;
}

// ── Startup: seed cache from DB first (instant), then refresh in background ──
(async function warmup() {
  try {
    const events = await loadCalendarFromDb();
    if (events.length > 0) {
      await cacheSet(CAL_KEY, events, CAL_TTL);
      _count = events.length; _source = "database";
      console.log(`[homepageCalendar] DB seed: ${events.length} events → cache warm before first request`);
    } else {
      console.log("[homepageCalendar] DB empty — scraper will populate on first request");
    }
  } catch (e: any) {
    console.warn("[homepageCalendar] DB seed failed:", e.message);
  }
  // Fresh scrape runs in background — updates cache + DB when done
  getHomepageCalendar()
    .then(d => console.log(`[homepageCalendar] background scrape: ${d.length} events`))
    .catch(() => {});
  getHomepageRates()
    .then(d => console.log(`[homepageCalendar] rates ready: ${Object.keys(d).length} currencies`))
    .catch(() => {});
})();
