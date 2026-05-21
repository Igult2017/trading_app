import { QueryClient } from "@tanstack/react-query";

export const CALENDAR_QUERY_KEY = ["/api/homepage/calendar"] as const;
export const RATES_QUERY_KEY    = ["/api/homepage/rates"]    as const;
export const BLOG_QUERY_KEY     = ["/api/blog"]              as const;

// Keep data "fresh" for 15 min — page never triggers its own refetch within that window
export const CALENDAR_STALE_MS = 15 * 60 * 1000;
export const CALENDAR_GC_MS    =  2 * 60 * 60 * 1000;

// Background loop fires every 12 min so cache is never older than 12 min
const REFRESH_INTERVAL_MS = 12 * 60 * 1000;

// ── Raw fetchers (always return gracefully, never throw) ──────────────────────

async function fetchCalendarRaw() {
  try {
    const r = await fetch("/api/homepage/calendar");
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

async function fetchRatesRaw() {
  try {
    const r = await fetch("/api/homepage/rates");
    const d = await r.json();
    return (d && typeof d === "object") ? d : {};
  } catch { return {}; }
}

async function fetchBlogRaw() {
  try {
    const r = await fetch("/api/blog");
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

// ── Cache writer — updates cache only when response has real data ─────────────

async function refreshAll(qc: QueryClient) {
  const [cal, rates, blog] = await Promise.all([
    fetchCalendarRaw(),
    fetchRatesRaw(),
    fetchBlogRaw(),
  ]);

  // Calendar & rates: only overwrite if we got non-empty data so a server
  // cold-start or temporary error never wipes good cached data.
  if (Array.isArray(cal) && cal.length > 0) {
    qc.setQueryData(CALENDAR_QUERY_KEY, cal);
  }
  if (rates && typeof rates === "object" && Object.keys(rates).length > 0) {
    qc.setQueryData(RATES_QUERY_KEY, rates);
  }
  // Blog can legitimately be empty — always write it
  qc.setQueryData(BLOG_QUERY_KEY, blog);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * One-shot prefetch used for hover-intent on nav links.
 * Only fetches if cache is empty (no stale data to show yet).
 */
export function prefetchIfEmpty(qc: QueryClient) {
  const hasCal   = (qc.getQueryData(CALENDAR_QUERY_KEY) as any[])?.length > 0;
  const hasRates = Object.keys((qc.getQueryData(RATES_QUERY_KEY) as object) ?? {}).length > 0;
  if (!hasCal || !hasRates) {
    refreshAll(qc).catch(() => {});
  }
}

/**
 * Start the background refresh loop.
 *
 * - Fires immediately on call.
 * - Then repeats every 12 minutes so the cache is never stale.
 * - Pauses while the browser tab is hidden; triggers one refresh on visibility
 *   restore so data is always fresh when the user returns.
 * - Returns a cleanup function — call it to stop the loop (e.g. on unmount).
 */
export function startCalendarBackgroundRefresh(qc: QueryClient): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let destroyed = false;

  // Immediate first load
  refreshAll(qc).catch(() => {});

  function schedule() {
    if (destroyed) return;
    timer = setInterval(() => {
      if (document.visibilityState !== "hidden") {
        refreshAll(qc).catch(() => {});
      }
    }, REFRESH_INTERVAL_MS);
  }

  // On tab focus restore — re-fresh once if the tab was hidden for a while
  function onVisibility() {
    if (document.visibilityState === "visible") {
      refreshAll(qc).catch(() => {});
    }
  }

  schedule();
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    destroyed = true;
    if (timer !== null) clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
