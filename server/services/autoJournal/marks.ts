/**
 * HOW FAR THE TRADE RAN EACH WAY — the numbers that only exist while it is open.
 *
 * His ask, 2026-09-03: *"we can extend it to also record this MAE/MFE in the journal."*
 *
 * MAE and MFE are the worst and best the trade ever showed before it closed. They **cannot be
 * reconstructed afterwards**: a closed trade tells you where it started and where it ended, and
 * nothing about the journey. They have to be measured while it runs, and the platform now does —
 * `monitor/exit_watch.py` keeps a running best and worst R for every open position, fed by the
 * 0.5-second FIX watcher rather than the 30-second poll, and persists them so a restart cannot take
 * them with it.
 *
 * THIS FILE IS THE BRIDGE. The Python monitor writes them into `strategy_state` under one row, keyed
 * by the broker's POSITION id; the trade carries that id; this reads them back.
 *
 * PIPS, NOT R — and getting this wrong would have been silent. `metrics_calculator.py` compares MAE
 * directly against the stop distance (`t.mae > t.sl_distance`) and divides the target distance by
 * MFE, and both of those are PIPS. It also filters on `> 0`, so both are MAGNITUDES: how far it went,
 * not which way. Storing R would have produced numbers that looked plausible in every breakdown and
 * meant nothing.
 */
import { db } from '../../db';
import { strategyState } from '../../../shared/schema';
import { eq } from 'drizzle-orm';

const STATE_KEY = 'exit_watch_seen';   // must match `exit_watch._STATE_KEY` on the Python side

export interface Marks {
  /** Worst it showed, in pips, as a positive magnitude. 0 if it never went against him. */
  mae: number;
  /** Best it showed, in pips, as a positive magnitude. 0 if it never went in his favour. */
  mfe: number;
  /** Which clock measured them: "fix" (every 0.5s) or "poll" (every 30s). */
  source: string;
}

/**
 * The marks for one position, converted to pips using the risk the trade actually took.
 *
 * `riskPips` is the ORIGINAL stop distance — the same number `stopLossDistance` carries — because
 * that is what the R multiples were measured against. Returns null when the position was never seen
 * (a trade opened before this existed, or one placed on another platform), which is honest: an
 * invented excursion would be indistinguishable from a measured one in every breakdown that reads it.
 */
export async function marksFor(positionId: string | null | undefined,
                               riskPips: number | null | undefined): Promise<Marks | null> {
  if (!positionId || !riskPips || riskPips <= 0) return null;
  try {
    const [row] = await db.select().from(strategyState)
      .where(eq(strategyState.strategyId, STATE_KEY)).limit(1);
    const all = (row?.state ?? {}) as Record<string, any>;
    const seen = all[String(positionId)];
    if (!seen) return null;

    const peak = num(seen.peak_r);      // best R reached; may be negative if it never went green
    const trough = num(seen.trough_r);  // worst R reached; may be positive if it never went red
    return {
      // MAGNITUDES, and clamped at zero. A trade that never traded against him has an MAE of 0, not
      // a negative one — the breakdown filters on `> 0` and a negative would simply vanish.
      mae: round2(Math.max(0, -(trough ?? 0)) * riskPips),
      mfe: round2(Math.max(0, peak ?? 0) * riskPips),
      source: String(seen.source ?? 'poll'),
    };
  } catch (err: any) {
    console.warn(`[autoJournal] could not read the high-water marks for position ${positionId}: `
                 + `${err?.message ?? err}`);
    return null;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function num(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}
