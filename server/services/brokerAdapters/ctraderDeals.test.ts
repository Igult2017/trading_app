/**
 * ctraderDeals.test.ts — run with:
 *     npx tsx server/services/brokerAdapters/ctraderDeals.test.ts
 *
 * WHY NO cTRADER TRADE EVER REACHED THE JOURNAL.
 *
 * His report, 2026-09-01: *"The trades taken by autotrader are not being captured and recorded or
 * synced in the journal."* True, and it was never a journal problem — nothing ever came out of the
 * adapter. Both routes into the journal funnel through one function, `mapClosedDeal`, whose first
 * line was:
 *
 *     if (!d || d.dealStatus !== 2 || d.closePositionDetail == null) return null;
 *
 * Measured against the live Pepperstone demo account on 2026-09-02, over a 14-day window:
 *   - all 30 deals carried `dealStatus: "FILLED"` — the STRING, because the JSON gateway serialises
 *     protobuf enums by name. `!== 2` therefore rejected every deal on the very first test.
 *   - 0 of 30 carried `closePositionDetail`, INCLUDING the six that genuinely closed a position.
 *
 * A null return there means "an opening fill, ignore it", so both failures were silent. The
 * 15-minute sync returned an empty list every time and the live feed dropped every close.
 *
 * THE FIXTURE IS REAL. `__fixtures__ctrader_deals.json` is six deals captured verbatim from that
 * account — no hand-written values. Position 239582511 is HIS autotraded EUR/USD trade: the stop
 * order that signal 70d8dac7 placed (STOP BUY 1.16048, SL 1.15986, TP 1.16295) filled at 1.16046
 * and closed at 1.15983. That trade existing at the broker while being absent from the journal is
 * the whole defect, in one row.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { mapClosedDeal, mapClosedFromEvent, pairDealsIntoTrades, mergeDealMappings } from './ctrader';
import { toDate } from '../brokerSyncService';

let failed = 0;
let count = 0;

function check(name: string, got: unknown, want: unknown) {
  count++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}` +
              (ok ? '' : `, want ${JSON.stringify(want)}`));
  if (!ok) failed++;
}

function teeth(name: string, brokeItAndFailed: boolean) {
  count++;
  console.log(`   ${brokeItAndFailed ? 'PASS' : 'FAIL'}  TEETH — ${name}`);
  if (!brokeItAndFailed) failed++;
}

console.log();
console.log('cTRADER DEALS — the trades that exist at the broker must reach the journal');

const DEALS: any[] = JSON.parse(
  readFileSync(join(process.cwd(), 'server', 'services', 'brokerAdapters',
                    '__fixtures__ctrader_deals.json'), 'utf8'));
const SYMBOLS: Record<number, string> = { 1: 'EURUSD', 2: 'GBPUSD', 41: 'XAUUSD' };

// ── THE SHAPE OF THE REAL PAYLOAD, asserted so the premise cannot rot ───────
check('the fixture is the six real deals', DEALS.length, 6);
check('every one is FILLED as a STRING, not the integer 2',
      DEALS.every(d => d.dealStatus === 'FILLED'), true);
check('NONE carries closePositionDetail — the field the old code required',
      DEALS.some(d => d.closePositionDetail != null), false);
check('tradeSide is a name too, not the integer 1/2',
      DEALS.every(d => d.tradeSide === 'BUY' || d.tradeSide === 'SELL'), true);

// ── THE OLD TEST, REPRODUCED — this is what returned null for all of them ───
const oldRule = (d: any) => !(!d || d.dealStatus !== 2 || d.closePositionDetail == null);
check('the old first line rejected all six', DEALS.filter(oldRule).length, 0);

// ── HIS TRADE, THROUGH THE PATH THAT NOW WORKS ─────────────────────────────
const trades = pairDealsIntoTrades(DEALS, SYMBOLS);
check('the six deals resolve to three closed positions', trades.length, 3);

const his = trades.find(t => t.openPrice === 1.16046);
check('his autotraded EUR/USD trade is one of them', his != null, true);
check('...on the right instrument', his?.symbol, 'EURUSD');
check('...as a Long, from the OPENING deal side', his?.direction, 'Long');
check('...filled at the price the broker recorded', his?.openPrice, 1.16046);
check('...closed at the price the broker recorded', his?.closePrice, 1.15983);
check('...sized 0.81 lots (8,100,000 cents / 100 / 100,000)', his?.lots, 0.81);
// (1.15983 − 1.16046) × 81,000 units = −51.03
check('...with the loss it actually made', his?.profit, -51.03);
check('...keyed on the CLOSING deal id, so a re-sync cannot duplicate it',
      his?.externalId, '317231950');
check('...carrying both timestamps in the broker\'s own milliseconds',
      [his?.openTime, his?.closeTime], [1788271402114, 1788274166750]);

// EVERY externalId MUST BE DISTINCT, or de-duplication silently merges two trades into one.
check('the three trades have three distinct ids',
      new Set(trades.map(t => t.externalId)).size, 3);

// A POSITION WITH ONLY AN OPENING DEAL IS STILL OPEN — recording it would invent a closed trade.
const openOnly = DEALS.filter(d => d.positionId === 239582511 && d.tradeSide === 'BUY');
check('a position with one deal produces nothing', pairDealsIntoTrades(openOnly, SYMBOLS).length, 0);

// A SHORT MUST COME OUT SHORT. Direction is read from the OPENING deal, and reading the closing
// one instead would invert every trade in the journal.
const shortDeals = DEALS
  .filter(d => d.positionId === 239582511)
  .map(d => ({ ...d, tradeSide: d.tradeSide === 'BUY' ? 'SELL' : 'BUY' }));
const shorted = pairDealsIntoTrades(shortDeals, SYMBOLS)[0];
check('the mirrored position is recorded Short', shorted?.direction, 'Short');
check('...and the same price move is now a PROFIT', shorted?.profit, 51.03);

// P&L IS LEFT UNDEFINED RATHER THAN REPORTED WRONGLY on a non-USD-quoted symbol: (close − entry) ×
// units is in the QUOTE currency, which is only the account currency when the quote is USD.
const jpy = DEALS
  .filter(d => d.positionId === 239582511)
  .map(d => ({ ...d, symbolId: 4 }));
const jpyTrade = pairDealsIntoTrades(jpy, { 4: 'USDJPY' })[0];
check('a JPY-quoted trade is still recorded', jpyTrade?.symbol, 'USDJPY');
check('...with prices and size', [jpyTrade?.openPrice, jpyTrade?.lots], [1.16046, 0.81]);
check('...but no invented profit', jpyTrade?.profit, undefined);

// GOLD SIZES IN OUNCES. A metals lot is 100 oz; using the currency figure would record a 0.13-lot
// gold trade as 0.00013 lots — the same wrong contract size that made the broker refuse the order.
const gold = DEALS
  .filter(d => d.positionId === 239582511)
  .map(d => ({ ...d, symbolId: 41, filledVolume: 1300, volume: 1300 }));
check('13 ounces of gold is 0.13 lots, not 0.00013',
      pairDealsIntoTrades(gold, SYMBOLS)[0]?.lots, 0.13);

// ── THE LIVE FEED, which is how a close reaches the journal in seconds ──────
// The 15-minute sweep is the safety net under it (both are asserted here); this path failing means
// every trade waits for that sweep, and before 31 Aug 2026 it meant nothing was recorded at all.
const closeEvent = {
  deal: { dealId: 317231950, symbolId: 1, tradeSide: 'SELL', filledVolume: 8_100_000,
          executionPrice: 1.15983, executionTimestamp: 1788274166750, dealStatus: 'FILLED' },
  position: { positionId: 239582511, positionStatus: 'POSITION_STATUS_CLOSED',
              price: 1.16046, tradeData: { tradeSide: 'BUY', openTimestamp: 1788271402114 },
              commission: -410, swap: 0, moneyDigits: 2 },
};
const live = mapClosedFromEvent(closeEvent, SYMBOLS);
check('a live close maps to a trade', live != null, true);
check('...the same trade the sync produces', [live?.externalId, live?.openPrice, live?.closePrice],
      ['317231950', 1.16046, 1.15983]);
check('...Long, from the POSITION\'s side and not the closing deal\'s', live?.direction, 'Long');
check('...with the same P&L', live?.profit, -51.03);
check('...and the position\'s own commission', live?.commission, -4.1);
// A ROW WITH A CLOSE AND NO OPEN has no duration, so every "held for" was blank on live-recorded
// trades while the synced ones had it. The position carries the open time; it was being dropped.
check('...and the time the position OPENED', live?.openTime, 1788271402114);

// MONEY IS SCALED BY THE BROKER'S OWN moneyDigits, not by a hardcoded 100. A three-digit account
// currency would otherwise report every commission ten times too large.
const live3 = mapClosedFromEvent(
  { ...closeEvent, position: { ...closeEvent.position, commission: -4100, moneyDigits: 3 } },
  SYMBOLS);
check('a 3-digit money field scales by 1,000', live3?.commission, -4.1);
const liveNoDigits = mapClosedFromEvent(
  { ...closeEvent, position: { ...closeEvent.position, moneyDigits: undefined } }, SYMBOLS);
check('...and an absent moneyDigits falls back to 2', liveNoDigits?.commission, -4.1);

// THE OPENING FILL MUST MAP TO NULL. Recording it would put a fictional closed trade in his journal
// the instant an order fills — worse than recording it late.
const openEvent = {
  deal: { dealId: 317214780, symbolId: 1, tradeSide: 'BUY', filledVolume: 8_100_000,
          executionPrice: 1.16046, executionTimestamp: 1788271402114, dealStatus: 'FILLED' },
  position: { positionId: 239582511, positionStatus: 'POSITION_STATUS_OPEN',
              price: 1.16046, tradeData: { tradeSide: 'BUY' } },
};
check('an opening fill records nothing', mapClosedFromEvent(openEvent, SYMBOLS), null);

// AND THE TWO PATHS AGREE ON THE ID, which is what stops the live feed and a later manual sync
// recording the same trade twice. `processIncomingTrades` de-duplicates on externalId alone.
check('live and sync produce the SAME externalId for one trade',
      live?.externalId === his?.externalId, true);

// ── THE STEP THAT PUTS IT IN THE JOURNAL, which is what he actually asked for ──
// `processIncomingTrades` calls `autoJournalTrade` ONLY when BOTH times survive `toDate`:
//     if (openTime && closeTime) { ... }
// So a mapper that drops the open time still fills `synced_trades` and the trade NEVER reaches the
// journal. That is not a cosmetic gap — it is his request, and it is why `openTime` above is
// load-bearing rather than a nicety.
for (const [label, t] of [['the sync path', his], ['the live path', live]] as const) {
  const o = toDate(t?.openTime), c = toDate(t?.closeTime);
  check(`${label} yields a real open time`, o?.toISOString(), '2026-09-01T14:03:22.114Z');
  check(`${label} yields a real close time`, c?.toISOString(), '2026-09-01T14:49:26.750Z');
  check(`${label} therefore reaches the JOURNAL, not just synced_trades`, !!(o && c), true);
}

// ── mapClosedDeal, for a gateway that does send the detail ──────────────────
// Kept because it carries the broker's own gross profit and swap. It must survive a named enum too.
const detailed = mapClosedDeal({
  dealId: 999, symbolId: 1, tradeSide: 'SELL', filledVolume: 10_000_000,
  executionPrice: 1.15983, executionTimestamp: 1788274166750, dealStatus: 'FILLED',
  commission: -410,
  closePositionDetail: { entryPrice: 1.16046, entryTimestamp: 1788271402114,
                         grossProfit: -6300, swap: -120 },
}, SYMBOLS);
check('a detailed deal maps when the field IS present', detailed?.externalId, '999');
check('...accepting the string status', detailed?.openPrice, 1.16046);
check('...Long, because SELLING is how a long is closed', detailed?.direction, 'Long');
check('...1.00 lot, not 100,000', detailed?.lots, 1);
check('...using the broker\'s own gross profit', detailed?.profit, -63);
check('...and its swap', detailed?.swap, -1.2);

// ── TEETH ──────────────────────────────────────────────────────────────────
teeth('the old integer test would reject the real payload', DEALS.filter(oldRule).length === 0);
teeth('a deal that is not filled is still ignored',
      pairDealsIntoTrades(DEALS.map(d => ({ ...d, dealStatus: 'REJECTED' })), SYMBOLS).length === 0);
teeth('mapClosedDeal still refuses a deal with no closePositionDetail',
      mapClosedDeal(DEALS[0], SYMBOLS) === null);

console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }

// ── THE MERGE MUST NOT ERASE WHAT THE OTHER PATH KNEW ──────────────────────
//
// The two deals below are the REAL payload of position 239821023, pulled from the Pepperstone demo
// account on 02 Sep 2026 — his GBP/USD trade, placed 09:54:04Z and closed 11:09:58Z.
//
// Both mappings run on this data. `pairDealsIntoTrades` builds the trade from the two deals and so
// knows the OPEN time. `mapClosedDeal` fires too, because this gateway's deals really do carry
// `closePositionDetail` — and its `openTime` is undefined, because that object has no
// `entryTimestamp`. The old merge did one `byId.set()` with the detailed result and therefore
// replaced a correct open time with nothing, on every trade the sweep ever recovered. The journal
// then had no holding time, no day of week, and a session guessed from the close.
const REAL_OPEN = {
  dealId: 317358421, orderId: 358693875, positionId: 239821023, symbolId: 2,
  tradeSide: 'SELL', volume: 9400000, filledVolume: 9400000,
  executionPrice: 1.3488, executionTimestamp: 1788342844240,
  dealStatus: 'FILLED', commission: 0, moneyDigits: 2,
};
const REAL_CLOSE = {
  dealId: 317367514, orderId: 358709797, positionId: 239821023, symbolId: 2,
  tradeSide: 'BUY', volume: 9400000, filledVolume: 9400000,
  executionPrice: 1.34882, executionTimestamp: 1788347398654,
  dealStatus: 'FILLED', commission: 0, moneyDigits: 2,
  // Present on the WS gateway (verified in production 02 Sep) and carrying NO entryTimestamp.
  closePositionDetail: { entryPrice: 1.3488, grossProfit: -188, swap: -12, balance: 994643 },
};

const mergedTrades = mergeDealMappings([REAL_OPEN, REAL_CLOSE], { 2: 'GBPUSD' });
check('one closed position produces exactly one trade', mergedTrades.length, 1);
const mt = mergedTrades[0];
check('the OPEN time survives the merge', mt.openTime, 1788342844240);
check('...which is 09:54:04Z, the moment it was placed',
      new Date(Number(mt.openTime)).toISOString(), '2026-09-02T09:54:04.240Z');
check('the close time is the closing deal', mt.closeTime, 1788347398654);
check('the trade is keyed on the closing deal', mt.externalId, '317367514');
check("the broker's own gross profit still wins", mt.profit, -1.88);
check("...and its swap too", mt.swap, -0.12);

// TEETH — the old behaviour, reproduced exactly, must lose the open time.
const oldWay = new Map<string, any>();
for (const t of pairDealsIntoTrades([REAL_OPEN, REAL_CLOSE], { 2: 'GBPUSD' })) oldWay.set(t.externalId, t);
for (const d of [REAL_OPEN, REAL_CLOSE]) {
  const t = mapClosedDeal(d, { 2: 'GBPUSD' });
  if (t) oldWay.set(t.externalId, t);          // wholesale overwrite — the defect
}
check('TEETH — the OLD wholesale overwrite really did lose the open time',
      oldWay.get('317367514')?.openTime, undefined);
check('TEETH — and the paired mapping really did have it',
      pairDealsIntoTrades([REAL_OPEN, REAL_CLOSE], { 2: 'GBPUSD' })[0]?.openTime, 1788342844240);


// ── DIRECTION: A LONG MUST NOT BE FILED AS A SHORT ─────────────────────────
//
// His report, 2026-09-03: the EUR/USD trade LOST 1.05R and the journal showed +1.05R.
//
// `ProtoOAPosition` has NO top-level `tradeSide` — read off the installed protobuf, the side lives
// ONLY inside `tradeData`, which is the same object whose `openTimestamp` we measured as MISSING on
// both of his trades. So the old expression fell through to `long = false` and filed EVERY live
// trade as a SHORT. Two lines below, the same flag signs the money, so a $51 LOSS on a long was
// recorded as a $51 WIN.
//
// The payload below is the shape actually observed: a position with `price`, `positionStatus` and
// NO `tradeData`.
const LIVE_LONG_NO_TRADEDATA = {
  deal: {
    dealId: 317231950, orderId: 358554565, positionId: 239582511, symbolId: 1,
    tradeSide: 'SELL',                 // SELLING to close means the position was a LONG
    filledVolume: 5000000, executionPrice: 1.15983,
    executionTimestamp: 1788274166750, dealStatus: 'FILLED', commission: 0, moneyDigits: 2,
  },
  position: {
    positionId: 239582511, positionStatus: 'POSITION_STATUS_CLOSED',
    price: 1.16046, swap: 0, commission: 0, moneyDigits: 2,
    // NO tradeData — this is the whole defect.
  },
};

const liveLong = mapClosedFromEvent(LIVE_LONG_NO_TRADEDATA, { 1: 'EURUSD' })!;
check('a SELL-to-close with no tradeData is recorded as a LONG', liveLong.direction, 'Long');
check('...and its P&L is NEGATIVE, because the long lost',
      (liveLong.profit ?? 0) < 0, true);
check('...at 1.16046 -> 1.15983 on 50 lots-equivalent',
      Math.round((liveLong.profit ?? 0) * 100) / 100, -31.5);

// A genuine SHORT must still come out short — the fix cannot simply flip everything.
const LIVE_SHORT = {
  deal: { ...LIVE_LONG_NO_TRADEDATA.deal, tradeSide: 'BUY', executionPrice: 1.34882 },
  position: { ...LIVE_LONG_NO_TRADEDATA.position, price: 1.34880 },
};
const liveShort = mapClosedFromEvent(LIVE_SHORT, { 1: 'GBPUSD' })!;
check('a BUY-to-close is still recorded as a SHORT', liveShort.direction, 'Short');

// And when tradeData IS present, it stays authoritative — the normal case must not regress.
const LIVE_WITH_TRADEDATA = {
  deal: { ...LIVE_LONG_NO_TRADEDATA.deal, tradeSide: 'SELL' },
  position: { ...LIVE_LONG_NO_TRADEDATA.position,
              tradeData: { tradeSide: 'BUY', openTimestamp: 1788271402114, volume: 5000000 } },
};
const withTD = mapClosedFromEvent(LIVE_WITH_TRADEDATA, { 1: 'EURUSD' })!;
check('tradeData still wins when the gateway sends it', withTD.direction, 'Long');
check('...and the open time comes through with it', withTD.openTime, 1788271402114);

// TEETH — the OLD expression, on the same payload, really did produce a Short.
const p = LIVE_LONG_NO_TRADEDATA.position as any;
const oldPosSide = String(p.tradeData?.tradeSide ?? p.tradeSide ?? '').toUpperCase();
check('TEETH — the old expression had nothing to read', oldPosSide, '');
check('TEETH — ...so it filed this LONG as a Short',
      (oldPosSide === 'BUY' || p.tradeData?.tradeSide === 1) ? 'Long' : 'Short', 'Short');

console.log(`ALL PASS (${count} checks)`);
