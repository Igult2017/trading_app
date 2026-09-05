/**
 * risk.test.ts — run with:
 *     npx tsx server/services/autoJournal/risk.test.ts
 *
 * R MEASURED AGAINST THE RISK THAT WAS ACTUALLY TAKEN.
 *
 * His question, 2026-09-02: *"if we are calculating RR in signals, why cant we calculate RR based on
 * wins and losses and populate the journals accurately?"* — and his ruling on the one ambiguous
 * case: **"Breakeven is 1:0 R."**
 *
 * Every number below comes from his own Pepperstone demo account, not from an invented example.
 * The GBP/USD trade of 02 Sep, entry order 358693875:
 *
 *     entry (stopPrice) 1.34886 · original stopLoss 1.34939 · original takeProfit 1.34672
 *     filled 1.34880 SELL · exited 1.34882
 *
 * -> risk 5.3 pips, target 21.4 pips, planned 4.04R. It exited two points above its fill: the
 * ladder had moved the stop to breakeven and the market took it. Achieved 0R.
 *
 * Before this, the journal recorded NOTHING for that trade — it measured risk from the stop the
 * position closed on, which WAS the entry, so risk came to zero and every risk field went blank.
 */
import { computeRisk } from './risk';
import { buildJournalEntry } from './fields';
import { exitReasonFor } from './exitReason';
import { marketContextFor, classifyNews } from './context';

let pass = 0, fail = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

console.log('\nAUTO-JOURNAL RISK — measured against the stop the trade was PLACED with\n');

// ── HIS REAL TRADE ─────────────────────────────────────────────────────────
const GBPUSD = {
  symbol: 'GBPUSD', direction: 'Short',
  entryPrice: 1.34886,            // where the stop order triggered
  closePrice: 1.34882,
  originalStopLoss: 1.34939,
  originalTakeProfit: 1.34672,
  outcome: 'BE' as const,
};
const r = computeRisk(GBPUSD);
check('the risk is the 5.3 pips he actually staked', r.stopLossDistance, 5.3);
check('the target is 21.4 pips', r.takeProfitDistance, 21.4);
check('the plan was 4.04R', r.plannedRR, 4.04);
check('a breakeven stop-out records 0R, not a blank — his rule, "Breakeven is 1:0 R"',
      r.achievedRR, 0);

// TEETH — the OLD behaviour on the same trade. The ladder moved the stop to the entry price, so
// measuring risk from the CLOSING stop gives zero, and every risk field disappears.
// Breakeven means the stop is moved to the ENTRY, so both are the same number — that is what makes
// the risk collapse to nothing. (My first draft used the fill, 1.34880, against the trigger price,
// 1.34886, which leaves a 0.6-pip gap and so is not breakeven at all.)
const oldWay = computeRisk({ ...GBPUSD, entryPrice: 1.34880, originalStopLoss: 1.34880 });
check('TEETH — measuring from the moved stop really does erase the risk',
      oldWay.stopLossDistance, undefined);
check('TEETH — ...and the R with it', oldWay.achievedRR, undefined);

// ── A WINNER, MEASURED IN R ────────────────────────────────────────────────
// Same 5.3-pip risk, run to the original target.
const won = computeRisk({ ...GBPUSD, closePrice: 1.34672, outcome: 'WIN' });
check('a trade that reaches its target returns the planned R', won.achievedRR, 4.04);

// A trade trailed out at +2R. The stop it CLOSED on was beyond entry — the old code would have
// measured risk against that and produced a number with no meaning.
const trailed = computeRisk({ ...GBPUSD, closePrice: 1.34780, outcome: 'WIN' });
check('a trailed exit is measured against the ORIGINAL risk', trailed.achievedRR, 2);

// ── A FULL LOSS ────────────────────────────────────────────────────────────
const lost = computeRisk({ ...GBPUSD, closePrice: 1.34939, outcome: 'LOSS' });
check('a stop-out at the original stop is exactly -1R', lost.achievedRR, -1);

// ── LONG SIDE, so the sign convention is not accidentally short-only ───────
const long = computeRisk({
  symbol: 'EURUSD', direction: 'Long',
  entryPrice: 1.16048, closePrice: 1.16295, originalStopLoss: 1.15986,
  originalTakeProfit: 1.16295, outcome: 'WIN',
});
check('a long winner is positive R', long.achievedRR, 3.98);
check('...and its risk is 6.2 pips', long.stopLossDistance, 6.2);

// ── NOTHING IS INVENTED WHERE NOTHING IS KNOWN ─────────────────────────────
// A trade placed without a stop leaves these blank. Falling back to the closing stop is exactly
// what produced the wrong numbers, so there is deliberately no fallback.
const noStop = computeRisk({ ...GBPUSD, originalStopLoss: null, outcome: 'WIN' });
check('no original stop means no risk numbers at all', noStop, {});

