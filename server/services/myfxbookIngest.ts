import { upsertCalendarEvents, storeReleasedValues } from "./calendarDb";
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

export interface IngestResult { events: number; released: number; skipped: number; }

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
  if (events.length === 0) return { events: 0, released: 0, skipped };

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
  return { events: events.length, released: filled, skipped };
}
