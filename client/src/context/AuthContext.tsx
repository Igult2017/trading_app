import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { warmJournalCache } from '@/lib/prefetchPanels';
import { clearInactivityTracking } from '@/lib/inactivity';

const LOCAL_ADMIN_KEY = 'local_admin_session';

/**
 * Resolve initial auth state synchronously from sessionStorage.
 * When running in local-admin mode (no Supabase), the session is persisted in
 * sessionStorage so we can skip the async useEffect entirely on reload —
 * loading starts as false and RequireAuth never shows the spinner.
 */
function getLocalInitialState() {
  const noSupabase = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!noSupabase || typeof window === 'undefined') {
    return { session: null as Session | null, user: null as User | null, role: null as 'admin' | 'user' | null, loading: true };
  }
  try {
    const stored = sessionStorage.getItem(LOCAL_ADMIN_KEY);
    if (stored) {
      const { email, token } = JSON.parse(stored) as { email: string; token?: string };
      const { session, user, role } = makeLocalSession(email, token);
      return { session, user, role, loading: false };
    }
  } catch {}
  return { session: null as Session | null, user: null as User | null, role: null as 'admin' | 'user' | null, loading: false };
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: 'admin' | 'user' | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, country?: string) => Promise<{
    error: Error | null;
    emailConfirmationRequired: boolean;
  }>;
  signIn: (email: string, password: string) => Promise<{
    error: Error | null;
    role: 'admin' | 'user' | null;
  }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function makeLocalSession(email: string, token = 'local-admin-token'): { session: Session; user: User; role: 'admin' } {
  const fakeUser = {
    id: 'local-admin',
    email,
    app_metadata: { role: 'admin' },
    user_metadata: { role: 'admin', full_name: 'Admin' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as unknown as User;

  const fakeSession = {
    access_token: token,
    refresh_token: '',
    expires_in: 86400,
    token_type: 'bearer',
    user: fakeUser,
  } as unknown as Session;

  return { session: fakeSession, user: fakeUser, role: 'admin' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => getLocalInitialState().session);
  const [user, setUser]       = useState<User | null>(() => getLocalInitialState().user);
  const [role, setRole]       = useState<'admin' | 'user' | null>(() => getLocalInitialState().role);
  const [loading, setLoading] = useState<boolean>(() => getLocalInitialState().loading);

  function extractRole(u: User | null): 'admin' | 'user' | null {
    if (!u) return null;
    const r = u.app_metadata?.role ?? u.user_metadata?.role;
    return r === 'admin' ? 'admin' : 'user';
  }

  useEffect(() => {
    if (!supabase) {
      const stored = sessionStorage.getItem(LOCAL_ADMIN_KEY);
      if (stored) {
        try {
          const { email, token } = JSON.parse(stored) as { email: string; token?: string };
          const { session: s, user: u, role: r } = makeLocalSession(email, token);
          setSession(s);
          setUser(u);
          setRole(r);
        } catch {
          sessionStorage.removeItem(LOCAL_ADMIN_KEY);
        }
      }
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setRole(extractRole(s?.user ?? null));
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setRole(extractRole(s?.user ?? null));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Defense-in-depth for the cache owner: logout already wipes it, but if a session
  // ended uncleanly (tab killed, no signOut) and a DIFFERENT user then signs in,
  // drop the previous user's cached data so it can never surface cross-user.
  useEffect(() => {
    if (loading || !user?.id) return;
    try {
      const OWNER_KEY = 'fsd-journal-cache-owner';
      const owner = localStorage.getItem(OWNER_KEY);
      if (owner && owner !== user.id) {
        queryClient.clear();
        localStorage.removeItem('fsd-journal-cache-v1');
      }
      localStorage.setItem(OWNER_KEY, user.id);
    } catch { /* ignore */ }
  }, [user?.id, loading]);

  async function runSetup(accessToken: string): Promise<'admin' | 'user' | null> {
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const data = await res.json() as { role?: string };
      return data.role === 'admin' ? 'admin' : 'user';
    } catch {
      return null;
    }
  }

  async function signUp(email: string, password: string, fullName: string, country = '') {
    if (!supabase) return { error: new Error('Auth not configured'), emailConfirmationRequired: false };

    const redirectTo = `${window.location.origin}/auth/callback`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, country },
        emailRedirectTo: redirectTo,
      },
    });

    if (error) return { error, emailConfirmationRequired: false };

    if (data.session) {
      // Warm the dashboard the instant signup yields a session (parallel with setup).
      try { warmJournalCache(queryClient, data.session.user.id); } catch { /* best-effort */ }
      const assignedRole = await runSetup(data.session.access_token);
      clearInactivityTracking();   // fresh login — start a clean 10-min window
      setRole(assignedRole ?? extractRole(data.session.user));
      return { error: null, emailConfirmationRequired: false };
    }

    return { error: null, emailConfirmationRequired: true };
  }

  async function signIn(email: string, password: string) {
    if (!supabase) {
      try {
        const res = await fetch('/api/auth/local-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          return { error: new Error(err.error ?? 'Invalid credentials'), role: null };
        }
        const data = await res.json() as { role: string; email: string; token?: string };
        const assignedRole: 'admin' | 'user' = data.role === 'admin' ? 'admin' : 'user';
        sessionStorage.setItem(LOCAL_ADMIN_KEY, JSON.stringify({ email: data.email, token: data.token }));
        const { session: s, user: u } = makeLocalSession(data.email, data.token);
        clearInactivityTracking();   // fresh login — start a clean 10-min window
        setSession(s);
        setUser(u);
        setRole(assignedRole);
        return { error: null, role: assignedRole };
      } catch (e: any) {
        return { error: new Error(e.message ?? 'Login failed'), role: null };
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      return { error: error ?? new Error('Sign in failed'), role: null };
    }

    // Fire the dashboard warm-up the INSTANT sign-in succeeds — the earliest the
    // token exists — so journal data is already loading (in parallel with the
    // profile setup below) before the user is routed to /journal.
    try { warmJournalCache(queryClient, data.session.user.id); } catch { /* best-effort */ }

    const assignedRole = await runSetup(data.session.access_token);
    const role = assignedRole ?? extractRole(data.session.user);

    // Set role directly — avoids calling refreshSession() which can fire
    // a SIGNED_OUT event on failure and silently kill the new session.
    clearInactivityTracking();   // fresh login — start a clean 10-min window
    setRole(role);
    return { error: null, role };
  }

  async function signOut() {
    // Keep the journal cache across logout so the SAME user's next login is INSTANT
    // (stale-while-revalidate — no loaders at all). The auth token is cleared below,
    // so the cached data can never be used for authenticated requests. A DIFFERENT
    // user signing in trips the owner-guard effect above (queryClient.clear() + wipe
    // localStorage) before any prior data can surface. The cache holds journal data +
    // plan status only — never credentials or tokens (those live in Supabase's store).
    if (!supabase) {
      sessionStorage.removeItem(LOCAL_ADMIN_KEY);
      setSession(null);
      setUser(null);
      setRole(null);
      return;
    }
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