const noTarget = computeRisk({ ...GBPUSD, originalTakeProfit: null, outcome: 'WIN' });
check('no target still gives the risk...', noTarget.stopLossDistance, 5.3);
// A SELL from 1.34886 exited at 1.34882 moved 0.4 pips in favour against a 5.3-pip risk:
// 0.00004 / 0.00053 = 0.08R. Small, and that is the point — it is a scratch, and the honest number
// for a scratch is a small one, not a blank.
check('...and an achieved R', noTarget.achievedRR, 0.08);
check('...but no planned R to compare against', noTarget.plannedRR, undefined);

const zeroRisk = computeRisk({ ...GBPUSD, originalStopLoss: 1.34886, outcome: 'WIN' });
check('a stop AT the entry cannot define a risk', zeroRisk, {});


// ── THE LEVEL IT FINISHED ON DECIDES THE R ─────────────────────────────────
//
// HIS REPORT, 2026-09-05: *"for autosync RR is not computed or entered accurately."* His real EURUSD
// trade of 01 Sep was a clean stop-out and the journal recorded **-1.05R** — the spread and the
// slippage landing inside `move / risk`. His own form does not do that: a Loss is fixed at "1:-1"
// and a BE at "1:0" (JournalForm.tsx:1511-1528). Borrowed, so a synced loss and a typed loss are
// the same number and can be averaged together.
console.log('\n  the exit level decides the R, not the raw price move:');

// EURUSD 317231950. The entry order (358554462), its stop 1.15986 and its target 1.16295 are read
// off production (`/api/admin/sync-events`, which recorded "risked 6 pips ... achieved 1.05R of a
// planned 4.15R" — the 1.05 unsigned, on a trade that LOST $51.03). The exit price below is chosen
// to put the trade through its stop by half a pip, which is what a stop-out with slippage looks
// like; the point of the check is the rule, not that exact tick.
const EURUSD_LOSS = {
  symbol: 'EURUSD', direction: 'Long' as const,
  entryPrice: 1.16048, originalStopLoss: 1.15986, originalTakeProfit: 1.16295,
  closePrice: 1.15982,                       // through the stop by 0.4 of a pip — the slippage
  outcome: 'LOSS' as const,
};
check('a stop-out measures worse than -1R from the raw prices, because of the slippage',
      computeRisk(EURUSD_LOSS).achievedRR, -1.06);
check('...and records exactly -1R once the exit is known to be the stop',
      computeRisk({ ...EURUSD_LOSS, exitReason: 'Stop Loss' }).achievedRR, -1);
check('...while its PLAN is untouched at 3.98R',
      computeRisk({ ...EURUSD_LOSS, exitReason: 'Stop Loss' }).plannedRR, 3.98);

check('a target reached records exactly the planned R',
      computeRisk({ ...GBPUSD, closePrice: 1.34670, outcome: 'WIN', exitReason: 'Take Profit' })
        .achievedRR, 4.04);

// AND THE HALF THAT MUST NOT BE SNAPPED. A trade managed out did something real; rounding it to a
// placed level would erase the only number that says what the management achieved.
check('a trailed exit keeps its measured R',
      computeRisk({ ...GBPUSD, closePrice: 1.34780, outcome: 'WIN', exitReason: 'Trailed Stop' })
        .achievedRR, 2);
// BOTH SIGNALS MUST AGREE. The exit reason is read from prices with half a pip of tolerance, so on
// its own it is a guess. A "Stop Loss" exit on a WINNING trade is a contradiction, and the measured
// number stands rather than a -1 nobody can justify.
check('a contradiction between outcome and exit reason is NOT snapped',
      computeRisk({ ...GBPUSD, closePrice: 1.34780, outcome: 'WIN', exitReason: 'Stop Loss' })
        .achievedRR, 2);


