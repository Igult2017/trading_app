/**
 * WHAT THIS PROGRAM HOLDS AT cTRADER, written where the other two programs can see it (22 Nov 2026).
 *
 * The website, the signal engine and the copier all share ONE cTrader app (Spotware refused a second one —
 * docs/ctrader-scaling.md). cTrader counts connections per app, and until now each program capped only itself, so
 * nothing added the three up. Each program now rewrites one row of `ctrader_usage` every 30 s; the admin capacity page
 * (`GET /api/admin/ctrader-capacity`) sums the rows that are still fresh.
 *
 * Limits that add up to 20 (the forum's ~25 per app is unverified, so we stay well under it): website 8
 * (CTRADER_MAX_CONNECTIONS), signal engine 3, copier 9.
 */
import { pool } from '../db';
import { stats as poolStats } from './ctraderConnPool';
import { hubStats } from './ctraderHub';

const EVERY_MS = 30_000;
export const FRESH_MS = 120_000;

export async function writeUsage(): Promise<void> {
  const p = poolStats();
  const h = hubStats();
  await pool.query(
    `INSERT INTO ctrader_usage (process, held, max_held, accounts, detail, updated_at)
     VALUES ('web', $1, $2, $3, $4, NOW())
     ON CONFLICT (process) DO UPDATE SET held = $1, max_held = $2, accounts = $3, detail = $4, updated_at = NOW()`,
    [p.held, p.max, h.accounts, JSON.stringify({ sockets: h.hubs, perSocket: h.perHub, waiting: p.waitingFeeds + p.waitingTasks })],
  );
}

/** Every row still being written, plus the totals against the sum of the limits. */
export async function readUsage(): Promise<{ rows: any[]; held: number; max: number }> {
  const { rows } = await pool.query(
    `SELECT process, held, max_held, accounts, detail, updated_at,
            (updated_at > NOW() - make_interval(secs => $1)) AS fresh
       FROM ctrader_usage ORDER BY process`, [FRESH_MS / 1000]);
  const live = rows.filter((r: any) => r.fresh);
  return { rows, held: live.reduce((a: number, r: any) => a + r.held, 0),
           max: live.reduce((a: number, r: any) => a + r.max_held, 0) };
}

export function startUsageReporter(): NodeJS.Timeout {
  const tick = () => writeUsage().catch((err) => console.warn(`[ctraderUsage] could not record usage: ${err?.message ?? err}`));
  tick();
  return setInterval(tick, EVERY_MS);
}
