import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';

export interface Entitlement {
  subscriptionStatus: string;
  subscriptionEndsAt: string | null;
  journalAccessEndsAt: string | null;
  journalAccessGrantedBy: string | null;
  hasJournalAccess: boolean;
  stripeConfigured: boolean;
}

/**
 * Fetch with a hard timeout so a slow server never leaves the journal
 * stuck on the loading screen in production.
 */
async function fetchEntitlement(): Promise<Entitlement> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const r = await authFetch('/api/me/entitlement', { signal: controller.signal });
    if (!r.ok) throw new Error(`entitlement ${r.status}`);
    return r.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function useEntitlement() {
  const { session, role } = useAuth();

  const { data, isLoading, fetchStatus, isError } = useQuery<Entitlement>({
    queryKey: ['/api/me/entitlement', session?.user?.id],
    queryFn: fetchEntitlement,
    enabled: !!session,
    staleTime: 60_000,
    retry: false,
  });

  // In TanStack Query v5, a disabled query (enabled:false) still reports
  // isLoading:true with fetchStatus:'idle'. Only block the UI while a real
  // network request is in flight.
  const actuallyLoading = isLoading && fetchStatus !== 'idle';

  const isAdmin = role === 'admin';

  // On error or timeout, grant access anyway when Stripe is not configured
  // (the endpoint itself does the same). Admins always get through.
  const hasJournalAccess =
    isAdmin ||
    (isError ? !(data?.stripeConfigured ?? false) : (data?.hasJournalAccess ?? false));

  return {
    loading: actuallyLoading,
    hasJournalAccess,
    stripeConfigured: data?.stripeConfigured ?? false,
    subscriptionStatus: data?.subscriptionStatus ?? 'free',
    journalAccessEndsAt: data?.journalAccessEndsAt ?? null,
    isAdmin,
  };
}