// ── THE WHOLE ENTRY, END TO END, FROM HIS REAL TRADE ───────────────────────
//
// `computeRisk` being right is not the same as the ENTRY being right, and driving the real builder
// proved it: the first run came out **LOSS at 0.08R** for a trade that is plainly a scratch.
//
// The cause was the same wrong stop, one function further on. `classifyOutcome` sizes its breakeven
// band as a fraction of THE MONEY THE STOP WAS RISKING — so feeding it the CLOSING stop (0.2 pips
// from entry, because the ladder had moved it there) shrank the band to nothing and filed a $1.88
// scratch as a full loss. With the ORIGINAL stop the band is $2.77 against a $1.88 result, which is
// breakeven, which his rule then records as 0R.
//
// Two functions had to agree about which stop is the risk. Testing them separately would have
// missed it, which is why this end-to-end check exists and is kept.
const realTrade: any = {
  id: 't1', brokerAccountId: 'acct', userId: 'u', externalId: '317367514',
  symbol: 'GBPUSD', direction: 'Short',
  openPrice: '1.34880',                 // the FILL, which is what gets stored — not the 1.34886 trigger
  closePrice: '1.34882',
  stopLoss: '1.34880',                  // the MOVED stop the position closed on: breakeven
  originalStopLoss: '1.34939', originalTakeProfit: '1.34672',
  entryOrderId: '358693875',
  openTime: new Date('2026-09-02T09:54:04.240Z'),
  closeTime: new Date('2026-09-02T11:09:58.654Z'),
  profitLoss: '-1.88', commission: '0', swap: '-0.12', lots: '0.94',
};
const e: any = buildJournalEntry(realTrade, null);
check('his real trade is BREAKEVEN, not a loss', e.outcome, 'BE');
check('...and therefore 0R, his rule', e.achievedRR, '1:0');
check('...risked 5.9 pips from the fill to the original stop', e.stopLossDistance, '5.9');
check('...on a 3.53R plan', e.plannedRR, '1:3.53');

// ── THE THREE R:R COLUMNS, WHICH IS WHERE THE REAL DEFECT WAS ──────────────
//
// `riskReward` used to carry the PLANNED ratio here. The manual form puts the ACHIEVED multiple in
// that same column (JournalForm.tsx:1915) and `metrics_calculator.py` averages it under the label
// "AVG R:R — Achieved" — so his two synced trades were contributing 4.15 and 3.53 to that average,
// on a trade that lost a full R and one that scratched.
check('riskReward now carries the ACHIEVED multiple, as the manual form writes it',
      e.riskReward, '0');
check('...and the plan has its own column, which this pipeline never wrote before',
      e.plannedRR, '1:3.53');
check('...in his "1:x" format, so a synced row and a typed row read identically',
      /^1:/.test(e.achievedRR), true);

// The market read, taken from the direction exactly as JournalForm.tsx:840-847 pre-fills it.
check('a Short is filed as a Bearish regime, his form’s own rule', e.manualFields.marketRegime, 'Bearish');
check('...with the matching HTF bias', e.manualFields.htfBias, 'Bear');
// The fill-vs-plan pair the metrics engine turns into the Execution Metrics panel.
check('the actual fill is recorded for the deviation maths', e.manualFields.actualEntry, '1.34880');
check('...and the stop the entry order really carried', e.manualFields.actualSL, '1.34939');
check('the stop SHOWN is the one it was placed with', e.stopLoss, '1.34939');
check('...and the stop it closed on is kept beside it', e.manualFields.closingStopLoss, '1.34880');
check('held 76 minutes', e.tradeDuration, '76');
check('in the LONDON session', e.sessionName, 'LONDON');

// TEETH — remove the original stop and the entry degrades exactly as it used to.
const oldEntry: any = buildJournalEntry(
  { ...realTrade, originalStopLoss: null, originalTakeProfit: null }, null);
check('TEETH — without the original stop it is misfiled as a LOSS', oldEntry.outcome, 'LOSS');
check('TEETH — ...and carries no R at all', oldEntry.achievedRR, undefined);



// ── WHY THE TRADE ENDED — the metrics page's exit analysis ─────────────────
//
// His report, 2026-09-03: *"some details of trades autosynced are not recorded there."* The metrics
// engine builds an `exitAnalysis` breakdown keyed on `primary_exit_reason`, and a synced trade never
// carried one, so every automatic trade sat in its "Unknown" bucket.
const GBP = { symbol: 'GBPUSD', entryPrice: 1.34880,
              originalStopLoss: 1.34939, originalTakeProfit: 1.34672 };

check('stopped at the ORIGINAL stop -> Stop Loss',
      exitReasonFor({ ...GBP, closePrice: 1.34939 }), 'Stop Loss');
check('reached the ORIGINAL target -> Take Profit',
      exitReasonFor({ ...GBP, closePrice: 1.34672 }), 'Take Profit');
// His real GBP/USD: the ladder moved the stop to the entry and the market took it there. Telling
// this apart from a full stop-out is the entire point — one protected the account, the other took
// the planned loss.
check('taken out at the ENTRY -> Breakeven Stop',
      exitReasonFor({ ...GBP, closePrice: 1.34882 }), 'Breakeven Stop');
check('ended anywhere else -> Trailed Stop, because the stop had been MOVED',
      exitReasonFor({ ...GBP, closePrice: 1.34800 }), 'Trailed Stop');
check('no original stop -> no guess', exitReasonFor({ ...GBP, closePrice: 1.348, originalStopLoss: null }),
      undefined);
