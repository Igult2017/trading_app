/**
 * ctraderRateGuard.test.ts — run with:
 *     npx tsx server/services/ctraderRateGuard.test.ts
 *
 * WHAT THIS PROTECTS (docs/OPEN.md D63). 94% of one production log — 4,714 of 5,000 lines — was a
 * single message repeating across four accounts: `cTrader: You are being rate limited`. The refusal
 * was not the defect. The defect was that being refused made the code open MORE connections: a flat
 * 15-second retry that never slowed down, a second retry driver every 60 seconds on top of it, an
 * unbounded reconnect loop, and two places that abandoned sockets without closing them. The refusal
 * therefore fed itself and could never clear.
 *
 * THE RULE BEING GUARDED: after a refusal, the next attempt must be LATER and there must be FEWER of
 * them. Every check below is one way that can silently stop being true.
 *
 * ⚠ WHAT IS NOT COVERED HERE, STATED SO IT IS NOT MISTAKEN FOR COVERED. Opening a real socket and
 * failing the application handshake needs a live broker; `openHub` is not exported and mocking the
 * module's imports would test the mock. What IS checked is the RULE that path now obeys
 * (`closeIfDeserted`) plus the source wiring, and the rest is measured in production — see D63's
 * "done means measured" table.
 */
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  classify, endAttempt, forget, guardStats, isStandingDown, mayAttempt,
  noteRateLimited, noteSuccess, nextRetryMs, retryStepMs, standDownRemainingMs, _resetForTests,
} from './ctraderRateGuard';
import { waitFor, PT_OA_ERROR, PT_ACCT_AUTH_RES } from './brokerAdapters/ctrader';
import { _internals } from './ctraderHub';

let failed = 0;
let count = 0;

