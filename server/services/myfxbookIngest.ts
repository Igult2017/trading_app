import { db } from "../db";
import { economicEvents } from "@shared/schema";
import { and, gte, lte } from "drizzle-orm";
import { upsertCalendarEvents, storeReleasedValues, loadCalendarFromDb } from "./calendarDb";
import { lastGoodMyfxbookAt } from "../scrapers/mfbSchedule";
import type { CalendarEvent, ReleasedValue } from "./calendarDb";

/**
 * myfxbookIngest — turn what the MyFXBook scraper posted back into stored rows.
 *
 * ⚠ IT WRITES NOTHING ITSELF. Every row goes through `upsertCalendarEvents` and
 * `storeReleasedValues`, the two functions that already exist. That is deliberate and it is the
 * most important line in this file: `calendarDb.ts:68-90` records a production wipe on 2026-09-07
 * caused by deleting the window before knowing it could be refilled, which left VIX.1's two news
 * protections (vix1.py:285,288) reading an empty calendar — not broken, starved. That guard must
 * exist in ONE place. A second writer here would be a second copy of it.
 *
 * The scraper hands over rows already filtered to his "commodities and forex only" rule and already
 * carrying a UTC timestamp — see server/python/myfxbook_calendar.py and calendar_filter.py.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** One row as the scraper emits it. */
export interface MfbRow {
  currency: string;
  event: string;
  impact: string;
  previous: string;
  consensus: string;
  actual: string;
  eventTime: string;   // ISO, UTC, ends in Z
  category?: string;
}

/** A dash is how the rest of the pipeline spells "no value", not an empty string. */
const dash = (v: string | undefined | null) => {
  const s = (v ?? "").trim();
  return s === "" ? "-" : s;
};

const IMPORTANCE = new Set(["High", "Medium", "Low"]);

function toCalendarEvent(r: MfbRow): CalendarEvent | null {
  const when = new Date(r.eventTime);
  if (Number.isNaN(when.getTime())) return null;
  return {
    date:       `${MONTHS[when.getUTCMonth()]} ${String(when.getUTCDate()).padStart(2, "0")}`,
    time:       `${String(when.getUTCHours()).padStart(2, "0")}:${String(when.getUTCMinutes()).padStart(2, "0")}`,
    currency:   (r.currency || "").toUpperCase(),
    event:      r.event,
    // Anything unexpected becomes Low rather than being dropped: an event missing from the calendar
    // looks to VIX.1's guard exactly like a guard that is passing.
    importance: (IMPORTANCE.has(r.impact) ? r.impact : "Low") as CalendarEvent["importance"],
    actual:     dash(r.actual),
    forecast:   dash(r.consensus),
    previous:   dash(r.previous),
    eventTime:  when.toISOString(),
    category:   r.category || "Currencies",
  };
}

export interface IngestResult {
  events: number;
  released: number;
  skipped: number;
  /** How many arriving events we did NOT already hold.
   *
   *  ⚠ THIS IS THE WHOLE POINT OF THE SWEEP. His instruction, 2026-11-09: *"check at a good
   *  interval for any news that has been posted that we did not persist so that we dont miss
   *  anything."* The sweep interval is currently 4 hours, which is a STARTING POINT. This number
   *  is what turns it into a measured one: if every sweep finds 0 new, 4 hours is too eager; if a
   *  sweep keeps finding events that are due within hours, it is too slow. */
  newEvents: number;
}

/** Counted the way a human would: same currency, same day, same event name. Not by database id —
 *  the rows are replaced wholesale on every write, so ids tell us nothing about what is new. */
const identity = (currency: string, iso: string, title: string) =>
  `${currency}|${iso.slice(0, 10)}|${title.trim().toLowerCase()}`;

/**
 * Store a scraped batch. Returns what actually landed, not what arrived — the difference is the
 * thing worth logging.
 */
export async function ingestMyfxbookEvents(rows: MfbRow[]): Promise<IngestResult> {
  const events: CalendarEvent[] = [];
  let skipped = 0;
  for (const r of rows ?? []) {
    const e = r && typeof r === "object" ? toCalendarEvent(r) : null;
    if (e && e.currency && e.event) events.push(e);
    else skipped++;
  }

  // ⚠ NO ROWS MEANS DO NOTHING, and `upsertCalendarEvents` already refuses an empty batch for the
  // reason above. Returning early just makes that explicit at the point a caller would read it.
  if (events.length === 0) return { events: 0, released: 0, skipped, newEvents: 0 };

  // COUNT WHAT IS NEW **BEFORE** WRITING. After the write everything matches, so asking afterwards
  // would always answer zero — a number that looks like a healthy "nothing missed" while actually
  // measuring nothing at all.
  let newEvents = 0;
  try {
    const times = events.map((e) => new Date(e.eventTime).getTime());
    const held = await db.select({
      currency: economicEvents.currency,
      eventTime: economicEvents.eventTime,
      title: economicEvents.title,
    }).from(economicEvents).where(and(
      gte(economicEvents.eventTime, new Date(Math.min(...times))),
      lte(economicEvents.eventTime, new Date(Math.max(...times))),
    ));
    const seen = new Set(held.map((h) =>
      identity(h.currency, new Date(h.eventTime).toISOString(), h.title)));
    newEvents = events.filter((e) => !seen.has(identity(e.currency, e.eventTime, e.event))).length;
  } catch (e: any) {
    // A failed count must never cost us the data it was only measuring.
    console.warn("[mfb] could not count new events:", e?.message ?? e);
  }

  await upsertCalendarEvents(events);

  // The released numbers ride in on the SAME fetch, which is the real gain over the arrangement
  // this replaces: the events came from one source and the numbers from another, so they had to be
  // matched up afterwards by currency and day. Here they were never apart.
  const released: ReleasedValue[] = events
    .filter((e) => e.actual !== "-")
    .map((e) => ({
      currency: e.currency,
      event:    e.event,
      date:     e.eventTime.slice(0, 10),
      time:     e.time,
      actual:   e.actual,
      forecast: e.forecast,
      previous: e.previous,
    }));

  const filled = released.length ? await storeReleasedValues(released) : 0;
  if (newEvents > 0) {
    console.log(`[mfb] sweep found ${newEvents} event(s) we were not holding — ` +
                `that is what the interval exists to catch`);
  }
  return { events: events.length, released: filled, skipped, newEvents };
}

/** How stale MyFXBook has to get before ForexFactory takes over again. The sweep runs every 4
 *  hours, so 6 allows one missed sweep of slack before the fallback steps in. */
const STALE_AFTER_MS = 6 * 60 * 60_000;

/**
 * The stored calendar IF MyFXBook is still fresh, otherwise null — null means "ForexFactory, your
 * turn". Never throws: not knowing whether MyFXBook is fresh must never stop the fallback running.
 */
export async function myfxbookRowsIfFresh(): Promise<CalendarEvent[] | null> {
  try {
    const at = await lastGoodMyfxbookAt();
    if (!at || Date.now() - at.getTime() >= STALE_AFTER_MS) return null;
    const rows = await loadCalendarFromDb();
    return rows.length ? rows : null;     // fresh but empty is NOT fresh enough to stand down for
  } catch (e: any) {
    console.warn("[mfb] freshness check failed, letting ForexFactory run:", e?.message ?? e);
    return null;
  }
}
