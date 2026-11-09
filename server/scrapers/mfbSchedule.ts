import { db } from "../db";
import { economicEvents, scrapeRuns } from "@shared/schema";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
// Every RULE lives in mfbLimits, which imports no database so it can be run and tested on its
// own. This file is the plumbing that fetches the rows those rules judge.
import { decide, myfxbookEnabled, no, RELEASE_FIRST_MS, RELEASE_GIVE_UP_MS } from "./mfbLimits";
import type { DueDecision, DueKind } from "./mfbLimits";
export { decide, myfxbookEnabled } from "./mfbLimits";
export type { DueDecision, DueKind, RunRow, PendingRelease } from "./mfbLimits";

/** Is a MyFXBook fetch allowed AND needed right now? The host timer asks this before spending
 *  3-6 minutes of browser; nothing else decides. Plumbing only — every rule is in `decide`. */
export async function decideDue(now: Date = new Date()): Promise<DueDecision> {
  if (!myfxbookEnabled()) return no("switched off (MYFXBOOK_ENABLED=false)");

  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const runs = await db.select().from(scrapeRuns)
    .where(and(eq(scrapeRuns.source, "myfxbook"), gte(scrapeRuns.startedAt, dayAgo)))
    .orderBy(desc(scrapeRuns.startedAt));

  const pending = await db.select({ eventTime: economicEvents.eventTime }).from(economicEvents)
    .where(and(
      gte(economicEvents.eventTime, new Date(now.getTime() - RELEASE_GIVE_UP_MS)),
      lte(economicEvents.eventTime, new Date(now.getTime() - RELEASE_FIRST_MS)),
      isNull(economicEvents.actualValue),
      sql`lower(${economicEvents.impactLevel}) in ('high','medium')`,
    ));

  return decide(
    runs.map((r) => ({
      kind: r.kind, startedAt: new Date(r.startedAt),
      finishedAt: r.finishedAt ? new Date(r.finishedAt) : null,
      ok: r.ok, blocked: r.blocked,
    })),
    pending.map((p) => ({ eventTime: new Date(p.eventTime) })),
    now,
  );
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
  ok: boolean; blocked?: boolean; rowCount?: number;
  /** How many of the arriving events we did NOT already hold. This is the number that says
   *  whether the sweep interval is right, so it is stored rather than only logged. */
  newCount?: number;
  tookMs?: number; error?: string;
}

export async function finishRun(id: string, r: RunResult): Promise<void> {
  await db.update(scrapeRuns).set({
    finishedAt: new Date(),
    ok:         r.ok,
    blocked:    r.blocked ?? false,
    rowCount:   r.rowCount ?? 0,
    newCount:   r.newCount ?? 0,
    tookMs:     r.tookMs ?? null,
    error:      r.error ?? null,
  }).where(eq(scrapeRuns.id, id));
}

/** A refusal looks like one of these in the scraper's error text. Kept in one place so the backoff
 *  and the log agree about what "blocked" means. */
export function looksBlocked(error: string | undefined | null): boolean {
  return /cloudflare|just a moment|challenge|403/i.test(error ?? "");
}

/** When MyFXBook last gave us a good batch, or null. Read by `homepageCalendar` to decide whether
 *  ForexFactory should stand down — see the comment there; two writers would overwrite each other. */
export async function lastGoodMyfxbookAt(): Promise<Date | null> {
  const [row] = await db.select({ at: scrapeRuns.finishedAt }).from(scrapeRuns)
    .where(and(eq(scrapeRuns.source, "myfxbook"), eq(scrapeRuns.ok, true)))
    .orderBy(desc(scrapeRuns.finishedAt)).limit(1);
  return row?.at ? new Date(row.at) : null;
}
