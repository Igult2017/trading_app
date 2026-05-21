import { QueryClient, QueryFunction } from "@tanstack/react-query";
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

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = await buildAuthHeaders(init.headers as Record<string, string> | undefined);
  return fetch(input, { ...init, headers, credentials: init.credentials ?? "include" });
}

export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const headers = await buildAuthHeaders(
    data ? { "Content-Type": "application/json" } : undefined,
  );
  const res = await fetch(url, {
    method, headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers = await buildAuthHeaders();
    const res = await fetch(queryKey.join("/") as string, { headers, credentials: "include" });
    if (unauthorizedBehavior === "returnNull" && res.status === 401) return null;
    await throwIfResNotOk(res);
    return await res.json();
  };

const DAY = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      gcTime: DAY,
      retry: false,
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
    const raw = localStorage.getItem("fsd-journal-cache-v1");
    if (!raw) return;
    const persisted = JSON.parse(raw) as {
      timestamp?: number;
      clientState?: { queries?: Array<{ queryKey: unknown[]; state: { data: unknown; status: string; dataUpdatedAt?: number } }> };
    };

    // Honour the 24-hour TTL — don't seed if the stored snapshot is too old
    const age = Date.now() - (persisted.timestamp ?? 0);
    if (age > DAY) return;

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
  key: "fsd-journal-cache-v1",
  throttleTime: 1_000,
});
