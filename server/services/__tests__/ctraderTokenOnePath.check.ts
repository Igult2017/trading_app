/**
 * THE ONE WAY A cTRADER TOKEN IS RENEWED — run against a REAL Postgres (PGlite), only cTrader's token address faked.
 * Run: npx tsx server/services/__tests__/ctraderTokenOnePath.check.ts
 *
 * WHY (22 Nov 2026, docs/ctrader-scaling.md). Three callers handed `refreshCTraderToken` a half-built account (id and
 * credentials only), so the shared sign-in record was skipped and the ticket was renewed on the account's OWN copy —
 * rotated for every sibling account and every process without the record knowing. And a refusal never renewed through
 * the record unless the token was within a day of expiry. Each case below fails on the code before this change.
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

async function freePort(): Promise<number> {
  return new Promise((res) => { const s = net.createServer().listen(0, () => { const p = (s.address() as any).port; s.close(() => res(p)); }); });
}

const port = await freePort();
const server = spawn(process.execPath, [path.resolve('node_modules/@electric-sql/pglite-socket/dist/scripts/server.js'),
                                        '-p', String(port), '-m', '10'], { stdio: 'ignore' });
for (let i = 0; i < 100; i++) {
  const up = await new Promise<boolean>((r) => { const c = net.connect(port, '127.0.0.1', () => { c.end(); r(true); }); c.on('error', () => r(false)); });
  if (up) break;
  await new Promise((r) => setTimeout(r, 100));
}
process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
process.env.COPY_ENCRYPTION_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
process.env.DB_SSL = 'false';

// THE REAL SCHEMA, statement by statement as psql would run it (a statement that needs something absent just fails).
const { pool, db } = await import('../../db');
const sql = fs.readFileSync(path.resolve('docker-migrate.sql'), 'utf8');
for (const stmt of sql.split(/;\s*\n/)) {
  if (stmt.trim()) await pool.query(stmt).catch(() => {});
}

// cTRADER'S TOKEN ADDRESS, FAKED: counts renewals and hands out a new pair each time (or refuses, when told to).
let renewals = 0, refuse = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  if (String(url).includes('/apps/token')) {
    renewals++;
    if (refuse) return new Response(JSON.stringify({ errorCode: 'ACCESS_DENIED', description: 'spent ticket' }), { status: 200 });
    return new Response(JSON.stringify({ access_token: `ACCESS-${renewals}`, refresh_token: `REFRESH-${renewals}`,
                                         expires_in: 2_592_000, token_type: 'bearer' }), { status: 200 });
  }
  return realFetch(url, init);
}) as any;

const { safeEncrypt, safeDecrypt } = await import('../../lib/crypto');
const { createTokenRecord, readToken } = await import('../ctraderTokenStore');
const { refreshCTraderToken } = await import('../autoSyncService');
const { brokerAccounts } = await import('../../../shared/schema');
const { eq } = await import('drizzle-orm');

const soon = Date.now() + 60_000;                          // expiring in a minute: a refresh is due
async function family(tag: string, accessToken = 'ACCESS-0') {
  const ids = [`${tag}-a`, `${tag}-b`];
  for (const [i, id] of ids.entries()) {
    await pool.query(`INSERT INTO broker_accounts (id, user_id, name, login_id, platform, connection_type, account_type, password_enc)
                      VALUES ($1, 'u1', $2, $2, 'ctrader', 'api', 'demo', $3)`,
                     [id, id, safeEncrypt(JSON.stringify({ accessToken, refreshToken: 'REFRESH-0', tokenExpiresAt: soon,
                                                           ctraderId: String(100 + i), app: 'legacy' }))]);
  }
  const rec = await createTokenRecord('u1', 'legacy', { accessToken, refreshToken: 'REFRESH-0', tokenExpiresAt: soon }, ids);
  return { ids, rec: rec! };
}
const tokenOf = async (id: string) => {
  const [r] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, id));
  return JSON.parse(safeDecrypt(r.passwordEnc) ?? '{}').accessToken;
};

console.log('\ncTRADER TOKEN — ONE RENEWAL PATH, ON A REAL DATABASE\n');

// 1. A HALF-BUILT ACCOUNT (the admin button, the credentials endpoint and the watchdog all passed one)
let f = await family('half');
renewals = 0;
const row = (await pool.query(`SELECT id, platform, password_enc FROM broker_accounts WHERE id = $1`, [f.ids[0]])).rows[0];
await refreshCTraderToken({ id: row.id, platform: row.platform, passwordEnc: row.password_enc } as any);
check('a half-built account still renews THROUGH the shared record (record moved on)',
      (await readToken(f.rec))?.accessToken, 'ACCESS-1');
check('...and the SIBLING account got the new token too', await tokenOf(f.ids[1]), 'ACCESS-1');
check('...one renewal, not one per account', renewals, 1);

// 2. A REFUSAL WHEN ANOTHER PROCESS ALREADY RENEWED
f = await family('done');
renewals = 0;
await pool.query(`UPDATE ctrader_tokens SET tokens_enc = $1, version = version + 1 WHERE id = $2`,
                 [safeEncrypt(JSON.stringify({ accessToken: 'ACCESS-NEWER', refreshToken: 'REFRESH-NEWER',
                                               tokenExpiresAt: Date.now() + 86_400_000 * 20 })), f.rec]);
const [accDone] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, f.ids[0]));
await refreshCTraderToken(accDone, { refusedToken: 'ACCESS-0' });
check('refused, but the record already holds a newer token: NOTHING is renewed', renewals, 0);
check('...the account is given the newer token', await tokenOf(f.ids[0]), 'ACCESS-NEWER');

// 3. A REFUSAL OF THE TOKEN THE RECORD STILL HOLDS (with weeks left — the old code never renewed here)
f = await family('stale');
await pool.query(`UPDATE ctrader_tokens SET tokens_enc = $1 WHERE id = $2`,
                 [safeEncrypt(JSON.stringify({ accessToken: 'ACCESS-0', refreshToken: 'REFRESH-0',
                                               tokenExpiresAt: Date.now() + 86_400_000 * 20 })), f.rec]);
renewals = 0;
const [accStale] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, f.ids[0]));
await refreshCTraderToken(accStale, { refusedToken: 'ACCESS-0' });
check('refused, and the record holds that same token: renewed once', renewals, 1);
check('...both accounts on the new token', [await tokenOf(f.ids[0]), await tokenOf(f.ids[1])], ['ACCESS-1', 'ACCESS-1']);

// 4. TWO SIBLINGS REFUSED AT THE SAME MOMENT
f = await family('pair');
await pool.query(`UPDATE ctrader_tokens SET tokens_enc = $1 WHERE id = $2`,
                 [safeEncrypt(JSON.stringify({ accessToken: 'ACCESS-0', refreshToken: 'REFRESH-0',
                                               tokenExpiresAt: Date.now() + 86_400_000 * 20 })), f.rec]);
renewals = 0;
const [pa] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, f.ids[0]));
const [pb] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, f.ids[1]));
await Promise.all([refreshCTraderToken(pa, { refusedToken: 'ACCESS-0' }), refreshCTraderToken(pb, { refusedToken: 'ACCESS-0' })]);
check('two siblings refused together: ONE renewal of the shared ticket', renewals, 1);

// 5. THE RECORD CANNOT RENEW: the account's own copy is NOT spent behind its back
f = await family('dead');
refuse = true; renewals = 0;
const [accDead] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, f.ids[0]));
const out = await refreshCTraderToken(accDead);
refuse = false;
check('the record fails: no second renewal with the account\'s own copy', renewals, 1);
check('...the account says it needs reconnecting', [out, (await pool.query(`SELECT sync_status FROM broker_accounts WHERE id=$1`,
      [f.ids[0]])).rows[0].sync_status], [null, 'error']);

console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass + fail} checks)`);
await pool.end();
server.kill();
process.exit(fail === 0 ? 0 : 1);
