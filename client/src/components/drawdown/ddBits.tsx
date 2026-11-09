import React from 'react';

/**
 * ddBits — the small shared pieces of the Drawdown panel.
 *
 * EXTRACTED, NOT REWRITTEN. These lived inside `DrawdownPanel.tsx` and were lifted out unchanged so
 * several sections could share them.
 *
 * `WLB` lived here too until 2026-11-09 and went with the Structural Diagnostics section, its only
 * caller - his words: *"Remove this part too. I dont see its essence."* The instruction it carried
 * (counts as a coloured split rather than "1 Win / 1 Loss") is in git with it, not lost.
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
