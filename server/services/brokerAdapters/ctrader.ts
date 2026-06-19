/**
 * cTrader Open API adapter (JSON over WebSocket, port 5036)
 * Auth: OAuth2 (authorization code flow via connect.spotware.com)
 * Requires: CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, CTRADER_REDIRECT_URI
 *
 * Payload types sourced from:
 * github.com/spotware/openapi-proto-messages/OpenApiModelMessages.proto
 */
import WebSocket from 'ws';
import type { RawBrokerTrade } from '../brokerSyncService';

const CONNECT   = 'https://connect.spotware.com';
const TOKEN_URL = `${CONNECT}/apps/token`;

export const LIVE_WS = 'wss://live.ctraderapi.com:5036';
export const DEMO_WS = 'wss://demo.ctraderapi.com:5036';

// Verified payload types from openapi-proto-messages
const PT_APP_AUTH_REQ  = 2100;
const PT_APP_AUTH_RES  = 2101;
export const PT_ACCT_AUTH_REQ = 2102;
export const PT_ACCT_AUTH_RES = 2103;
export const PT_SYMBOLS_REQ   = 2114;
export const PT_SYMBOLS_RES   = 2115;
const PT_DEALS_REQ     = 2133;
const PT_DEALS_RES     = 2134;
const PT_TRADER_REQ    = 2121;   // PROTO_OA_TRADER_REQ  (2120 is SYMBOL_CHANGED_EVENT — wrong)
const PT_TRADER_RES    = 2122;   // PROTO_OA_TRADER_RES
const PT_ACCOUNTS_REQ  = 2149;
const PT_ACCOUNTS_RES  = 2150;
export const PT_OA_ERROR        = 2142;
export const PT_EXECUTION_EVENT = 2126;  // PROTO_OA_EXECUTION_EVENT — real-time fills
export const PT_HEARTBEAT       = 51;    // ProtoHeartbeatEvent — keep-alive, send every ~10s

// ── Helpers ───────────────────────────────────────────────────────────────────

export function openWS(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => { ws.terminate(); reject(new Error(`WS connect timeout: ${url}`)); }, 12000);
    ws.once('open',  () => { clearTimeout(t); resolve(ws); });
    ws.once('error', (e) => { clearTimeout(t); reject(e); });
  });
}

export function send(ws: WebSocket, payloadType: number, payload: object) {
  ws.send(JSON.stringify({ payloadType, payload }));
}

export function waitFor(ws: WebSocket, targetType: number, timeoutMs = 20000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`cTrader timeout waiting for type ${targetType}`)), timeoutMs);
    ws.on('message', function handler(raw) {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.payloadType === PT_OA_ERROR) {
        const desc = String(msg.payload?.description ?? msg.payload?.errorCode ?? 'unknown error');
        // Ignore errors about unsolicited server-push events (e.g. SymbolChangedEvent) —
        // these are not responses to our request; keep waiting for the actual reply.
        if (desc.includes('Event') || desc.toLowerCase().includes('not supported')) return;
        clearTimeout(t); ws.off('message', handler);
        reject(new Error(`cTrader: ${desc}`));
      } else if (msg.payloadType === targetType) {
        clearTimeout(t); ws.off('message', handler);
        resolve(msg.payload ?? {});
      }
    });
  });
}

export async function appAuth(ws: WebSocket) {
  const clientId     = process.env.CTRADER_CLIENT_ID;
  const clientSecret = process.env.CTRADER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('CTRADER_CLIENT_ID or CTRADER_CLIENT_SECRET is not configured');
  send(ws, PT_APP_AUTH_REQ, { clientId, clientSecret });
  await waitFor(ws, PT_APP_AUTH_RES);
}

// ── OAuth2 ────────────────────────────────────────────────────────────────────

