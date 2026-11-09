import { db } from "../db";
import { economicEvents, scrapeRuns } from "@shared/schema";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";

/**
 * mfbSchedule — WHEN we are allowed to ask MyFXBook, and when we actually need to.
 *
 * His instruction, 2026-11-09: *"remember rate limiting so that myfxbook doesnt block as for ever.
 * Were can scrap available news once and persist then only scrap again when going to get
 * releases."*
 *
 * So there are only two reasons to fetch:
 *   HORIZON — once a day, pick up everything published for the next ~11 days and keep it.
 *   RELEASE — a figure was due a few minutes ago and we do not have the number yet.
 *
 * ⚠ EVERY LIMIT IS READ FROM THE DATABASE, NOT FROM A VARIABLE. The brake's whole job is to hold on
 * a bad day, and the likeliest bad day is the app restarting in a loop — which resets anything held
 * in memory at exactly the moment the brake matters most. `scrape_runs` survives restarts.
 *
 * ⚠ A FETCH COSTS 3.5-6.4 MINUTES. Measured from this server, 2026-11-09: 210s and 381s, because
 * Cloudflare serves a datacentre address two challenges in a row. Every interval below is sized
 * against that, not against a fast request.
 */

/** Minimum gap between ANY two MyFXBook fetches. */
const MIN_GAP_MS = 15 * 60_000;

/** Hard ceiling per rolling 24 hours. Expected real use is 3-6, so this is a backstop that holds
 *  even if the logic above it is wrong — not a target. */
const MAX_PER_DAY = 20;

/** One horizon fetch per day. 20h rather than 24 so it never drifts out of a daily slot. */
const HORIZON_EVERY_MS = 20 * 60 * 60_000;

/** A fetch in flight for longer than this is presumed dead, so a crashed run cannot wedge the lock
 *  shut for ever. Comfortably past the slowest measured run (381s) plus container start. */
const STUCK_AFTER_MS = 12 * 60_000;

/** How long after a release to look for the number, and when to give up.
 *  ⚠ The existing ladder is [2, 5, 10, 15] minutes (scheduler.ts) and CANNOT be used here: a single
 *  fetch takes longer than the first three rungs put together. */
const RELEASE_FIRST_MS = 6 * 60_000;
const RELEASE_GIVE_UP_MS = 45 * 60_000;
const RELEASE_MAX_TRIES = 2;

/** Being refused must make us wait LONGER, never try harder. Capped so it recovers on its own. */
const BACKOFF_MS = [30, 60, 120, 240, 360].map((m) => m * 60_000);

export type DueKind = "horizon" | "release";
export interface DueDecision { due: boolean; kind: DueKind | null; reason: string; }

const no = (reason: string): DueDecision => ({ due: false, kind: null, reason });

/** True unless it has been switched off. Default ON, because an env var nobody set must not
 *  silently disable the source the calendar now depends on. */
export function myfxbookEnabled(): boolean {
  return (process.env.MYFXBOOK_ENABLED ?? "true").toLowerCase() !== "false";
}

/** Is a MyFXBook fetch allowed AND needed right now? The host timer asks this before spending
 *  3-6 minutes of browser; nothing else decides. */
