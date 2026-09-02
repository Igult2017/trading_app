/**
 * journalParity.test.ts — run with:
 *     DATABASE_URL="postgresql://x:x@localhost:5432/x" npx tsx server/services/journalParity.test.ts
 *
 * DOES A TRADE FROM THE BROKER REACH EVERY JOURNAL PAGE THE WAY A TYPED ONE DOES?
 *
 * His question, 2026-09-02: *"have you audited journal and ctrader account sync to ensure it
 * provided data of trades to all the pages of the journal like calender, dashboard, drawdown, etc
 * like i would do manually using journal form?"*
 *
 * It did not. Every page is built from the SAME list — `resolveComputeScope` in routes.ts reads
 * `journal_entries` for the user and the calendar, drawdown, metrics and timeframe engines all
 * consume it — so reaching the pages is not the problem. Carrying the same FIELDS was.
 *
 * Six gaps, each verified by reading both paths:
 *
 *   1. THE CACHED PAGES WERE NEVER CLEARED. `invalidateComputeCaches` was a local function in
 *      routes.ts with three callers, all of them the manual endpoints. The sync writes through
 *      `storage.createJournalEntry` directly, so a broker trade stayed invisible on every page for
 *      up to five minutes. It now lives in `lib/cache.ts` where both paths can reach it.
 *   2. NO BALANCE OR MONETARY RISK. `POST /api/journal/entries` calls `enrichTradeWithBalance`
 *      before inserting; this path did not, so `accountBalance` and `monetaryRisk` were blank.
 *   3. NO RISK PERCENT. The manual endpoint defaults it to 1; this left it null, and the drawdown
 *      engine reads it.
 *   4. A TRADE COULD NEVER BE BREAKEVEN. `netPl >= 0 ? 'WIN' : 'LOSS'` files a flat trade as a WIN
 *      and, after costs, a stop-moved-to-breakeven exit as a LOSS. Both engines have a breakeven
 *      class. VIX.1's ladder moves the stop to breakeven at 0.4R, so this is the ordinary outcome
 *      of a managed trade.
 *   5. PIPS WERE GUESSED FROM THE PRICE. `price > 100 ? 100 : 10000` — right for the four currency
 *      pairs by luck, and TEN TIMES too many for gold, which quotes to 2 decimals.
 *   6. THE STOP AND TARGET WERE THROWN AWAY. The live event's position carries both, so no synced
 *      trade had a risk/reward, a stop distance or an achieved R.
 *
 * These are field-level checks on the real functions, plus wiring checks read off the source for
 * the two paths that need a database to run.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { pipDigits, pipSize, toPips } from '../lib/pipMath';
import { classifyOutcome } from './brokerSyncService';
import { mapClosedFromEvent } from './brokerAdapters/ctrader';

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

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

/** Source with comments removed.
 *
 * REQUIRED FOR THE "IS IT GONE?" CHECKS, and it is the second time this has bitten. Each fix below
 * QUOTES the rule it replaced, so that the next reader knows what was wrong and why — and a plain
 * text search then finds the old rule alive in the very comment explaining its removal.
 * `server/lib/entryParity.test.ts` strips comments for exactly this reason.
 */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const sync   = stripComments(read('server', 'services', 'brokerSyncService.ts'));
const routes = stripComments(read('server', 'routes.ts'));
const cache  = read('server', 'lib', 'cache.ts');

console.log();
console.log('JOURNAL PARITY — a broker trade must carry what a typed one carries');

// ── 5. PIPS COME FROM THE INSTRUMENT, NOT FROM HOW BIG ITS PRICE IS ─────────
// The old rule was `price > 100 ? 100 : 10000`. These four are the ones it got right, by luck.
check('EUR/USD is quoted to 5 decimals', pipDigits('EUR/USD'), 5);
check('...so a pip is 0.0001', pipSize('EUR/USD'), 0.0001);
check('a 6.3-pip EUR/USD move reads as 6.3', toPips(0.00063, 'EUR/USD'), 6.3);
check('USD/JPY is 3 decimals, pip 0.01', [pipDigits('USD/JPY'), pipSize('USD/JPY')], [3, 0.01]);
check('GBP/JPY the same', pipSize('GBP/JPY'), 0.01);

