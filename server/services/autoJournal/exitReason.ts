/**
 * WHY THE TRADE ENDED — the one thing the exit analysis needs, and the one nobody was writing.
 *
 * His report, 2026-09-03: *"This fix should be extended to metrics page too, some details of trades
 * autosynced are not recorded there."*
 *
 * `metrics_calculator.py` builds an `exitAnalysis` breakdown keyed on `primary_exit_reason`, and a
 * synced trade never carried one — so every automatically-recorded trade landed in its "Unknown"
 * bucket while a typed one was properly classified.
 *
 * NOTHING NEW HAD TO BE FETCHED. The answer is the exit price read against the levels the trade was
 * PLACED with, and those arrived on 02 Sep (`synced_trades.original_stop_loss` /
 * `original_take_profit`, taken from the broker's entry order).
 *
 * THE FOUR ANSWERS, and why the fourth matters:
 *
 *   Take Profit     the original target was reached
 *   Stop Loss       the original stop was hit — a full planned loss
 *   Breakeven Stop  it came back to the entry, which is the ladder's 0.4R rung doing its job
 *   Trailed Stop    it ended somewhere else, which means the stop had been MOVED
 *
 * Separating the last two from "Stop Loss" is the whole point. Lumping them together would say a
 * managed trade and an unmanaged one failed the same way, when one protected the account and the
 * other took the planned loss — and telling those apart is what the exit analysis is for.
 *
 * WHERE THERE IS NO ORIGINAL STOP there is no answer, and it returns undefined rather than guessing.
 * A wrong reason in a breakdown he reads is worse than an honest blank.
 */
import { pipSize } from '../../lib/pipMath';

export type ExitReason = 'Take Profit' | 'Stop Loss' | 'Breakeven Stop' | 'Trailed Stop';

export interface ExitInput {
  symbol: string;
  entryPrice?: number | string | null;
  closePrice?: number | string | null;
  originalStopLoss?: number | string | null;
  originalTakeProfit?: number | string | null;
}

/**
 * How close two prices must be to count as "the same level".
 *
 * HALF A PIP, not an exact match. A stop or target is filled at the market, not at the price on
 * paper: his GBP/USD breakeven stop sat at 1.34880 and filled at 1.34882, two points away. Demanding
 * equality would have called that a "Trailed Stop" — the one answer it certainly was not.
 */
const TOLERANCE_PIPS = 0.5;

export function exitReasonFor(t: ExitInput): ExitReason | undefined {
  const exit  = num(t.closePrice);
  const entry = num(t.entryPrice);
  const stop  = num(t.originalStopLoss);
  const targ  = num(t.originalTakeProfit);
  if (exit === undefined || entry === undefined || stop === undefined) return undefined;

  const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE_PIPS * pipSize(t.symbol);

  // TARGET FIRST. A target can sit on the same side as a trailed stop, and reaching it is the more
  // specific fact — a trade that made its full target did not "trail out".
  if (targ !== undefined && near(exit, targ)) return 'Take Profit';
  if (near(exit, stop))  return 'Stop Loss';
  if (near(exit, entry)) return 'Breakeven Stop';
  return 'Trailed Stop';
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}
