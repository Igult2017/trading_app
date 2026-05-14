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

export function useEntitlement() {
  const { session, role } = useAuth();

  const { data, isLoading, fetchStatus } = useQuery<Entitlement>({
    queryKey: ['/api/me/entitlement', session?.user?.id],
    queryFn: () =>
      authFetch('/api/me/entitlement').then(r => {
        if (!r.ok) throw new Error('entitlement fetch failed');
        return r.json();
      }),
    enabled: !!session,
    staleTime: 60_000,
    retry: false,
  });

  // In TanStack Query v5, a disabled query still reports isLoading:true
  // (status:"pending", fetchStatus:"idle"). We only want to block the UI
  // while a real network request is in flight, not while the query is idle.
  const actuallyLoading = isLoading && fetchStatus !== 'idle';

  const isAdmin = role === 'admin';

  return {
    loading: actuallyLoading,
    hasJournalAccess: isAdmin || (data?.hasJournalAccess ?? false),
    stripeConfigured: data?.stripeConfigured ?? false,
    subscriptionStatus: data?.subscriptionStatus ?? 'free',
    journalAccessEndsAt: data?.journalAccessEndsAt ?? null,
    isAdmin,
  };
}
