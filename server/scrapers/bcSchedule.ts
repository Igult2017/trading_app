import { db } from "../db";
import { scrapeRuns } from "@shared/schema";
import { and, eq, gte } from "drizzle-orm";
// Every RULE lives in bcLimits (no database, tested on its own). This file is the plumbing — the same split as
// mfbSchedule / mfbLimits, which this copies.
import { decide, type BcDecision, type BcSlot } from "./bcLimits";
export { barchartEnabled } from "./bcLimits";

const SOURCE = "barchart";

export async function bcDecideDue(now: Date = new Date()): Promise<BcDecision> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const runs = await db.select().from(scrapeRuns)
    .where(and(eq(scrapeRuns.source, SOURCE), gte(scrapeRuns.startedAt, dayAgo)));
  // THE SWITCH IS ON THE ADMIN PAGE (21 Nov 2026) — `serverSwitch` falls back to BARCHART_ENABLED, then OFF.
  const { serverSwitch } = await import("../lib/engineSettings");
  const enabled = await serverSwitch("barchart_enabled");
  return decide(runs.map((r) => ({ kind: r.kind, startedAt: new Date(r.startedAt), blocked: r.blocked })), now, enabled);
}

/** Written BEFORE the browser opens, so a crash still leaves a trace and still uses up the slot. */
export async function bcStartRun(slot: BcSlot): Promise<string> {
  const [row] = await db.insert(scrapeRuns).values({ source: SOURCE, kind: slot, startedAt: new Date() })
    .returning({ id: scrapeRuns.id });
  return row.id;
}

export async function bcFinishRun(id: string, r: { ok: boolean; blocked?: boolean; rowCount?: number;
  tookMs?: number; error?: string }): Promise<void> {
  await db.update(scrapeRuns).set({
    finishedAt: new Date(), ok: r.ok, blocked: r.blocked ?? false, rowCount: r.rowCount ?? 0,
    tookMs: r.tookMs ?? null, error: r.error ?? null,
  }).where(eq(scrapeRuns.id, id));
}
