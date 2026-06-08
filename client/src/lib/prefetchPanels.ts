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
import { authFetch } from "./queryClient";

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
    queryClient.prefetchQuery({
      queryKey,
      queryFn: () =>
        authFetch(url)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
      staleTime,
    });
  }

  // ── Strategy audit — delayed so fast queries get network priority ────────────
  setTimeout(() => {
    const p = new URLSearchParams({ sessionId });
    if (userId) p.set("userId", userId);

    queryClient.prefetchQuery({
      queryKey: ["strategyAudit", sessionId, userId],
      queryFn: async () => {
        try {
          const r = await authFetch(`/api/strategy-audit/compute?${p}`);
          return r.ok ? r.json() : null;
        } catch { return null; }
      },
      staleTime: STALE_AUDIT,
    });
  }, 500);
}
