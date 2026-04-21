import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

const LOCAL_ADMIN_KEY = 'local_admin_session';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: 'admin' | 'user' | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{
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

function makeLocalSession(email: string): { session: Session; user: User; role: 'admin' } {
  const fakeUser = {
    id: 'local-admin',
    email,
    app_metadata: { role: 'admin' },
    user_metadata: { role: 'admin', full_name: 'Admin' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as unknown as User;

  const fakeSession = {
    access_token: 'local-admin-token',
    refresh_token: '',
    expires_in: 86400,
    token_type: 'bearer',
    user: fakeUser,
  } as unknown as Session;

  return { session: fakeSession, user: fakeUser, role: 'admin' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser]       = useState<User | null>(null);
  const [role, setRole]       = useState<'admin' | 'user' | null>(null);
  const [loading, setLoading] = useState(true);

  function extractRole(u: User | null): 'admin' | 'user' | null {
    if (!u) return null;
    const r = u.app_metadata?.role ?? u.user_metadata?.role;
    return r === 'admin' ? 'admin' : 'user';
  }

  useEffect(() => {
    if (!supabase) {
      const stored = localStorage.getItem(LOCAL_ADMIN_KEY);
      if (stored) {
        try {
          const { email } = JSON.parse(stored) as { email: string };
          const { session: s, user: u, role: r } = makeLocalSession(email);
          setSession(s);
          setUser(u);
          setRole(r);
        } catch {
          localStorage.removeItem(LOCAL_ADMIN_KEY);
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

  async function signUp(email: string, password: string, fullName: string) {
    if (!supabase) return { error: new Error('Auth not configured'), emailConfirmationRequired: false };

    const redirectTo = `${window.location.origin}/auth/callback`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: redirectTo,
      },
    });

    if (error) return { error, emailConfirmationRequired: false };

    if (data.session) {
      await runSetup(data.session.access_token);
      await supabase.auth.refreshSession();
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
        const data = await res.json() as { role: string; email: string };
        const assignedRole: 'admin' | 'user' = data.role === 'admin' ? 'admin' : 'user';
        localStorage.setItem(LOCAL_ADMIN_KEY, JSON.stringify({ email: data.email }));
        const { session: s, user: u } = makeLocalSession(data.email);
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

    const assignedRole = await runSetup(data.session.access_token);

    if (assignedRole) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      const finalRole = extractRole(refreshed.session?.user ?? null);
      return { error: null, role: finalRole };
    }

    return { error: null, role: extractRole(data.session.user) };
  }

  async function signOut() {
    if (!supabase) {
      localStorage.removeItem(LOCAL_ADMIN_KEY);
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
