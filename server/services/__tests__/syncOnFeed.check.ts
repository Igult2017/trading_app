/**
 * A SYNC RUNS ON THE ACCOUNT'S LIVE-FEED CONNECTION — no new connection, no crossed answers (22 Nov 2026, step 5).
 * Run: DATABASE_URL=postgresql://x.invalid/x npx tsx server/services/__tests__/syncOnFeed.check.ts
 *
 * In words, what must hold:
 *  * an account with a live feed syncs its deal history and balance ON THAT CONNECTION — the stand-in sees no new
 *    connection and no new login;
 *  * two accounts sharing that connection sync AT THE SAME TIME, and the stand-in answers them in REVERSE order:
 *    each still gets only its own trade and its own balance (an unmatched answer would hand one the other's);
 *  * the account list is asked on a feed connection too, and two users asking at once each get only their own list;
 *  * an account with no feed here is reported as "no feed" (the caller then uses its own connection, as before).
 * A real WebSocket server stands in for cTrader; the REAL sync functions run against it.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { _internals, onFeed } from '../ctraderHub';
import { fetchCTraderTrades, fetchCTraderBalance, getCTraderAccounts, syncPathStats, openWS, factsToColumns,
         LIVE_WS, DEMO_WS } from '../brokerAdapters/ctrader';

const DEALS_REQ = 2133, DEALS_RES = 2134, ORDERS_REQ = 2175, ORDERS_RES = 2176, TRADER_REQ = 2121,
      TRADER_RES = 2122, ACCOUNTS_REQ = 2149, ACCOUNTS_RES = 2150, APP_AUTH_REQ = 2100, ACCT_AUTH_REQ = 2102;

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// ── the stand-in: holds questions of one kind until two are waiting (or 150 ms), then answers in REVERSE ──
let connections = 0, assetLists = 0;
const ASSET_LIST_REQ = 2112, ASSET_LIST_RES = 2113;
const logins: number[] = [];
const held = new Map<number, Array<() => void>>();
function hold(kind: number, answer: () => void) {
  const q = held.get(kind) ?? [];
  q.push(answer);
  held.set(kind, q);
  const flush = () => { const all = held.get(kind) ?? []; held.set(kind, []); all.reverse().forEach((f) => f()); };
  if (q.length >= 2) flush(); else setTimeout(flush, 150);
}
const wss = new WebSocketServer({ port: 0 });
wss.on('connection', (sock) => {
  const role = connections++ === 0 ? 'demo' : 'live';
  const say = (payloadType: number, payload: object) => sock.send(JSON.stringify({ payloadType, payload }));
  sock.on('message', (raw) => {
    const { payloadType: t, payload: p } = JSON.parse(raw.toString());
    const id = Number(p?.ctidTraderAccountId);
    if (t === APP_AUTH_REQ || t === ACCT_AUTH_REQ) logins.push(t);
    if (t === DEALS_REQ) hold(t, () => say(DEALS_RES, { ctidTraderAccountId: id, deal: [{
      dealId: id * 10, positionId: id * 100, symbolId: 1, dealStatus: 'FILLED', tradeSide: 'SELL', executionPrice: 1.2,
      executionTimestamp: 1_700_000_000_000, filledVolume: 10_000_000, moneyDigits: 2,
      closePositionDetail: { entryPrice: 1.1, grossProfit: id, swap: 0 } }] }));
    if (t === ORDERS_REQ) say(ORDERS_RES, { ctidTraderAccountId: id, order: [] });
    // Account details as cTrader sends them: NO currency name, only its asset id (step 6). Both accounts
    // are in asset 3, but 111 is at Pepperstone (3 = EUR) and 222 at FTMO (3 = GBP) — brokers number their
    // assets differently, so a remembered name that ignores the broker hands one account the other's.
    if (t === TRADER_REQ) hold(t, () => say(TRADER_RES, { ctidTraderAccountId: id, trader: {
      ctidTraderAccountId: id, balance: id * 100, moneyDigits: 2, depositAssetId: 3,
      brokerName: id === 111 ? 'Pepperstone' : 'FTMO', leverageInCents: id === 111 ? 50_000 : 10_000,
      accountType: id === 111 ? 'NETTED' : 0 } }));
    if (t === ASSET_LIST_REQ) {
      assetLists++;
      say(ASSET_LIST_RES, { ctidTraderAccountId: id, asset: id === 111
        ? [{ assetId: 1, name: 'USD' }, { assetId: 3, name: 'EUR' }]
        : [{ assetId: 1, name: 'USD' }, { assetId: 3, name: 'GBP' }] });
    }
    if (t === ACCOUNTS_REQ) hold(t + (role === 'live' ? 1000 : 0), () => say(ACCOUNTS_RES, {
      accessToken: p.accessToken,
      ctidTraderAccount: role === 'live' ? [] : [{ ctidTraderAccountId: p.accessToken === 'tok-A' ? 111 : 222, isLive: false }],
    }));
  });
});
await new Promise((r) => wss.once('listening', r));
const url = `ws://127.0.0.1:${(wss.address() as any).port}`;

// ── two feed connections, as the hub holds them: demo with accounts 111 and 222 on it, and one live ──
const { hubs, hubKey } = _internals;
const feed = (ws: WebSocket, host: string, ctids: number[]) => hubs.push({
  ws, hb: null as any, lease: null as any, key: hubKey(host, undefined), closing: false, pending: 0,
  members: new Map(ctids.map((c) => [c, { account: { id: `acct-${c}` } as any, ctid: c, symbolMap: { 1: 'EURUSD' } }])),
} as any);
feed(await openWS(url), DEMO_WS, [111, 222]);
feed(await openWS(url), LIVE_WS, []);
const opened = connections;

console.log('\nA SYNC ON THE LIVE-FEED CONNECTION\n');
const day = 24 * 3600 * 1000, to = 1_700_000_000_000 + day, from = to - 3 * day;
const [t111, t222] = await Promise.all([fetchCTraderTrades('tok', '111', from, to, false),
                                        fetchCTraderTrades('tok', '222', from, to, false)]);
check('two accounts syncing at once on one connection each get ONLY their own trade',
      [t111.map((t) => t.externalId), t222.map((t) => t.externalId)], [['1110'], ['2220']]);
check('...with their own profit', [t111[0]?.profit, t222[0]?.profit], [1.11, 2.22]);
const [b111, b222] = await Promise.all([fetchCTraderBalance('tok', '111', false), fetchCTraderBalance('tok', '222', false)]);
check('...and their own balance', [b111?.balance, b222?.balance], [111, 222]);

console.log('\nACCOUNT DETAILS FROM cTRADER (step 6)\n');
check('the broker / prop firm comes from cTrader', [b111?.brokerName, b222?.brokerName], ['Pepperstone', 'FTMO']);
check('the currency is the NAME of the account\'s asset, looked up at ITS broker', [b111?.currency, b222?.currency],
      ['EUR', 'GBP']);
check('leverage 1:N from leverageInCents', [b111?.leverage, b222?.leverage], [500, 100]);
check('hedged / netted, whether named or numbered', [b111?.positionMode, b222?.positionMode], ['netted', 'hedged']);
const again = await fetchCTraderBalance('tok', '111', false);
const again2 = await fetchCTraderBalance('tok', '222', false);
check('the asset list is asked once per broker, then remembered — each broker\'s own',
      [assetLists, again?.currency, again2?.currency], [2, 'EUR', 'GBP']);
check('the columns written: every fact cTrader gave', factsToColumns(b111!, 'USD'),
      { balance: '111', currency: 'EUR', brokerName: 'Pepperstone', leverage: 500, positionMode: 'netted' });
check('...and a fact it did NOT give is left out, never blanked (stored currency kept)',
      factsToColumns({ balance: 5, currency: '' }, 'JPY'), { balance: '5', currency: 'JPY' });
const [lA, lB] = await Promise.all([getCTraderAccounts('tok-A'), getCTraderAccounts('tok-B')]);
check('two users asking for their account lists at once each get only their own',
      [lA.map((a) => a.ctidTraderAccountId), lB.map((a) => a.ctidTraderAccountId)], [['111'], ['222']]);
check('NO new connection was opened for any of it', connections - opened, 0);
check('...and nobody logged in again (no app or account login sent)', logins.length, 0);
check('every one was counted as "on the feed", none as "own connection"', syncPathStats, { onFeed: 10, ownConnection: 0 });
check('an account with no feed here is reported as "no feed"', await onFeed(333, false, undefined, async () => 1), null);

for (const h of hubs) h.ws.close();
wss.close();
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