// HALF A PIP OF TOLERANCE, not an exact match: his breakeven stop sat at 1.34880 and filled at
// 1.34882. Demanding equality would have called that a Trailed Stop.
check('a fill two points off the level still counts as that level',
      exitReasonFor({ ...GBP, closePrice: 1.34941 }), 'Stop Loss');



// ── HOW FAR IT RAN EACH WAY — MAE / MFE ────────────────────────────────────
//
// His ask, 2026-09-03: *"we can extend it to also record this MAE/MFE in the journal."*
//
// PIPS, NOT R, and this is the check that matters. `metrics_calculator.py` compares MAE straight
// against the stop distance (`t.mae > t.sl_distance`) and divides the target distance by MFE — both
// of those are PIPS. It also filters on `> 0`, so both are MAGNITUDES, not signed. R would have
// looked plausible in every breakdown and meant nothing.
//
// His GBP/USD trade: 5.9-pip risk, ran to +1.78R in his favour and -0.07R against.
const RISK_PIPS = 5.9;
const toMarks = (peak: number, trough: number) => ({
  mfe: Math.round(Math.max(0, peak) * RISK_PIPS * 100) / 100,
  mae: Math.round(Math.max(0, -trough) * RISK_PIPS * 100) / 100,
});

let m = toMarks(1.78, -0.07);
check('MFE is the best excursion in PIPS, not R', m.mfe, 10.5);
check('MAE is the worst excursion in PIPS, as a positive magnitude', m.mae, 0.41);
check('...and MAE is comparable with the stop distance, which is what metrics does',
      m.mae < RISK_PIPS, true);

// A trade that never went against him has NO adverse excursion — zero, not a negative number.
// The metrics breakdown filters on `> 0`, so a negative would silently vanish from it.
m = toMarks(2.4, 0.3);
check('a trade that never traded against him has an MAE of 0', m.mae, 0);
check('...and its MFE is still recorded', m.mfe, 14.16);

// And the mirror: one that never went green.
m = toMarks(-0.2, -1.0);
check('a trade that never went green has an MFE of 0', m.mfe, 0);
check('...and its MAE is the full stop distance', m.mae, 5.9);


// ── THE MARKET READ, borrowed from his own form ────────────────────────────
//
// `JournalForm.tsx:840-847` pre-fills market regime, trend and HTF bias from the direction the
// moment it is set. Copying the rule is why his synced trades can now populate the Market Regime
// and HTF Bias panels at all; getting the VALUES wrong would put them in buckets his typed trades
// never use, which is worse than leaving them blank.
console.log('\n  the market read, copied from JournalForm.tsx:840-847:');
check('a Long reads Bullish/Bullish/Bull', marketContextFor('Long'),
      { marketRegime: 'Bullish', trendDirection: 'Bullish', htfBias: 'Bull' });
check('a Short reads Bearish/Bearish/Bear', marketContextFor('Short'),
      { marketRegime: 'Bearish', trendDirection: 'Bearish', htfBias: 'Bear' });
check('anything else reads NOTHING, rather than defaulting to a side',
      marketContextFor(''), undefined);
check('...including a null direction', marketContextFor(null), undefined);


// ── THE NEWS ENVIRONMENT, and the guard that matters most ──────────────────
//
// The three values are his form's own (JournalForm.tsx:879). The trap is the empty case: with no
// calendar rows for that day we cannot tell "nothing was scheduled" from "we never scraped it", and
// writing "Clear" would turn a gap in OUR data into a claim about HIS trade.
console.log('\n  the news environment, and the coverage guard:');
const ENTRY = new Date('2026-09-01T12:00:00Z');
const ev = (mins: number, currency: string, impact: string) =>
  ({ currency, impact, when: new Date(ENTRY.getTime() + mins * 60_000) });

check('no calendar coverage for that day means BLANK, never "Clear"',
      classifyNews([], ENTRY, ['EUR', 'USD']), undefined);
check('a high-impact release inside the hour is Major',
      classifyNews([ev(-30, 'USD', 'High')], ENTRY, ['EUR', 'USD']), 'Major');
check('...and the scrapers\' lowercase spelling counts the same',
      classifyNews([ev(-30, 'USD', 'high')], ENTRY, ['EUR', 'USD']), 'Major');
check('a medium release inside the hour is Minor',
      classifyNews([ev(20, 'EUR', 'Medium')], ENTRY, ['EUR', 'USD']), 'Minor');
check('a day WITH events but none near the entry is genuinely Clear',
      classifyNews([ev(400, 'USD', 'High')], ENTRY, ['EUR', 'USD']), 'Clear');
check('...and an event in another currency does not count against this pair',
      classifyNews([ev(-10, 'JPY', 'High')], ENTRY, ['EUR', 'USD']), 'Clear');

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
