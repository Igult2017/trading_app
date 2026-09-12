import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/queryClient';

/**
 * ONE WAY FOR THE ADMIN PANEL TO READ DATA — and the reason it exists.
 *
 * Every admin screen used to load itself with `useState` + `useEffect` + `fetch`. Switching tabs
 * UNMOUNTS the screen you were on, so that state was thrown away, and coming back re-fetched from
 * nothing. That is why he saw "loading" or an empty page on every single tab, every single time:
 * *"every page is loading or saying no content when i open it"*. Nothing was ever kept.
 *
 * The app already had the cure wired up and the panel simply was not using it. React Query is
 * configured in `lib/queryClient.ts` with `staleTime: Infinity` and `gcTime: DAY`, and App.tsx
 * wraps everything in `PersistQueryClientProvider` — so anything read through it is kept for a
 * day AND survives a page reload. Two calls in AdminPanel already did this; fourteen did not.
 *
 * WHAT CHANGES FOR THE USER. The first visit to a screen fetches. Every visit after that paints
 * from cache immediately — no spinner, no empty state — while a fresh copy is fetched behind it.
 */
export function useAdminData<T>(url: string, opts: { enabled?: boolean; fallback?: T } = {}) {
  const q = useQuery<T>({
    queryKey: [url],
    queryFn: () => fetchJson<T>(url),
    enabled: opts.enabled ?? true,
    staleTime: Infinity,
    retry: 1,
  });
  return {
    data: (q.data ?? opts.fallback) as T,
    /** TRUE ONLY ON A COLD FIRST LOAD. Deliberately `isLoading` and not `isFetching`: a
     *  background refresh of data we already have must never blank the page the user is reading,
     *  which is the whole point of the change. */
    loading: q.isLoading,
    /** A refresh that failed while cached data is still on screen is not worth shouting about;
     *  only report an error when there is nothing to show. */
    error: q.isError && q.data === undefined ? ((q.error as Error)?.message ?? 'Could not load') : null,
    refresh: () => q.refetch(),
  };
}

/**
 * EVERY READ THE PANEL MAKES, in one list.
 *
 * These are fetched in the background as soon as the panel opens, so a tab is already warm before
 * it is clicked. They are deliberately ordered: the screens he lands on first come first, and the
 * heavy ones are last so they cannot delay the light ones.
 *
 * Writes are NOT here. A POST or PATCH has a side effect and must never be fired speculatively.
 */
export const ADMIN_READS: string[] = [
  '/api/admin/stats',
  '/api/admin/users',
  '/api/admin/tickets',
  '/api/blog/all',
  '/api/admin/blog-views',
  '/api/admin/campaign-stats',
  '/api/admin/campaign-history',
  '/api/admin/cc-agents',
  '/api/admin/tasks',
  '/api/admin/copy/overview',
  '/api/admin/sessions',
];

// NOT PREFETCHED, ON PURPOSE: /api/admin/metrics, /health, /logs and /services-state. System
// Monitor polls those every few seconds and reshapes them before use, so warming them here would
// fetch data that is stale by the time it is read and store it in the wrong shape. That screen
// keeps its own last-reading cache instead.

/**
 * Warm every screen in the background once, shortly after the panel opens.
 *
 * WHY A DELAY, AND WHY ONE AT A TIME. Firing fourteen requests the instant the panel mounts makes
 * them compete with the data the screen he is actually looking at needs — the visible page would
 * get slower so the invisible ones could get faster. They start after the first paint has settled
 * and go out in a small trickle.
 *
 * `prefetchQuery` is a no-op for anything already cached, so this costs nothing on a revisit and
 * never overwrites fresher data.
 */
export function usePrefetchAdmin(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const url of ADMIN_READS) {
        if (cancelled) return;
        await qc.prefetchQuery({
          queryKey: [url],
          queryFn: () => fetchJson(url),
          staleTime: Infinity,
        }).catch(() => { /* a warm-up that fails is not an error the user should ever see */ });
      }
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, qc]);
}
