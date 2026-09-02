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
/** FILLED, whichever way the gateway spells it.
 *
 * The protobuf enum is the integer 2; the JSON gateway serialises enum VALUES BY NAME, so the same
 * deal arrives as `"FILLED"`. `mapClosedDeal` tested `!== 2` only, so every real deal failed the very
 * first check and returned null — silently, because a null there means "an opening fill, ignore it".
 * Verified against the live Pepperstone demo account on 2026-09-02: all 30 deals in a 14-day window
 * carried `dealStatus: "FILLED"`, and NONE carried `closePositionDetail`.
 */
function isFilled(d: any): boolean {
  const s = d?.dealStatus;
  return s === 2 || s === '2' || String(s).toUpperCase() === 'FILLED';
}

/** Deals whose position is USD-quoted, so (close − entry) × units IS the P&L in account currency. */
function usdQuoted(symbol: string): boolean {
  return /USD$/i.test(symbol.replace(/[^A-Za-z]/g, ''));
}

/** Money fields are integers scaled by `moneyDigits`, which the broker states per record.
 *
 * It defaults to 2 — hundredths, the near-universal case — but it is stated for a reason and an
 * account whose currency scales differently would have every commission and swap out by a factor of
 * ten or a hundred if the divisor were hardcoded. `ProtoOADeal` and `ProtoOAPosition` both carry it.
 */
function money(raw: unknown, digits: unknown): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const d = Number(digits);
  return n / Math.pow(10, Number.isFinite(d) && d >= 0 ? d : 2);
}

/** Units of the base asset in one lot.
 *
 * NOT A GUESS AND NOT UNIVERSAL: a currency lot is 100,000 units, a metals lot is 100 ounces. The
 * broker states this per symbol (`ProtoOASymbol.lotSize`) but the symbol list this adapter fetches
 * (`ProtoOALightSymbol`) does not carry it — the same gap that made autotrade size gold 1,000x too
 * large. Only `lots` on the journal row depends on this here; prices, times and P&L do not.
 */
function lotUnits(symbol: string): number {
  return /^(XAU|XAG|XPT|XPD)/i.test(symbol.replace(/[^A-Za-z]/g, '')) ? 100 : 100_000;
}

/**
 * Pair a position's deals into ONE closed trade — the path that actually works on this gateway.
 *
 * WHY THIS EXISTS. `mapClosedDeal` needs `closePositionDetail` for the entry price, the gross profit
 * and the swap. The broker does not send it here: 0 of 30 real deals carried it, including six that
 * genuinely closed a position. So the only way to know a deal closed something is to look at the
 * position's deals together — the first opens it, a later one on the opposite side closes it.
 *
 * Everything used below is a field VERIFIED present on the real payload: dealId, positionId,
 * symbolId, tradeSide, filledVolume, executionPrice, executionTimestamp, dealStatus, commission.
 *
 * P&L IS ONLY COMPUTED WHEN IT CAN BE COMPUTED HONESTLY. `volume` is in cents of the base unit, so
 * units = filledVolume / 100 and profit = (close − entry) × units in the QUOTE currency. That is the
 * account currency only for a USD-quoted symbol. For anything else the trade is still recorded — with
 * its prices, times and size — and the profit is left undefined rather than reported wrongly.
 */
