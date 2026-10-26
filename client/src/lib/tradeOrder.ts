/**
 * NEWEST TRADE AT THE TOP, OLDEST AT THE BOTTOM — ordered by when the TRADE happened.
 *
 * His instruction, 2026-10-26: *"The tradevault should also record trades from the latest at the
 * top to the oldest at the bottom."*
 *
 * ⚠ WHAT WAS DECIDING THE ORDER BEFORE. The list arrives ordered by `created_at`
 * (`server/storage.ts:519`) — when the ROW WAS WRITTEN. For a trade he typed in himself those are
 * the same moment, so it looked right. For a trade the sweep imported, `created_at` is when the
 * import ran, so a batch lands in whatever order the broker handed it over, and a trade from last
 * week can sit above one from today.
 *
 * ⚠ IT SORTS ON EXACTLY THE DATE THE ROW DISPLAYS. The vault shows `entryTime`'s date, falling
 * back to `createdAt` (`TradeVault.tsx`, `journalEntryToTrade`). Sorting on anything else — a
 * third field, or a cleverer guess — would put a row above another whose printed date is later,
 * which is the exact thing he is asking to stop seeing.
 *
 * ⚠ COMPARED AS TEXT, ON PURPOSE. The two writers disagree about time zones: the manual form posts
 * a local wall clock with no zone (`2026-10-26T14:30`, a `datetime-local` input) and the importer
 * posts UTC (`2026-10-26T11:30:00.000Z`, `autoJournal/fields.ts:163`). Reading both as moments
 * would shift the hand-typed ones by his offset and could print a date out of order at midnight.
 * Both start `YYYY-MM-DDTHH:MM`, which sorts correctly as plain text, so the printed column is
 * guaranteed to descend. The cost is that two entries within his UTC offset of each other may swap
 * places inside a day; the benefit is that the dates are never wrong, which is what he asked for.
 */

/** The one shape this needs. Deliberately narrow, so any entry-like row can be ordered. */
export interface OrderableEntry {
  entryTime?: string | null;
  createdAt?: string | Date | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** The sortable key for one entry: the same date the row will print, as comparable text. */
export function tradeSortKey(e: OrderableEntry): string {
  const t = typeof e.entryTime === 'string' ? e.entryTime.trim() : '';
  // A legacy or hand-edited value that is not a date at all (say "26/10/2026") must not be
  // compared against ISO text — it would sort below everything. Fall through to createdAt.
  if (ISO_DATE.test(t)) return t.slice(0, 16);
  if (!e.createdAt) return '';
  const c = e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt);
  return ISO_DATE.test(c) ? c.slice(0, 16) : '';
}

/**
 * Newest first. Anything with no readable date at all sinks to the bottom rather than floating to
 * the top — an undated row claiming to be the latest trade is the more misleading of the two.
 */
export function byNewestTradeFirst(a: OrderableEntry, b: OrderableEntry): number {
  const ka = tradeSortKey(a), kb = tradeSortKey(b);
  if (ka === kb) return 0;
  if (!ka) return 1;
  if (!kb) return -1;
  return ka < kb ? 1 : -1;
}

/** A new array, newest trade first. Never sorts in place — the caller's list is React Query's
 *  cached array, and sorting that where it lies mutates state React believes is immutable. */
export function newestTradeFirst<T extends OrderableEntry>(entries: readonly T[]): T[] {
  return entries.slice().sort(byNewestTradeFirst);
}
