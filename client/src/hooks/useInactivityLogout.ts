import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  INACTIVITY_TIMEOUT_MS as TIMEOUT_MS,
  LAST_ACTIVITY_KEY,
  LAST_SESSION_KEY,
  clearInactivityTracking,
  rememberReturnTo,
} from "@/lib/inactivity";

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel", "click",
];

/**
 * Signs the user out after INACTIVITY_TIMEOUT_MS of no activity (3 hours as of 2026-08-08) —
 * including while the tab was closed. The duration lives in lib/inactivity.ts.
 *
 * HIS INSTRUCTION, 2026-09-09: *"I just want it to be logout without any notification and also it
 * does not log user out and take them to login page directly. It just logs users out when time
 * elapses then takes them to the landing page."*
 *
 * Three things that used to be different, and all three were deliberate before:
 *
 *   1. NO MESSAGE. There was a toast reading "Signed out due to inactivity". It is gone, along with
 *      the helper that spelled the duration out in words.
 *   2. IT HAPPENS WHEN THE TIME ELAPSES. The old version did not sign anyone out when the timer
 *      fired — it only set a flag, and waited for the user's NEXT click or keypress to act on it.
 *      So a session left idle overnight was still signed in until somebody touched the page. Now
 *      the timer signs out on its own.
 *   3. IT LANDS ON THE PUBLIC LANDING PAGE, not the login screen.
 *
 * The activity clock is keyed on the STABLE user id, NOT the access token. Supabase rotates the
 * access token on refresh, so keying on it made a reopened/refreshed session look like a "different"
 * session — the stored timestamp was discarded and the timeout never fired. Keying on user.id fixes
 * tab-close logout; clearInactivityTracking() on a fresh sign-in stops a new login from inheriting
 * the previous session's clock.
 */
export function useInactivityLogout() {
  const { session, signOut, loading } = useAuth();
  const [, navigate] = useLocation();

  const signOutRef  = useRef(signOut);
  const navigateRef = useRef(navigate);
  signOutRef.current  = signOut;
  navigateRef.current = navigate;

  // Stable per-login identifier — survives access-token rotation.
  const sessionIdRef = useRef<string>("");
  sessionIdRef.current = session?.user?.id ?? "";

  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against running the logout twice — the timer and the reopened-tab check can both reach
  // it, and signing out twice would navigate a second time from under the landing page.
  const loggingOut  = useRef(false);

  const clearTimers = useCallback(() => {
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    logoutTimer.current = null;
  }, []);

  /**
   * Sign out quietly and leave the user on the landing page.
   *
   * THE ORDER OF THESE TWO STEPS IS THE WHOLE FIX, and reversing it silently restores the old
   * behaviour. Three separate places send a signed-out user to /auth the moment the session goes
   * away: RequireAuth (App.tsx:104-109), RequireAdmin (App.tsx:127) and AdminPanel.tsx:3118.
   * Signing out FIRST and navigating afterwards is a race against all three, and they win often
   * enough that the user still lands on the login screen — exactly what he asked to stop.
   *
   * Navigating first changes the route, which unmounts the protected subtree this hook lives in.
   * No guard is then mounted to see a null session, so nothing can override the destination.
   *
   * `rememberReturnTo()` has to be called here, before navigating. `signOut` normally records the
   * page for the next login, but by the time it runs the path is already '/', which it refuses to
   * store — so without this line an idle logout would quietly forget where the user had been.
   */
  const doLogout = useCallback(async () => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    clearTimers();
    clearInactivityTracking();
    rememberReturnTo();
    navigateRef.current("/");
    await signOutRef.current();
  }, [clearTimers]);

  const scheduleExpiry = useCallback(() => {
    clearTimers();
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    localStorage.setItem(LAST_SESSION_KEY,  sessionIdRef.current);
    logoutTimer.current = setTimeout(() => { doLogout(); }, TIMEOUT_MS);
  }, [clearTimers, doLogout]);

  useEffect(() => {
    if (!session) {
      if (!loading) {
        clearTimers();
        loggingOut.current = false;
        clearInactivityTracking();
      }
      return;
    }

    // ── Resume detection (tab reopened / token refreshed) ─────────────────
    // A closed or sleeping tab has no running timer, so the elapsed time is checked on return.
    // Apply the stored clock only when it belongs to THIS user.
    const storedTime  = localStorage.getItem(LAST_ACTIVITY_KEY);
    const storedSid   = localStorage.getItem(LAST_SESSION_KEY);
    const sameSession = !!storedTime && storedSid === sessionIdRef.current;
    const elapsed     = sameSession ? Date.now() - parseInt(storedTime!, 10) : 0;

    if (sameSession && elapsed >= TIMEOUT_MS) {
      doLogout();
      return;
    }
    if (!sameSession) clearInactivityTracking();   // stale clock from a prior login
    loggingOut.current = false;
    // Coming back to the tab counts as activity, so the window starts fresh — unchanged behaviour.
    scheduleExpiry();

    const handleActivity = () => { scheduleExpiry(); };

    ACTIVITY_EVENTS.forEach(evt =>
      window.addEventListener(evt, handleActivity, { passive: true }),
    );

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity));
    };
  }, [session, loading, scheduleExpiry, clearTimers, doLogout]);
}
