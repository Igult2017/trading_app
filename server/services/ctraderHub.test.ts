/**
 * ctraderHub.test.ts — run with:
 *     DATABASE_URL="postgresql://x:x@localhost:5432/x" npx tsx server/services/ctraderHub.test.ts
 *
 * WHAT THIS PROTECTS. Sockets used to be one-per-account, so an incoming execution event could only
 * belong to one account and no routing was needed. Now many accounts share a socket and every event
 * has to be delivered to exactly the right one.
 *
 * THE FAILURE BEING GUARDED IS SILENT AND EXPENSIVE: route a closed trade to the wrong member and a
 * real trade is written into the wrong person's journal, with nothing erroring. So the rule is that
 * an event is routed by its own `ctidTraderAccountId`, or — when there is exactly one account on the
 * socket, which is the shipped default and identical to the old behaviour — to that one account.
 * Never by guessing.
 *
 * `ProtoOAExecutionEvent` carries `ctidTraderAccountId` in the protobuf schema, but that has NOT been
 * observed on this JSON gateway, which is why CTRADER_ACCOUNTS_PER_CONN ships at 1.
 */
import { PT_EXECUTION_EVENT } from './brokerAdapters/ctrader';
import { ACCOUNTS_PER_CONN, _internals, _resetForTests } from './ctraderHub';

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

const { route, hubKey } = _internals;

/** A hub with no real socket — routing is pure and needs none. */
function fakeHub(ctids: number[]) {
  const members = new Map<number, any>();
  for (const c of ctids) {
    members.set(c, { account: { id: `acct-${c}`, userId: `user-${c}` }, ctid: c, symbolMap: {} });
  }
  return { ws: null, hb: null, lease: null, key: 'k', closing: false, members } as any;
}

function frame(payload: any, type = PT_EXECUTION_EVENT) {
  return Buffer.from(JSON.stringify({ payloadType: type, payload }));
}

console.log('\nCTRADER HUB — an event reaches exactly the account it belongs to');

// ── ROUTING BY ACCOUNT ID ───────────────────────────────────────────────────
const hub = fakeHub([111, 222, 333]);
let got: string[] = [];
const collect = (m: any) => got.push(m.account.id);

route(hub, frame({ ctidTraderAccountId: 222, deal: { dealId: 1 } }), collect);
check('an event is delivered to the account it names', got, ['acct-222']);

got = [];
route(hub, frame({ ctidTraderAccountId: 111, deal: { dealId: 2 } }), collect);
check('...and a different id reaches a different account', got, ['acct-111']);

got = [];
route(hub, frame({ ctidTraderAccountId: 999, deal: { dealId: 3 } }), collect);
check('an id belonging to NO member on this socket is delivered to nobody', got, []);

// The id arriving as a string must still route — JSON gateways are not fussy about number types.
got = [];
route(hub, frame({ ctidTraderAccountId: '333', deal: { dealId: 4 } }), collect);
check('a numeric-string id still routes correctly', got, ['acct-333']);

// ── THE SINGLE-MEMBER FALLBACK (the shipped default) ────────────────────────
const solo = fakeHub([777]);
got = [];
route(solo, frame({ deal: { dealId: 5 } }), collect);
check('no id + ONE account on the socket -> that account (the old behaviour exactly)',
      got, ['acct-777']);

// ── AND THE REFUSAL THAT MATTERS ────────────────────────────────────────────
// With several accounts and no id, delivering to any of them is a guess. A guess here writes a real
// trade into the wrong person's journal.
got = [];
const errs: string[] = [];
const realError = console.error;
console.error = (m: any) => { errs.push(String(m)); };
route(hub, frame({ deal: { dealId: 6 } }), collect);
console.error = realError;
check('no id + MANY accounts -> delivered to nobody rather than guessed', got, []);
check('...and it says so loudly', errs.length > 0 && errs[0].includes('dropped rather than guessed'), true);

// ── FRAMES THAT ARE NOT TRADES ──────────────────────────────────────────────
got = [];
route(hub, frame({ ctidTraderAccountId: 222 }, 51), collect);   // heartbeat payloadType
check('a non-execution frame is ignored', got, []);
route(hub, Buffer.from('not json at all'), collect);
check('malformed JSON is ignored rather than thrown', got, []);
route(hub, frame(null), collect);
check('an execution event with no payload is ignored', got, []);

// ── SOCKETS ARE SEPARATED BY HOST *AND* APP ─────────────────────────────────
// Both are correctness: live and demo are different endpoints, and a socket is authenticated as ONE
// cTrader app — an account's token only works under the app that issued it.
check('different hosts never share a socket',
      hubKey('wss://live', 'legacy') === hubKey('wss://demo', 'legacy'), false);
check('different apps never share a socket',
      hubKey('wss://demo', 'sync') === hubKey('wss://demo', 'legacy'), false);
check('same host and app do share', hubKey('wss://demo', 'sync'), hubKey('wss://demo', 'sync'));
check('no app recorded is treated as legacy', hubKey('wss://demo', undefined), 'wss://demo|legacy');

// ── THE SHIPPED DEFAULT ─────────────────────────────────────────────────────
check('CTRADER_ACCOUNTS_PER_CONN ships at 1 — identical to the old behaviour until routing is proven',
      ACCOUNTS_PER_CONN, 1);

// ── TEETH ───────────────────────────────────────────────────────────────────
// Prove the routing test can fail: a router that ignored the id and always took the first member
// would pass every "delivered to somebody" check and be catastrophically wrong.
const naive = (h: any, r: Buffer, cb: any) => cb(h.members.values().next().value);
got = [];
naive(hub, frame({ ctidTraderAccountId: 222 }), collect);
teeth('a router that ignored the id would deliver to the WRONG account', got[0] !== 'acct-222');

got = [];
route(hub, frame({ ctidTraderAccountId: 222, deal: { dealId: 7 } }), collect);
teeth('...while the real router delivers to the right one', got[0] === 'acct-222');

_resetForTests();
console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
