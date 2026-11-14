import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';

/**
 * useMyProfile — the signed-in user's own profile (GET /api/me/profile), ONE copy for the whole app.
 *
 * WHY SHARED (2026-11-15). The journal header used to fetch this into its own private state, so a name
 * or photo changed anywhere else (now the Settings page) stayed stale in the header until a reload.
 * Everything reads this key and every save calls `refresh()`.
 */
export const MY_PROFILE_KEY = ['/api/me/profile'];

export type MyProfile = {
  fullName: string; email: string | null; plan: string; country: string;
  avatarUrl: string | null;
  loginStreak: number; longestStreak: number; activeDays: string[];
  /** The trader's own "show me on the leaderboard" switch — off until they turn it on. */
  leaderboardOptIn: boolean;
  /** An admin removed them; their own switch then has no effect, and the page says so. */
  leaderboardRemovedByAdmin: boolean;
};

export function useMyProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery<MyProfile | null>({
    queryKey: [...MY_PROFILE_KEY, user?.id ?? null],
    enabled: !!user,
    queryFn: async () => {
      const r = await authFetch('/api/me/profile');
      if (!r.ok) return null;
      const d = await r.json();
      return {
        fullName: d.fullName || '', email: d.email ?? null, plan: d.plan || 'Free', country: d.country || '',
        avatarUrl: d.avatarUrl || null,
        loginStreak: d.loginStreak || 0, longestStreak: d.longestStreak || 0,
        activeDays: Array.isArray(d.activeDays) ? d.activeDays : [],
        leaderboardOptIn: d.leaderboardOptIn === true,
        leaderboardRemovedByAdmin: d.leaderboardRemovedByAdmin === true,
      };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: MY_PROFILE_KEY });
  return { profile: user ? (q.data ?? null) : null, isLoading: q.isLoading, refresh };
}
