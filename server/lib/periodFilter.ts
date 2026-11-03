/**
 * periodFilter.ts — narrow a set of journal entries to a date range.
 *
 * WHY IT EXISTS. His 2026-11-03 Drawdown design added a period selector (this month / this quarter /
 * year to date / all time) and `/api/drawdown/compute` had no date filter of any kind. The client
 * resolves the period to a `from`/`to` pair (`client/src/components/drawdown/ddPeriods.ts`) so the
 * calendar logic lives in one place; this is the dumb range filter at the other end.
 *
 * ⚠ THE DATE PRIORITY IS COPIED FROM THE PYTHON, NOT CHOSEN HERE. `server/python/drawdown/_utils.py`
 * picks a trade's date as `tradeDate -> entryTime -> exitTime -> entryTimeUTC -> createdAt`, and the
 * Metrics page uses the same order. If this file disagreed about which field dates a trade, a
 * filtered month could hold trades the Python then assigns to a different month — the totals would
 * not match the rows, and nothing would error.
 *
 * ⚠ A SEPARATE FILE, NOT INLINE IN `routes.ts`, so it can be checked without a running server.
 * `routes.ts` is already past 6,000 lines and under review for splitting (docs/RESTRUCTURE.md); this
 * is the kind of pure function that does not belong in it.
 */

/** The fields that can date a trade, in the order the Python tries them. */
const DATE_FIELDS = [
  'tradeDate', 'trade_date',
  'entryTime', 'entry_time',
  'exitTime', 'exit_time',
  'entryTimeUTC', 'entry_time_utc',
  'createdAt', 'created_at',
] as const;

/** A trade's date as `YYYY-MM-DD`, or null when nothing on it parses. */
export function entryDateKey(entry: any): string | null {
  for (const f of DATE_FIELDS) {
    const raw = entry?.[f];
    if (raw == null || raw === '') continue;
    // Already an ISO-ish string: take the date part without constructing a Date, so a timezone can
    // never shift it across a month boundary.
    const s = String(raw);
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${m}-${day}`;
    }
  }
  return null;
}

/** `YYYY-MM-DD`, or null if the input is not one. Guards against a junk query string. */
export function asDateKey(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Entries whose date falls inside `[from, to]`, inclusive. With no usable range the original array
 * is returned UNCHANGED — so "all time" is byte-for-byte the behaviour that existed before the
 * selector, and an undated trade is only ever dropped by a filter that was actually asked for.
 */
export function filterEntriesByPeriod(entries: any[], from: unknown, to: unknown): any[] {
  const f = asDateKey(from);
  const t = asDateKey(to);
  if (!f && !t) return entries;
  if (!Array.isArray(entries)) return entries;
  return entries.filter((e) => {
    const k = entryDateKey(e);
    if (!k) return false;                 // cannot be placed in the range being asked for
    if (f && k < f) return false;
    if (t && k > t) return false;
    return true;
  });
}
