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

  const { data, isLoading } = useQuery<Entitlement>({
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

  // Admins always have access regardless of subscription state
  const isAdmin = role === 'admin';

  return {
    loading: isLoading,
    hasJournalAccess: isAdmin || (data?.hasJournalAccess ?? false),
    stripeConfigured: data?.stripeConfigured ?? false,
    subscriptionStatus: data?.subscriptionStatus ?? 'free',
    journalAccessEndsAt: data?.journalAccessEndsAt ?? null,
    isAdmin,
  };
}