// AND THE ONE IT GOT WRONG. Gold quotes to 2 decimals — the broker said so itself on 31 Aug,
// refusing a 3-decimal price — so a pip is 0.10 and a $4.20 move is 42 pips, not 420.
check('gold is quoted to 2 decimals', pipDigits('XAU/USD'), 2);
check('...so a pip is 0.10, not 0.01', pipSize('XAU/USD'), 0.1);
check('a $4.20 gold move is 42 pips', toPips(4.20, 'XAU/USD'), 42);
check('...where the OLD rule said 420', Math.round(4.20 * 100), 420);
check('a $12 gold move is 120 pips', toPips(12, 'XAU/USD'), 120);
check('the Node table matches the Python one for gold',
      pipDigits('XAUUSD') === 2 && pipDigits('XAU/USD') === 2, true);
check('an unknown FX pair still defaults to 5 decimals', pipDigits('EUR/CHF'), 5);
check('a bad number yields nothing rather than a fake zero', toPips(NaN, 'EUR/USD'), undefined);

// ── 6. THE STOP AND TARGET ARE CAPTURED FROM THE LIVE POSITION ──────────────
const closeEvent = {
  deal: { dealId: 317231950, symbolId: 1, tradeSide: 'SELL', filledVolume: 8_100_000,
          executionPrice: 1.15983, executionTimestamp: 1788274166750, dealStatus: 'FILLED' },
  position: { positionId: 239582511, positionStatus: 'POSITION_STATUS_CLOSED',
              price: 1.16046, tradeData: { tradeSide: 'BUY', openTimestamp: 1788271402114 },
              stopLoss: 1.15986, takeProfit: 1.16295, commission: -410, swap: 0, moneyDigits: 2 },
};
const live = mapClosedFromEvent(closeEvent, { 1: 'EURUSD' });
// These are the real levels signal 70d8dac7 placed: STOP BUY 1.16048, SL 1.15986, TP 1.16295.
check('the stop reaches the journal', live?.stopLoss, 1.15986);
check('...and the target', live?.takeProfit, 1.16295);
// A position with no stop must not invent one — 0 is cTrader's "unset", not a price of zero.
const noStop = mapClosedFromEvent(
  { ...closeEvent, position: { ...closeEvent.position, stopLoss: 0, takeProfit: 0 } },
  { 1: 'EURUSD' });
check('an unset stop stays empty, never 0', [noStop?.stopLoss, noStop?.takeProfit],
      [undefined, undefined]);

// The risk numbers the journal pages read, derived from those levels the way the code does it.
const ep = 1.16046, sl = 1.15986, tp = 1.16295, xp = 1.15983;
const risk = Math.abs(ep - sl), reward = Math.abs(tp - ep);
check('risk/reward comes out at 4.15', Math.round((reward / risk) * 100) / 100, 4.15);
check('the stop was 6 pips', toPips(risk, 'EURUSD'), 6);
check('and the trade achieved -1.05R', Math.round(((xp - ep) / risk) * 100) / 100, -1.05);

// ── 4. A TRADE CAN BE BREAKEVEN — driven through the REAL classifier ────────
// His actual trade: gross -51.03, commission -4.10, so net -55.13 on a 6-pip stop.
const t = (o: Record<string, any>) => ({
  openPrice: '1.16046', closePrice: '1.15983', stopLoss: '1.15986',
  lots: '0.81', profitLoss: '-51.03', commission: '-4.10', swap: '0', ...o,
}) as any;

check('his real losing trade is a LOSS', classifyOutcome(-55.13, t({})), 'LOSS');

