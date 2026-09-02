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

export interface RiskInput {
  symbol: string;
  direction: string;              // 'Long' | 'Short'
  entryPrice?: number | null;     // the fill
  closePrice?: number | null;
  originalStopLoss?: number | null;
  originalTakeProfit?: number | null;
  outcome: 'WIN' | 'LOSS' | 'BE';
}

export interface RiskNumbers {
  /** The original risk, in pips — what he actually put at stake. */
  stopLossDistance?: number;
  /** The original target, in pips. */
  takeProfitDistance?: number;
  /** Planned reward-to-risk, from the levels the trade was placed with. */
  riskReward?: number;
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
      out.riskReward = round2(reward / risk);
    }
  }

  // HIS RULE, APPLIED BEFORE THE ARITHMETIC: breakeven is 1:0.
  if (t.outcome === 'BE') {
    out.achievedRR = 0;
    return out;
  }

  if (exit !== undefined) {
    const move = t.direction === 'Long' ? exit - entry : entry - exit;
    out.achievedRR = round2(move / risk);
  }
  return out;
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}
