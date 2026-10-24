import { db } from "../db";
import { economicEvents } from "@shared/schema";
import { and, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";

export interface CalendarEvent {
  date: string; time: string; currency: string; event: string;
  importance: "High" | "Medium" | "Low";
  actual: string; forecast: string; previous: string;
  eventTime: string; category: string;
}

export interface RateEntry {
  nominal: number; inflation: number; bank: string; live: boolean;
}

const GEO: Record<string, { country: string; region: string }> = {
  USD: { country: "United States",  region: "North America" },
  EUR: { country: "Euro Area",      region: "Europe"        },
  GBP: { country: "United Kingdom", region: "Europe"        },
  JPY: { country: "Japan",          region: "Asia"          },
  CAD: { country: "Canada",         region: "North America" },
  AUD: { country: "Australia",      region: "Oceania"       },
  CHF: { country: "Switzerland",    region: "Europe"        },
  NZD: { country: "New Zealand",    region: "Oceania"       },
  CNY: { country: "China",          region: "Asia"          },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function dbWindow() {
  const now = Date.now();
  return { from: new Date(now - 2 * 86_400_000), to: new Date(now + 14 * 86_400_000) };
}

function toRow(e: CalendarEvent) {
  const geo = GEO[e.currency] ?? { country: e.currency, region: "Global" };
  return {
    title:         e.event,
    eventType:     e.category,
    country:       geo.country,
    region:        geo.region,
    currency:      e.currency,
    impactLevel:   e.importance,
    eventTime:     e.eventTime ? new Date(e.eventTime) : new Date(),
    expectedValue: e.forecast !== "-" ? e.forecast : null,
    previousValue: e.previous !== "-" ? e.previous : null,
    actualValue:   e.actual   !== "-" ? e.actual   : null,
    sourceSite:    "forexfactory",
    lastScraped:   new Date(),
  };
}

function fromRow(row: typeof economicEvents.$inferSelect): CalendarEvent {
  const dt = new Date(row.eventTime);
  return {
    date:       `${MONTHS[dt.getUTCMonth()]} ${String(dt.getUTCDate()).padStart(2, "0")}`,
    time:       `${String(dt.getUTCHours()).padStart(2, "0")}:${String(dt.getUTCMinutes()).padStart(2, "0")}`,
    currency:   row.currency,
    event:      row.title,
    importance: row.impactLevel as "High" | "Medium" | "Low",
    actual:     row.actualValue   ?? "-",
    forecast:   row.expectedValue ?? "-",
    previous:   row.previousValue ?? "-",
    eventTime:  row.eventTime.toISOString(),
    category:   row.eventType,
  };
}

/** Replace the stored events across the span the incoming batch covers, then purge expired ones so
 *  the table never grows unbounded.
 *
 *  NEVER DELETE BEFORE YOU KNOW YOU CAN REFILL. This function used to delete the window FIRST and
 *  only then work out what it had to put back — and on 2026-09-07 that wiped the whole economic
 *  calendar out of production.
 *
 *  How it happened. MyFXBook was blocked, so no economic events were scraped and the only thing
 *  that arrived was ten crypto news headlines from the RSS feeds. Ten is not zero, so the empty
 *  guard below let it through; the window was deleted; and then the filter dropped all ten, because
 *  a crypto headline is a story with no scheduled time, and only events with one can be stored.
 *  The log said `saved 0 events` and the calendar was gone. (That crypto feed has since been
 *  deleted outright, so the exact sequence cannot recur — the lesson below is what generalises.)
 *
 *  The cost was not cosmetic: VIX.1's two news protections (vix1.py:285,288) read that event list,
 *  so with it empty neither could ever fire. They were not broken — they were starved.
 *
 *  The guard is therefore on the ROWS, not on the input. "We received something" is not the
 *  question; "we have something to put back" is. */
export async function upsertCalendarEvents(events: CalendarEvent[]): Promise<void> {
  if (!events.length) return;

  // Work out the replacement BEFORE touching the table. If a scrape brings back only events we
  // cannot store, the right outcome is to keep what is already there and say so.
  const rows = events.filter(e => e.eventTime).map(toRow);
  if (!rows.length) {
    console.warn(
      `[calendarDb] ${events.length} event(s) arrived but none carry a scheduled time — ` +
      `keeping the stored calendar rather than replacing it with nothing`
    );
    return;
  }

  // DELETE ONLY THE SPAN THE NEW ROWS ACTUALLY COVER — not a fixed ±14 days.
  //
  // This used to clear −2 to +14 days and refill. That was safe while the source published a
  // fortnight; the source changed on 2026-09-09 and now publishes ONE WEEK (see
  // news_calendar.scrape_calendar — the next-week feed answers 404). With a fixed window, every
  // refresh late in the week would delete days the incoming batch cannot put back, and the
  // calendar would shrink a little more each time until the feed rolled over.
  //
  // Bounding the delete by the batch's own first and last event keeps the replace-in-place
  // behaviour that stops duplicates, while making it impossible to remove anything this source
  // could not refill. It is the same principle as the guard above, applied to the range instead of
  // the count: never delete before you know you can put it back.
  const times = rows.map(r => r.eventTime.getTime());
  const from = new Date(Math.min(...times));
  const to   = new Date(Math.max(...times));

  await db.delete(economicEvents).where(
    and(gte(economicEvents.eventTime, from), lte(economicEvents.eventTime, to))
  );
  for (let i = 0; i < rows.length; i += 100) {
    await db.insert(economicEvents).values(rows.slice(i, i + 100));
  }
  console.log(`[calendarDb] saved ${rows.length} events`);

  // Purge expired events:
  //   Low / Medium impact → deleted after 24 h (market has priced them in)
  //   High impact         → deleted after 48 h (NFP, FOMC, CPI have multi-day ripple effects)
  const h24 = new Date(Date.now() - 24 * 3_600_000);
  const h48 = new Date(Date.now() - 48 * 3_600_000);
  const { rowCount } = await db.delete(economicEvents).where(
    or(
      and(lt(economicEvents.eventTime, h24), inArray(economicEvents.impactLevel, ["Low", "Medium"])),
      and(lt(economicEvents.eventTime, h48), inArray(economicEvents.impactLevel, ["High"]))
    )
  );
  if (rowCount) console.log(`[calendarDb] purged ${rowCount} expired events`);
}

/** Load the ±14-day window from DB — used to warm the cache on server startup. */
/** One released reading, as Trading Economics publishes it. */
export interface ReleasedValue {
  currency: string;
  event:    string;
  date:     string;      // YYYY-MM-DD, the day TE lists it under
  time:     string;
  actual:   string;
  forecast: string;
  previous: string;
}

/** Strip a title to its comparable core, so the SAME event named slightly differently on two sites
 *  still matches: case, punctuation and the month tag TE appends ("OCT") all go. */
function titleKey(t: string): string {
  return String(t || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Write released numbers onto the calendar rows they belong to.
 *
 * ⚠ MATCHED ON CURRENCY + TITLE + CALENDAR DAY, NOT ON THE CLOCK. The two sources print times in
 * different zones, so matching on the minute would silently attach the wrong number to the wrong
 * event — the one outcome worse than having no outcome at all.
 *
 * ⚠ AND AN AMBIGUOUS MATCH IS SKIPPED. If a currency has two rows with the same title on the same
 * day, nothing is written: a blank is honest, a guess is a false number next to a real event.
 *
 * Returns how many rows were filled, so the caller can log a real figure rather than "ok".
 */
export async function storeReleasedValues(values: ReleasedValue[]): Promise<number> {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const { from, to } = dbWindow();
  const rows = await db.select().from(economicEvents)
    .where(and(gte(economicEvents.eventTime, from), lte(economicEvents.eventTime, to)));

  // Index what is stored by currency + title + day, counting collisions as we go.
  const index = new Map<string, { id: string; hits: number }>();
  for (const r of rows) {
    const day = new Date(r.eventTime).toISOString().slice(0, 10);
    const k = `${r.currency}|${titleKey(r.title)}|${day}`;
    const seen = index.get(k);
    if (seen) seen.hits += 1;
    else index.set(k, { id: r.id, hits: 1 });
  }

  let filled = 0, ambiguous = 0, unmatched = 0;
  for (const v of values) {
    const k = `${v.currency}|${titleKey(v.event)}|${v.date}`;
    const hit = index.get(k);
    if (!hit) { unmatched += 1; continue; }
    if (hit.hits > 1) { ambiguous += 1; continue; }     // never guess between two same-named rows
    await db.update(economicEvents)
      .set({ actualValue: v.actual })
      .where(and(eq(economicEvents.id, hit.id), sql`${economicEvents.actualValue} IS NULL`));
    filled += 1;
  }
  console.log(`[calendarDb] released values: ${filled} filled, ${unmatched} unmatched, ${ambiguous} ambiguous`);
  return filled;
}

export async function loadCalendarFromDb(): Promise<CalendarEvent[]> {
  const { from, to } = dbWindow();
  const rows = await db
    .select()
    .from(economicEvents)
    .where(and(gte(economicEvents.eventTime, from), lte(economicEvents.eventTime, to)))
    .orderBy(economicEvents.eventTime);
  return rows.map(fromRow);
}
