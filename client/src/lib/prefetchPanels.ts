/**
 * prefetchPanels.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared background-prefetch utility for the journal panel set.
 *
 * WHEN TO CALL:
 *   1. On session selection (Journal.tsx useEffect) — warm the cache before
 *      the user opens any panel for the first time.
 *   2. After every trade save / edit / delete (JournalForm, TradeVault) —
 *      immediately re-warm the cache after invalidation so the next panel
 *      open is instant with fresh data.
 *
 * STRATEGY AUDIT NOTE:
 *   The audit is a heavy Python computation (up to ~10s). It fires 500 ms
 *   after the fast endpoints so it does not compete with them for the first
 *   response slot. It runs silently in the background and is ready by the
 *   time the user navigates to the Audit tab.
 */

import type { QueryClient } from "@tanstack/react-query";
import { authFetch, fetchJson } from "./queryClient";

// Match the global queryClient default (staleTime: Infinity) so persisted
// cache entries are never considered stale on reload. Data is invalidated
// explicitly after mutations — no background refetch is needed.
const STALE_FAST  = Infinity;
const STALE_TF    = Infinity;
const STALE_AUDIT = Infinity;

export function prefetchAllPanels(
  queryClient: QueryClient,
  sessionId: string,
  userId?: string,
): void {
  if (!sessionId) return;

  // ── Fast endpoints — fire immediately, all in parallel ──────────────────────
  const fast: { queryKey: unknown[]; url: string; staleTime: number }[] = [
    {
      queryKey: ["/api/sessions",          sessionId],
      url:      `/api/sessions/${sessionId}`,
      staleTime: STALE_FAST,
    },
    {
      queryKey: ["/api/metrics/compute",   sessionId],
      url:      `/api/metrics/compute?sessionId=${sessionId}`,
      staleTime: STALE_FAST,
    },
    {
      queryKey: ["/api/journal/entries",   sessionId],
      url:      `/api/journal/entries?sessionId=${sessionId}`,
      staleTime: STALE_FAST,
    },
    {
      queryKey: ["/api/calendar/compute",  sessionId],
      url:      `/api/calendar/compute?sessionId=${sessionId}`,
      staleTime: STALE_FAST,
    },
    {
      queryKey: ["/api/drawdown/compute",  sessionId],
      url:      `/api/drawdown/compute?sessionId=${sessionId}`,
      staleTime: STALE_FAST,
    },
    {
      queryKey: ["/api/tf-metrics/matrix", sessionId],
      url:      `/api/tf-metrics/matrix?sessionId=${sessionId}`,
      staleTime: STALE_TF,
    },
  ];

  for (const { queryKey, url, staleTime } of fast) {
    // fetchJson THROWS on a non-OK/transient response instead of resolving with
    // null. A rejected prefetch is swallowed by prefetchQuery and leaves any
    // existing good data in place — it must never overwrite the cache (especially
    // the shared "/api/journal/entries" key the Trade Vault reads) with null.
    queryClient.prefetchQuery({
      queryKey,
      queryFn: () => fetchJson(url),
      staleTime,
    });
  }

  // ── Strategy audit — delayed so fast queries get network priority ────────────
  setTimeout(() => {
    const p = new URLSearchParams({ sessionId });
    if (userId) p.set("userId", userId);

    queryClient.prefetchQuery({
      queryKey: ["strategyAudit", sessionId, userId],
      // Use fetchJson so a non-OK/transient failure THROWS. A rejected prefetch is
      // swallowed by prefetchQuery and leaves the cache EMPTY — instead of poisoning
      // it with a sticky `null` (staleTime Infinity) that makes the Audit page show
      // "NO AUDIT DATA YET" and never refetch. The component's own fetchAudit then
      // loads fresh (real data, or a proper error+retry if the server is the issue).
      queryFn: () => fetchJson(`/api/strategy-audit/compute?${p}`),
      staleTime: STALE_AUDIT,
    });
  }, 500);
}

/**
 * Warm the whole journal dashboard for the just-signed-in user. Safe to call the
 * INSTANT sign-in resolves (the Supabase token is available by then) and again on
 * session-confirm — prefetchQuery dedupes identical in-flight keys, so repeated
 * calls are cheap. Fires the last-open session's panels immediately, in parallel
 * with the sessions list, so data is loading before the user reaches /journal.
 */
export function warmJournalCache(queryClient: QueryClient, userId?: string): void {
  const savedId = typeof window !== "undefined"
    ? localStorage.getItem("journal_active_session_id")
    : null;

  if (savedId) prefetchAllPanels(queryClient, savedId, userId);

  queryClient.prefetchQuery({
    // Key must match Journal.tsx useQuery key exactly: ['/api/sessions']
    queryKey: ["/api/sessions"],
    queryFn: () => fetchJson("/api/sessions"),
    staleTime: 2 * 60 * 1000,
  }).then(() => {
    const sessions: any[] = (queryClient.getQueryData(["/api/sessions"]) as any[]) ?? [];
    if (sessions.length === 0) return;
    const target =
      (savedId && sessions.find((s: any) => s.id === savedId)) ??
      sessions.slice().sort((a: any, b: any) =>
        new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
        new Date(a.updatedAt ?? a.createdAt ?? 0).getTime()
      )[0];
    if (target && (!savedId || target.id !== savedId)) prefetchAllPanels(queryClient, target.id, userId);
  }).catch(() => { /* best-effort */ });
}