function check(name: string, got: unknown, want: unknown) {
  count++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}` +
              (ok ? '' : `, want ${JSON.stringify(want)}`));
  if (!ok) failed++;
}

function teeth(name: string, brokeItAndFailed: boolean) {
  count++;
  console.log(`   ${brokeItAndFailed ? 'PASS' : 'FAIL'}  TEETH — ${name}`);
  if (!brokeItAndFailed) failed++;
}

// ── WHICH KIND OF "NO" WAS THAT? ──────────────────────────────────────────────
console.log('\nRATE GUARD — three refusals that look alike need three different answers');

// The exact words from the production log that opened D63.
check('the production message is read as rate limiting',
      classify('cTrader: You are being rate limited'), 'rate-limited');
check('the error code form is too',
      classify('cTrader: BLOCKED_PAYLOAD_TYPE'), 'rate-limited');
check('and the per-application form',
      classify('REQUEST_FREQUENCY_EXCEEDED'), 'rate-limited');
// THE ONE THAT WAS MISSING, and whose absence meant a dead login was never retried with a fresh one.
check('a dead login is read as a login problem, not a rate limit',
      classify('cTrader: Access denied. Make sure the credentials are valid.'), 'login-rejected');
check('cTrader ACCESS_DENIED likewise', classify('ACCESS_DENIED'), 'login-rejected');
check('an invalidated token likewise', classify('CH_ACCESS_TOKEN_INVALID'), 'login-rejected');
check('anything else stays "other"',
      classify('cTrader timeout waiting for type 2103'), 'other');

// ⚠ ORDER MATTERS. A rate limit must never be treated as a login problem: "curing" it with a token
// refresh rotates the ticket every sibling account shares and breaks the accounts that still worked.
teeth('a rate limit is never mistaken for a login problem, even when it mentions auth',
      classify('auth request rate limit reached') === 'rate-limited');

// ── THE SHARED STAND-DOWN ─────────────────────────────────────────────────────
console.log('\nRATE GUARD — being refused makes the next attempt LATER, not sooner');

_resetForTests();
const t0 = 1_000_000;
check('nothing is standing down before any refusal', isStandingDown(t0), false);
check('and every account may attempt', mayAttempt('a', t0), true);

const first = noteRateLimited(t0);
check('the first refusal stands everything down for 30s', first.waitMs, 30_000);
check('it is a fresh trip', first.fresh, true);
check('nobody may attempt during it', mayAttempt('a', t0 + 1_000), false);
check('not even a different account', mayAttempt('b', t0 + 1_000), false);

// A BURST IS ONE EVENT. Four accounts attach together, so one limit comes back as four refusals.
const burst = noteRateLimited(t0 + 5);
check('a second refusal inside the window does NOT escalate again', burst.fresh, false);
check('and the wait is unchanged', burst.step, 1);

// Re-tripped AFTER the window expired → the wait doubles.
const second = noteRateLimited(t0 + 31_000);
check('being refused again after the window doubles the wait', second.waitMs, 60_000);
check('and again', noteRateLimited(t0 + 95_000).waitMs, 120_000);

// Capped, so a persistent refusal never becomes an infinite outage.
_resetForTests();
let now = t0;
for (let i = 0; i < 12; i++) { const r = noteRateLimited(now); now += r.waitMs + 1; }
check('the wait is capped at 10 minutes', noteRateLimited(now).waitMs, 600_000);

// ── ONE ACCOUNT TESTS THE WATER, NOT ALL FOUR ─────────────────────────────────
console.log('\nRATE GUARD — recovery costs one request, not four');

_resetForTests();
noteRateLimited(t0);
const after = t0 + 31_000;                       // window has expired
check('the first account to ask becomes the one that tries', mayAttempt('a', after), true);
check('a second account waits for its answer', mayAttempt('b', after), false);
check('the prober may ask again', mayAttempt('a', after), true);
check('the guard says who is probing', guardStats(after).probing, 'a');
endAttempt('a');
check('once its turn ends another account may try', mayAttempt('b', after), true);

// ⚠ ONLY A REAL SUCCESS CLEARS THE ESCALATION. If letting the window lapse reset the step, a refusal
// every ten minutes would be re-tried for ever at the 30-second starting wait — a brake in name only.
_resetForTests();
noteRateLimited(t0);
noteRateLimited(t0 + 31_000);
teeth('an expired window does NOT reset the escalation',
      noteRateLimited(t0 + 95_000).waitMs === 120_000);
noteSuccess();
check('a success clears the brake completely', isStandingDown(t0 + 95_001), false);
check('and the next refusal starts from the bottom again',
      noteRateLimited(t0 + 96_000).waitMs, 30_000);

// ── THE PER-ACCOUNT WAIT ──────────────────────────────────────────────────────
console.log('\nRATE GUARD — one account retrying does not hammer');

check('the first retry keeps the old 15s, so nothing got FASTER', retryStepMs(0), 15_000);
check('then doubles', [retryStepMs(1), retryStepMs(2), retryStepMs(3)], [30_000, 60_000, 120_000]);
check('and is capped at 5 minutes', retryStepMs(99), 300_000);

_resetForTests();
// THE RANDOMNESS IS NOT DECORATION: four accounts that fail together must not come back in lockstep.
const waits = [0, 1, 2, 3].map(() => nextRetryMs('spread-test'));
teeth('consecutive waits for one account grow', waits[3] > waits[0]);
const sameStep = [0, 0, 0, 0, 0, 0].map((_, i) => { _resetForTests(); return nextRetryMs(`acct-${i}`); });
teeth('four accounts at the same step do NOT get identical waits',
      new Set(sameStep).size > 1);
for (const w of sameStep) {
  if (w < 15_000 * 0.75 || w > 15_000 * 1.25) {
    teeth(`a spread wait stays within ±25% of 15s (saw ${w})`, false);
  }
}

// ⚠ A 15-SECOND RETRY INSIDE A 10-MINUTE STAND-DOWN IS 40 POINTLESS WAKE-UPS, each a log line.
_resetForTests();
noteRateLimited(t0);
teeth('a retry is never scheduled sooner than the stand-down ends',
      nextRetryMs('a', t0 + 1_000) >= standDownRemainingMs(t0 + 1_000));

_resetForTests();
nextRetryMs('gone'); nextRetryMs('gone');
check('an account is tracked while it is failing', guardStats().accountsBackingOff, 1);
forget('gone');
check('and forgotten once it connects', guardStats().accountsBackingOff, 0);

// ── ONE BROKEN ACCOUNT MUST NOT TAKE A HEALTHY SOCKET DOWN ────────────────────
console.log('\nHUB — a socket dies only when nobody is on it and nobody is arriving');

const { closeIfDeserted, isFor } = _internals;

function fakeHub(members: number, pending: number) {
  const m = new Map<number, any>();
  for (let i = 0; i < members; i++) m.set(100 + i, { account: { id: `a${i}` } });
  let closed = false;
  return {
    hub: {
      members: m, pending, closing: false, hb: setInterval(() => {}, 1e9),
      ws: { close() { closed = true; } },
    } as any,
    wasClosed: () => closed,
  };
}

const deserted = fakeHub(0, 0);
closeIfDeserted(deserted.hub);
check('a socket nobody is on is closed', deserted.wasClosed(), true);
check('and marked as an expected close, so it is not re-attached', deserted.hub.closing, true);

// THE TRAP IN THE OBVIOUS VERSION OF THIS FIX. One account failing must never take the others offline.
const busy = fakeHub(2, 0);
closeIfDeserted(busy.hub);
teeth('a socket with healthy accounts on it is NOT closed', busy.wasClosed() === false);

// A member only joins AFTER its round-trip finishes, so "no members" is also true of a socket that
// three accounts are currently authorising onto. `pending` is what tells those two apart.
const arriving = fakeHub(0, 3);
closeIfDeserted(arriving.hub);
teeth('a socket accounts are still joining is NOT closed', arriving.wasClosed() === false);

// ── A REPLY ONLY ANSWERS THE ACCOUNT THAT ASKED ───────────────────────────────
console.log('\nHUB — one account\'s refusal does not fail the other three');

check('a reply naming this account is mine', isFor(111)({ ctidTraderAccountId: 111 }), true);
check('a reply naming another account is not', isFor(111)({ ctidTraderAccountId: 222 }), false);
// ⚠ TOLERANT WHEN THE FIELD IS ABSENT. The schema marks it required, but this gateway has dropped a
// schema-required field before (`closePositionDetail`: 0 of 30 real deals carried it). A strict test
// against a field the gateway might omit would time out every attach — a noisy bug made a total outage.
check('a reply naming nobody is accepted rather than timing out',
      isFor(111)({}), true);

/** A socket that is only an event emitter — `waitFor` needs nothing more. */
function fakeSocket() {
  const ws = new EventEmitter() as any;
  ws.off = ws.removeListener.bind(ws);
  return ws;
}
(async () => {
  // The exact production scenario: two accounts authorising on ONE socket, and the broker refuses one.
  const ws = fakeSocket();
  let bRejected = false;
  const waitA = waitFor(ws, PT_ACCT_AUTH_RES, 2_000, isFor(111)).catch((e: any) => `A:${e.message}`);
  const waitB = waitFor(ws, PT_ACCT_AUTH_RES, 2_000, isFor(222))
    .catch(() => { bRejected = true; return 'B'; });

  ws.emit('message', Buffer.from(JSON.stringify({
    payloadType: PT_OA_ERROR,
    payload: { ctidTraderAccountId: 111, description: 'You are being rate limited' },
  })));
  ws.emit('message', Buffer.from(JSON.stringify({
    payloadType: PT_ACCT_AUTH_RES, payload: { ctidTraderAccountId: 222 },
  })));

  const a = await waitA;
  await waitB;
  check('the refused account gets the refusal', String(a).includes('rate limited'), true);
  teeth('the OTHER account on the same socket is NOT failed by it', bRejected === false);

  // No id on the error → cannot tell whose it is, so it is still reported rather than swallowed.
  const ws2 = fakeSocket();
  const waitC = waitFor(ws2, PT_ACCT_AUTH_RES, 2_000, isFor(333)).catch((e: any) => `C:${e.message}`);
  ws2.emit('message', Buffer.from(JSON.stringify({
    payloadType: PT_OA_ERROR, payload: { description: 'You are being rate limited' },
  })));
  check('an unlabelled refusal is still reported, never swallowed',
        String(await waitC).includes('rate limited'), true);

  // ⚠ THE TIMEOUT USED TO LEAVE ITS LISTENER ATTACHED, for the life of the socket, per timed-out wait.
  const ws3 = fakeSocket();
  const before = ws3.listenerCount('message');
  await waitFor(ws3, 9999, 30).catch(() => {});
  teeth('a timed-out wait removes its own listener',
        ws3.listenerCount('message') === before);

  // ── THE WIRING, READ FROM THE SOURCE ────────────────────────────────────────
  //
  // These two cannot be called directly without a database and a broker, and they are exactly the
  // places a later edit would silently undo the fix. Same idiom as `lib/entryParity.test.ts`, which
  // reads the server entry files to prove the two of them stayed in step.
  console.log('\nWIRING — the brake is fitted at every point that can walk around it');

  const here = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8');
  const realtime = here('ctraderRealtime.ts');
  const pool = here('ctraderConnPool.ts');
  const hub = here('ctraderHub.ts');

  teeth('the 60-second sweep consults the brake (or it walks past it once a minute, for ever)',
        /if\s*\(!isStandingDown\(\)\)\s*\{/.test(realtime));
  teeth('a single connect attempt consults the brake before asking the broker',
        /if\s*\(!mayAttempt\(id\)\)/.test(realtime));
  teeth('only one retry timer per account can be pending',
        /retryTimer\.get\(id\)/.test(realtime) && /clearTimeout\(existing\)/.test(realtime));
  teeth('a successful attach takes the brake off',
        /noteSuccess\(\)/.test(realtime));
  teeth('the pool refuses every new connection while standing down',
        /isStandingDown\(\)/.test(pool));
  teeth('an abandoned socket is destroyed when the app handshake fails',
        /ws\?\.terminate\(\)/.test(hub));
  // ⚠ COMMENTS STRIPPED FIRST. The negative half of this check is the valuable half — it fails if
  // anyone reintroduces the unbounded loop — but the comment explaining the fix quotes `for(;;)`
  // verbatim, so testing the raw file would match the prose describing the bug as if it were the bug.
  const code = (src: string) => src.split('\n')
    .filter(l => !/^\s*(\*|\/\/)/.test(l))
    .join('\n');
  teeth('the socket search loop is bounded, and the unbounded one is gone',
        /for \(let round = 0; round < MAX_ROUNDS/.test(code(hub)) && !/for\s*\(;;\)/.test(code(hub)));

  console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — ${count} checks\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
