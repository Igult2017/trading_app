/**
 * ddPeriods.ts — the period selector's options, and the date range each one means.
 *
 * WHY THE RANGE IS WORKED OUT HERE AND NOT ON THE SERVER. The selector is new in his 2026-11-03
 * design and the API had no date filter at all, so one had to be added. Sending a resolved
 * `from`/`to` pair means the period *semantics* live in exactly one place — this file — and the
 * server stays a dumb range filter. The alternative (sending "QTD" and teaching the route what a
 * quarter is) would have put the same calendar logic in two languages, which is how the two drift.
 *
 * ⚠ "All time" SENDS NO RANGE AT ALL, so the default request is byte-for-byte what it was before
 * this change. That matters: it keeps the existing server cache entry valid and means a user who
 * never touches the selector cannot be affected by any of this.
 */

export type PeriodKey = 'ALL' | 'MTD' | 'QTD' | 'YTD';

export interface PeriodOption {
  key: PeriodKey;
  /** What the dropdown shows. Built from the real clock, so it names the actual month/quarter. */
  label: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

/** Local midnight, as `YYYY-MM-DD`. Kept date-only so a timezone cannot shift a month boundary. */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The options, labelled from today's date — "October 2026", "Q4 2026", "2026 to date". */
export function periodOptions(now = new Date()): PeriodOption[] {
  const q = Math.floor(now.getMonth() / 3) + 1;
  return [
    { key: 'ALL', label: 'All time' },
    { key: 'MTD', label: `${MONTHS[now.getMonth()]} ${now.getFullYear()}` },
    { key: 'QTD', label: `Q${q} ${now.getFullYear()}` },
    { key: 'YTD', label: `${now.getFullYear()} to date` },
  ];
}

/**
 * The inclusive date range a period covers, or `null` for "all time".
 *
 * `to` is today rather than the end of the period: a drawdown figure for a month that has not
 * finished should not pretend to cover days that have not happened.
 */
export function periodRange(key: PeriodKey, now = new Date()): { from: string; to: string } | null {
  if (key === 'ALL') return null;
  const to = ymd(now);
  if (key === 'MTD') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (key === 'QTD') {
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return { from: ymd(new Date(now.getFullYear(), qStartMonth, 1)), to };
  }
  return { from: ymd(new Date(now.getFullYear(), 0, 1)), to };
}

/** The query string the panel appends. Empty for "all time", so the default call is unchanged. */
export function periodQuery(key: PeriodKey, now = new Date()): string {
  const r = periodRange(key, now);
  return r ? `&from=${r.from}&to=${r.to}` : '';
}
