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
import { mapClosedDeal, mapClosedFromEvent, pairDealsIntoTrades } from './ctrader';
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
console.log(`ALL PASS (${count} checks)`);
