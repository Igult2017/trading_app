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
  PT_EXECUTION_EVENT, PT_HEARTBEAT,
} from './brokerAdapters/ctrader';

const HEARTBEAT_MS = 10_000;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(process.env[name] ?? ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Accounts per socket. 1 = exactly today's behaviour. Raise only once routing is proven — above. */
export const ACCOUNTS_PER_CONN = envInt('CTRADER_ACCOUNTS_PER_CONN', 1, 1, 200);

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
}

type OnTrade = (member: Member, payload: any) => void;
type OnHubLost = (accountIds: string[]) => void;

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

export function logRoutingEvidence(): void {
  if (reported || sawRouted + sawUnrouted === 0) return;
  reported = true;
  if (sawUnrouted === 0) {
    console.log(`[cTraderHub] execution events DO carry ctidTraderAccountId (${sawRouted} seen) — ` +
                `CTRADER_ACCOUNTS_PER_CONN can safely be raised above ${ACCOUNTS_PER_CONN}`);
  } else {
    console.warn(`[cTraderHub] ${sawUnrouted} execution event(s) arrived WITHOUT ctidTraderAccountId ` +
                 `— do NOT raise CTRADER_ACCOUNTS_PER_CONN above 1; routing would be a guess`);
  }
}

function hubKey(host: string, app: string | undefined): string {
  return `${host}|${app ?? 'legacy'}`;
}

/** A hub for this host+app with room, or a new one. */
async function hubWithRoom(host: string, app: string | undefined,
                           onTrade: OnTrade, onHubLost: OnHubLost): Promise<Hub> {
  const key = hubKey(host, app);
  const existing = hubs.find(h => h.key === key && !h.closing && h.members.size < ACCOUNTS_PER_CONN);
  if (existing) return existing;

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
    ws, lease, key, closing: false, members: new Map(),
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
                             onTrade: OnTrade, onHubLost: OnHubLost): Promise<void> {
  if (hubOf.has(account.id)) return;
  const ctid   = Number(creds.ctraderId);
  const isLive = account.accountType?.toLowerCase() !== 'demo';
  const hub    = await hubWithRoom(isLive ? LIVE_WS : DEMO_WS, creds.app, onTrade, onHubLost);

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
export const _internals = { hubs, hubOf, route, hubKey };