export function pairDealsIntoTrades(deals: any[], symbolMap: Record<number, string>): RawBrokerTrade[] {
  const byPosition = new Map<string, any[]>();
  for (const d of deals ?? []) {
    if (!isFilled(d) || d?.positionId == null) continue;
    const k = String(d.positionId);
    const list = byPosition.get(k);
    if (list) list.push(d); else byPosition.set(k, [d]);
  }
  const out: RawBrokerTrade[] = [];
  for (const [, group] of byPosition) {
    if (group.length < 2) continue;                       // still open — nothing realised yet
    group.sort((a, b) => Number(a.executionTimestamp ?? 0) - Number(b.executionTimestamp ?? 0));
    const open = group[0];
    const shut = group[group.length - 1];
    const side = String(open.tradeSide ?? '').toUpperCase();
    const long = side === 'BUY' || open.tradeSide === 1;
    const symbol = symbolMap[open.symbolId] ?? String(open.symbolId);
    const units = Number(shut.filledVolume ?? shut.volume ?? 0) / 100;
    const entry = Number(open.executionPrice);
    const exit  = Number(shut.executionPrice);
    const comm  = (money(open.commission, open.moneyDigits) ?? 0)
                + (money(shut.commission, shut.moneyDigits) ?? 0);
    const profit = (Number.isFinite(entry) && Number.isFinite(exit) && units > 0 && usdQuoted(symbol))
      ? Math.round(((long ? exit - entry : entry - exit) * units) * 100) / 100
      : undefined;
    out.push({
      // KEYED ON THE CLOSING DEAL, so the de-duplication in processIncomingTrades still holds: one
      // closed position produces exactly one externalId, stable across syncs.
      externalId: String(shut.dealId),
      symbol,
      direction:  long ? 'Long' : 'Short',
      lots:       units > 0 ? units / lotUnits(symbol) : undefined,
      openPrice:  Number.isFinite(entry) ? entry : undefined,
      closePrice: Number.isFinite(exit) ? exit : undefined,
      openTime:   open.executionTimestamp ?? undefined,
      closeTime:  shut.executionTimestamp ?? undefined,
      profit,
      commission: comm || undefined,
      swap:       undefined,
      comment:    shut.comment,
    });
  }
  return out;
}

/**
 * One LIVE execution event -> a closed trade, using the position the event already carries.
 *
 * `ProtoOAExecutionEvent` carries `deal` AND `position`; the realtime feed read only the deal and
 * then required `closePositionDetail`, which this gateway does not send. So every live close mapped
 * to null. The position gives what the missing detail would have: `price` is the entry, `swap` and
 * `commission` are the position's own, and `positionStatus` says whether it is finished.
 *
 * CONSERVATIVE BY DESIGN: if the event does not clearly describe a CLOSE, this returns null and the
 * 15-minute sync still catches the trade through `pairDealsIntoTrades`. Recording an opening fill as
 * a closed trade would put a fictional row in his journal, which is worse than recording it late.
 */
export function mapClosedFromEvent(ev: any, symbolMap: Record<number, string>): RawBrokerTrade | null {
  const d = ev?.deal, p = ev?.position;
  if (!d || !p || !isFilled(d)) return null;
  const status = String(p.positionStatus ?? '').toUpperCase();
  const posSide = String(p.tradeData?.tradeSide ?? p.tradeSide ?? '').toUpperCase();
  const dealSide = String(d.tradeSide ?? '').toUpperCase();
  const closedByStatus = status.includes('CLOSED');
  const closedBySide = !!posSide && !!dealSide && posSide !== dealSide;
  if (!closedByStatus && !closedBySide) return null;          // an opening fill

  const symbol = symbolMap[d.symbolId] ?? String(d.symbolId);
  const long = posSide === 'BUY' || p.tradeData?.tradeSide === 1;
  const units = Number(d.filledVolume ?? d.volume ?? 0) / 100;
  const entry = Number(p.price);
  const exit = Number(d.executionPrice);
  const profit = (Number.isFinite(entry) && Number.isFinite(exit) && units > 0 && usdQuoted(symbol))
    ? Math.round(((long ? exit - entry : entry - exit) * units) * 100) / 100
    : undefined;
  return {
    externalId: String(d.dealId),
    symbol,
    direction: long ? 'Long' : 'Short',
    lots: units > 0 ? units / lotUnits(symbol) : undefined,
    openPrice: Number.isFinite(entry) ? entry : undefined,
    closePrice: Number.isFinite(exit) ? exit : undefined,
    // THE POSITION CARRIES ITS STOP AND TARGET, and both were being dropped. `ProtoOAPosition` has
    // `stopLoss` and `takeProfit` (confirmed against the installed protobuf schema), and without
    // them the journal cannot show what was risked: no risk/reward, no stop distance, no achieved R.
    // A form-entered trade has all three, so a broker trade sat beside it with the columns empty.
    // Only the LIVE path can supply these — a closed position's deals carry no stop, so a trade
    // recovered by the 15-minute sweep still has none, and the journal shows it blank rather than
    // inventing one.
    stopLoss: Number.isFinite(Number(p.stopLoss)) && Number(p.stopLoss) > 0
      ? Number(p.stopLoss) : undefined,
    takeProfit: Number.isFinite(Number(p.takeProfit)) && Number(p.takeProfit) > 0
      ? Number(p.takeProfit) : undefined,
    // THE POSITION KNOWS WHEN IT OPENED — `tradeData.openTimestamp`. This was left undefined, which
    // gave the journal a trade with a close and no open, so every duration and every "held for" on
    // the live-recorded rows was blank while the synced ones had it.
    openTime: p.tradeData?.openTimestamp ?? undefined,
    closeTime: d.executionTimestamp ?? undefined,
    profit,
    commission: money(p.commission, p.moneyDigits),
    swap: money(p.swap, p.moneyDigits),
    comment: d.comment ?? p.tradeData?.comment,
  };
}

