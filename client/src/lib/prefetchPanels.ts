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

const STALE_FAST  = 2 * 60 * 1000;   // 2 min — metrics / drawdown / calendar / entries
const STALE_TF    = 60_000;           // 1 min — tf-metrics
const STALE_AUDIT = 5 * 60 * 1000;   // 5 min — strategy audit (heavy Python)

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
        authFetch(url).then(r =>
          r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)),
        ),
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
        const r = await authFetch(`/api/strategy-audit/compute?${p}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      },
      staleTime: STALE_AUDIT,
    });
  }, 500);
}
