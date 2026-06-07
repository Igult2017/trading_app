import { db } from "../db";
import { economicEvents } from "@shared/schema";
import { and, gte, inArray, lt, lte, or } from "drizzle-orm";

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
    sourceSite:    "myfxbook",
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

/** Replace the ±14-day window in DB with fresh scraped events.
 *  Also purges events older than 30 days so the table never grows unbounded. */
export async function upsertCalendarEvents(events: CalendarEvent[]): Promise<void> {
  if (!events.length) return;
  const { from, to } = dbWindow();

  // Replace the active window
  await db.delete(economicEvents).where(
    and(gte(economicEvents.eventTime, from), lte(economicEvents.eventTime, to))
  );
  const rows = events.filter(e => e.eventTime).map(toRow);
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
export async function loadCalendarFromDb(): Promise<CalendarEvent[]> {
  const { from, to } = dbWindow();
  const rows = await db
    .select()
    .from(economicEvents)
    .where(and(gte(economicEvents.eventTime, from), lte(economicEvents.eventTime, to)))
    .orderBy(economicEvents.eventTime);
  return rows.map(fromRow);
}
