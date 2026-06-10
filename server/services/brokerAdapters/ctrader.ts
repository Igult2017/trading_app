/**
 * cTrader Open API adapter (JSON over WebSocket, port 5036)
 * Auth: OAuth2 (authorization code flow via openapi.ctrader.com)
 * Requires: CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, CTRADER_REDIRECT_URI
 */
import WebSocket from 'ws';
import type { RawBrokerTrade } from '../brokerSyncService';

const CONNECT   = 'https://connect.spotware.com';
const TOKEN_URL = `${CONNECT}/apps/token`;

const LIVE_WS = 'wss://live.ctraderapi.com:5036';
const DEMO_WS = 'wss://demo.ctraderapi.com:5036';

// Open API JSON payload types
const PT_APP_AUTH_REQ   = 2100;
const PT_APP_AUTH_RES   = 2101;
const PT_ACCT_AUTH_REQ  = 2102;
const PT_ACCT_AUTH_RES  = 2103;
const PT_ACCOUNTS_REQ   = 2149;
const PT_ACCOUNTS_RES   = 2150;
const PT_DEALS_REQ      = 2254;
const PT_DEALS_RES      = 2255;
const PT_SYMBOLS_REQ    = 2110;
const PT_SYMBOLS_RES    = 2111;
const PT_ERROR          = 50;
const PT_OA_ERROR       = 2142;

// ── Helpers ───────────────────────────────────────────────────────────────────

function openWS(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => { ws.terminate(); reject(new Error(`WS connect timeout: ${url}`)); }, 10000);
    ws.once('open',  () => { clearTimeout(t); resolve(ws); });
    ws.once('error', (e) => { clearTimeout(t); reject(e); });
  });
}

function send(ws: WebSocket, payloadType: number, payload: object) {
  ws.send(JSON.stringify({ payloadType, payload }));
}

function waitFor(ws: WebSocket, targetType: number, timeoutMs = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for payloadType ${targetType}`)), timeoutMs);
    ws.on('message', function handler(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.payloadType === PT_ERROR || msg.payloadType === PT_OA_ERROR) {
        clearTimeout(t); ws.off('message', handler);
        reject(new Error(`cTrader error: ${msg.payload?.description ?? msg.payload?.errorCode ?? 'unknown'}`));
      } else if (msg.payloadType === targetType) {
        clearTimeout(t); ws.off('message', handler);
        resolve(msg.payload);
      }
    });
  });
}

async function appAuth(ws: WebSocket) {
  send(ws, PT_APP_AUTH_REQ, {
    clientId:     process.env.CTRADER_CLIENT_ID ?? '',
    clientSecret: process.env.CTRADER_CLIENT_SECRET ?? '',
  });
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

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
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
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken };
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
      liveResult.status === 'rejected' ? `live: ${(liveResult as any).reason?.message}` : null,
      demoResult.status === 'rejected' ? `demo: ${(demoResult as any).reason?.message}` : null,
    ].filter(Boolean).join('; ');
    throw new Error(`No cTrader accounts found (${reasons})`);
  }
  return accounts;
}

// ── Trade history (WebSocket) ─────────────────────────────────────────────────

export async function fetchCTraderTrades(
  accessToken: string,
  ctraderId:   string,
  fromMs:      number,
  toMs:        number,
): Promise<RawBrokerTrade[]> {
  const acctId = Number(ctraderId);
  const wsUrl  = (await isLiveAccount(accessToken, acctId)) ? LIVE_WS : DEMO_WS;

  const ws = await openWS(wsUrl);
  try {
    await appAuth(ws);

    send(ws, PT_ACCT_AUTH_REQ, { ctidTraderAccountId: acctId, accessToken });
    await waitFor(ws, PT_ACCT_AUTH_RES);

    // Fetch symbol list to map symbolId → name
    send(ws, PT_SYMBOLS_REQ, { ctidTraderAccountId: acctId });
    const symPayload = await waitFor(ws, PT_SYMBOLS_RES, 15000);
    const symbolMap: Record<number, string> = {};
    for (const s of (symPayload?.symbol ?? [])) {
      if (s.symbolId && s.symbolName) symbolMap[s.symbolId] = s.symbolName;
    }

    // Fetch deals in 10-day chunks (API limit)
    const CHUNK = 10 * 24 * 60 * 60 * 1000;
    const allDeals: any[] = [];
    for (let from = fromMs; from < toMs; from += CHUNK) {
      const to = Math.min(from + CHUNK, toMs);
      send(ws, PT_DEALS_REQ, { ctidTraderAccountId: acctId, fromTimestamp: from, toTimestamp: to });
      const dp = await waitFor(ws, PT_DEALS_RES, 15000);
      allDeals.push(...(dp?.deal ?? []));
    }

    return allDeals
      .filter((d: any) => d.dealStatus === 2 && d.closePositionDetail != null)
      .map((d: any): RawBrokerTrade => {
        const close = d.closePositionDetail;
        return {
          externalId: String(d.dealId),
          symbol:     symbolMap[d.symbolId] ?? String(d.symbolId),
          direction:  d.tradeSide === 1 ? 'Long' : 'Short',
          lots:       d.filledVolume  ? d.filledVolume / 10000000  : undefined,
          openPrice:  close?.entryPrice    ? close.entryPrice / 100000    : undefined,
          closePrice: d.executionPrice     ? d.executionPrice / 100000    : undefined,
          openTime:   close?.entryTimestamp ? String(Math.floor(close.entryTimestamp / 1000)) : undefined,
          closeTime:  d.executionTimestamp  ? String(Math.floor(d.executionTimestamp / 1000)) : undefined,
          profit:     close?.grossProfit    ? close.grossProfit / 100     : undefined,
          commission: d.commission          ? d.commission / 100          : undefined,
          swap:       close?.swap           ? close.swap / 100            : undefined,
          comment:    d.comment,
        };
      });
  } finally {
    ws.close();
  }
}

// Returns true if the given account ID is a live account
async function isLiveAccount(accessToken: string, acctId: number): Promise<boolean> {
  const accounts = await getCTraderAccounts(accessToken);
  const match = accounts.find(a => String(a.ctidTraderAccountId) === String(acctId));
  return match?.isLive ?? true;
}
