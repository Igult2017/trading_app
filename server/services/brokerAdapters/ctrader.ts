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
// THE ORDER LIST — where the RISK AS PLACED lives. Read off the installed protobuf package
// (ProtoOAOrderListReq/Res), never guessed: a wrong payload type here fails silently, because an
// unrecognised message simply never matches and the wait times out.
const PT_ORDERS_REQ    = 2175;
const PT_ORDERS_RES    = 2176;
const PT_TRADER_REQ    = 2121;   // PROTO_OA_TRADER_REQ  (2120 is SYMBOL_CHANGED_EVENT — wrong)
const PT_TRADER_RES    = 2122;   // PROTO_OA_TRADER_RES
const PT_ACCOUNTS_REQ  = 2149;
const PT_ACCOUNTS_RES  = 2150;
export const PT_OA_ERROR        = 2142;
export const PT_EXECUTION_EVENT = 2126;  // PROTO_OA_EXECUTION_EVENT — real-time fills
export const PT_HEARTBEAT       = 51;    // ProtoHeartbeatEvent — keep-alive, send every ~10s

// ── ONE ACCOUNT'S SESSION ENDING, WHICH IS NOT THE SOCKET ENDING ─────────────────────────────────
//
// Read from Spotware's own `OpenApiModelMessages.proto` (`ProtoOAPayloadType`), never guessed — a wrong
// payload type here fails SILENTLY, because an unrecognised message simply never matches. The same
// fetch also returned 2102/2103/2126/2142, which match the constants above exactly; that agreement is
// what makes these two trustworthy.
//
// WHY THEY MATTER NOW: `ProtoOAAccountsTokenInvalidatedEvent` fires on a routine token REFRESH and ends
// the session for that ONE account while every other account on the socket keeps streaming
// (docs/ctrader-open-api-apps.md:90). With one account per socket that shows up as our own request
// failing. With several, the socket stays healthy and one account goes quiet with nothing reporting it.
// THE OPEN-POSITION CHECK — "what are you actually holding for this account right now?"
// Read from Spotware's `OpenApiModelMessages.proto` in the same fetch that gave 2147/2164 and confirmed
// 2102/2103/2126/2142 against the constants already here. Reconcile is NOT one of the three
// history requests, so it is on the 50-per-second budget, not the scarce 5-per-second one.
export const PT_RECONCILE_REQ = 2124;  // PROTO_OA_RECONCILE_REQ
export const PT_RECONCILE_RES = 2125;  // PROTO_OA_RECONCILE_RES

export const PT_TOKEN_INVALIDATED  = 2147;  // PROTO_OA_ACCOUNTS_TOKEN_INVALIDATED_EVENT
export const PT_ACCOUNT_DISCONNECT = 2164;  // PROTO_OA_ACCOUNT_DISCONNECT_EVENT

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

/**
 * Wait for one reply on this socket.
 *
 * ⚠ `match` EXISTS BECAUSE SOCKETS ARE NOW SHARED. Matching on the message type alone was correct while
 * every socket carried one account; with several, two accounts asking the same question at the same
 * moment would each be handed whichever reply arrived first — so one account would be told about the
 * other's positions. Pass `match` to require the reply to name the account that asked.
 */
