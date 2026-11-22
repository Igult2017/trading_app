/**
 * REQUESTS PACED PER CONNECTION, AND "TOO MANY" WAITED OUT AND SENT AGAIN (22 Nov 2026, sync plan step 4).
 * Run: npx tsx server/services/__tests__/ctraderPace.check.ts
 *
 * In words, what must hold:
 *  * each connection has its OWN allowance — two connections each send 4 history requests at once
 *    (the old single website-wide clock spaced all 8 by 300 ms: over 2 s);
 *  * on one connection, never more than 4 history / 35 ordinary requests inside any one second,
 *    even when many callers ask at the same moment;
 *  * a "you are being rate limited" answer is waited out and the SAME question sent again on the SAME
 *    connection; any other refusal comes straight back; after three resends the refusal stands.
 * Uses a real WebSocket server standing in for cTrader.
 */
import { WebSocketServer } from 'ws';
import { awaitTurn, BUDGET } from '../brokerAdapters/ctraderPace';
import { ask, openWS, RESEND_WAITS_MS, PT_OA_ERROR } from '../brokerAdapters/ctrader';
const PT_ACCOUNTS_REQ = 2149, PT_ACCOUNTS_RES = 2150;   // the account-list question and answer (proto)

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
/** The most requests found inside any one-second window of these send times. */
const busiestSecond = (ts: number[]) => Math.max(...ts.map((t) => ts.filter((u) => u >= t && u < t + 1000).length));

console.log('\ncTRADER PACING — PER CONNECTION\n');

// 1. Two connections, 4 history requests each, all at once.
const a = {}, b = {};
let t0 = Date.now();
await Promise.all([...Array(4)].flatMap(() => [awaitTurn('history', a), awaitTurn('history', b)]));
check('two connections send their 4 history requests each at once (under 200 ms)', Date.now() - t0 < 200, true);

// 2. Ten concurrent history callers on ONE connection.
const c = {}, times: number[] = [];
t0 = Date.now();
await Promise.all([...Array(10)].map(() => awaitTurn('history', c).then(() => times.push(Date.now()))));
check('ten history requests on one connection: never more than 4 in any second', busiestSecond(times), BUDGET.history);
check('...so the 10th waits two full windows (>= 2 s)', Date.now() - t0 >= 2000, true);

// 3. Ordinary requests: 35 at once, the 36th waits.
const d = {}, nt: number[] = [];
t0 = Date.now();
await Promise.all([...Array(36)].map(() => awaitTurn('normal', d).then(() => nt.push(Date.now() - t0))));
nt.sort((x, y) => x - y);
check('35 ordinary requests go at once', nt[34] < 200, true);
check('...the 36th waits for the window (>= 1 s)', nt[35] >= 1000, true);

// 4. ask(): resend on "too many", against a stand-in server.
RESEND_WAITS_MS.splice(0, 3, 50, 50, 50);
let refuse = 0, mode: 'rate' | 'other' = 'rate', seen = 0;
const wss = new WebSocketServer({ port: 0 });
wss.on('connection', (sock) => sock.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.payloadType !== PT_ACCOUNTS_REQ) return;
  seen++;
  if (refuse > 0) {
    refuse--;
    const description = mode === 'rate' ? 'You are being rate limited' : 'CH_ACCESS_TOKEN_INVALID';
    sock.send(JSON.stringify({ payloadType: PT_OA_ERROR, payload: { errorCode: 'X', description } }));
  } else sock.send(JSON.stringify({ payloadType: PT_ACCOUNTS_RES, payload: { ctidTraderAccountId: [{ ctidTraderAccountId: 7 }] } }));
}));
await new Promise((r) => wss.once('listening', r));
const ws = await openWS(`ws://127.0.0.1:${(wss.address() as any).port}`);
const q = () => ask(ws, 'normal', PT_ACCOUNTS_REQ, { accessToken: 't' }, PT_ACCOUNTS_RES, 2000);

refuse = 2; seen = 0;
const got = await q().catch((e) => ({ error: String(e.message) }));
check('"rate limited" twice, then answered: the answer is returned', got?.ctidTraderAccountId?.[0]?.ctidTraderAccountId, 7);
check('...after the same question was sent 3 times on the same connection', seen, 3);

refuse = 1; mode = 'other'; seen = 0;
const other = await q().then(() => 'answered', (e) => String(e.message));
check('any other refusal comes straight back, not resent', [other.includes('CH_ACCESS_TOKEN_INVALID'), seen], [true, 1]);

refuse = 9; mode = 'rate'; seen = 0;
const gaveUp = await q().then(() => 'answered', (e) => String(e.message));
check('after three resends the "rate limited" refusal stands', [gaveUp.includes('rate limited'), seen], [true, 4]);

ws.close(); wss.close();
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
