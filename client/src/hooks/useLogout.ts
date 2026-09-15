import { useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { rememberReturnTo } from '@/lib/inactivity';

/**
 * LOG OUT WITHOUT MAKING ANYONE WAIT — one order, shared by the log-out buttons and the idle logout.
 *
 * His question, 2026-09-15: *"Why is the logout and log in too slow."* The buttons did
 * `await signOut(); navigate('/')`. `signOut` waits for the Supabase library's lock and then a network
 * call to Supabase, so nothing moved until it returned. And the moment the session cleared, the page
 * guards (`RequireAuth` in App.tsx, the admin panel's own check) jumped to `/auth`, which opens the
 * login pop-up, before the button finally sent him home.
 *
 * The idle logout had already solved exactly this (`useInactivityLogout.ts`): leave first, sign out
 * after. Leaving unmounts the protected page, so no guard is left to see a signed-out session.
 */
export async function leaveThenSignOut(
  navigate: (to: string) => void,
  signOut: () => Promise<void>,
): Promise<void> {
  rememberReturnTo();   // before navigating: once the path is '/', it is deliberately not stored
  navigate('/');
  await signOut();
}

export function useLogout(): () => Promise<void> {
  const { signOut } = useAuth();
  const [, navigate] = useLocation();
  const busy = useRef(false);
  return useCallback(async () => {
    if (busy.current) return;          // a double click must not sign out twice
    busy.current = true;
    try {
      await leaveThenSignOut(navigate, signOut);
    } finally {
      busy.current = false;
    }
  }, [navigate, signOut]);
}
