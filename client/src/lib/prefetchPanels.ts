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

  // ── Entries — FAST standalone prefetch ───────────────────────────────────────
  // A cheap DB query (~250ms). Seed it on its OWN so the Trade Vault + dashboard
  // recent-trades populate immediately, instead of waiting on the ~2s /api/dashboard
  // bundle below (which blocks on the metrics Python compute). The bundle re-seeds
  // the same key harmlessly; whichever lands first wins, and this one lands first.
  queryClient.prefetchQuery({
    queryKey: ["/api/journal/entries", sessionId],
    queryFn: () => fetchJson(`/api/journal/entries?sessionId=${sessionId}`),
    staleTime: STALE_FAST,
  });

  // ── Landing bundle — ONE round-trip seeds the dashboard + session selector ───
  // /api/dashboard returns { sessions, session, entries, metrics } in a single
  // request; we seed each panel's EXACT React Query key so the components read from
  // cache with no fetch. fetchJson THROWS on a non-OK/transient response, so a
  // failed bundle leaves any existing good cache intact (never overwrites with null,
  // especially the shared "/api/journal/entries" key the Trade Vault reads).
  fetchJson(`/api/dashboard?sessionId=${sessionId}`)
    .then((d: any) => {
      if (!d) return;
      if (Array.isArray(d.sessions)) queryClient.setQueryData(["/api/sessions"], d.sessions);
      if (d.session)                 queryClient.setQueryData(["/api/sessions", sessionId], d.session);
      if (Array.isArray(d.entries))  queryClient.setQueryData(["/api/journal/entries", sessionId], d.entries);
      if (d.metrics)                 queryClient.setQueryData(["/api/metrics/compute", sessionId], d.metrics);
    })
    .catch(() => { /* best-effort — panels fall back to their own queries */ });

  // ── Heavier analytics panels — background prefetch so a tab switch is warm, but
  // they NEVER block the dashboard (each is a 30s-cap Python compute). ───────────
  const heavy: { queryKey: unknown[]; url: string; staleTime: number }[] = [
    { queryKey: ["/api/calendar/compute",  sessionId], url: `/api/calendar/compute?sessionId=${sessionId}`,  staleTime: STALE_FAST },
    { queryKey: ["/api/drawdown/compute",  sessionId], url: `/api/drawdown/compute?sessionId=${sessionId}`,  staleTime: STALE_FAST },
    { queryKey: ["/api/tf-metrics/matrix", sessionId], url: `/api/tf-metrics/matrix?sessionId=${sessionId}`, staleTime: STALE_TF },
  ];
  for (const { queryKey, url, staleTime } of heavy) {
    queryClient.prefetchQuery({ queryKey, queryFn: () => fetchJson(url), staleTime });
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
  // Entitlement gates the WHOLE journal (the first loader, before the dashboard even
  // mounts). Prefetch it the instant we sign in — keyed exactly as useEntitlement —
  // so the journal renders straight to content instead of a full-page spinner.
  if (userId) {
    queryClient.prefetchQuery({
      queryKey: ["/api/me/entitlement", userId],
      queryFn: () => fetchJson("/api/me/entitlement"),
      staleTime: 60_000,
    });
  }

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

/**
 * AWAITABLE warm-up for login/signup. Resolves once the journal's gating data is in
 * cache — entitlement + the active session's /api/dashboard (sessions, session,
 * entries, metrics) — so login can complete onto a fully-populated dashboard rather
 * than a skeleton.
 *
 * Contract (deliberately defensive — this runs in the login critical path):
 *  - NEVER throws. Every fetch is caught; a failure just means the journal's own
 *    boot-gate/queries handle it after navigation.
 *  - TIME-BOXED. Races a timeout so a slow/cold metrics compute can't hang login;
 *    on timeout it resolves and the in-flight fetches keep seeding the cache in the
 *    background while the boot-gate skeleton covers the gap.
 *  - Brand-new user with no sessions resolves almost immediately (nothing to load).
 */
export async function prepareDashboard(
  queryClient: QueryClient,
  userId?: string,
  timeoutMs = 6000,
): Promise<void> {
  // Warm-cache fast path: if the gating data (entitlement + the active session's
  // metrics) is already cached — i.e. a SAME-user re-login on a device that kept its
  // cache — resolve immediately so re-login stays INSTANT (no blocking fetch). The
  // journal renders straight from cache; its own queries refresh in the background.
  // Only a COLD login (new device / different user / first signup) falls through to
  // the blocking fetch below.
  const savedId = typeof window !== "undefined"
    ? localStorage.getItem("journal_active_session_id")
    : null;
  const haveEnt  = !userId || !!queryClient.getQueryData(["/api/me/entitlement", userId]);
  const haveDash = !!savedId && !!queryClient.getQueryData(["/api/metrics/compute", savedId]);
  if (haveEnt && haveDash) return;

  const work = (async () => {
    const tasks: Promise<unknown>[] = [];

    // Entitlement — gates the whole journal (the first loader). Seed its exact key.
    if (userId) {
      tasks.push(
        fetchJson("/api/me/entitlement")
          .then((d) => queryClient.setQueryData(["/api/me/entitlement", userId], d))
          .catch(() => { /* journal falls back to its own entitlement query */ }),
      );
    }

    // Active session → landing bundle.
    tasks.push((async () => {
      let sessionId = typeof window !== "undefined"
        ? localStorage.getItem("journal_active_session_id")
        : null;

      let sessions: any[] = [];
      try {
        const list = await fetchJson<any[]>("/api/sessions");
        sessions = Array.isArray(list) ? list : [];
        queryClient.setQueryData(["/api/sessions"], sessions);
      } catch { /* leave empty — no session to populate */ }

      // Validate the saved session or fall back to the most-recent one.
      if (!sessionId || !sessions.some((s: any) => s.id === sessionId)) {
        sessionId = sessions.length
          ? sessions.slice().sort((a: any, b: any) =>
              new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
              new Date(a.updatedAt ?? a.createdAt ?? 0).getTime())[0].id
          : null;
      }
      if (!sessionId) return;   // brand-new user — nothing to populate, resolve fast

      try {
        const d: any = await fetchJson(`/api/dashboard?sessionId=${sessionId}`);
        if (d) {
          if (Array.isArray(d.sessions)) queryClient.setQueryData(["/api/sessions"], d.sessions);
          if (d.session)                 queryClient.setQueryData(["/api/sessions", sessionId], d.session);
          if (Array.isArray(d.entries))  queryClient.setQueryData(["/api/journal/entries", sessionId], d.entries);
          if (d.metrics)                 queryClient.setQueryData(["/api/metrics/compute", sessionId], d.metrics);
        }
      } catch { /* boot-gate skeleton covers it after navigation */ }
    })());

    await Promise.all(tasks);
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); });
  try {
    await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
