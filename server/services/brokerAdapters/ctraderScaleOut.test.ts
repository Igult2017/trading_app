/**
 * ctraderScaleOut.test.ts — run with:
 *     npx tsx server/services/brokerAdapters/ctraderScaleOut.test.ts
 *
 * ONE TRADE TAKEN OFF IN THREE PIECES IS ONE TRADE.
 *
 * His report, 2026-09-26: *"Auto sync journal has gap. In one trade, if i took profit at different
 * points, it is recording each profit taken as an individual trade. It should record one order as an
 * order after the whole order has been closed not recording each take profit as a seperate order."*
 *
 * THE PAYLOAD BELOW IS HIS OWN AUTOTRADED EUR/USD POSITION 239582511 — the same deals as
 * `__fixtures__ctrader_deals.json`, with the single closing deal SPLIT into the three partials that
 * produce the defect. Nothing else is invented: the volumes sum to the position's own 8,100,000, the
 * prices sit between the recorded fill and the recorded exit, and the timestamps run in order.
 *
 * FOUR THINGS ARE PINNED HERE, and each one was a separate route to the same wrong journal:
 *   1. the sweep's aggregation emits ONE trade, sized at the whole position
 *   2. it emits NOTHING while the position still holds volume — a trade he has not finished taking
 *      must not appear as a trade he has
 *   3. `mergeDealMappings` does not re-split it into one trade per partial via `mapClosedDeal`
 *   4. the live feed refuses a partial close instead of recording each take-profit in seconds
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { mapClosedFromEvent, pairDealsIntoTrades, mergeDealMappings } from './ctrader';
import { viewPositions } from './ctraderPositions';
import { exitReasonFor } from '../autoJournal/exitReason';
import { computeRisk } from '../autoJournal/risk';

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
console.log('cTRADER SCALE-OUT — one position is one trade, however many times he took profit');

const SYMBOLS: Record<number, string> = { 1: 'EURUSD', 2: 'GBPUSD', 41: 'XAUUSD' };

// ── HIS POSITION, TAKEN OFF IN THREE ───────────────────────────────────────
// 8,100,000 cents of base unit = 81,000 units = 0.81 lots, opened long at 1.16046.
const OPEN = {
  dealId: 317214780, orderId: 358554462, positionId: 239582511, symbolId: 1,
  tradeSide: 'BUY', volume: 8_100_000, filledVolume: 8_100_000,
  executionPrice: 1.16046, executionTimestamp: 1788271402114,
  dealStatus: 'FILLED', commission: 0, moneyDigits: 2,
};
// Three take-profits: 0.27 lots at +20 pips, 0.27 at +40, 0.27 at +10 (the runner trailed back).
const TP1 = {
  dealId: 317220001, orderId: 358560001, positionId: 239582511, symbolId: 1,
  tradeSide: 'SELL', volume: 2_700_000, filledVolume: 2_700_000,
  executionPrice: 1.16246, executionTimestamp: 1788272000000,
  dealStatus: 'FILLED', commission: 0, moneyDigits: 2,
};
const TP2 = {
  ...TP1, dealId: 317225002, orderId: 358565002,
  executionPrice: 1.16446, executionTimestamp: 1788273000000,
};
const TP3 = {
  ...TP1, dealId: 317231950, orderId: 358554565,
  executionPrice: 1.16146, executionTimestamp: 1788274166750,
};
const SCALED = [OPEN, TP1, TP2, TP3];

// ── 1. ONE TRADE OUT, NOT THREE ────────────────────────────────────────────
console.log('\n1. the sweep records the position once:');
const trades = pairDealsIntoTrades(SCALED, SYMBOLS);
check('three take-profits produce ONE trade', trades.length, 1);
const t = trades[0];
check('...keyed on the FINAL closing deal, so a re-sync cannot duplicate it',
      t.externalId, '317231950');
check('...carrying the position id, which is the join to everything else', t.positionId, '239582511');
check('...the WHOLE position size, not the last slice', t.lots, 0.81);
check('...the direction of the opening deal', t.direction, 'Long');
check('...entered where it was filled', t.openPrice, 1.16046);
// (2.7m·1.16246 + 2.7m·1.16446 + 2.7m·1.16146) / 8.1m = 1.16279333… -> 1.16279 at the column's 5dp
check('...exited at the VOLUME-WEIGHTED average of the three', t.closePrice, 1.16279);
check('...opened when the position opened', t.openTime, 1788271402114);
check('...closed when the LAST piece came off', t.closeTime, 1788274166750);
// Leg by leg: (0.002 + 0.004 + 0.001) × 27,000 = 54 + 108 + 27 = 189.00
check('...with the money all three legs actually made', t.profit, 189);
check('...and it says it came off in three', t.closedInParts, 3);
check('...naming each one, in order', t.exits?.map(e => e.dealId),
      ['317220001', '317225002', '317231950']);
check('...with each slice\'s own price', t.exits?.map(e => e.price), [1.16246, 1.16446, 1.16146]);
check('...and each slice\'s own size', t.exits?.map(e => e.lots), [0.27, 0.27, 0.27]);
// THE ENTRY ORDER IS THE OPENING ONE. The three closing orders carry no levels, so taking one of
// them would lose the risk the trade was placed with — and with it every R on the row.
check('the entry order is the one that OPENED the position', t.entryOrderId, '358554462');

// THE ROUNDED AVERAGE IS NOT WHAT THE MONEY IS COMPUTED FROM. (1.16279 − 1.16046) × 81,000 = 188.73,
// which is 27 cents adrift of what the account actually received. Summing the legs is exact.
const fromRoundedAverage = Math.round(((t.closePrice! - t.openPrice!) * 81_000) * 100) / 100;
check('TEETH — computing from the rounded average would be wrong', fromRoundedAverage, 188.73);
teeth('...and the trade does NOT carry that figure', t.profit !== fromRoundedAverage);

// ── 2. A POSITION STILL HOLDING VOLUME IS NOT A TRADE YET ──────────────────
console.log('\n2. nothing is recorded until the whole order is closed:');
check('after the first take-profit, nothing', pairDealsIntoTrades([OPEN, TP1], SYMBOLS).length, 0);
check('after the second, still nothing', pairDealsIntoTrades([OPEN, TP1, TP2], SYMBOLS).length, 0);
check('after the third, one trade', pairDealsIntoTrades(SCALED, SYMBOLS).length, 1);
// AND THE SWEEP CAN STILL SAY WHY, which is the difference between "the sync is broken" and "the
// trade is not over yet". On 02 Sep not being able to tell those apart cost four deploys.
const half = viewPositions([OPEN, TP1], SYMBOLS)[0];
check('the view reports what is open', [half.openVolume, half.closedVolume, half.fullyClosed],
      [8_100_000, 2_700_000, false]);

// A WINDOW THAT STARTS AFTER THE POSITION OPENED is a partial VIEW, not a closed trade. Emitting it
// would invent a trade with no entry price; the volumes not balancing is what says so, and the hourly
// deep sweep is what eventually brings both ends into one window.
check('closing deals with no opening deal produce nothing',
      pairDealsIntoTrades([TP1, TP2, TP3], SYMBOLS).length, 0);

// TEETH — the OLD rule, reproduced. It took the last deal as "the close" and asked nothing else, so
// it emitted a trade after the FIRST partial, sized at that partial and keyed on its deal id. Two
// syncs later that is three rows for one trade.
const oldRule = (deals: any[]) => {
  const byPos = new Map<string, any[]>();
  for (const d of deals) {
    const k = String(d.positionId);
    byPos.set(k, [...(byPos.get(k) ?? []), d]);
  }
  const out: any[] = [];
  for (const [, g] of byPos) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.executionTimestamp - b.executionTimestamp);
    out.push({ externalId: String(g[g.length - 1].dealId),
               lots: (g[g.length - 1].filledVolume / 100) / 100_000 });
  }
  return out;
};
check('TEETH — the old rule recorded a trade after the FIRST partial',
      oldRule([OPEN, TP1]).length, 1);
check('TEETH — ...sized at that partial, not the position', oldRule([OPEN, TP1])[0].lots, 0.27);
check('TEETH — ...and its id CHANGED as each further take-profit arrived',
      [oldRule([OPEN, TP1])[0].externalId,
       oldRule([OPEN, TP1, TP2])[0].externalId,
       oldRule(SCALED)[0].externalId],
      ['317220001', '317225002', '317231950']);
teeth('...which is three externalIds for one trade, so three journal entries',
      new Set([oldRule([OPEN, TP1])[0].externalId,
               oldRule([OPEN, TP1, TP2])[0].externalId,
               oldRule(SCALED)[0].externalId]).size === 3);

// ── 3. THE DETAILED PATH MUST NOT RE-SPLIT IT ──────────────────────────────
//
// This gateway's deals DO carry `closePositionDetail` (measured in production 02 Sep), and
// `mergeDealMappings` used to run `mapClosedDeal` over EVERY deal and key the result on that deal's
// own id. So aggregating in `pairDealsIntoTrades` alone would have fixed nothing: the merge would
// have put the three partials straight back as three trades.
console.log('\n3. the detailed mapping merges INTO the position, it does not re-split it:');
const withDetail = [
  OPEN,
  { ...TP1, closePositionDetail: { entryPrice: 1.16046, grossProfit: 5400, swap: -40 } },
  { ...TP2, closePositionDetail: { entryPrice: 1.16046, grossProfit: 10800, swap: -40 } },
  { ...TP3, closePositionDetail: { entryPrice: 1.16046, grossProfit: 2700, swap: -40 } },
];
const merged = mergeDealMappings(withDetail, SYMBOLS);
check('three detailed partials still produce ONE trade', merged.length, 1);
check('...still keyed on the final closing deal', merged[0].externalId, '317231950');
check('...still the whole position size', merged[0].lots, 0.81);
// THE BROKER'S OWN MONEY, SUMMED ACROSS ALL THREE. 54 + 108 + 27 = 189.00. Taking the last partial's
// figure alone — which is what a per-deal overwrite does — would have reported $27 on a $189 trade.
check('...and the broker\'s own gross profit summed over every slice', merged[0].profit, 189);
check('...its swap summed too', merged[0].swap, -1.2);
check('...with the open time the detail does not carry', merged[0].openTime, 1788271402114);
teeth('the last slice\'s own profit ($27) is NOT what the trade reports',
      merged[0].profit !== 27);

// A DEAL THAT BELONGS TO NO POSITION still stands alone — the only route left for a gateway that
// sends the detail without a usable positionId, and losing it would lose the trade.
const orphan = mergeDealMappings([{
  dealId: 999, symbolId: 1, tradeSide: 'SELL', filledVolume: 10_000_000,
  executionPrice: 1.15983, executionTimestamp: 1788274166750, dealStatus: 'FILLED', commission: -410,
  closePositionDetail: { entryPrice: 1.16046, entryTimestamp: 1788271402114, grossProfit: -6300 },
}], SYMBOLS);
check('a detailed deal with no position is still recorded', orphan.map(x => x.externalId), ['999']);

// ── 4. THE LIVE FEED REFUSES A PARTIAL ─────────────────────────────────────
//
// `mapClosedFromEvent` treated ANY opposite-side deal as a close, and a partial take-profit is exactly
// that — so each one was recorded the instant it filled. One event cannot aggregate a position (it
// carries one deal), so the honest answer is to hand the case to the sweep.
console.log('\n4. the live feed records nothing for a partial exit:');
const partialEvent = {
  deal: { dealId: 317220001, positionId: 239582511, symbolId: 1, tradeSide: 'SELL',
          filledVolume: 2_700_000, executionPrice: 1.16246,
          executionTimestamp: 1788272000000, dealStatus: 'FILLED', moneyDigits: 2 },
  position: { positionId: 239582511, positionStatus: 'POSITION_STATUS_OPEN', price: 1.16046,
              tradeData: { tradeSide: 'BUY', openTimestamp: 1788271402114, volume: 8_100_000 },
              commission: 0, swap: 0, moneyDigits: 2 },
};
check('a partial take-profit records nothing', mapClosedFromEvent(partialEvent, SYMBOLS), null);

// AND THE FINAL SLICE IS REFUSED TOO, although its status says CLOSED — because one event cannot know
// the other two slices' prices, so recording it would file a 0.81-lot trade as 0.27 lots with $27 of
// its $189. This is the case that makes the volume test load-bearing rather than belt-and-braces.
const finalSliceEvent = {
  deal: { ...partialEvent.deal, dealId: 317231950, executionPrice: 1.16146,
          executionTimestamp: 1788274166750 },
  position: { ...partialEvent.position, positionStatus: 'POSITION_STATUS_CLOSED' },
};
check('the FINAL slice of a scaled-out position is also left to the sweep',
      mapClosedFromEvent(finalSliceEvent, SYMBOLS), null);

// A TRADE CLOSED IN ONE DEAL MUST STILL REACH THE JOURNAL IN SECONDS. That is the whole point of the
// feed, and a fix that silenced it for every trade would be a worse defect than the one it cures.
const wholeEvent = {
  deal: { ...partialEvent.deal, dealId: 317231950, filledVolume: 8_100_000,
          executionPrice: 1.16146, executionTimestamp: 1788274166750 },
  position: { ...partialEvent.position, positionStatus: 'POSITION_STATUS_CLOSED' },
};
const whole = mapClosedFromEvent(wholeEvent, SYMBOLS);
check('a single full close is still recorded live', whole?.externalId, '317231950');
check('...at the whole position size', whole?.lots, 0.81);
check('...with its money', whole?.profit, 81);

// AND THE PAYLOAD WITH NO tradeData AT ALL — the shape actually observed on his account 03 Sep — must
// still work off the status alone, or the direction fix of that day is undone.
const noTradeData = {
  deal: { ...wholeEvent.deal },
  position: { positionId: 239582511, positionStatus: 'POSITION_STATUS_CLOSED',
              price: 1.16046, swap: 0, commission: 0, moneyDigits: 2 },
};
check('a close with no tradeData is still recorded, from the status',
      mapClosedFromEvent(noTradeData, SYMBOLS)?.externalId, '317231950');
check('...and still as the LONG it was', mapClosedFromEvent(noTradeData, SYMBOLS)?.direction, 'Long');

// TEETH — the OLD condition, on the partial event, really did record it.
const p: any = partialEvent.position, d: any = partialEvent.deal;
const oldClosedBySide = String(p.tradeData?.tradeSide ?? '').toUpperCase()
                        !== String(d.tradeSide ?? '').toUpperCase();
teeth('the old opposite-side test called this partial a close', oldClosedBySide === true);

// ── 5. WHAT THE JOURNAL MAKES OF IT ────────────────────────────────────────
//
// A scaled-out trade did not finish ON a level — it finished at the volume-weighted average of
// several — so no level can describe how it ended, and `computeRisk` must not snap it to a placed
// level. Both snaps would be fictions on a trade that banked partials before the rest came off.
console.log('\n5. the journal reports the shape, and never snaps the R:');
check('a trade taken off in pieces is a Partial Take Profit',
      exitReasonFor({ symbol: 'EURUSD', entryPrice: 1.16046, closePrice: 1.16279,
                      originalStopLoss: 1.15986, originalTakeProfit: 1.16446,
                      closedInParts: 3 }),
      'Partial Take Profit');
check('...and one closed in a single deal still names its level',
      exitReasonFor({ symbol: 'EURUSD', entryPrice: 1.16046, closePrice: 1.16446,
                      originalStopLoss: 1.15986, originalTakeProfit: 1.16446,
                      closedInParts: 1 }),
      'Take Profit');

// THE TRAP THIS GUARDS. The snap exists to take the SPREAD out of a result: a trade filled two points
// short of its target really did make the target, so `1:6.67` is the honest number for it. Exactly the
// same two points on a VOLUME-WEIGHTED AVERAGE mean nothing of the kind — the average lands where the
// slices happen to average to, and claiming the planned R there says the whole position reached a
// target only part of it ever saw.
//
// Entry 1.16046, stop 1.15986 (6.0 pips of risk), target 1.16446 (40 pips, so a planned 1:6.67).
// The exit below is 1.16444 — two points short, inside the half-pip tolerance the snap uses.
const nearTarget = { symbol: 'EURUSD', direction: 'Long', entryPrice: 1.16046,
                     closePrice: 1.16444, originalStopLoss: 1.15986,
                     originalTakeProfit: 1.16446, outcome: 'WIN' as const };
const wholeR  = computeRisk({ ...nearTarget,
                              exitReason: exitReasonFor({ ...nearTarget, closedInParts: 1 }) });
const scaledR = computeRisk({ ...nearTarget,
                              exitReason: exitReasonFor({ ...nearTarget, closedInParts: 3 }) });
check('both read the same plan', [wholeR.plannedRR, scaledR.plannedRR], [6.67, 6.67]);
check('a single full close two points short of target snaps to the planned R',
      wholeR.achievedRR, 6.67);
check('...and a scaled-out one reports what it MEASURED instead', scaledR.achievedRR, 6.63);
teeth('the two are not the same number, which is the whole point of the rule',
      scaledR.achievedRR !== wholeR.achievedRR);

// ── THE UNSPLIT FIXTURE MUST STILL BEHAVE ──────────────────────────────────
// Six real deals, three positions, each closed in ONE deal. The aggregation must be invisible to them
// or this change breaks every trade he has already recorded correctly.
console.log('\n6. the real six-deal fixture is untouched by any of this:');
const DEALS: any[] = JSON.parse(
  readFileSync(join(process.cwd(), 'server', 'services', 'brokerAdapters',
                    '__fixtures__ctrader_deals.json'), 'utf8'));
const plain = pairDealsIntoTrades(DEALS, SYMBOLS);
check('still three closed positions', plain.length, 3);
check('still three distinct ids', new Set(plain.map(x => x.externalId)).size, 3);
const his = plain.find(x => x.openPrice === 1.16046);
check('his EUR/USD is still 0.81 lots at a $51.03 loss', [his?.lots, his?.profit], [0.81, -51.03]);
check('...still keyed on its closing deal', his?.externalId, '317231950');
check('...and it does NOT claim to have been scaled out of', his?.closedInParts, 1);

console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
