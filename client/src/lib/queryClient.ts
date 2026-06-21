import { QueryClient, QueryFunction, keepPreviousData } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { supabase } from "./supabase";

const LOCAL_ADMIN_KEY = 'local_admin_session';

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

async function buildAuthHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } else {
    try {
      const stored = localStorage.getItem(LOCAL_ADMIN_KEY);
      if (stored) {
        const { token } = JSON.parse(stored) as { token?: string };
        if (token) headers["Authorization"] = `Bearer ${token}`;
      }
    } catch { }
  }
  return headers;
}

const networkFallback = (status = 503) =>
  new Response(JSON.stringify({ error: 'Network unavailable' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = await buildAuthHeaders(init.headers as Record<string, string> | undefined);
  try {
    return await fetch(input, { ...init, headers, credentials: init.credentials ?? "include" });
  } catch {
    return networkFallback();
  }
}

/**
 * Safe JSON fetch for React Query `queryFn`s. Authenticated, and THROWS on any
 * non-OK response (401/5xx/502/503) instead of resolving with an error body.
 *
 * Why this matters: a queryFn that does `authFetch(url).then(r => r.json())`
 * will *resolve* with a junk object on a 502/503 (or `[]` if it falls back),
 * overwriting the last-good data and blanking the UI. By throwing, React Query
 * keeps the previous successful data and just records the error — so a transient
 * server hiccup no longer makes content disappear.
 */
export async function fetchJson<T = any>(url: string): Promise<T> {
  const res = await authFetch(url);
  await throwIfResNotOk(res);
  return res.json();
}

export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const headers = await buildAuthHeaders(
    data ? { "Content-Type": "application/json" } : undefined,
  );
  try {
    const res = await fetch(url, {
      method, headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
    await throwIfResNotOk(res);
    return res;
  } catch (err) {
    if (err instanceof TypeError) throw new Error('Network unavailable — check your connection');
    throw err;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers = await buildAuthHeaders();
    try {
      const res = await fetch(queryKey.join("/") as string, { headers, credentials: "include" });
      if (unauthorizedBehavior === "returnNull" && res.status === 401) return null;
      await throwIfResNotOk(res);
      return await res.json();
    } catch (err) {
      if (err instanceof TypeError) return null;
      throw err;
    }
  };

const DAY = 24 * 60 * 60 * 1000;
const RETAIN_MS = 30 * DAY;                        // keep the persisted cache ~30 days (survives logout)
const CACHE_KEY = "fsd-journal-cache-v1";
const OWNER_KEY = "fsd-journal-cache-owner";       // userId the persisted cache belongs to

/** Synchronously read the signed-in user's id from the Supabase session that
 *  supabase-js stores in localStorage — used to guard the persisted cache so a
 *  DIFFERENT user can never seed from the previous user's data. */
function currentSupabaseUserId(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const v = JSON.parse(localStorage.getItem(k) || "null");
        return v?.user?.id ?? v?.currentSession?.user?.id ?? null;
      }
    }
  } catch { /* ignore */ }
  return null;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      gcTime: DAY,
      retry: false,
      // Keep showing the last-good data while a query refetches or its key
      // changes, so a failed/slow refetch never flashes the UI empty.
      placeholderData: keepPreviousData,
    },
    mutations: { retry: false },
  },
});

/**
 * Synchronously read the persisted cache from localStorage and seed the
 * QueryClient with it — before any React component renders.
 *
 * Why this is needed:
 *   PersistQueryClientProvider restores the cache inside a useEffect, which
 *   fires AFTER the first paint.  That one-frame gap means components mount
 *   with an empty QueryClient even though fresh data is sitting in
 *   localStorage.  By seeding here (module evaluation time, synchronous) the
 *   QueryClient already contains the last-known data on frame 0, so pages
 *   that use cached queries never see a loading state.
 */
function seedQueryClientFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    // Never seed a cache that belongs to a DIFFERENT user than the one currently
    // signed in — drop it so the previous user's data can't leak on a shared device.
    const owner = localStorage.getItem(OWNER_KEY);
    const uid = currentSupabaseUserId();
    if (owner && uid && owner !== uid) { localStorage.removeItem(CACHE_KEY); return; }
    const persisted = JSON.parse(raw) as {
      timestamp?: number;
      clientState?: { queries?: Array<{ queryKey: unknown[]; state: { data: unknown; status: string; dataUpdatedAt?: number } }> };
    };

    // Retention window — don't seed if the stored snapshot is older than RETAIN_MS
    const age = Date.now() - (persisted.timestamp ?? 0);
    if (age > RETAIN_MS) return;

    const queries = persisted?.clientState?.queries ?? [];
    for (const q of queries) {
      if (q?.state?.status === "success" && q?.state?.data !== undefined) {
        queryClient.setQueryData(q.queryKey, q.state.data);
      }
    }
  } catch { /* ignore malformed cache */ }
}

// Run synchronously at module load — before any React tree mounts
seedQueryClientFromStorage();

/**
 * Persists the query cache to localStorage so the dashboard is ready
 * instantly on every visit — stale data is shown immediately while
 * fresh data refreshes in the background.
 */
export const localStoragePersister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: CACHE_KEY,
  throttleTime: 1_000,
});
