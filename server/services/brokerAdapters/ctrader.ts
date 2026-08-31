/**
 * cTrader Open API adapter (JSON over WebSocket, port 5036)
 * Auth: OAuth2 (authorization code flow via connect.spotware.com)
 * Requires: CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, CTRADER_REDIRECT_URI
 * Optional: CTRADER_SYNC_CLIENT_ID, CTRADER_SYNC_CLIENT_SECRET (the "Journal Trade Sync" app)
 *
 * TWO cTrader applications share the workload (Spotware rate-limits PER APPLICATION):
 *   legacy — the original app: the signal platform's candle feed + every account connected
 *            before the split. Its quota must never be consumed by user account syncs again
 *            (a single first-connect 2-year backfill is ~100 history requests, and a user
 *            token-refresh storm on /apps/token once 429'd the scanner).
 *   sync   — the "Journal Trade Sync" app: ALL NEW account connects, their history pulls,
 *            balance fetches, realtime feeds and token refreshes.
 * Tokens are BOUND to the app that issued them, so every stored credential JSON records its
 * issuer (`app: "sync"`; absent = legacy) and refresh/appAuth MUST use that same app's
 * credentials — using the other app's yields invalid_client.
 *
 * Payload types sourced from:
 * github.com/spotware/openapi-proto-messages/OpenApiModelMessages.proto
 */
import WebSocket from 'ws';
import type { RawBrokerTrade } from '../brokerSyncService';
import { acquire, withConnection } from '../ctraderConnPool';

const CONNECT   = 'https://connect.spotware.com';
const TOKEN_URL = `${CONNECT}/apps/token`;

// ── App credential pairs ──────────────────────────────────────────────────────

export function appCreds(app?: string): { clientId: string; clientSecret: string } {
  if (app === 'sync' && process.env.CTRADER_SYNC_CLIENT_ID && process.env.CTRADER_SYNC_CLIENT_SECRET) {
    return { clientId: process.env.CTRADER_SYNC_CLIENT_ID, clientSecret: process.env.CTRADER_SYNC_CLIENT_SECRET };
  }
  return { clientId: process.env.CTRADER_CLIENT_ID ?? '', clientSecret: process.env.CTRADER_CLIENT_SECRET ?? '' };
}

/**
 * Which cTrader app NEW account connects are issued under.
 *
 * BEING CONFIGURED IS NOT THE SAME AS BEING APPROVED, and treating them as the same broke account
 * connection for every user. This returned `'sync'` whenever the sync app's id and secret were
 * merely PRESENT — and they have been present in production since the split, while Spotware has
 * never approved that app. So the sign-in page was built with an unapproved client id and
 * connect.spotware.com answered **404 NOT FOUND**. Nobody could add an account at all.
 *
 * The comment above this function already warned that the credentials fail while approval is
 * pending, and told whoever read it to "deploy the cutover only once the portal shows the app
 * Active" — but nothing enforced that, and setting the variables WAS the cutover.
 *
 * So approval is now stated explicitly and separately. `CTRADER_SYNC_APP_APPROVED=true` is the
 * switch, and until it is set every new connect goes to the legacy app, which is the approved one.
 * When Spotware does approve it, that is one environment variable and no code change.
 *
 * THE READ PATH IS DELIBERATELY UNTOUCHED. `appCreds` still honours `app: "sync"` on accounts
 * already connected under it, so this changes what NEW connects use and nothing else. Unsetting
 * the sync credentials — the other obvious fix — would have silently changed the read path too,
 * because `appCreds` falls back to the legacy pair when they are absent.
 */
export function newConnectApp(): 'sync' | 'legacy' {
  const approved = String(process.env.CTRADER_SYNC_APP_APPROVED ?? '').trim().toLowerCase() === 'true';
  return approved && process.env.CTRADER_SYNC_CLIENT_ID && process.env.CTRADER_SYNC_CLIENT_SECRET
    ? 'sync' : 'legacy';
}

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

