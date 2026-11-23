/**
 * PIX OPTIONS — STORING EACH OPEN'S TABLES (his order, 23 Nov 2026: "you scrape data from both platforms and store in
 * the database"). The scraper container (`server/python/barchart_greeks.py`, which reads Investing.com's overnight
 * table first — the Sentry panel it embeds — then Barchart) sends both here once per open; the signal engine maps them
 * (`signal_platform/strategies/pix_options/job.py`). docs/options-levels.md.
 *
 * STRICT ON PURPOSE: only the three markets, the two sources, finite numbers and bounded sizes are accepted — a
 * malformed body is refused whole, never half-stored.
 */
import type { Pool } from "pg";

export const OPTION_MARKETS = new Set(["XAU/USD", "EUR/USD", "GBP/USD"]);
const SOURCES = new Set(["investing", "barchart"]);
const MAX_ROWS = 200;

export interface OptionSnapshot {
  source: string; market: string; expiry: string | null; spot: number | null; futures: number | null;
  rows: Record<string, number | string | null>[]; picks: unknown[] | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The snapshots in `body`, or the reason it is refused. */
export function parseSnapshots(body: any): { ok: true; runId: string; slot: string; snaps: OptionSnapshot[] } |
                                           { ok: false; error: string } {
  const runId = typeof body?.runId === "string" && body.runId.length <= 64 ? body.runId : null;
  const slot = typeof body?.slot === "string" && ["asia", "ln", "ny"].includes(body.slot) ? body.slot : null;
  if (!runId || !slot) return { ok: false, error: "runId and slot (asia | ln | ny) are required" };
  if (!Array.isArray(body.snapshots) || body.snapshots.length === 0 || body.snapshots.length > 6)
    return { ok: false, error: "snapshots must be 1 to 6 entries" };
  const snaps: OptionSnapshot[] = [];
  for (const s of body.snapshots) {
    if (!SOURCES.has(s?.source) || !OPTION_MARKETS.has(s?.market)) return { ok: false, error: "unknown source or market" };
    if (!Array.isArray(s.rows) || s.rows.length > MAX_ROWS) return { ok: false, error: `rows must be at most ${MAX_ROWS}` };
    for (const r of s.rows) {
      if (typeof r !== "object" || r === null || num(r.strike) === null) return { ok: false, error: "a row without a numeric strike" };
    }
    if (s.picks != null && (!Array.isArray(s.picks) || s.picks.length > MAX_ROWS)) return { ok: false, error: "bad picks" };
    snaps.push({ source: s.source, market: s.market, expiry: typeof s.expiry === "string" ? s.expiry.slice(0, 32) : null,
                 spot: num(s.spot), futures: num(s.futures), rows: s.rows, picks: s.picks ?? null });
  }
  return { ok: true, runId, slot, snaps };
}

/** One row per snapshot, in one transaction (all or nothing). */
export async function storeSnapshots(db: Pool, runId: string, slot: string, snaps: OptionSnapshot[]): Promise<number> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (const s of snaps) {
      await client.query(
        `INSERT INTO options_snapshots (run_id, slot, source, market, expiry, spot, futures, rows, picks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
        [runId, slot, s.source, s.market, s.expiry, s.spot, s.futures, JSON.stringify(s.rows),
         s.picks == null ? null : JSON.stringify(s.picks)]);
    }
    await client.query("COMMIT");
    return snaps.length;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
