import { QueryClient } from "@tanstack/react-query";

export const CALENDAR_QUERY_KEY = ["/api/homepage/calendar"] as const;
export const RATES_QUERY_KEY    = ["/api/homepage/rates"]    as const;
export const BLOG_QUERY_KEY     = ["/api/blog"]              as const;

const STALE_MS = 5 * 60 * 1000;   // 5 min — stays fresh while browsing
const GC_MS    = 60 * 60 * 1000;  // 1 h  — survives across navigation

async function fetchCalendar() {
  const r = await fetch("/api/homepage/calendar");
  const d = await r.json().catch(() => []);
  // Reject empty arrays so we never poison the cache with a cold-start blank
  if (!Array.isArray(d) || d.length === 0) throw new Error("empty");
  return d;
}

async function fetchRates() {
  const r = await fetch("/api/homepage/rates");
  const d = await r.json().catch(() => ({}));
  if (!d || typeof d !== "object" || Object.keys(d).length === 0) throw new Error("empty");
  return d;
}

async function fetchBlog() {
  const r = await fetch("/api/blog");
  return r.ok ? r.json().catch(() => []) : [];
}

/**
 * Prefetch calendar + rates + blog into the shared QueryClient.
 *
 * Safe to call multiple times — TanStack Query skips the fetch if a
 * non-stale result is already cached.  Empty responses are intentionally
 * NOT cached so the next call can retry (avoids poisoning the cache during
 * server cold-start).
 */
export function prefetchCalendarData(qc: QueryClient) {
  // Fire all three in parallel; errors are swallowed (best-effort)
  qc.prefetchQuery({ queryKey: CALENDAR_QUERY_KEY, queryFn: fetchCalendar, staleTime: STALE_MS, gcTime: GC_MS })
    .catch(() => {});
  qc.prefetchQuery({ queryKey: RATES_QUERY_KEY,    queryFn: fetchRates,    staleTime: STALE_MS, gcTime: GC_MS })
    .catch(() => {});
  qc.prefetchQuery({ queryKey: BLOG_QUERY_KEY,     queryFn: fetchBlog,     staleTime: STALE_MS, gcTime: GC_MS })
    .catch(() => {});
}
