/**
 * PIX OPTIONS — STORING EACH OPEN'S TABLES, on a REAL Postgres (PGlite), the table exactly as docker-migrate.sql makes it.
 * Run: npx tsx server/services/__tests__/optionsSnapshot.check.ts
 *
 * In words: a good body is stored, one row per table; an unknown market, an unknown source, a row without a numeric
 * strike, a missing run id or slot are refused whole; a failure part-way stores NOTHING (all or nothing).
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const port = await new Promise<number>((res) => { const s = net.createServer().listen(0, () => { const p = (s.address() as any).port; s.close(() => res(p)); }); });
const server = spawn(process.execPath, [path.resolve('node_modules/@electric-sql/pglite-socket/dist/scripts/server.js'),
                                        '-p', String(port), '-m', '5'], { stdio: 'ignore' });
for (let i = 0; i < 100; i++) {
  const up = await new Promise<boolean>((r) => { const c = net.connect(port, '127.0.0.1', () => { c.end(); r(true); }); c.on('error', () => r(false)); });
  if (up) break;
  await new Promise((r) => setTimeout(r, 100));
}
process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
process.env.DB_SSL = 'false';
const { pool } = await import('../../db');
const sql = fs.readFileSync(path.resolve('docker-migrate.sql'), 'utf8');
await pool.query(sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS options_snapshots'), sql.indexOf('-- ── copy_engine_heartbeat')));
const { parseSnapshots, storeSnapshots } = await import('../../lib/optionsSnapshot');

const row = { put_delta: -0.66, put_price: 53.34, strike: 3618.6, call_price: 19.45, call_delta: 0.34, iv: 44.75 };
const good = { runId: 'r1', slot: 'ln', snapshots: [
  { source: 'investing', market: 'XAU/USD', expiry: '2026-11-24', spot: 3584.4, rows: [row] },
  { source: 'barchart', market: 'XAU/USD', spot: 3584.4, futures: 3600, rows: [{ strike: 3600, type: 'Call' }],
    picks: [{ side: 'buy', strike: 3566, spot: 3550, fails: [] }] }] };
const g = parseSnapshots(good);
check('a good body is accepted', g.ok, true);
if (g.ok) check('…and stored, one row per table', await storeSnapshots(pool, g.runId, g.slot, g.snaps), 2);
const n = Number((await pool.query('SELECT count(*) FROM options_snapshots')).rows[0].count);
check('two rows in the table', n, 2);
const bad = (b: any) => { const r = parseSnapshots(b); return r.ok ? 'accepted' : 'refused'; };
check('an unknown market is refused', bad({ ...good, snapshots: [{ ...good.snapshots[0], market: 'USD/TRY' }] }), 'refused');
check('an unknown source is refused', bad({ ...good, snapshots: [{ ...good.snapshots[0], source: 'tradingview' }] }), 'refused');
check('a row without a numeric strike is refused', bad({ ...good, snapshots: [{ ...good.snapshots[0], rows: [{ strike: 'x' }] }] }), 'refused');
check('no run id / a bad slot is refused', [bad({ ...good, runId: undefined }), bad({ ...good, slot: 'tokyo' })], ['refused', 'refused']);
const broken = parseSnapshots({ runId: 'r2', slot: 'ny', snapshots: [good.snapshots[0], good.snapshots[0]] });
if (broken.ok) {
  (broken.snaps[1] as any).rows = { not: 'json-able as rows' } as any;           // forces the 2nd insert to fail
  (broken.snaps[1] as any).market = null;                                        // NOT NULL column → the insert fails
  let threw = false;
  try { await storeSnapshots(pool, broken.runId, broken.slot, broken.snaps); } catch { threw = true; }
  const r2 = Number((await pool.query("SELECT count(*) FROM options_snapshots WHERE run_id = 'r2'")).rows[0].count);
  check('a failure part-way stores NOTHING (all or nothing)', [threw, r2], [true, 0]);
}
console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass + fail} checks)`);
await pool.end();
server.kill();
process.exit(fail === 0 ? 0 : 1);
