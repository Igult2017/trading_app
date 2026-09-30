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
 * observed on this JSON gateway, which is why CTRADER_ACCOUNTS_PER_CONN shipped at 1.
 *
 * MEASURED 2026-09-30, AND IT DOES: a demo trade produced 4 execution events and every one carried the
 * id. The setting is now 2 — notch one of the 1/2/5/10/20/50 ramp. The checks below are what make that
 * safe to do: with several accounts on a socket, an unlabelled fill is DROPPED, never guessed at.
 */
import { PT_EXECUTION_EVENT, PT_TOKEN_INVALIDATED, PT_ACCOUNT_DISCONNECT } from './brokerAdapters/ctrader';
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

const { route, hubKey, hasRoom } = _internals;

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
check('CTRADER_ACCOUNTS_PER_CONN is 5 — notch two, after sharing was measured working at 2',
      ACCOUNTS_PER_CONN, 5);

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

// ── ONE ACCOUNT'S SESSION ENDING MUST NOT TAKE THE OTHERS DOWN (docs/OPEN.md D53) ────────────────
//
// cTrader ends a single account's session on a routine token refresh. The socket and every other
// account on it keep working, so the event has to name WHICH account and only that one may be touched.
// Before this, `route` dropped every frame that was not a fill, so the event was invisible.
console.log('\nA DEAD ACCOUNT SESSION IS SEEN, AND ONLY THAT ACCOUNT IS TOUCHED\n');

/** A hub that records which accounts were reported lost, instead of reconnecting them. */
function lossHub(ctids: number[]) {
  const h = fakeHub(ctids);
  const lost: string[] = [];
  h.onAccountLost = (id: string) => lost.push(id);
  return { h, lost };
}
const nothing = () => { /* fills are irrelevant here */ };

let L = lossHub([111, 222, 333]);
route(L.h, frame({ ctidTraderAccountIds: [222] }, PT_TOKEN_INVALIDATED), nothing);
check('an invalidated token reports ONLY the account it names', L.lost, ['acct-222']);

L = lossHub([111, 222, 333]);
route(L.h, frame({ ctidTraderAccountIds: [111, 333] }, PT_TOKEN_INVALIDATED), nothing);
check('...and it reads the ARRAY form, so several named accounts are all handled',
      L.lost, ['acct-111', 'acct-333']);

// The disconnect event names ONE account in a different field. Reading only the array form would have
// silently ignored it — the same class of miss as the fill router's missing id.
L = lossHub([111, 222]);
route(L.h, frame({ ctidTraderAccountId: 222 }, PT_ACCOUNT_DISCONNECT), nothing);
check('a disconnect names its account in the SINGULAR field and is still handled',
      L.lost, ['acct-222']);

L = lossHub([111, 222]);
route(L.h, frame({ ctidTraderAccountIds: [999] }, PT_TOKEN_INVALIDATED), nothing);
check('an account that is not ours is ignored rather than mistaken for one of ours', L.lost, []);

// NO ID AND SEVERAL MEMBERS: which session died is unknowable, so every member is re-checked rather
// than one being guessed at. Re-checking is cheap and safe; guessing re-authorises the wrong account
// and leaves the broken one broken.
L = lossHub([111, 222, 333]);
route(L.h, frame({}, PT_TOKEN_INVALIDATED), nothing);
check('no id + several accounts -> ALL are re-checked, never one guessed',
      L.lost, ['acct-111', 'acct-222', 'acct-333']);

L = lossHub([111]);
route(L.h, frame({}, PT_TOKEN_INVALIDATED), nothing);
check('no id + one account -> that account, unambiguously', L.lost, ['acct-111']);

// AND IT MUST NOT BE CONFUSED WITH A FILL. A fill still routes as a fill, and a session event must
// never be delivered to `onTrade` as though a trade had happened.
let fills: string[] = [];
L = lossHub([111, 222]);
route(L.h, frame({ ctidTraderAccountIds: [222] }, PT_TOKEN_INVALIDATED),
      (m: any) => fills.push(m.account.id));
check('a session event is never delivered as a trade', fills, []);

teeth('a router that dropped these events would report no loss at all',
      L.lost.length === 1 && fills.length === 0);

// ── ROOM IS COUNTED INCLUDING SLOTS ALREADY PROMISED (the bug that made sharing impossible) ──────
//
// A member is only added to `members` AFTER its authorisation round-trip finishes. Counting `members`
// alone therefore reports an EMPTY socket while three accounts are already on their way to it — so on a
// concurrent boot every account was told there was room, and each opened its own socket instead.
// MEASURED on production 2026-09-30 with the limit set to 2: accounts 4, sockets 4, [1,1,1,1].
console.log(`
ROOM COUNTS RESERVATIONS, NOT JUST ARRIVALS
`);

const roomy = (members: number, pending: number) =>
  ({ key: 'k', closing: false, members: new Map(Array.from({ length: members }, (_, i) => [i, {} as any])), pending } as any);

check('an empty socket has room', hasRoom(roomy(0, 0), 'k'), true);
check('...and one already promised to somebody still has room, below the limit',
      hasRoom(roomy(0, 1), 'k'), true);
check('...but one promised up to the limit does NOT, even with no member arrived yet',
      hasRoom(roomy(0, ACCOUNTS_PER_CONN), 'k'), false);
check('members and promises are counted TOGETHER against the limit',
      hasRoom(roomy(1, ACCOUNTS_PER_CONN - 1), 'k'), false);
check('a socket at the member limit is full', hasRoom(roomy(ACCOUNTS_PER_CONN, 0), 'k'), false);
check('a closing socket is never offered', hasRoom({ ...roomy(0, 0), closing: true }, 'k'), false);
check('a socket for a different host+app is never offered', hasRoom(roomy(0, 0), 'other'), false);

// TEETH — the old test. Counting members alone says the 0-member/2-promised socket has room, which is
// exactly how four accounts ended up on four sockets.
teeth('counting members alone would wrongly report room',
      roomy(0, ACCOUNTS_PER_CONN).members.size < ACCOUNTS_PER_CONN
      && !hasRoom(roomy(0, ACCOUNTS_PER_CONN), 'k'));

_resetForTests();
console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
