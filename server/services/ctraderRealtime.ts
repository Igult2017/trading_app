/**
 * cTrader real-time trade recorder
 * ────────────────────────────────
 * One persistent WebSocket per connected cTrader account, listening for
 * PROTO_OA_EXECUTION_EVENT. The instant a position closes, the deal is fed into
 * processIncomingTrades — the SAME pipeline as manual/connect sync, so it's
 * deduped (by externalId) and auto-journaled. Safe beside the existing sync: a
 * trade can never be recorded twice.
 *
 * Push-only (no polling); the only periodic outbound message is a 10s heartbeat
 * keep-alive. Resilience: reconnect with backoff on drop, one-shot token refresh
 * on auth-expiry (2142), and a 60s reconcile that self-heals missed connects and
 * prunes deleted accounts. Feeds run on the PRIMARY worker only (cluster-safe).
 */
import WebSocket from 'ws';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { brokerAccounts } from '../../shared/schema';
import type { BrokerAccount } from '../../shared/schema';
import { safeDecrypt } from '../lib/crypto';
import { processIncomingTrades } from './brokerSyncService';
import { notificationService } from './notificationService';
import { refreshCTraderToken } from './autoSyncService';
import { acquire, logUtilisation, stats, type Lease } from './ctraderConnPool';
import {
  LIVE_WS, DEMO_WS, openWS, send, waitFor, appAuth, mapClosedDeal,
  PT_ACCT_AUTH_REQ, PT_ACCT_AUTH_RES, PT_SYMBOLS_REQ, PT_SYMBOLS_RES,
  PT_EXECUTION_EVENT, PT_HEARTBEAT,
} from './brokerAdapters/ctrader';

interface Conn { ws: WebSocket; hb: NodeJS.Timeout; closing: boolean; }
const conns = new Map<string, Conn>();   // brokerAccountId → live connection
const connecting = new Set<string>();    // ids mid-handshake (blocks double-connect)
const HEARTBEAT_MS = 10_000;
const RECONNECT_MS = 15_000;
const RECONCILE_MS = 60_000;
// Feeds live only on the primary worker (mirrors index.ts) so PM2 cluster mode
// can't open duplicate sockets; non-primary workers no-op and the primary's
// reconcile loop adopts any account they connect/delete within RECONCILE_MS.
const IS_PRIMARY = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';

async function loadAccount(id: string): Promise<BrokerAccount | null> {
  const [a] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, id));
  return a ?? null;
}

function scheduleReconnect(id: string): void {
  setTimeout(() => { connect(id).catch(() => {}); }, RECONNECT_MS);
}

/** Idempotent connect — guards against concurrent attempts for the same account. */
async function connect(id: string, attempt = 0): Promise<void> {
  if (conns.has(id) || connecting.has(id)) return;
  connecting.add(id);
  try { await openFeed(id, attempt); }
  finally { connecting.delete(id); }
}

async function openFeed(id: string, attempt: number): Promise<void> {
  const account = await loadAccount(id);
  if (!account || account.platform.toLowerCase() !== 'ctrader' || account.connectionType !== 'api') return;

  let creds: any;
  try { creds = JSON.parse(safeDecrypt(account.passwordEnc) ?? '{}'); } catch { return; }
  if (!creds.accessToken || !creds.ctraderId) return;        // OAuth not finished yet

  const acctId = Number(creds.ctraderId);
  const isLive = account.accountType?.toLowerCase() !== 'demo';

  // A FEED HOLDS ITS SLOT FOR AS LONG AS THE SOCKET LIVES, and outranks transient work in the pool:
  // cTrader is excluded from the 15-minute sync timer (`autoSyncService.ts:168`), so this feed is
  // the ONLY ongoing trade sync this user has. A backfill can wait; a feed that cannot open means
  // that user silently records nothing. The lease is released in exactly one place — the socket's
  // 'close' handler below — because a feed that leaks a slot strangles the pool one account at a
  // time, and the symptom (new feeds refused) looks nothing like the cause.
  let lease: Lease;
  try {
    lease = await acquire('feed', 'live-feed');
  } catch (err: any) {
    console.error(`[cTraderRT] no connection slot for account ${id}: ${err.message}`);
    scheduleReconnect(id);
    return;
  }

  try {
    const ws = await openWS(isLive ? LIVE_WS : DEMO_WS);
    await appAuth(ws, creds.app);       // the app that ISSUED this account's tokens
    send(ws, PT_ACCT_AUTH_REQ, { ctidTraderAccountId: acctId, accessToken: creds.accessToken });
    await waitFor(ws, PT_ACCT_AUTH_RES);

    // Execution events carry only a numeric symbolId → fetch the id→name map once.
    send(ws, PT_SYMBOLS_REQ, { ctidTraderAccountId: acctId });
    const symPayload = await waitFor(ws, PT_SYMBOLS_RES, 30000);
    const symbolMap: Record<number, string> = {};
    for (const s of (symPayload?.symbol ?? [])) if (s.symbolId && s.symbolName) symbolMap[s.symbolId] = s.symbolName;

    const hb = setInterval(() => { try { send(ws, PT_HEARTBEAT, {}); } catch { /* socket gone */ } }, HEARTBEAT_MS);
    const conn: Conn = { ws, hb, closing: false };
    conns.set(id, conn);
    console.log(`[cTraderRT] live feed connected — account ${id} (ctid ${creds.ctraderId})`);

    ws.on('message', (raw) => { onExecution(account, symbolMap, raw).catch(() => {}); });
    ws.on('error', () => { try { ws.close(); } catch { /* noop */ } });
    ws.on('close', () => {
      clearInterval(hb);
      conns.delete(id);
      lease.release();                 // the slot goes back the moment the socket does
      if (!conn.closing) scheduleReconnect(id);
    });
  } catch (err: any) {
    // RELEASED FIRST, before anything that might open another socket. The token-refresh retry below
    // calls openFeed again, which acquires its own lease — without this the failed attempt's slot
    // would still be held and a token-refresh loop would eat the pool one retry at a time.
    // `release` is idempotent, and the 'close' handler above cannot have been attached on this path.
    lease.release();
    const msg = String(err?.message ?? '');
    if (attempt === 0 && /2142|token|auth/i.test(msg)) {       // expired token → refresh once
      const fresh = await refreshCTraderToken(account).catch(() => null);
      if (fresh) { await openFeed(id, 1); return; }
    }
    scheduleReconnect(id);
  }
}

