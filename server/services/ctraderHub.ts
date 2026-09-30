/**
 * Many cTrader accounts on ONE socket — the change that stops connections growing with users.
 *
 * WHY. `ctraderRealtime` held one permanent WebSocket per account, for every user, forever. At
 * ~1.5 accounts a user that is 3,000 sockets at 2,000 users, on ONE cTrader application, whose
 * concurrent-connection ceiling is reported (forum, not the docs) to be about 25. The connection
 * eventually refused could be the signal platform reconnecting — the outcome ruled out.
 *
 * The API is built for this: a socket authenticates the APP once, then each account authorises
 * separately with its own token, and a token refresh ends only that account's session — the others
 * on the same socket keep streaming.
 *
 * TWO THINGS DECIDE WHICH SOCKET AN ACCOUNT MAY JOIN, and both are correctness, not tidiness:
 *   * the HOST — live and demo are different endpoints;
 *   * the APP  — a socket is authenticated as ONE cTrader application, and an account's token only
 *     works under the app that issued it (`creds.app`). Mixing them on one socket authenticates
 *     nobody correctly.
 *
 * ROUTING IS BY `ctidTraderAccountId`, which `ProtoOAExecutionEvent` carries — confirmed from the
 * protobuf schema. **But it has NOT been observed on this JSON gateway**, because the old code never
 * needed to read it. So `CTRADER_ACCOUNTS_PER_CONN` DEFAULTS TO 1: behaviour identical to before,
 * one account per socket, and the single-member fallback below routes exactly as it always did.
 * `logRoutingEvidence` reports whether real events carry the id. Once the log says they do, raising
 * the setting is a config change and no code change.
 *
 * That gate exists because the failure it guards is silent: route a trade to the wrong account and
 * you have written a real trade into the wrong person's journal, with nothing failing loudly.
 */
import WebSocket from 'ws';
import type { BrokerAccount } from '../../shared/schema';
import { acquire, type Lease } from './ctraderConnPool';
import {
  LIVE_WS, DEMO_WS, openWS, send, waitFor, appAuth,
  PT_ACCT_AUTH_REQ, PT_ACCT_AUTH_RES, PT_SYMBOLS_REQ, PT_SYMBOLS_RES,
  PT_EXECUTION_EVENT, PT_HEARTBEAT, PT_TOKEN_INVALIDATED, PT_ACCOUNT_DISCONNECT,
  PT_RECONCILE_REQ, PT_RECONCILE_RES,
} from './brokerAdapters/ctrader';

