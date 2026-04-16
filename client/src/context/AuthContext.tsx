import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

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

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
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
    if (!supabase) return { error: new Error('Auth not configured'), role: null };

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
    if (!supabase) return;
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
