/**
 * The Assets board's row list: EVERY confirmed entry this month, newest first.
 *
 * WHY THIS IS A SEPARATE MODULE. The sidebar used to be built inline in AssetPage with a `seen` set
 * that kept ONE ROW PER SYMBOL, so the newest signal for a pair hid every older one. A week that
 * recorded 5 confirmed entries displayed 3 rows, and XAU/USD's two entries on 19 Aug 2026 were both
 * invisible because a *watch* alert on 21 Aug had taken the XAU/USD slot. That list was an
 * instrument picker wearing a signal list's clothes.
 *
 * Pulled out here so the rule can be tested against real production rows without a browser or a
 * login — `/assets` sits behind RequireAuth, so an inline version could only ever be eyeballed.
 *
 * His rule: *"record all the signals with confirmed entries per week [later: month] … Only signals
 * with confirmed entry from the newest at the top and the oldest below in that order."*
 */

/** The fields this module actually reads. The rows carry far more; nothing else here cares. */
export interface SignalRow {
  id?: string;
  symbol?: string;
  status?: string;
  createdAt?: string | Date | null;
  triggeredAt?: string | Date | null;
  triggered_at?: string | Date | null;
  [k: string]: unknown;
}

/** `triggered_at` arrives snake_case from some paths and camelCase from others. Accept both. */
function triggeredAt(s: SignalRow): string | Date | null {
  return s?.triggeredAt ?? s?.triggered_at ?? null;
}

/**
 * WAS THE ENTRY ACTUALLY TAKEN?
 *
 * `triggered_at` is stamped by the monitor at the moment price touches the entry
 * (`signal_platform/monitor/signal_monitor.py`). The status that means the opposite is explicit in
 * that same file: EXPIRED is *"the setup reversed before entry. CANCEL (expired), never a loss:
 * whoever followed the card was never in a trade."*
 *
 * So this timestamp IS the confirmation, and it is the whole filter. It keeps a filled trade whether
 * it went on to hit TP (`executed`), hit SL (`invalidated`) or is still running (`active`), and it
 * drops watches, un-filled stop orders and cancelled setups without needing to enumerate statuses —
 * which matters, because a status list would have to be revisited every time one is added.
 */
export function hasConfirmedEntry(s: SignalRow | null | undefined): boolean {
  return Boolean(s && triggeredAt(s));
}

function time(v: string | Date | null | undefined): number {
  const t = new Date(v ?? 0).getTime();
  return Number.isFinite(t) ? t : 0;      // an unparseable date sorts last rather than poisoning the sort
}

/**
 * Every confirmed entry, newest first. One row per SIGNAL — deliberately not per symbol.
 *
 * Sorted purely by time, per his instruction. There is no grouping by state: the previous list put
 * live trades above watching above closed, which is reasonable for a board that mixes them, and
 * wrong for one he asked to read newest-to-oldest.
 */
export function confirmedEntries(rows: SignalRow[] | null | undefined): SignalRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(hasConfirmedEntry)
    .sort((a, b) => time(b?.createdAt) - time(a?.createdAt));
}