async function onExecution(account: BrokerAccount, symbolMap: Record<number, string>, raw: WebSocket.RawData): Promise<void> {
  let msg: any;
  try { msg = JSON.parse(raw.toString()); } catch { return; }
  if (msg.payloadType !== PT_EXECUTION_EVENT) return;        // ignore heartbeats/other events

  const trade = msg.payload?.deal ? mapClosedDeal(msg.payload.deal, symbolMap) : null;
  if (!trade) return;                                         // opening fill, not a realised close

  try {
    const { created } = await processIncomingTrades(account.id, account.userId, [trade]);
    if (created > 0) {
      console.log(`[cTraderRT] recorded live trade ${trade.externalId} ${trade.symbol} (acct ${account.id})`);
      await notificationService.createNotification({
        userId:  account.userId,
        type:    'trade_synced',
        title:   'Trade recorded',
        message: `${trade.direction} ${trade.symbol} closed @ ${trade.closePrice ?? '—'} · P/L ${trade.profit ?? 0}`,
      }).catch(() => {});
    }
  } catch (e: any) {
    console.error(`[cTraderRT] record failed (acct ${account.id}): ${e.message}`);
  }
}

/** Connect newly-added cTrader accounts and drop feeds whose account was deleted. */
async function reconcile(): Promise<void> {
  const all = await db.select().from(brokerAccounts).where(eq(brokerAccounts.connectionType, 'api'));
  const wanted = new Set(all.filter(a => a.platform.toLowerCase() === 'ctrader').map(a => a.id));
  wanted.forEach(id => { if (!conns.has(id)) connect(id).catch(() => {}); });
  const stale: string[] = [];
  conns.forEach((_c, id) => { if (!wanted.has(id)) stale.push(id); });
  stale.forEach(id => removeCTraderAccount(id));
}

/** Boot hook (primary worker only) — open all feeds, then keep them reconciled. */
export async function startCTraderRealtime(): Promise<void> {
  if (!IS_PRIMARY) return;
  try {
    await reconcile();
    // ACCOUNTS AND CONNECTIONS ARE REPORTED SEPARATELY. They are the same number today — one socket
    // per account — and the whole point of the pooling work is that they stop being. A log line that
    // conflates them cannot show the change working.
    const s = stats();
    console.log(`[cTraderRT] live feeds active for ${conns.size} cTrader account(s) — ` +
                `${s.held}/${s.max} pooled connections in use`);
    setInterval(() => { reconcile().catch(() => {}); }, RECONCILE_MS);
    setInterval(logUtilisation, 60_000);
  } catch (e: any) {
    console.error(`[cTraderRT] startup failed: ${e.message}`);
  }
}

/** Start a feed for a freshly connected account (call right after OAuth completes). */
export function addCTraderAccount(id: string): void { if (IS_PRIMARY) connect(id).catch(() => {}); }

/** Stop and drop a feed (call on account disconnect/delete). */
export function removeCTraderAccount(id: string): void {
  const c = conns.get(id);
  if (!c) return;
  c.closing = true;
  clearInterval(c.hb);
  try { c.ws.close(); } catch { /* noop */ }
  conns.delete(id);
}