export async function appAuth(ws: WebSocket, app?: string) {
  const { clientId, clientSecret } = appCreds(app);
  if (!clientId || !clientSecret) throw new Error('CTRADER_CLIENT_ID or CTRADER_CLIENT_SECRET is not configured');
  send(ws, PT_APP_AUTH_REQ, { clientId, clientSecret });
  await waitFor(ws, PT_APP_AUTH_RES);
}

// ── OAuth2 ────────────────────────────────────────────────────────────────────

export function getCTraderAuthUrl(state: string, app?: string): string {
  const { clientId } = appCreds(app ?? newConnectApp());
  const redirectUri = process.env.CTRADER_REDIRECT_URI ?? '';
  if (!clientId) throw new Error('CTRADER_CLIENT_ID is not set');
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: 'trading', response_type: 'code', state });
  return `${CONNECT}/apps/auth?${params}`;
}

export async function exchangeCodeForTokens(code: string, app?: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const { clientId, clientSecret } = appCreds(app ?? newConnectApp());
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  process.env.CTRADER_REDIRECT_URI ?? '',
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error_description ?? `cTrader token error: ${res.status}`);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in ?? 3600 };
}

export async function refreshAccessToken(refreshToken: string, app?: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const { clientId, clientSecret } = appCreds(app);
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
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

async function fetchAccountsFromEndpoint(wsUrl: string, accessToken: string, app?: string): Promise<CTraderAccount[]> {
  // A LEASE FROM THE POOL BEFORE THE SOCKET. Everything Node opens is counted, so a burst of
  // add-account clicks can never use up the app's connections and leave the signal platform unable
  // to reconnect. See ctraderConnPool.
  return withConnection('task', 'accounts-list', () => fetchAccountsOnce(wsUrl, accessToken, app));
}

async function fetchAccountsOnce(wsUrl: string, accessToken: string, app?: string): Promise<CTraderAccount[]> {
  const ws = await openWS(wsUrl);
  try {
    await appAuth(ws, app);
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

export async function getCTraderAccounts(accessToken: string, app?: string): Promise<CTraderAccount[]> {
  const [liveResult, demoResult] = await Promise.allSettled([
    fetchAccountsFromEndpoint(LIVE_WS, accessToken, app),
    fetchAccountsFromEndpoint(DEMO_WS, accessToken, app),
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
  app?:        string,
): Promise<{ balance: number; currency: string } | null> {
  const acctId = Number(ctraderId);
  // Counted against Node's connection budget like everything else — see ctraderConnPool.
  const lease = await acquire('task', 'balance');
  const ws = await openWS(isLive ? LIVE_WS : DEMO_WS).catch((e) => { lease.release(); throw e; });
  try {
    await appAuth(ws, app);
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
  } finally { ws.close(); lease.release(); }
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
    // THE BROKER'S OWN MILLISECONDS, passed through untouched. This used to divide by 1000 and
    // stringify — `String(Math.floor(ms / 1000))` — which produced a numeric string of seconds.
    // `toDate` then read it as a DATE string, got an Invalid Date, and every sync of this account
    // died with `RangeError: Invalid time value`. Converting units here and again there is how the
    // two halves disagreed; the adapter now reports what the broker said and `toDate` owns the unit.
    openTime:   close?.entryTimestamp ?? undefined,
    closeTime:  d.executionTimestamp  ?? undefined,
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
  app?:        string,
): Promise<RawBrokerTrade[]> {
  const acctId = Number(ctraderId);
  const wsUrl  = isLive ? LIVE_WS : DEMO_WS;

  // THE LONGEST-RUNNING TASK IN NODE holds a slot for its whole duration: a first sync backfills
  // 730 days in 7-day chunks 250ms apart, so ~105 requests and ~26 seconds on one connection. Ten
  // simultaneous signups is ten connections for half a minute — which is exactly the burst that
  // could have left the signal platform unable to reconnect. It queues now instead.
  const lease = await acquire('task', 'trade-sync');
  const ws = await openWS(wsUrl).catch((e) => { lease.release(); throw e; });
  try {
    await appAuth(ws, app);

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
    lease.release();
  }
}
