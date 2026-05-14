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

/**
 * Build the default headers for an API request, including the auth
 * Bearer token so the server can identify the user.
 */
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
    } catch {
      // ignore parse errors
    }
  }
  return headers;
}

/**
 * Drop-in replacement for `fetch` that automatically attaches the Supabase
 * Bearer token and `credentials: "include"`.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = await buildAuthHeaders(init.headers as Record<string, string> | undefined);
  return fetch(input, { ...init, headers, credentials: init.credentials ?? "include" });
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = await buildAuthHeaders(
    data ? { "Content-Type": "application/json" } : undefined,
  );
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers = await buildAuthHeaders();
    const res = await fetch(queryKey.join("/") as string, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

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
      // Keep cached data for 24 hours so the persister has something to save
      gcTime: DAY,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Persists the query cache to localStorage so the dashboard is ready
 * instantly on every login — stale data is shown immediately while
 * fresh data loads in the background.
 *
 * Only queries that have successfully fetched data are stored.
 * The persisted cache expires after 24 hours.
 */
export const localStoragePersister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: "fsd-journal-cache-v1",
  throttleTime: 1_000,
});
