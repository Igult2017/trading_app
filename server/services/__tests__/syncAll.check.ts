/**
 * SYNC ALL ON THE SERVER — one run per user, one account at a time, every step pushed (22 Nov 2026, step 7).
 * Run: DATABASE_URL=postgresql://x.invalid/x npx tsx server/services/__tests__/syncAll.check.ts
 *
 * In words, what must hold:
 *  * the accounts are synced ONE AT A TIME, in order — never two of his at once;
 *  * a second click while a run is going gets THAT run back, and no account is synced twice;
 *  * EA, logged-out and no-API accounts are skipped with a reason, never attempted;
 *  * one account failing is recorded on its line and the NEXT account still runs;
 *  * a step that hangs is capped, marked "still running", and the run moves on;
 *  * his open tab is told every step, and the finished run can still be read afterwards;
 *  * each account is synced exactly as his own Sync button does it (deep, manual).
 * The REAL queue runs; the broker sync, the account list and the browser tab are stand-ins.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { storage } from '../../storage';
import { subscribe } from '../journalPush';
import { startSyncAll, syncAllStatus, _setRunnerForTests, _setStepCapForTests } from '../syncAllQueue';

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const acct = (id: string, extra: object = {}) => ({ id, name: `my ${id}`, brokerName: null, platform: 'ctrader',
  connectionType: 'api', isActive: true, syncStatus: 'ok', ...extra }) as any;
const ACCOUNTS = [
  acct('a', { brokerName: 'Pepperstone' }), acct('ea', { connectionType: 'webhook' }), acct('b'),
  acct('out', { syncStatus: 'disconnected' }), acct('boom'), acct('slow'), acct('c'),
];
(storage as any).getBrokerAccounts = async (uid: string) => (uid === 'u1' ? ACCOUNTS : []);

// The broker sync, stand-in: records order and overlap; 'boom' throws, 'slow' never finishes.
const order: string[] = [];
let running = 0, maxRunning = 0;
// Overlap is counted WITHOUT the deliberately hung 'slow': after its cap the run moves on while it is still
// going in the background — the one overlap that is allowed, so one stuck broker cannot freeze the rest.
_setRunnerForTests(async (a) => {
  order.push(a.id);
  if (a.id !== 'slow') { running++; maxRunning = Math.max(maxRunning, running); }
  try {
    if (a.id === 'boom') throw new Error('broker said no');
    if (a.id === 'slow') await new Promise(() => {});
    await sleep(40);
    return { ok: true, fetched: 2, created: 1 };
  } finally { if (a.id !== 'slow') running--; }
});
_setStepCapForTests(150);

// His open tab, stand-in: collects every Sync All event pushed to it.
const frames: any[] = [];
subscribe('u1', { status() { return this; }, set() { return this; }, flushHeaders() {}, on() {}, end() {},
  write(line: string) { const m = /^event: journal\ndata: (.*)\n\n$/s.exec(line);
    if (m) { const e = JSON.parse(m[1]); if (e.type === 'sync-all') frames.push(JSON.parse(JSON.stringify(e.run))); }
    return true; } } as any);

console.log('\nSYNC ALL ON THE SERVER\n');
const first = await startSyncAll('u1');
const second = await startSyncAll('u1');
check('a second click while it runs gets the SAME run back', [first.alreadyRunning, second.alreadyRunning,
      second.run === first.run], [false, true, true]);
for (let i = 0; i < 100 && !syncAllStatus('u1')?.finishedAt; i++) await sleep(20);
const run = syncAllStatus('u1')!;

check('the run finished', !!run.finishedAt, true);
check('accounts synced ONE AT A TIME (apart from one past its cap)', maxRunning, 1);
check('...in order, each once (no account synced twice)', order, ['a', 'b', 'boom', 'slow', 'c']);
check('EA, logged-out accounts skipped with a reason, never attempted',
      run.items.filter((i) => i.status === 'skipped').map((i) => [i.accountId, i.message]),
      [['ea', 'sends its trades through the EA on its own'], ['out', 'logged out — reconnect it first']]);
check('a failing account is recorded on its own line...', run.items.find((i) => i.accountId === 'boom')?.status, 'error');
check('...and the NEXT account still ran', run.items.find((i) => i.accountId === 'c')?.status, 'done');
check('a step that hangs is capped and marked "still running"',
      run.items.find((i) => i.accountId === 'slow')?.status, 'still-running');
check('the name shown is the broker from cTrader when known, else his label',
      [run.items[0].label, run.items[2].label], ['Pepperstone', 'my b']);
check('his tab was told about every step (start, each syncing + result, end)', frames.length, 1 + 5 * 2 + 1);
check('...the first said all queued, the last said finished',
      [frames[0].items.filter((i: any) => i.status === 'queued').length, !!frames.at(-1).finishedAt], [5, true]);
check('...and in between it showed one account at a time syncing',
      frames.every((f) => f.items.filter((i: any) => i.status === 'syncing').length <= 1), true);
check('the finished run can still be read (a page opened afterwards)', syncAllStatus('u1') === run, true);
const again = await startSyncAll('u1');
check('a click after it finished starts a NEW run', [again.alreadyRunning, again.run !== run], [false, true]);
check('another user has no run', syncAllStatus('u2'), null);

// Assert the CALL, not a definition: the default sync is his own Sync button's (deep + manual).
const src = readFileSync(join(process.cwd(), 'server/services/syncAllQueue.ts'), 'utf8');
check('each account is synced as his own Sync button does it',
      /=\s*\(a\)\s*=>\s*syncAccount\(a,\s*\{\s*deep:\s*true,\s*manual:\s*true\s*\}\)/.test(src), true);

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
