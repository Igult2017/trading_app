import React from 'react';

/**
 * ddBits — the small shared pieces of the Drawdown panel.
 *
 * EXTRACTED, NOT REWRITTEN. All three lived inside `DrawdownPanel.tsx`, which the 2026-11-03 design
 * rebuilt; they are lifted here unchanged so several sections can share them and so the instruction
 * recorded against `WLB` is not quietly lost in the rebuild.
 */

export function fmtDd(v?: number | null): string {
  if (v == null) return '—';
  if (v === 0) return '0.00%';
  return `${Number(v).toFixed(2)}%`;
}

export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtRange(start?: string | null, end?: string | null): string {
  if (!start) return '';
  try {
    const s = new Date(start);
    if (!end || end === start) return `${MONTH_ABBR[s.getMonth()]} ${s.getDate()}`;
    const e = new Date(end);
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
      return `${MONTH_ABBR[s.getMonth()]} ${s.getDate()}–${e.getDate()}`;
    return `${MONTH_ABBR[s.getMonth()]} ${s.getDate()} – ${MONTH_ABBR[e.getMonth()]} ${e.getDate()}`;
  } catch { return ''; }
}

/**
 * WINS / LOSSES / BREAKEVENS as coloured figures — his instruction, 2026-08-29:
 *
 *   "dont write loses as 8L and wins are 7W. Instead, write wins in green and losses in red like
 *    9/10. Breakevens are written in orange."
 *
 * So the letter suffixes are gone and the counts read as a slash-separated split: wins green,
 * losses red, breakevens orange. A group with no breakevens shows just `7/3` rather than `7/3/0`,
 * because a zero adds nothing and the orange would be misleading.
 *
 * `title` carries the words for anyone hovering, so the colour is not the only thing conveying
 * meaning — colour alone fails for a colour-blind reader.
 *
 * ⚠ KEPT THROUGH THE 2026-11-03 REBUILD ON PURPOSE. His new mock-up writes these as plain text
 * ("1 Win / 1 Loss"); that would have silently reverted the instruction above, so the new sections
 * render their counts through this component instead.
 */
export function WLB({ wins, losses, breakevens, size = 12 }: {
  wins?: number; losses?: number; breakevens?: number; size?: number;
}) {
  const w = wins ?? 0, l = losses ?? 0, b = breakevens ?? 0;
  return (
    <span style={{ fontSize: size, fontFamily: 'var(--dd-mono)', fontWeight: 700 }}
          title={`${w} win${w === 1 ? '' : 's'}, ${l} loss${l === 1 ? '' : 'es'}`
                 + (b > 0 ? `, ${b} breakeven${b === 1 ? '' : 's'}` : '')}>
      <span className="c-emerald">{w}</span>
      <span className="c-faint">/</span>
      <span className="c-rose">{l}</span>
      {b > 0 && <><span className="c-faint">/</span><span className="c-amber">{b}</span></>}
    </span>
  );
}
