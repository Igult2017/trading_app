import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const hasCredentials = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasCredentials) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth features will not work');
}

// Session is stored in sessionStorage (not the default localStorage) so it is
// scoped to the browser tab: closing the tab/browser clears the session and
// reopening requires a fresh login. A page refresh keeps sessionStorage, so
// refreshing does NOT log the user out. Trade-off: each tab has its own session
// (a second/duplicated tab starts logged out).
export const supabase: SupabaseClient | null = hasCredentials
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
      },
    })
  : null;