export function waitFor(ws: WebSocket, targetType: number, timeoutMs = 20000,
                        match?: (payload: any) => boolean): Promise<any> {
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
        // Not ours — another account on this same socket asked too. Keep waiting rather than stealing it.
        if (match && !match(msg.payload ?? {})) return;
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

/** BUY or SELL, however this gateway spelled it.
 *
 * ⚠ THE TRAP, and I fell into it on 2026-09-27. The JSON gateway names its enums ("BUY"), the
 * protobuf path sends the INTEGER (1). Writing `String(d.tradeSide).toUpperCase() || fallback`
 * looks like it covers both and does not: `String(1)` is "1", which is TRUTHY, so the fallback
 * never runs and the side reads as "1". `long` then came out false and a BUY was recorded as a
 * Short — with the profit signed by that same flag, so a $500 WIN was journalled as a $500 LOSS.
 *
 * The original code had `side === 'BUY' || d.tradeSide === 1` and was right. This is that, in one
 * place, so the two callers cannot drift.
 */
function sideOf(d: any): string {
  const s = String(d?.tradeSide ?? '').toUpperCase();
  if (s === 'BUY' || s === '1') return 'BUY';
  if (s === 'SELL' || s === '2') return 'SELL';
  return s;
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
    const first = group[0];
    const openSide = sideOf(first);
    const vol = (d: any) => Number(d.filledVolume ?? d.volume ?? 0) / 100;

    // ── EVERY PIECE COUNTS, NOT JUST THE LAST ONE ─────────────────────────────────────────────
    //
    // HIS REPORT, 2026-09-27: taking profit at several points was recording several trades. The
    // live path was creating those rows; THIS path had the matching half of the bug — it read
    // `group[group.length - 1]` as "the close", so a position banked in three pieces was written
    // as one trade carrying only the LAST piece's size, price and profit. One row, and wrong.
    //
    // Deals on the opening side ADD to the position (scaling in), deals on the other side TAKE
    // FROM it. Both are averaged by size, so the entry and exit are the prices he actually got.
    const opens  = group.filter((d) => sideOf(d) === openSide);
    const closes = group.filter((d) => !opens.includes(d));
    if (closes.length === 0) continue;                    // nothing has been taken off yet

    const openedUnits = opens.reduce((t, d) => t + vol(d), 0);
    const closedUnits = closes.reduce((t, d) => t + vol(d), 0);
    // ⚠ ONLY WHEN THE WHOLE THING IS FINISHED — his rule: "record one order as an order AFTER the
    // whole order has been closed". While part of it is still running the trade has no final size
    // and no final result, so recording it now would be recording a guess. The next sweep sees it.
    if (!(openedUnits > 0) || closedUnits + 1e-9 < openedUnits) continue;

    const wavg = (ds: any[]) => {
      const t = ds.reduce((a, d) => a + vol(d), 0);
      return t > 0 ? ds.reduce((a, d) => a + Number(d.executionPrice) * vol(d), 0) / t : NaN;
    };
    const open = opens[0];
    const shut = closes[closes.length - 1];
    const long = openSide === 'BUY';
    const symbol = symbolMap[first.symbolId] ?? String(first.symbolId);
    const units = closedUnits;
    const entry = wavg(opens);
    const exit  = wavg(closes);
    const comm  = group.reduce((t, d) => t + (money(d.commission, d.moneyDigits) ?? 0), 0);
    const profit = (Number.isFinite(entry) && Number.isFinite(exit) && units > 0 && usdQuoted(symbol))
      ? Math.round(((long ? exit - entry : entry - exit) * units) * 100) / 100
      : undefined;
    out.push({
      // KEYED ON THE LAST CLOSING DEAL, so the de-duplication in processIncomingTrades still holds:
      // one finished position produces exactly one externalId, stable across syncs.
      externalId: String(shut.dealId),
      positionId: first.positionId != null ? String(first.positionId) : undefined,
      symbol,
      direction:  long ? 'Long' : 'Short',
      lots:       units > 0 ? units / lotUnits(symbol) : undefined,
      openPrice:  Number.isFinite(entry) ? entry : undefined,
      closePrice: Number.isFinite(exit) ? exit : undefined,
      openTime:   open.executionTimestamp ?? undefined,
      closeTime:  shut.executionTimestamp ?? undefined,
      // THE ORDER THAT OPENED THE POSITION — the join key to the risk it was placed with. The
      // CLOSING deal's orderId is a different order (the stop/target that fired) and carries no
      // levels, so taking the wrong one of the two yields nothing.
      entryOrderId: open.orderId != null ? String(open.orderId) : undefined,
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
  // `p.tradeSide` is NOT a field on ProtoOAPosition (verified against the installed protobuf) — the
  // side is only ever inside `tradeData`. Reading it was a fallback that could never fire.
  const posSide = String(p.tradeData?.tradeSide ?? '').toUpperCase();
  const dealSide = String(d.tradeSide ?? '').toUpperCase();
  // ── A PARTIAL TAKE-PROFIT IS NOT A CLOSED TRADE ────────────────────────────────────────────
  //
  // HIS REPORT, 2026-09-27: *"in one trade, if i took profit at different points, it is recording
  // each profit taken as an individual trade. It should record one order as an order after the
  // whole order has been closed."*
  //
  // THE CAUSE WAS `closedBySide`. It asked only "is this deal on the opposite side to the
  // position?" — which is TRUE of every partial close, not just the last one. So each time he
  // banked part of a position, that deal arrived here, passed the test, and was written as its own
  // journal row keyed on its own dealId. Three take-profits meant three trades, each carrying only
  // its own slice of the size.
  //
  // THE POSITION ITSELF SAYS WHETHER IT IS FINISHED, so that is what is asked now. While any part
  // remains open the position is OPEN, and there is no trade to record yet.
  // ⚠ ASK THE POSITION, NOT THE SIDE. My first attempt at this required the sides to differ, and
  // that DROPPED A REAL CLOSE: this gateway sometimes sends no `tradeData` at all (his EUR/USD trade
  // of 01 Sep — see LIVE_LONG_NO_TRADEDATA in the tests), so `posSide` is '' and a side comparison
  // can never be true. The position's own status is always there and is the thing being asked.
  if (!status.includes('CLOSED')) return null;   // still running: an opening fill, OR a PARTIAL close
  // The opening fill of a position that is ALREADY closed — only reachable on a replayed event, but
  // recording it would file an entry as an exit. Skipped only when the sides are actually readable.
  if (posSide && dealSide && posSide === dealSide) return null;

  const symbol = symbolMap[d.symbolId] ?? String(d.symbolId);
  // THE CLOSING DEAL IS THE ONLY RELIABLE SOURCE OF THE DIRECTION, and getting this wrong inverted
  // the MONEY as well as the label.
  //
  // `ProtoOAPosition` has NO top-level `tradeSide` — read off the installed protobuf, its fields are
  // positionId, tradeData, positionStatus, swap, price, stopLoss, takeProfit, ... The side lives
  // ONLY inside `tradeData`, which is the same object whose `openTimestamp` we measured as MISSING on
  // both of his trades. So `posSide` was '', the `=== 1` test matched nothing, and `long` fell
  // through to FALSE — every live-recorded trade filed as a SHORT.
  //
  // His EUR/USD trade of 01 Sep was a LONG that lost 1.05R. It was stored as a short, and because
  // `profit` below is signed by this same flag, a $51 LOSS was recorded as a $51 WIN.
  //
  // A deal that SELLS to close was a LONG; one that BUYS to close was a SHORT. That is unambiguous,
  // always present, and exactly the rule `mapClosedDeal` already uses. The old `p.tradeSide` branch
  // is gone: the schema says that field does not exist, so it never did anything.
  const long = posSide ? posSide === 'BUY' : dealSide === 'SELL';
  const units = Number(d.filledVolume ?? d.volume ?? 0) / 100;
  const entry = Number(p.price);
  const exit = Number(d.executionPrice);
  const profit = (Number.isFinite(entry) && Number.isFinite(exit) && units > 0 && usdQuoted(symbol))
    ? Math.round(((long ? exit - entry : entry - exit) * units) * 100) / 100
    : undefined;
  return {
    externalId: String(d.dealId),
    positionId: p.positionId != null ? String(p.positionId) : undefined,
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

/**
 * Turn a window of raw deals into closed trades, using BOTH mappings and keeping the best of each.
 *
 * Extracted from `fetchCTraderTrades` so it can be tested without a socket — the defect it now
 * guards against was invisible to every existing test precisely because it lived inside the network
 * call.
 */
export function mergeDealMappings(allDeals: any[], symbolMap: Record<number, string>): RawBrokerTrade[] {
  const byId = new Map<string, RawBrokerTrade>();
  for (const t of pairDealsIntoTrades(allDeals, symbolMap)) byId.set(t.externalId, t);

  // MERGE FIELD BY FIELD. THE DETAILED PATH USED TO REPLACE THE PAIRED ONE WHOLESALE, and that
  // silently threw away the OPEN TIME on every trade.
  //
  // Measured in production on 02 Sep: this gateway's deals DO carry `closePositionDetail`, so
  // `mapClosedDeal` fires for every closed deal and its result overwrote the paired one. But
  // `closePositionDetail` has no `entryTimestamp`, so its `openTime` is undefined — while the
  // paired trade, built from the two real deals of the position, has the true one. The overwrite
  // therefore replaced a correct open time with nothing, on every single trade:
  //
  //     deals per position: 239821023:2 239582511:2   <- both pairable
  //     [Sync] had GBPUSD 317367514 ... broker offers openTime=null
  //
  // The broker's own gross profit and swap really are better than anything derived from two
  // execution prices, which is why the detailed values still win — but only WHERE THEY EXIST. A
  // field the detailed path leaves undefined must fall back to the paired value rather than erase
  // it. "Better where present" is not the same as "better", and one `set()` conflated them.
  // ⚠ A PARTIAL CLOSE MUST NOT SNEAK BACK IN HERE. `mapClosedDeal` runs on EVERY deal on its own,
  // so a position banked in three pieces yields three trades from this loop. Once
  // `pairDealsIntoTrades` started folding those pieces into ONE trade (2026-09-27), the two pieces
  // it no longer keys lost their `paired` match and fell into the `!paired` branch below — which
  // ADDS them as separate trades. The sweep then reported "4 closed trade(s)" for an account with
  // two positions, and would have rebuilt the very rows the fix exists to prevent.
  //
  // I MISSED THIS WHEN I FIXED THE OTHER TWO PATHS, and the live log is what caught it: the count
  // did not match the number of positions. The `!paired` branch is still needed — a position whose
  // OPENING deal falls outside the fetch window cannot be paired, and its close should still be
  // recorded — so the test is not "was it paired" but "does its POSITION already have a trade".
  const pairedPositions = new Set<string>();
  for (const t of byId.values()) if (t.positionId) pairedPositions.add(String(t.positionId));

  for (const d of allDeals) {
    const t = mapClosedDeal(d, symbolMap);
    if (!t) continue;
    const paired = byId.get(t.externalId);
    if (!paired) {
      const pos = d?.positionId != null ? String(d.positionId) : (t.positionId ? String(t.positionId) : null);
      if (pos && pairedPositions.has(pos)) continue;   // another piece of an already-recorded trade
      byId.set(t.externalId, t);
      if (pos) pairedPositions.add(pos);
      continue;
    }
    // ⚠ A SLICE MUST NOT OVERWRITE THE WHOLE POSITION — the third path of the partial-close bug,
    // and the one that actually reached him. He said "the fix you made is not working" and he was
    // right; production, 2026-09-27 18:03:27, after the other two paths were fixed AND deployed:
    //
    //     recorded | 320874862 | Short 0.25 lots, P/L 225.25
    //
    // That is one piece of a 1.00-lot position. `pairDealsIntoTrades` had already built the whole
    // thing correctly. But `mapClosedDeal` runs on EVERY deal on its own, so the LAST closing deal
    // also produces a standalone 0.25-lot trade under the SAME externalId — and this loop let every
    // non-null field of that slice win, taking volume, profit and close price down with it.
    //
    // The note above explains why the detailed path normally wins: the broker's own gross profit
    // and swap beat anything derived from two execution prices. TRUE FOR A POSITION CLOSED ONCE,
    // FALSE FOR ONE BANKED IN PIECES, where that deal's profit describes a piece. The code never
    // told the two apart, so the better-data rule quietly became a data-loss rule.
    //
    // THE TEST IS THE VOLUME, not a new flag: if the standalone deal covers LESS than the paired
    // trade, the paired trade is an aggregate of several closes and is authoritative. No new field
    // on RawBrokerTrade and no second copy of the opening/closing side logic — the pairing already
    // did that work and the answer is sitting in `lots` on both objects.
    //
    // `lots` is optional (brokerSyncService.ts), so when either side cannot be read the volume test
    // is impossible and the CURRENT behaviour is kept — nothing regresses on a deal shape that does
    // not report volume, or on the seven other adapters.
    const isAggregate = typeof paired.lots === 'number' && typeof t.lots === 'number'
                        && t.lots + 1e-9 < paired.lots;
    const merged = { ...paired };
    for (const [k, v] of Object.entries(t)) {
      if (v === undefined || v === null) continue;
      // On an aggregate, the detail may only FILL A BLANK; it may never replace a computed total.
      if (isAggregate && (merged as any)[k] !== undefined && (merged as any)[k] !== null) continue;
      (merged as any)[k] = v;
    }
    byId.set(t.externalId, merged);
  }
  return [...byId.values()];
}

// ── Trade history (WebSocket) ─────────────────────────────────────────────────

// isLive is passed from the stored accountType — avoids redundant WS connections on every sync chunk
/**
 * The stop and target each ENTRY ORDER was placed with, keyed by order id.
 *
 * WHY THIS REQUEST EXISTS. A closed position's DEALS carry no stop at all, and the live feed reads
 * the stop off the position as it CLOSES — which for any trade the ladder managed is the stop after
 * it was moved. Measuring risk against that gives zero for a trade taken to breakeven, so the
 * journal recorded no R for exactly the trades worth measuring.
 *
 * The broker keeps the real answer on the entry order. Verified against his own account 02 Sep:
 * order 358693875, a STOP entry, carried stopLoss 1.34939 and takeProfit 1.34672 against an entry of
 * 1.34886 — a 5.3 pip risk and a 4.04R plan, where the closing stop said the risk was nothing.
 */
async function fetchEntryOrderLevels(ws: WebSocket, acctId: number, from: number, to: number)
    : Promise<Map<string, { stopLoss?: number; takeProfit?: number; orderType?: string }>> {
  const out = new Map<string, { stopLoss?: number; takeProfit?: number; orderType?: string }>();
  try {
    send(ws, PT_ORDERS_REQ, { ctidTraderAccountId: acctId, fromTimestamp: from, toTimestamp: to });
    const payload = await waitFor(ws, PT_ORDERS_RES, 20000);
    for (const o of (payload?.order ?? [])) {
      const sl = Number(o?.stopLoss), tp = Number(o?.takeProfit);
      // Only orders that actually carried levels. A closing STOP_LOSS_TAKE_PROFIT order has neither,
      // and recording an empty entry for it would mask the real one.
      if (!(Number.isFinite(sl) && sl > 0) && !(Number.isFinite(tp) && tp > 0)) continue;
      out.set(String(o.orderId), {
        stopLoss:   Number.isFinite(sl) && sl > 0 ? sl : undefined,
        takeProfit: Number.isFinite(tp) && tp > 0 ? tp : undefined,
        // HOW THE TRADE WAS ENTERED — "STOP", "LIMIT", "MARKET". The metrics page has an order-type
        // breakdown and every synced trade landed in its "Unknown" bucket, because nothing ever read
        // this. It costs nothing: these orders are already being fetched for the stop and target.
        orderType:  o?.orderType ? String(o.orderType) : undefined,
      });
    }
  } catch (err: any) {
    // A TRADE WITHOUT ITS ORIGINAL STOP IS STILL A TRADE. This request failing must never fail the
    // sync — the trade is recorded with no R rather than with a wrong one.
    console.warn(`[cTrader] could not read the entry orders (risk numbers will be blank): `
                 + `${err?.message ?? err}`);
  }
  return out;
}

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
  // TWO LIMITS APPLY HERE, AND THEY GUARD DIFFERENT THINGS. The pool lease caps how many cTrader
  // CONNECTIONS exist; this gate caps how many REQUESTS are in flight across all of them. A burst of
  // requests down a few connections is what earns a rate-limit refusal, and history is the scarce
  // budget at 5 per second.
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
    // WHAT THE GATEWAY ACTUALLY SENT. Verified against the hosted cTrader MCP on 02 Sep, the two
    // deals of position 239821023 both carry `positionId` and `executionTimestamp` — so pairing
    // should group them and take the open time from the earlier one. Production nonetheless reported
    // `openTime=null` for that exact trade. The two services are different (this is the Open API WS
    // gateway; the MCP is its own service) and may not name or send the same fields, so this prints
    // what THIS path received rather than what the other one proves is available.
    if (allDeals.length) {
      const groups = new Map<string, number>();
      for (const d of allDeals) {
        const k = String(d?.positionId ?? 'none');
        groups.set(k, (groups.get(k) ?? 0) + 1);
      }
      console.log(`[cTrader] ${allDeals.length} deal(s); fields on the first: `
                  + `${Object.keys(allDeals[0] ?? {}).sort().join(',')}`);
      const cpd = allDeals.find(d => d?.closePositionDetail)?.closePositionDetail;
      if (cpd) {
        console.log(`[cTrader] closePositionDetail carries: ${Object.keys(cpd).sort().join(',')}`
                    + ` (an 'entryTimestamp' here is what mapClosedDeal reads for the open time)`);
      }
      console.log(`[cTrader] deals per position: `
                  + `${[...groups].map(([k, n]) => `${k}:${n}`).join(' ')} `
                  + `(a position needs 2 for the open time to be paired in)`);
    }

    const merged = mergeDealMappings(allDeals, symbolMap);

    // THE RISK AS PLACED, attached to each trade. One extra request on the same socket, and only
    // when there is something to attach it to.
    if (merged.length) {
      const levels = await fetchEntryOrderLevels(ws, acctId, fromMs, toMs);
      let attached = 0;
      for (const t of merged) {
        const lv = t.entryOrderId ? levels.get(t.entryOrderId) : undefined;
        if (!lv) continue;
        t.originalStopLoss   = lv.stopLoss;
        t.originalTakeProfit = lv.takeProfit;
        t.orderType          = lv.orderType;
        attached++;
      }
      console.log(`[cTrader] original risk attached to ${attached}/${merged.length} closed trade(s)`
                  + ` from ${levels.size} entry order(s)`);
    }
    const out = merged;
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