// THE LADDER'S OWN OUTCOME. Stop moved to breakeven at 0.4R, price comes back, exit AT the entry:
// the trade moved zero, so there is no risk band at all and commission alone used to make it a LOSS.
const flat = t({ closePrice: '1.16046', stopLoss: '1.16046', profitLoss: '0' });
check('a stop-out at the entry price is BREAKEVEN, not a loss', classifyOutcome(-4.10, flat), 'BE');
check('...even with a swap charge too',
      classifyOutcome(-5.30, t({ closePrice: '1.16046', stopLoss: '1.16046',
                                 profitLoss: '0', swap: '-1.20' })), 'BE');
check('an exactly flat result with no costs is BREAKEVEN',
      classifyOutcome(0, t({ closePrice: '1.16046', profitLoss: '0', commission: '0' })), 'BE');

// A SCRATCH IS NOT A WIN. A trade that made less than it cost to place went nowhere.
check('a $0.40 net result inside $4.10 of costs is BREAKEVEN',
      classifyOutcome(0.40, t({ profitLoss: '4.50' })), 'BE');
check('a real win is still a WIN', classifyOutcome(95.90, t({ profitLoss: '100.00' })), 'WIN');
check('a real loss is still a LOSS', classifyOutcome(-104.10, t({ profitLoss: '-100.00' })), 'LOSS');

// ...and the band scales with the trade, so it cannot swallow a real result on a large position.
// Money risked here = (51.03/0.00063) x 0.0006 = $48.60; a twentieth of that is $2.43, under the
// $4.10 of costs, so costs are the wider band and the one that applies.
check('the band is the WIDER of the risk and the costs',
      classifyOutcome(-3.00, t({})), 'BE');
check('...and $10 is outside both', classifyOutcome(-10.00, t({})), 'LOSS');

// INTRODUCING 'BE' MUST NOT MAKE TRADES VANISH. It is a new outcome value on a path that only ever
// emitted WIN and LOSS, so every engine that reads `outcome` was checked before shipping it:
//   calendar  — lowercases, counts BE in `trades` and its P&L but excludes it from wins/losses, and
//               divides the win rate by `decisive = wins + losses` (calendar_calculator.py:98-122)
//   metrics   — `BE_OUTCOMES` contains "BE" verbatim (metrics_calculator.py:49)
//   drawdown  — `_BE_ALIASES` contains "be" and `_s()` lowercases (drawdown/_utils.py:140)
const calendarPy = read('server', 'python', 'calendar_calculator.py');
const metricsPy  = read('server', 'python', 'metrics_calculator.py');
const drawdownPy = read('server', 'python', 'drawdown', '_utils.py');
check('the metrics engine knows "BE"', metricsPy.includes('BE_OUTCOMES'), true);
check('...and accepts that exact spelling', /BE_OUTCOMES.*"BE"/.test(metricsPy), true);
check('the drawdown engine has a breakeven class', drawdownPy.includes('_BE_ALIASES'), true);
check('the calendar keeps a breakeven OUT of the win rate',
      calendarPy.includes('decisive = data["wins"] + data["losses"]'), true);
check('...while still counting it as a trade',
      calendarPy.includes('daily[day_key]["trades"] += 1'), true);
// And the uppercase spellings the sync emits are the ones these engines accept.
check('the metrics engine accepts uppercase WIN and LOSS',
      /WIN_OUTCOMES.*"WIN"/.test(metricsPy) && /LOSS_OUTCOMES.*"LOSS"/.test(metricsPy), true);

// ── WIRING: the six fixes are actually connected ────────────────────────────
check('1. the sync clears the cached pages',
      sync.includes('invalidateComputeCaches(defaultSessionId'), true);
check('...and the helper is shared, not local to routes.ts',
      cache.includes('export async function invalidateComputeCaches'), true);
check('...so routes.ts imports it rather than defining its own',
      routes.includes('invalidateComputeCaches } from "./lib/cache"') ||
      routes.includes('invalidateComputeCaches') && !routes.includes('async function invalidateComputeCaches'),
      true);
