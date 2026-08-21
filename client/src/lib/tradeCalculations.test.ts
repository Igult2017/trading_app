/**
 * tradeCalculations.test.ts — run with:  npx tsx client/src/lib/tradeCalculations.test.ts
 *
 * No test framework is installed in this repo (`"test"` script absent, only `tsx`), so this is a
 * plain script rather than a new dependency added on the way past.
 *
 * WHY THESE EXIST. Two reported defects, 2026-08-21:
 *   "P&L does not record accurately when R is more than 3R. i experienced it in 6R"
 *   "loss does not autorecord sometimes"
 *
 * Neither was a cap. Nothing in the app ever worked out the R a trade ACTUALLY reached — it could
 * only be typed, read off a screenshot (the extractor was never told what it was), or SILENTLY
 * COPIED FROM THE PLANNED R. So a 6R trade recorded at its 3R target. And the outcome field
 * defaulted to "Win", so a loss the screenshot could not classify recorded as a win.
 */
import { calcDollarRisk, calcPnL, deriveAchievedRR, outcomeFromPrices } from "./tradeCalculations";

let failed = 0;
let count = 0;

function check(name: string, got: unknown, want: unknown) {
  count++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}: got ${JSON.stringify(got)}` +
              (ok ? "" : `, want ${JSON.stringify(want)}`));
  if (!ok) failed++;
}

function teeth(name: string, brokeIt: boolean) {
  count++;
  console.log(`   ${brokeIt ? "PASS" : "FAIL"}  TEETH — ${name}: ${brokeIt}`);
  if (!brokeIt) failed++;
}

console.log("\nJOURNAL P&L — the achieved R, and the outcome that must not default to a win\n");

// ── HIS CASE: a 6R trade that was planned to 3R ──────────────────────────────
// Buy at 1.1000, stop 1.0990 (10 pips of risk), target 1.1030 (3R), actually ran to 1.1060 (6R).
const ENTRY = 1.1000, STOP = 1.0990, TARGET = 1.1030, EXIT_6R = 1.1060;

check("the planned R is 3", deriveAchievedRR(ENTRY, STOP, TARGET), 3);
check("the ACHIEVED R is 6 — the number nothing used to compute",
      deriveAchievedRR(ENTRY, STOP, EXIT_6R), 6);

const RISK_PCT = 2, BALANCE = 10000;
const dollarRisk = calcDollarRisk(BALANCE, RISK_PCT);         // $200
check("2% of 10,000 is 200 at risk", dollarRisk, 200);
check("THE BUG: recording the PLANNED R pays 3R", calcPnL(dollarRisk, 3, "Win"), 600);
check("THE FIX: recording the ACHIEVED R pays 6R",
      calcPnL(dollarRisk, deriveAchievedRR(ENTRY, STOP, EXIT_6R)!, "Win"), 1200);
teeth("the two differ by $600 — the money the old path silently dropped",
      calcPnL(dollarRisk, 6, "Win") - calcPnL(dollarRisk, 3, "Win") === 600);

// ── it works the same on a sell ──────────────────────────────────────────────
check("a SELL that ran 6R reads 6 too", deriveAchievedRR(1.1000, 1.1010, 1.0940), 6);
check("a partial close short of target is a partial R", deriveAchievedRR(1.1000, 1.0990, 1.1015), 1.5);
check("closing at the stop is exactly 1R of movement", deriveAchievedRR(ENTRY, STOP, STOP), 1);

// ── it refuses rather than inventing ─────────────────────────────────────────
check("no exit price -> null, not 0", deriveAchievedRR(ENTRY, STOP, null), null);
check("no stop -> null (no denominator, so there is no R)", deriveAchievedRR(ENTRY, null, EXIT_6R), null);
check("a zero-width stop is a missing stop, not an infinite R",
      deriveAchievedRR(ENTRY, ENTRY, EXIT_6R), null);
check("junk in -> null", deriveAchievedRR("abc", "def", "ghi"), null);
check("strings are accepted — form fields arrive as strings",
      deriveAchievedRR("1.1000", "1.0990", "1.1060"), 6);

// R IS UNSIGNED. The sign of the money comes from the outcome; a negative R multiplied by a loss is
// how a loss becomes a profit, which is the class of bug this whole change is about.
check("a losing exit still reports a POSITIVE size", deriveAchievedRR(ENTRY, STOP, 1.0995), 0.5);
teeth("...so it can never be negative", deriveAchievedRR(ENTRY, STOP, 1.0900)! > 0);

// ── the outcome, derived from the prices ─────────────────────────────────────
check("a buy closing above entry is a Win", outcomeFromPrices(ENTRY, STOP, EXIT_6R, true), "Win");
check("a buy closing below entry is a Loss", outcomeFromPrices(ENTRY, STOP, 1.0993, true), "Loss");
check("a SELL closing below entry is a Win", outcomeFromPrices(1.1000, 1.1010, 1.0940, false), "Win");
check("a SELL closing above entry is a Loss", outcomeFromPrices(1.1000, 1.1010, 1.1005, false), "Loss");
check("closing on the entry is BE", outcomeFromPrices(ENTRY, STOP, ENTRY, true), "BE");
check("a hair either side of entry is still BE, not a win",
      outcomeFromPrices(ENTRY, STOP, ENTRY + 0.00001, true), "BE");
check("it refuses when it cannot tell", outcomeFromPrices(ENTRY, STOP, null, true), null);

// THE DEFECT THAT PUT LOSSES IN AS WINS: the outcome field defaulted to "Win", and a screenshot with
// no visible exit time reads as "Open", which was dropped — so the default stood.
teeth("a losing buy is NOT reported as a win",
      outcomeFromPrices(ENTRY, STOP, 1.0993, true) !== "Win");
teeth("and direction matters — the same exit flips the verdict",
      outcomeFromPrices(ENTRY, STOP, 1.0993, true) !== outcomeFromPrices(ENTRY, 1.1010, 1.0993, false));

// ── the loss path needs no R at all ──────────────────────────────────────────
check("a loss is minus the risk, whatever the R", calcPnL(dollarRisk, 6, "Loss"), -200);
check("...and a break-even is zero", calcPnL(dollarRisk, 6, "BE"), 0);

console.log();
if (failed) {
  console.log(`${failed} of ${count} FAILED`);
  process.exit(1);
}
console.log(`ALL PASS (${count} checks)`);
