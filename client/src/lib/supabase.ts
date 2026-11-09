import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const hasCredentials = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasCredentials) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth features will not work');
}

export const RESET_PATH = '/auth/reset-password';

/**
 * A PASSWORD-RESET LINK IS HONOURED WHEREVER IT LANDS — not only on the reset page.
 *
 * MEASURED on production, 2026-11-08, with a real link from `admin/generate_link`: the app asks
 * Supabase to send people to `https://app.dorixe.com/auth/reset-password` (AuthModal.tsx), and
 * Supabase hands back `redirect_to=https://app.dorixe.com` — the PATH IS DROPPED, because that
 * address is not on the project's Redirect URLs allow-list (the app only moved to app.dorixe.com on
 * 2026-11-02). The link therefore lands on the HOMEPAGE carrying `#...&type=recovery`, nothing there
 * reads it, the visitor is silently signed in, and no password form is ever shown. That is the whole
 * of "password reset does not work".
 *
 * ⚠ IT HAS TO RUN BEFORE `createClient`. The login library wipes the token out of the address as
 * soon as it starts reading it (GoTrueClient.js:3103), so anything that waits for React is too late.
 * A module-level statement above the call is the only placement that always wins.
 *
 * Only `type=recovery` is routed. An EXPIRED link comes back as `#error=access_denied&
 * error_code=otp_expired` with no type at all, which is indistinguishable from an expired sign-up
 * confirmation — so guessing a destination for it would be inventing a rule. Noted in docs/OPEN.md
 * instead of guessed at.
 */
function routeRecoveryLink(): void {
  if (typeof window === 'undefined') return;
  const { hash, search, pathname } = window.location;
  if (pathname === RESET_PATH) return;
  const carriesRecovery = (s: string) =>
    s.length > 1 && new URLSearchParams(s.replace(/^[#?]/, '')).get('type') === 'recovery';
  if (!carriesRecovery(hash) && !carriesRecovery(search)) return;
  // `replace`, so Back does not bounce straight out of the reset page again. The hash and query are
  // carried over untouched: they ARE the one-time token.
  window.location.replace(`${window.location.origin}${RESET_PATH}${search}${hash}`);
}

routeRecoveryLink();

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