export function mapClosedDeal(d: any, symbolMap: Record<number, string>): RawBrokerTrade | null {
  if (!d || !isFilled(d) || d.closePositionDetail == null) return null;
  const close = d.closePositionDetail;
  const symbol = symbolMap[d.symbolId] ?? String(d.symbolId);
  // THE CLOSING DEAL IS THE OPPOSITE SIDE OF THE POSITION, so a deal that SELLS to close was a LONG.
  // Reading the deal's own side made every recorded direction the inverse of the trade actually
  // taken. `tradeSide` also arrives by NAME on this gateway, so the `=== 1` test alone matched
  // nothing and everything came out 'Short'.
  const soldToClose = String(d.tradeSide ?? '').toUpperCase() === 'SELL' || d.tradeSide === 2;
  return {
    externalId: String(d.dealId),
    symbol,
    direction:  soldToClose ? 'Long' : 'Short',
    // UNITS -> LOTS, using the instrument's own contract size. This divided by 100 and called the
    // result lots, which is units: a 1-lot forex trade was recorded as 100,000 lots.
    lots:       d.filledVolume ? (d.filledVolume / 100) / lotUnits(symbol) : undefined,
    openPrice:  close?.entryPrice     != null ? close.entryPrice       : undefined,
    closePrice: d.executionPrice      != null ? d.executionPrice       : undefined,
    // THE BROKER'S OWN MILLISECONDS, passed through untouched. This used to divide by 1000 and
    // stringify — `String(Math.floor(ms / 1000))` — which produced a numeric string of seconds.
    // `toDate` then read it as a DATE string, got an Invalid Date, and every sync of this account
    // died with `RangeError: Invalid time value`. Converting units here and again there is how the
    // two halves disagreed; the adapter now reports what the broker said and `toDate` owns the unit.
    openTime:   close?.entryTimestamp ?? undefined,
    closeTime:  d.executionTimestamp  ?? undefined,
    profit:     money(close?.grossProfit, d.moneyDigits),
    commission: money(d.commission, d.moneyDigits),
    swap:       money(close?.swap, d.moneyDigits),
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

    // TWO PATHS, AND THE SECOND IS THE ONE THAT WORKS ON THIS GATEWAY.
    //
    // `mapClosedDeal` needs `closePositionDetail`. Verified against the live demo account on
    // 2026-09-02: NONE of 30 real deals carried it, including six that genuinely closed a position.
    // So this used to map every deal to null and return an EMPTY LIST on every sync — which is
    // exactly why autotrade's trades never reached the journal. It is kept first because a gateway
    // that DOES send the field gives richer data (real gross profit and swap) than pairing can.
    // BOTH PATHS RUN AND THE RESULTS ARE MERGED, never one-or-the-other. A first draft returned the
    // detailed list whenever it was non-empty, which would silently DROP every paired trade the
    // moment a single deal happened to carry the field — a mixed response is the case that loses
    // data, and it is the case an either/or cannot see.
    const byId = new Map<string, RawBrokerTrade>();
    for (const t of pairDealsIntoTrades(allDeals, symbolMap)) byId.set(t.externalId, t);
    // Detailed LAST so it wins on a collision: both key on the closing dealId, and the broker's own
    // gross profit and swap beat anything derived from two execution prices.
    for (const d of allDeals) {
      const t = mapClosedDeal(d, symbolMap);
      if (t) byId.set(t.externalId, t);
    }
    const out = [...byId.values()];
    if (allDeals.length && !out.length) {
      console.warn(`[cTrader] ${allDeals.length} deals fetched but none resolved to a closed trade ` +
                   `— every position may still be open`);
    }
    return out;
  } finally {
    ws.close();
    lease.release();
  }
}