export function getCTraderAuthUrl(state: string): string {
  const clientId    = process.env.CTRADER_CLIENT_ID ?? '';
  const redirectUri = process.env.CTRADER_REDIRECT_URI ?? '';
  if (!clientId) throw new Error('CTRADER_CLIENT_ID is not set');
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: 'trading', response_type: 'code', state });
  return `${CONNECT}/apps/auth?${params}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  process.env.CTRADER_REDIRECT_URI ?? '',
      client_id:     process.env.CTRADER_CLIENT_ID ?? '',
      client_secret: process.env.CTRADER_CLIENT_SECRET ?? '',
    }),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error_description ?? `cTrader token error: ${res.status}`);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in ?? 3600 };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     process.env.CTRADER_CLIENT_ID ?? '',
      client_secret: process.env.CTRADER_CLIENT_SECRET ?? '',
    }),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error_description ?? `cTrader refresh error: ${res.status}`);
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken, expiresIn: data.expires_in ?? 3600 };
}

// ── Account list (WebSocket) ───────────────────────────────────────────────────

export interface CTraderAccount {
  ctidTraderAccountId: string;
  brokerName:  string;
  traderLogin: string;
  isLive:      boolean;
  balance:     number;
  currency:    string;
}

async function fetchAccountsFromEndpoint(wsUrl: string, accessToken: string): Promise<CTraderAccount[]> {
  const ws = await openWS(wsUrl);
  try {
    await appAuth(ws);
    send(ws, PT_ACCOUNTS_REQ, { accessToken });
    const payload = await waitFor(ws, PT_ACCOUNTS_RES);
    return (payload?.ctidTraderAccount ?? []).map((a: any): CTraderAccount => ({
      ctidTraderAccountId: String(a.ctidTraderAccountId),
      brokerName:          a.brokerName ?? '',
      traderLogin:         String(a.traderLogin ?? ''),
      isLive:              a.isLive ?? false,
      balance:             (a.balance ?? 0) / 100,
      currency:            a.depositCurrency ?? '',
    }));
  } finally {
    ws.close();
  }
}

export async function getCTraderAccounts(accessToken: string): Promise<CTraderAccount[]> {
  const [liveResult, demoResult] = await Promise.allSettled([
    fetchAccountsFromEndpoint(LIVE_WS, accessToken),
    fetchAccountsFromEndpoint(DEMO_WS, accessToken),
  ]);
  const accounts: CTraderAccount[] = [
    ...(liveResult.status === 'fulfilled' ? liveResult.value : []),
    ...(demoResult.status === 'fulfilled' ? demoResult.value : []),
  ];
  if (accounts.length === 0) {
    const reasons = [
      liveResult.status === 'rejected'  ? `live: ${(liveResult  as any).reason?.message}` : null,
      demoResult.status === 'rejected'  ? `demo: ${(demoResult  as any).reason?.message}` : null,
    ].filter(Boolean).join('; ');
    throw new Error(`No cTrader accounts found (${reasons})`);
  }
  return accounts;
}

// ── Account balance (single WS fetch) ────────────────────────────────────────

export async function fetchCTraderBalance(
  accessToken: string,
  ctraderId:   string,
  isLive:      boolean = false,
): Promise<{ balance: number; currency: string } | null> {
  const acctId = Number(ctraderId);
  const ws = await openWS(isLive ? LIVE_WS : DEMO_WS);
  try {
    await appAuth(ws);
    send(ws, PT_ACCT_AUTH_REQ, { ctidTraderAccountId: acctId, accessToken });
    await waitFor(ws, PT_ACCT_AUTH_RES);
    send(ws, PT_TRADER_REQ, { ctidTraderAccountId: acctId });
    const t = await waitFor(ws, PT_TRADER_RES, 10000);
    console.log(`[cTrader] PT_TRADER_RES raw for ${ctraderId}:`, JSON.stringify(t));
    // PT_TRADER_RES payload may have balance nested under `trader` or flat — handle both
    const trader = t?.trader ?? t;
    const rawBalance = trader?.balance ?? 0;
    // cTrader scales `balance` by moneyDigits (raw / 10^moneyDigits), NOT a fixed
    // /100. DEMO accounts often report moneyDigits=0, so the old /100 collapsed
    // their balance toward $0. Default to 2 (the common live case) when absent.
    const moneyDigits = trader?.moneyDigits ?? 2;
    const balance = rawBalance / Math.pow(10, moneyDigits);
    const currency   = trader?.depositCurrency ?? '';
    console.log(`[cTrader] PT_TRADER_RES for ${ctraderId}: rawBalance=${rawBalance} moneyDigits=${moneyDigits} -> ${balance} currency=${currency}`);
    return { balance, currency };
  } catch (err: any) {
    console.error(`[cTrader] fetchCTraderBalance failed for account ${ctraderId}: ${err.message}`);
    return null;
  } finally { ws.close(); }
}

// ── Deal pagination helper ────────────────────────────────────────────────────

// If a range returns exactly maxRows, the API may have truncated it. Split the
// range in half and recurse so we never silently lose closed deals.
async function fetchDealsInRange(ws: WebSocket, acctId: number, from: number, to: number): Promise<any[]> {
  const maxRows = 500;
  send(ws, PT_DEALS_REQ, { ctidTraderAccountId: acctId, fromTimestamp: from, toTimestamp: to, maxRows });
  const dp    = await waitFor(ws, PT_DEALS_RES, 20000);
  const deals = dp?.deal ?? [];
  if (deals.length < maxRows || from + 1 >= to) return deals;
  const mid   = Math.floor((from + to) / 2);
  const left  = await fetchDealsInRange(ws, acctId, from, mid);
  await new Promise(r => setTimeout(r, 250)); // pause between recursive splits
  const right = await fetchDealsInRange(ws, acctId, mid, to);
  return [...left, ...right];
}

// ── Deal → trade mapping (shared by history sync + realtime feed) ─────────────

/**
 * Map a FILLED, position-closing cTrader deal to a RawBrokerTrade.
 * Returns null when the deal isn't a realised close (e.g. an opening fill), so
 * callers can `.filter(Boolean)`. Used by both the history fetch and the live
 * execution-event feed so the two stay byte-for-byte consistent.
 */
export function mapClosedDeal(d: any, symbolMap: Record<number, string>): RawBrokerTrade | null {
  if (!d || d.dealStatus !== 2 || d.closePositionDetail == null) return null;
  const close = d.closePositionDetail;
  return {
    externalId: String(d.dealId),
    symbol:     symbolMap[d.symbolId] ?? String(d.symbolId),
    direction:  d.tradeSide === 1 ? 'Long' : 'Short',
    lots:       d.filledVolume        ? d.filledVolume / 100           : undefined,
    openPrice:  close?.entryPrice     != null ? close.entryPrice       : undefined,
    closePrice: d.executionPrice      != null ? d.executionPrice       : undefined,
    openTime:   close?.entryTimestamp ? String(Math.floor(close.entryTimestamp / 1000)) : undefined,
    closeTime:  d.executionTimestamp  ? String(Math.floor(d.executionTimestamp  / 1000)) : undefined,
    profit:     close?.grossProfit    != null ? close.grossProfit / 100 : undefined,
    commission: d.commission          != null ? d.commission / 100      : undefined,
    swap:       close?.swap           != null ? close.swap / 100        : undefined,
    comment:    d.comment,
  };
}

// ── Trade history (WebSocket) ─────────────────────────────────────────────────

// isLive is passed from the stored accountType — avoids redundant WS connections on every sync chunk
export async function fetchCTraderTrades(
  accessToken: string,
  ctraderId:   string,
  fromMs:      number,
  toMs:        number,
  isLive:      boolean = false,
): Promise<RawBrokerTrade[]> {
  const acctId = Number(ctraderId);
  const wsUrl  = isLive ? LIVE_WS : DEMO_WS;

  const ws = await openWS(wsUrl);
  try {
    await appAuth(ws);

    send(ws, PT_ACCT_AUTH_REQ, { ctidTraderAccountId: acctId, accessToken });
    await waitFor(ws, PT_ACCT_AUTH_RES);

    // Build symbolId → name map
    send(ws, PT_SYMBOLS_REQ, { ctidTraderAccountId: acctId });
    const symPayload = await waitFor(ws, PT_SYMBOLS_RES, 30000);
    const symbolMap: Record<number, string> = {};
    for (const s of (symPayload?.symbol ?? [])) {
      if (s.symbolId && s.symbolName) symbolMap[s.symbolId] = s.symbolName;
    }

    // Fetch deals in 7-day chunks; 250ms pause between chunks prevents rate limiting
    const CHUNK_MS  = 7 * 24 * 60 * 60 * 1000;
    const CHUNK_GAP = 250; // ms — cTrader rate-limits ~100+ rapid requests on one WS
    const allDeals: any[] = [];
    let firstChunk = true;
    for (let from = fromMs; from < toMs; from += CHUNK_MS) {
      if (!firstChunk) await new Promise(r => setTimeout(r, CHUNK_GAP));
      firstChunk = false;
      const to = Math.min(from + CHUNK_MS, toMs);
      allDeals.push(...await fetchDealsInRange(ws, acctId, from, to));
    }

    return allDeals
      .map((d: any) => mapClosedDeal(d, symbolMap))
      .filter((t): t is RawBrokerTrade => t !== null);
  } finally {
    ws.close();
  }
}
