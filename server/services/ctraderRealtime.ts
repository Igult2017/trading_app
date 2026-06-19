/**
 * cTrader real-time trade recorder
 * ────────────────────────────────
 * Holds one persistent WebSocket per connected cTrader account and listens for
 * PROTO_OA_EXECUTION_EVENT. The instant a position closes, the deal is fed into
 * processIncomingTrades — the SAME pipeline as manual/connect sync, so it is
 * deduped (by externalId) and auto-journaled. That makes this safe to run
 * alongside the existing sync: a trade can never be recorded twice.
 *
 * Keep-alive: a heartbeat every 10s (cTrader drops idle sockets). Resilience:
 * reconnect with a fixed backoff on close/error, and a one-shot token refresh
 * if the access token has expired (account-auth error 2142).
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
import {
  LIVE_WS, DEMO_WS, openWS, send, waitFor, appAuth, mapClosedDeal,
  PT_ACCT_AUTH_REQ, PT_ACCT_AUTH_RES, PT_SYMBOLS_REQ, PT_SYMBOLS_RES,
  PT_EXECUTION_EVENT, PT_HEARTBEAT,
} from './brokerAdapters/ctrader';

interface Conn { ws: WebSocket; hb: NodeJS.Timeout; closing: boolean; }
const conns = new Map<string, Conn>();   // brokerAccountId → live connection
const HEARTBEAT_MS = 10_000;
const RECONNECT_MS = 15_000;

async function loadAccount(id: string): Promise<BrokerAccount | null> {
  const [a] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, id));
  return a ?? null;
}

function scheduleReconnect(id: string): void {
  setTimeout(() => { connect(id).catch(() => {}); }, RECONNECT_MS);
}

async function connect(id: string, attempt = 0): Promise<void> {
  if (conns.has(id)) return;                                  // already streaming
  const account = await loadAccount(id);
  if (!account || account.platform.toLowerCase() !== 'ctrader') return;
  if (account.connectionType !== 'api') return;

  let creds: any;
  try { creds = JSON.parse(safeDecrypt(account.passwordEnc) ?? '{}'); } catch { return; }
  if (!creds.accessToken || !creds.ctraderId) return;        // OAuth not finished yet

  const acctId = Number(creds.ctraderId);
  const isLive = account.accountType?.toLowerCase() !== 'demo';

  try {
    const ws = await openWS(isLive ? LIVE_WS : DEMO_WS);
    await appAuth(ws);
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
      if (!conn.closing) scheduleReconnect(id);
    });
  } catch (err: any) {
    const msg = String(err?.message ?? '');
    // Expired/invalid access token → refresh once, then retry immediately.
    if (attempt === 0 && /2142|token|auth/i.test(msg)) {
      const fresh = await refreshCTraderToken(account).catch(() => null);
      if (fresh) { await connect(id, 1); return; }
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

/** Boot hook — open a live feed for every connected cTrader account. */
export async function startCTraderRealtime(): Promise<void> {
  try {
    const all = await db.select().from(brokerAccounts).where(eq(brokerAccounts.connectionType, 'api'));
    const ctrader = all.filter(a => a.platform.toLowerCase() === 'ctrader');
    console.log(`[cTraderRT] starting live feeds for ${ctrader.length} cTrader account(s)`);
    for (const a of ctrader) connect(a.id).catch(() => {});
  } catch (e: any) {
    console.error(`[cTraderRT] startup failed: ${e.message}`);
  }
}

/** Start a feed for a freshly connected account (call right after OAuth completes). */
export function addCTraderAccount(id: string): void { connect(id).catch(() => {}); }

/** Stop and drop a feed (call on account disconnect/delete). */
export function removeCTraderAccount(id: string): void {
  const c = conns.get(id);
  if (!c) return;
  c.closing = true;
  clearInterval(c.hb);
  try { c.ws.close(); } catch { /* noop */ }
  conns.delete(id);
}