const HEARTBEAT_MS = 10_000;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(process.env[name] ?? ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Accounts per socket. 1 = exactly today's behaviour. Raise only once routing is proven — above. */
/**
 * DEFAULT RAISED 1 -> 2 ON 2026-09-30, on measurement rather than on hope.
 *
 * It shipped at 1 because nobody had seen whether a real fill on this JSON gateway names the account it
 * belongs to. That is now measured: a demo trade produced **4 execution events and every one carried
 * `ctidTraderAccountId`** (`[cTraderHub] execution events DO carry ctidTraderAccountId (4 seen)`, and a
 * `routing-ok` row). So the premise the 1 was protecting no longer holds.
 *
 * AND THERE IS NO PATH TO A WRONG DELIVERY — read `route` below, all three branches:
 *   * id present  -> the member is looked up BY that id, so it is either the right one or none at all;
 *   * id absent, one member  -> unambiguous, exactly the old behaviour;
 *   * id absent, several  -> dropped and said out loud, never guessed.
 * The worst case at 2 is therefore a DROPPED fill, not a misfiled one — and a drop is now recovered
 * twice over: the catch-up on the next attach, and the 15-minute sweep.
 *
 * WHY 2 AND NOT 50. One dropped socket takes every account on it down together, and there is no
 * documented limit on accounts per connection, so the real number has to be found rather than assumed.
 * The agreed ramp is 1 -> 2 -> 5 -> 10 -> 20 -> 50, verifying at each notch
 * (docs/ctrader-scaling.md Step 5). This is notch one.
 *
 * HOW TO SEE IT WORKED: the boot line reports accounts and sockets separately, so accounts must now
 * EXCEED sockets. Set `CTRADER_ACCOUNTS_PER_CONN=1` to fall straight back — no code change, though it
 * needs a restart, because this is read once at startup.
 */
export const ACCOUNTS_PER_CONN = envInt('CTRADER_ACCOUNTS_PER_CONN', 2, 1, 200);

export interface Member {
  account:   BrokerAccount;
  ctid:      number;
  symbolMap: Record<number, string>;
}

interface Hub {
  ws:      WebSocket;
  hb:      NodeJS.Timeout;
  lease:   Lease;
  key:     string;                    // `${host}|${app}` — see the header
  closing: boolean;
  members: Map<number, Member>;       // ctidTraderAccountId -> member
  /**
   * Slots promised to accounts that are still authorising.
   *
   * A member only appears in `members` AFTER its authorisation round-trip finishes, so counting
   * `members` alone says a socket is empty while three accounts are already on their way to it. Room is
   * therefore `members.size + pending`, and a slot is reserved at the moment a socket is CHOSEN.
   */
  pending: number;
  // Called when ONE account on this socket loses its session while the socket stays up.
  onAccountLost?: OnAccountLost;
}

type OnTrade = (member: Member, payload: any) => void;
type OnHubLost = (accountIds: string[]) => void;
/** ONE account lost its session; the socket and its other accounts are unaffected. */
type OnAccountLost = (accountId: string, reason: string) => void;

const hubs: Hub[] = [];
const hubOf = new Map<string, Hub>();   // brokerAccountId -> hub

// Whether real execution events carry the account id. Reported once, so the setting above can be
// raised on evidence rather than on the protobuf schema alone.
let sawRouted = 0;
let sawUnrouted = 0;
let reported = false;

export function hubStats(): { hubs: number; accounts: number; perHub: number[] } {
  return { hubs: hubs.length, accounts: hubOf.size, perHub: hubs.map(h => h.members.size) };
}

/**
 * The verdict on THE GATE, in a form that outlives the log.
 *
 * WHY IT RETURNS SOMETHING NOW. This printed to the console and nothing else — and the container log
 * holds roughly **50 seconds** of history, because the Python signal platform writes continuously. The
 * one line that answers "can accounts share a socket?" would therefore appear once, after the first
 * fill, and be gone long before anyone looked. A console-only answer to a question this load-bearing is
 * an answer we do not have (docs/ctrader-scaling.md, THE GATE).
 *
 * The caller persists it. The hub stays transport-only and does not reach into the database itself.
 */
export function logRoutingEvidence(): { carriesId: boolean; routed: number; unrouted: number } | null {
  if (reported || sawRouted + sawUnrouted === 0) return null;
  reported = true;
  if (sawUnrouted === 0) {
    console.log(`[cTraderHub] execution events DO carry ctidTraderAccountId (${sawRouted} seen) — ` +
                `CTRADER_ACCOUNTS_PER_CONN can safely be raised above ${ACCOUNTS_PER_CONN}`);
  } else {
    console.warn(`[cTraderHub] ${sawUnrouted} execution event(s) arrived WITHOUT ctidTraderAccountId ` +
                 `— do NOT raise CTRADER_ACCOUNTS_PER_CONN above 1; routing would be a guess`);
  }
  return { carriesId: sawUnrouted === 0, routed: sawRouted, unrouted: sawUnrouted };
}

/** Live counters, for a status read that does not consume the one-shot verdict above. */
export function routingCounters(): { routed: number; unrouted: number } {
  return { routed: sawRouted, unrouted: sawUnrouted };
}

function hubKey(host: string, app: string | undefined): string {
  return `${host}|${app ?? 'legacy'}`;
}

/** A hub for this host+app with room, or a new one. */
/**
 * Sockets being opened right now, by key, so concurrent callers wait instead of each opening their own.
 *
 * ⚠ THIS IS WHY SHARING NEVER ACTUALLY HAPPENED. Accounts connect concurrently
 * (`ctraderRealtime.ts:233` is a `Promise.all`), and the search for an existing socket below runs
 * SYNCHRONOUSLY, before any await — while the socket it would find is only registered three awaits
 * later. So every account on a concurrent boot looked, saw nothing, and opened its own. Measured on
 * production 2026-09-30 with the limit set to 2: `accounts 4, sockets 4, accountsPerSocket [1,1,1,1]`.
 * The setting was being honoured and the sharing was still impossible.
 */
const creating = new Map<string, Promise<Hub>>();

/** Room accounts for slots already promised, not just members already authorised. */
function hasRoom(h: Hub, key: string): boolean {
  return h.key === key && !h.closing && (h.members.size + h.pending) < ACCOUNTS_PER_CONN;
}

/**
 * A socket for this host+app with room, or a new one. **Reserves a slot on the socket it returns** —
 * the caller MUST release it (see `attach`), or the socket leaks capacity and slowly stops accepting.
 */
async function hubWithRoom(host: string, app: string | undefined,
                           onTrade: OnTrade, onHubLost: OnHubLost,
                           onAccountLost?: OnAccountLost): Promise<Hub> {
  const key = hubKey(host, app);
  for (;;) {
    const existing = hubs.find(h => hasRoom(h, key));
    if (existing) { existing.pending++; return existing; }

    const inFlight = creating.get(key);
    if (inFlight) {
      // Someone is already opening a socket for this key. Wait for it, then look again — it may have
      // room for this account, or may already be full, in which case the loop opens the next one.
      try { await inFlight; } catch { /* the opener logs its own failure; just re-evaluate */ }
      continue;
    }

    const opening = openHub(host, app, key, onTrade, onHubLost, onAccountLost)
      .finally(() => { if (creating.get(key) === opening) creating.delete(key); });
    creating.set(key, opening);
    const hub = await opening;
    hub.pending++;
    return hub;
  }
}

async function openHub(host: string, app: string | undefined, key: string,
                       onTrade: OnTrade, onHubLost: OnHubLost,
                       onAccountLost?: OnAccountLost): Promise<Hub> {
  const lease = await acquire('feed', 'live-feed');
  let ws: WebSocket;
  try {
    ws = await openWS(host);
    await appAuth(ws, app);
  } catch (err) {
    lease.release();
    throw err;
  }

  const hub: Hub = {
    ws, lease, key, closing: false, members: new Map(), pending: 0, onAccountLost,
    hb: setInterval(() => { try { send(ws, PT_HEARTBEAT, {}); } catch { /* socket gone */ } }, HEARTBEAT_MS),
  };
  hubs.push(hub);

  ws.on('message', (raw) => route(hub, raw, onTrade));
  ws.on('error', () => { try { ws.close(); } catch { /* noop */ } });
  ws.on('close', () => {
    clearInterval(hub.hb);
    hub.lease.release();
    const i = hubs.indexOf(hub);
    if (i >= 0) hubs.splice(i, 1);
    // EVERY member of this socket lost its feed together — that is the cost of sharing, and the
    // caller re-attaches them all rather than one silently going quiet.
    const lost: string[] = [];
    hub.members.forEach(m => { hubOf.delete(m.account.id); lost.push(m.account.id); });
    hub.members.clear();
    if (!hub.closing && lost.length) onHubLost(lost);
  });
  return hub;
}

/** One incoming frame -> the member it belongs to. */
function route(hub: Hub, raw: WebSocket.RawData, onTrade: OnTrade): void {
  let msg: any;
  try { msg = JSON.parse(raw.toString()); } catch { return; }

  // ── ONE ACCOUNT'S SESSION ENDED, AND THE SOCKET IS FINE ────────────────────────────────────────
  //
  // Checked BEFORE the execution-event guard below, because that guard drops every other frame — which
  // is why this was invisible. cTrader sends this on a routine token refresh, and it ends the session
  // for the named account ONLY; the others on this socket keep streaming
  // (docs/ctrader-open-api-apps.md:90, docs/OPEN.md D53).
  //
  // Harmless while each socket carries one account — a dead session then surfaces as our own next
  // request failing, and the one-shot token refresh recovers it. A BLOCKER for sharing: the socket
  // stays healthy, so nothing would notice that one account had gone quiet.
  if (msg.payloadType === PT_TOKEN_INVALIDATED || msg.payloadType === PT_ACCOUNT_DISCONNECT) {
    const why = msg.payloadType === PT_TOKEN_INVALIDATED ? 'token invalidated' : 'account disconnected';
    // The invalidation event names accounts in an ARRAY (`ctidTraderAccountIds`); the disconnect event
    // names one (`ctidTraderAccountId`). Both shapes are read, so neither is silently ignored.
    const ids: number[] = Array.isArray(msg.payload?.ctidTraderAccountIds)
      ? msg.payload.ctidTraderAccountIds.map(Number).filter(Number.isFinite)
      : [Number(msg.payload?.ctidTraderAccountId ?? NaN)].filter(Number.isFinite);

    // NO ID AND ONE MEMBER is unambiguous — the same fallback the fill router uses. With several
    // members it would be a guess about whose session died, and guessing here means re-authorising the
    // wrong account while the broken one stays broken.
    const targets = ids.length ? ids
                  : (hub.members.size === 1 ? [...hub.members.keys()] : []);
    if (!targets.length) {
      console.error(`[cTraderHub] ${why} with no account id on a socket carrying ${hub.members.size} `
                  + `accounts — cannot tell which; every member will be re-checked`);
      hub.members.forEach(m => hub.onAccountLost?.(m.account.id, why));
      return;
    }
    for (const ctid of targets) {
      const m = hub.members.get(ctid);
      if (!m) continue;                                    // not ours — another app's account
      console.warn(`[cTraderHub] ${why} for account ${m.account.id} (ctid ${ctid}) — `
                 + `re-authorising it alone; ${hub.members.size - 1} other account(s) keep streaming`);
      hub.onAccountLost?.(m.account.id, why);
    }
    return;
  }

  if (msg.payloadType !== PT_EXECUTION_EVENT) return;      // heartbeats and everything else

  const ctid = Number(msg.payload?.ctidTraderAccountId ?? NaN);
  let member: Member | undefined;
  if (Number.isFinite(ctid)) {
    sawRouted++;
    member = hub.members.get(ctid);
  } else {
    sawUnrouted++;
    // NO ID ON THE EVENT. With one account on the socket this is unambiguous and is exactly what the
    // old code did. With several it would be a guess, and guessing writes a real trade into the
    // wrong person's journal — so it is refused and said out loud instead.
    if (hub.members.size === 1) member = hub.members.values().next().value;
    else {
      console.error(`[cTraderHub] execution event with no ctidTraderAccountId on a socket carrying ` +
                    `${hub.members.size} accounts — dropped rather than guessed. ` +
                    `Set CTRADER_ACCOUNTS_PER_CONN=1.`);
      return;
    }
  }
  if (member) onTrade(member, msg.payload);
}

/** Put one account on a socket. Throws so the caller can retry/refresh exactly as before. */
export async function attach(account: BrokerAccount, creds: any,
                             onTrade: OnTrade, onHubLost: OnHubLost,
                             onAccountLost?: OnAccountLost): Promise<void> {
  if (hubOf.has(account.id)) return;
  const ctid   = Number(creds.ctraderId);
  const isLive = account.accountType?.toLowerCase() !== 'demo';
  const hub    = await hubWithRoom(isLive ? LIVE_WS : DEMO_WS, creds.app, onTrade, onHubLost,
                                  onAccountLost);
  // An EXISTING socket was created with an earlier account’s callback; keep the latest so a member
  // added later is never left without one.
  if (onAccountLost) hub.onAccountLost = onAccountLost;

  // `hubWithRoom` RESERVED a slot on this socket, and the reservation is what stops three concurrent
  // accounts all being told an empty socket has room for them. It must be given back on BOTH paths: a
  // reservation that is never released is capacity this socket silently stops offering for ever.
  try {
    send(hub.ws, PT_ACCT_AUTH_REQ, { ctidTraderAccountId: ctid, accessToken: creds.accessToken });
    await waitFor(hub.ws, PT_ACCT_AUTH_RES);

    // Execution events carry a numeric symbolId, so each account needs the id->name map. Accounts on
    // the same broker return identical lists, so one copy is SHARED rather than held per account —
    // 3,000 separate maps is real memory for no benefit.
    send(hub.ws, PT_SYMBOLS_REQ, { ctidTraderAccountId: ctid });
    const symPayload = await waitFor(hub.ws, PT_SYMBOLS_RES, 30_000);
    const fresh: Record<number, string> = {};
    for (const s of (symPayload?.symbol ?? [])) if (s.symbolId && s.symbolName) fresh[s.symbolId] = s.symbolName;
    const symbolMap = shareSymbolMap(fresh);

    hub.members.set(ctid, { account, ctid, symbolMap });
    hubOf.set(account.id, hub);
  } finally {
    hub.pending = Math.max(0, hub.pending - 1);
  }
}

/** Take one account off its socket, and close the socket when it is the last one. */
export function detach(accountId: string): void {
  const hub = hubOf.get(accountId);
  if (!hub) return;
  hubOf.delete(accountId);
  hub.members.forEach((m, ctid) => { if (m.account.id === accountId) hub.members.delete(ctid); });
  if (hub.members.size === 0) {
    hub.closing = true;
    clearInterval(hub.hb);
    try { hub.ws.close(); } catch { /* noop */ }
  }
}

/**
 * Ask cTrader what positions it is holding for ONE account, on that account's existing feed socket.
 *
 * WHY ON THE FEED SOCKET and not a fresh connection: a fresh one would take a slot from the pool of 8
 * every five minutes, for every account — which is the cost this whole exercise is removing. The socket
 * is already open and already authorised for this account.
 *
 * ⚠ THE REPLY IS MATCHED ON THE ACCOUNT, not just the message type. With several accounts on one socket,
 * two asking at once would otherwise each take whichever reply came back first, and one account would be
 * told about the other's positions — which is exactly the class of mix-up the fill router exists to
 * prevent, reappearing one layer down.
 *
 * Returns the open position ids, or null when this account has no feed to ask on.
 */
export async function openPositionIds(accountId: string): Promise<string[] | null> {
  const hub = hubOf.get(accountId);
  if (!hub || hub.closing) return null;
  let ctid: number | undefined;
  hub.members.forEach((m, k) => { if (m.account.id === accountId) ctid = k; });
  if (ctid === undefined) return null;

  send(hub.ws, PT_RECONCILE_REQ, { ctidTraderAccountId: ctid });
  const payload = await waitFor(hub.ws, PT_RECONCILE_RES, 20_000,
                                (p) => Number(p?.ctidTraderAccountId) === ctid);
  const list = Array.isArray(payload?.position) ? payload.position : [];
  return list.map((p: any) => String(p?.positionId)).filter((id: string) => id && id !== 'undefined');
}

export function isAttached(accountId: string): boolean { return hubOf.has(accountId); }
export function attachedIds(): string[] { return [...hubOf.keys()]; }

// One copy of each distinct symbol map, keyed by its own content.
const symbolMapCache = new Map<string, Record<number, string>>();
function shareSymbolMap(m: Record<number, string>): Record<number, string> {
  const key = JSON.stringify(m);
  const hit = symbolMapCache.get(key);
  if (hit) return hit;
  symbolMapCache.set(key, m);
  return m;
}

/** Tests only. */
export function _resetForTests(): void {
  hubs.forEach(h => { clearInterval(h.hb); h.lease.release(); });
  hubs.length = 0;
  hubOf.clear();
  symbolMapCache.clear();
  sawRouted = 0; sawUnrouted = 0; reported = false;
}
export const _internals = { hubs, hubOf, route, hubKey, hasRoom, creating };
