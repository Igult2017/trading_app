/**
 * Was a trading day a win, a loss, or break-even?
 *
 * ⚠ ONE RULE, TWO SCREENS. The calendar colours a day green / red / amber from this; the Monthly
 * Drawdown table now prints W / L / BE from the same thing. They are the same question about the
 * same day, and if the two ever answered differently the user would be right to trust neither —
 * so there is one copy of it and both read it.
 *
 * His instruction, 2026-10-25: *"all traded dates and outcome just like the calendar does but not
 * with money ... L for loss in that date and W for win in that date and BE for breakeven."*
 * "Just like the calendar" is taken literally here: the same rule, not a second one that agrees
 * most of the time.
 */

/** Half a cent. A day that nets to zero out of a +100 and a -100 is break-even, not a win off a
 *  rounding crumb. */
export const FLAT_EPS = 0.005;

export type DayTone = 'win' | 'loss' | 'flat';

/** The calendar's own three-way split, by the day's NET profit or loss. */
export function dayTone(pnl: number): DayTone {
  if (Math.abs(pnl) < FLAT_EPS) return 'flat';
  return pnl > 0 ? 'win' : 'loss';
}

/** The same answer as a letter, for the Monthly Drawdown drop-down. */
export function dayMark(pnl: number): 'W' | 'L' | 'BE' {
  const t = dayTone(pnl);
  return t === 'win' ? 'W' : t === 'loss' ? 'L' : 'BE';
}