export async function decideDue(now: Date = new Date()): Promise<DueDecision> {
  if (!myfxbookEnabled()) return no("switched off (MYFXBOOK_ENABLED=false)");

  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const recent = await db.select().from(scrapeRuns)
    .where(and(eq(scrapeRuns.source, "myfxbook"), gte(scrapeRuns.startedAt, dayAgo)))
    .orderBy(desc(scrapeRuns.startedAt));

  // 1. ONE AT A TIME. Two browsers on a 2-CPU box is how this machine fell over on 2026-09-07.
  const inFlight = recent.find((r) => !r.finishedAt &&
    now.getTime() - new Date(r.startedAt).getTime() < STUCK_AFTER_MS);
  if (inFlight) return no("a fetch is already running");

  // 2. The ceiling, counted over attempts — failures included, or being blocked would cost nothing.
  if (recent.length >= MAX_PER_DAY) return no(`daily ceiling reached (${recent.length}/${MAX_PER_DAY})`);

  // 3. The minimum gap, measured from the last ATTEMPT.
  const last = recent[0];
  if (last) {
    const since = now.getTime() - new Date(last.startedAt).getTime();
    if (since < MIN_GAP_MS) return no(`only ${Math.round(since / 60_000)} min since the last fetch`);

    // 4. BACKOFF. Count how many times in a row we were refused and wait the matching interval.
    //    Being refused must slow us down; it must never turn into retrying harder.
    if (last.blocked) {
      let streak = 0;
      for (const r of recent) { if (r.blocked) streak++; else break; }
      const wait = BACKOFF_MS[Math.min(streak - 1, BACKOFF_MS.length - 1)];
      if (since < wait) {
        return no(`backing off after ${streak} refusal(s): ${Math.round((wait - since) / 60_000)} min left`);
      }
    }
  }

  // 5. THE DAILY "SCRAPE IT ONCE AND KEEP IT" FETCH.
  const lastGoodHorizon = recent.find((r) => r.kind === "horizon" && r.ok);
  if (!lastGoodHorizon ||
      now.getTime() - new Date(lastGoodHorizon.startedAt).getTime() > HORIZON_EVERY_MS) {
    return { due: true, kind: "horizon", reason: "no successful horizon fetch in the last 20h" };
  }

  // 6. A NUMBER WE ARE STILL MISSING. Only Medium and High are worth a 6-minute browser.
  const from = new Date(now.getTime() - RELEASE_GIVE_UP_MS);
  const to   = new Date(now.getTime() - RELEASE_FIRST_MS);
  const pending = await db.select().from(economicEvents)
    .where(and(
      gte(economicEvents.eventTime, from),
      lte(economicEvents.eventTime, to),
      isNull(economicEvents.actualValue),
      sql`lower(${economicEvents.impactLevel}) in ('high','medium')`,
    ));
  if (pending.length === 0) return no("nothing published recently that we are missing");

  // Stop after RELEASE_MAX_TRIES attempts since the OLDEST thing we are waiting on, so a figure
  // that is simply never published cannot keep a browser running all afternoon.
  const oldest = pending.reduce((a, b) => (a.eventTime < b.eventTime ? a : b)).eventTime;
  const triesSince = recent.filter((r) => r.kind === "release" &&
    new Date(r.startedAt) >= new Date(oldest)).length;
  if (triesSince >= RELEASE_MAX_TRIES) {
    return no(`already tried ${triesSince}x for this release; not asking again`);
  }

  return {
    due: true,
    kind: "release",
    reason: `${pending.length} release(s) still missing a number (try ${triesSince + 1}/${RELEASE_MAX_TRIES})`,
  };
}

/** Record that a fetch is starting. Written BEFORE the browser opens, so a crash still leaves a
 *  trace and still counts against the ceiling. */
export async function startRun(kind: DueKind): Promise<string> {
  const [row] = await db.insert(scrapeRuns)
    .values({ source: "myfxbook", kind, startedAt: new Date() })
    .returning({ id: scrapeRuns.id });
  return row.id;
}

export interface RunResult {
  ok: boolean; blocked?: boolean; rowCount?: number; tookMs?: number; error?: string;
}

export async function finishRun(id: string, r: RunResult): Promise<void> {
  await db.update(scrapeRuns).set({
    finishedAt: new Date(),
    ok:         r.ok,
    blocked:    r.blocked ?? false,
    rowCount:   r.rowCount ?? 0,
    tookMs:     r.tookMs ?? null,
    error:      r.error ?? null,
  }).where(eq(scrapeRuns.id, id));
}

/** A refusal looks like one of these in the scraper's error text. Kept in one place so the backoff
 *  and the log agree about what "blocked" means. */
export function looksBlocked(error: string | undefined | null): boolean {
  return /cloudflare|just a moment|challenge|403/i.test(error ?? "");
}
