/**
 * ALL THREE PROGRAMS ON THE ONE cTRADER APP, ADDED UP — on a REAL Postgres (PGlite).
 * Run: npx tsx server/services/__tests__/ctraderUsage.check.ts
 *
 * The website, the signal engine and the copier each rewrite one `ctrader_usage` row every 30 s (22 Nov 2026). The
 * admin capacity page sums the rows still being written. This proves the website's own row, the sum, and that a
 * program which stopped writing drops out of the total instead of being counted for ever.
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
const i = sql.indexOf('-- ── ctrader_usage'), j = sql.indexOf('-- ── copy_jobs');
await pool.query(sql.slice(i, j));

const { writeUsage, readUsage } = await import('../ctraderUsage');
console.log('\ncTRADER USAGE — ONE APP, THREE PROGRAMS\n');
await writeUsage();
let u = await readUsage();
check('the website writes its own row (held / limit from its pool)', u.rows.map((r: any) => [r.process, r.max_held]), [['web', 8]]);
await pool.query(`INSERT INTO ctrader_usage (process, held, max_held, accounts) VALUES ('signal', 2, 3, 1), ('copier', 1, 9, 6)`);
u = await readUsage();
check('the three programs add up: limits 8 + 3 + 9 = 20', u.max, 20);
check('...connections held add up too', u.held, 0 + 2 + 1);
await pool.query(`UPDATE ctrader_usage SET updated_at = NOW() - INTERVAL '5 minutes' WHERE process = 'copier'`);
u = await readUsage();
check('a program that stopped writing drops out of the total', [u.max, u.held], [11, 2]);
check('...but its last row is still shown, marked stale', u.rows.find((r: any) => r.process === 'copier')?.fresh, false);

console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass + fail} checks)`);
await pool.end();
server.kill();
process.exit(fail === 0 ? 0 : 1);