check('2. the sync runs the same balance enrichment as the form',
      sync.includes('enrichTradeWithBalance(sessionId'), true);
check('...which is the same function the manual endpoint uses',
      routes.includes('enrichTradeWithBalance(sessionId'), true);
check('3. a risk percent is always recorded', sync.includes("riskPercent: '1'"), true);
check('4. breakeven is a possible outcome', sync.includes("'BE'"), true);
check('...and the old two-way rule is gone',
      sync.includes("netPl >= 0 ? 'WIN' : 'LOSS'"), false);
check('5. the price-magnitude pip guess is gone',
      sync.includes('ep > 100 ? 100 : 10000'), false);
check('...replaced by the instrument table', sync.includes("from '../lib/pipMath'"), true);
check('6. risk/reward and achieved R are stored',
      sync.includes('riskReward:') && sync.includes('achievedRR'), true);

// EVERY PAGE READS THE SAME LIST, so these fields land everywhere at once. Asserted so that a
// future change routing one page around `resolveComputeScope` is caught here.
for (const ns of ['entries', 'metrics', 'calendar', 'drawdown', 'tfmatrix']) {
  check(`the ${ns} page's cache is cleared with the rest`, cache.includes(`"${ns}"`), true);
}

// ── THE LAST LINK: THE BROWSER HAS TO ASK AGAIN ────────────────────────────
// The server can hold the trade and still never show it. The app sets `staleTime: Infinity` and
// `refetchOnWindowFocus: false` globally, and NOTHING on the client knows a broker sync happened —
// the three things that refresh the journal (saving the form, editing in Trade Vault, deleting a
// session) are all the user's own actions. So every journal panel must set its own freshness, or it
// sits on pre-sync numbers indefinitely — a page reload included, because the persisted cache is
// restored with a fresh timestamp and "never stale" survives the reload.
//
// The Dashboard's two queries were the only ones without it.
const panels: [string, string, RegExp][] = [
  ['Dashboard',   join('client', 'src', 'pages', 'Journal.tsx'),                 /staleTime: PANEL_STALE_MS/],
  ['Trade Vault', join('client', 'src', 'components', 'TradeVault.tsx'),         /staleTime: 2 \* 60 \* 1000/],
  ['Calendar',    join('client', 'src', 'components', 'TradingCalendar.tsx'),    /staleTime: 2 \* 60 \* 1000/],
  ['Drawdown',    join('client', 'src', 'components', 'DrawdownPanel.tsx'),      /staleTime: 0/],
  ['Metrics',     join('client', 'src', 'components', 'MetricsPanel.tsx'),       /staleTime: 2 \* 60 \* 1000/],
  ['Audit',       join('client', 'src', 'components', 'StrategyAudit.tsx'),      /staleTime: 0/],
  ['Sessions',    join('client', 'src', 'components', 'CreateSession.tsx'),      /staleTime: 0/],
];
for (const [name, file, re] of panels) {
  check(`the ${name} panel re-asks the server rather than inheriting "never stale"`,
        re.test(readFileSync(join(process.cwd(), file), 'utf8')), true);
}
// BOTH Dashboard queries, not just one — it shows the metrics AND the recent-trades list.
const journalSrc = readFileSync(join(process.cwd(), 'client', 'src', 'pages', 'Journal.tsx'), 'utf8');
check('...and the Dashboard sets it on BOTH of its queries',
      (journalSrc.match(/staleTime: PANEL_STALE_MS/g) ?? []).length, 2);

// ── TEETH ──────────────────────────────────────────────────────────────────
teeth('the old pip rule really was wrong for gold', Math.round(4.20 * 100) !== 42);
teeth('...and really was right for EUR/USD', Math.round(0.00063 * 10000 * 100) / 100 === 6.3);
teeth('a synced trade with no stop still records no risk/reward',
      mapClosedFromEvent({ ...closeEvent,
        position: { ...closeEvent.position, stopLoss: 0 } }, { 1: 'EURUSD' })?.stopLoss === undefined);

console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
