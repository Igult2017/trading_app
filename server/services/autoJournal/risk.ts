/**
 * R AND RISK-REWARD, MEASURED AGAINST THE RISK THAT WAS ACTUALLY TAKEN.
 *
 * His question, 2026-09-02: *"if we are calculating RR in signals, why cant we calculate RR based on
 * wins and losses and populate the journals accurately?"*
 *
 * We can, and the arithmetic was never the problem. It was being handed the wrong stop.
 *
 * THE DEFECT, in one sentence: the journal measured risk against the stop the position had when it
 * CLOSED, which for any trade the ladder managed is the stop after it was moved.
 *
 *   * moved to breakeven, then stopped out -> the stop equals the entry -> risk is ZERO -> R and RR
 *     both come out blank, so a managed trade recorded nothing at all
 *   * trailed to +2R, then stopped out -> risk measured against a stop BEYOND entry -> the number is
 *     not merely imprecise, it is meaningless
 *
 * Those are precisely the trades the ladder exists to produce, so the trades most worth measuring
 * were the ones that measured as nothing.
 *
 * WHERE THE REAL RISK COMES FROM. The broker keeps the stop and target the trade was PLACED with, on
 * the entry order. Verified against his own account on 02 Sep — the GBP/USD trade, entry order
 * 358693875:
 *
 *     entry (stopPrice) 1.34886 · stopLoss 1.34939 · takeProfit 1.34672
 *     -> risk 5.3 pips, target 21.4 pips, planned 4.04R
 *
 * It exited at 1.34882 against a 1.34880 fill: the ladder's breakeven stop, hit. **Achieved 0R.**
 * The journal showed a blank, because 1.34880 minus 1.34880 is zero.
 *
 * THE BREAKEVEN RULE IS HIS, quoted exactly: *"Breakeven is 1:0 R."* A trade stopped at breakeven
 * risked one and returned nothing, so it records **0**, not a blank and not the -0.038R that the raw
 * prices give once the spread is counted. That figure is noise wearing the costume of a result.
 *
 * AND WHERE THERE IS NO ORIGINAL STOP, THERE IS NO R. A trade placed without one leaves these blank
 * rather than falling back to the moved stop — falling back is what produced the wrong numbers in
 * the first place.
 */
import { toPips } from '../../lib/pipMath';
import type { ExitReason } from './exitReason';

export interface RiskInput {
  symbol: string;
  direction: string;              // 'Long' | 'Short'
  entryPrice?: number | null;     // the fill
  closePrice?: number | null;
  originalStopLoss?: number | null;
  originalTakeProfit?: number | null;
  outcome: 'WIN' | 'LOSS' | 'BE';
  /** Which level the trade actually finished on. See the snapping rule below. */
  exitReason?: ExitReason;
}

export interface RiskNumbers {
  /** The original risk, in pips — what he actually put at stake. */
  stopLossDistance?: number;
  /** The original target, in pips. */
  takeProfitDistance?: number;
  /**
   * Planned reward-to-risk, from the levels the trade was placed with.
   *
   * RENAMED from `riskReward` on 2026-09-05, and the rename is the fix, not cosmetics. The caller
   * was writing this into the `risk_reward` COLUMN — and the manual journal form writes the
   * **achieved** multiple into that same column (`JournalForm.tsx:1915`,
   * `riskReward: parseRR(f4.achievedRR)`). So one column meant two opposite things depending on
   * which pipeline wrote the row, and `metrics_calculator.py` averages it under the label
   * "AVG R:R — Achieved". His two synced trades were contributing 4.15 and 3.53 to that average,
   * on a trade that lost a full R and one that scratched. The name now says which number it is.
   */
  plannedRR?: number;
  /** What it returned, in multiples of that original risk. Breakeven is exactly 0. */
  achievedRR?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeRisk(t: RiskInput): RiskNumbers {
  const entry = num(t.entryPrice);
  const exit  = num(t.closePrice);
  const stop  = num(t.originalStopLoss);
  const targ  = num(t.originalTakeProfit);

  // NO ORIGINAL STOP, NO RISK NUMBERS. Every field below divides by this, and the whole defect was
  // dividing by a stop that no longer represented the risk.
  if (entry === undefined || stop === undefined) return {};
  const risk = Math.abs(entry - stop);
  if (!risk) return {};

  const out: RiskNumbers = {};
  out.stopLossDistance = toPips(risk, t.symbol);

  if (targ !== undefined) {
    const reward = Math.abs(targ - entry);
    if (reward) {
      out.takeProfitDistance = toPips(reward, t.symbol);
      out.plannedRR = round2(reward / risk);
    }
  }

  // ── WHAT IT RETURNED ───────────────────────────────────────────────────────
  //
  // THE LEVEL IT FINISHED ON DECIDES THE R, not the raw price move. His stop-out of 01 Sep recorded
  // **-1.05R** because the spread and the slippage land inside `move / risk`. His journal form does
  // not do that: a Loss is fixed at `"1:-1"` and a BE at `"1:0"` (`JournalForm.tsx:1511-1528`). The
  // note at the top of this file already makes that argument for breakeven — *"that figure is noise
  // wearing the costume of a result"* — and then failed to apply it to a stop-out. Same noise, same
  // answer. Borrowed from his form so a synced loss and a typed loss are the same number.
  //
  // BOTH THE OUTCOME AND THE EXIT REASON MUST AGREE before anything is snapped. The exit reason is
  // read from prices with half a pip of tolerance, so on its own it is a guess; paired with the
  // outcome it is a fact. Where they disagree — or where the trade was managed out rather than
  // taken at a placed level — the measured number stands, because then it is a real result and not
  // an artefact of the spread.
  const measured = exit !== undefined
    ? round2((t.direction === 'Long' ? exit - entry : entry - exit) / risk)
    : undefined;

  if (t.outcome === 'BE') {
    out.achievedRR = 0;                                  // his rule: "Breakeven is 1:0 R"
  } else if (t.outcome === 'LOSS' && t.exitReason === 'Stop Loss') {
    out.achievedRR = -1;                                 // it hit the stop it was placed with
  } else if (t.outcome === 'WIN' && t.exitReason === 'Take Profit' && out.plannedRR !== undefined) {
    out.achievedRR = out.plannedRR;                      // it made the target it was placed with
  } else if (measured !== undefined) {
    out.achievedRR = measured;                           // trailed, managed, or partly filled
  }
  return out;
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}
