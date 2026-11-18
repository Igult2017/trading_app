import { db } from "../db";
import { barchartSnapshots, scrapeRuns } from "@shared/schema";
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
  return decide(runs.map((r) => ({ kind: r.kind, startedAt: new Date(r.startedAt), blocked: r.blocked })), now);
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

export interface BcRow {
  strike: number; type: "Call" | "Put"; last: number | null; iv: number | null; delta: number | null;
  gamma: number | null; theta: number | null; vega: number | null; ivSkew: number | null; tradeTime: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Keeps only well-formed rows (a strike and a side); everything else is dropped, never guessed. */
export function cleanRows(rows: unknown): BcRow[] {
  if (!Array.isArray(rows)) return [];
  const out: BcRow[] = [];
  for (const r of rows as any[]) {
    const strike = num(r?.strike);
    if (strike === null || (r?.type !== "Call" && r?.type !== "Put")) continue;
    out.push({ strike, type: r.type, last: num(r.last), iv: num(r.iv), delta: num(r.delta), gamma: num(r.gamma),
      theta: num(r.theta), vega: num(r.vega), ivSkew: num(r.ivSkew), tradeTime: num(r.tradeTime) });
  }
  return out;
}

export async function bcStore(symbol: string, slot: string, underlying: number | null, rows: BcRow[]): Promise<number> {
  await db.insert(barchartSnapshots).values({ symbol, slot, underlying, rowCount: rows.length, rows });
  return rows.length;
}
