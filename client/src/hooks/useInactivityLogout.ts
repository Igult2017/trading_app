import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  INACTIVITY_TIMEOUT_MS as TIMEOUT_MS,
  LAST_ACTIVITY_KEY,
  LAST_SESSION_KEY,
  clearInactivityTracking,
} from "@/lib/inactivity";

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel", "click",
];

/**
 * Auto-logs the user out after 10 minutes of inactivity — including while the
 * tab was closed.
 *
 * The activity clock is keyed on the STABLE user id, NOT the access token.
 * Supabase rotates the access token on refresh, so keying on it made a
 * reopened/refreshed session look like a "different" session — the stored
 * timestamp was discarded and the timeout never fired. Keying on user.id fixes
 * tab-close logout; clearInactivityTracking() on a fresh sign-in stops a new
 * login from inheriting the previous session's clock.
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

  const logoutTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silentExpired = useRef(false);

  const clearTimers = useCallback(() => {
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    logoutTimer.current = null;
  }, []);

  const scheduleExpiry = useCallback(() => {
    clearTimers();
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    localStorage.setItem(LAST_SESSION_KEY,  sessionIdRef.current);
    logoutTimer.current = setTimeout(() => {
      silentExpired.current = true;
    }, TIMEOUT_MS);
  }, [clearTimers]);

  const doLogout = useCallback(async () => {
    clearTimers();
    silentExpired.current = false;
    clearInactivityTracking();
    toast({
      title: "Signed out due to inactivity",
      description: "You were automatically signed out after 10 minutes of inactivity. Please log in again.",
      duration: 7_000,
    });
    await signOutRef.current();
    navigateRef.current("/auth");
  }, [clearTimers]);

  useEffect(() => {
    if (!session) {
      if (!loading) {
        clearTimers();
        silentExpired.current = false;
        clearInactivityTracking();
      }
      return;
    }

    // ── Resume detection (tab reopened / token refreshed) ─────────────────
    // Apply the stored clock only when it belongs to THIS user.
    const storedTime  = localStorage.getItem(LAST_ACTIVITY_KEY);
    const storedSid   = localStorage.getItem(LAST_SESSION_KEY);
    const sameSession = !!storedTime && storedSid === sessionIdRef.current;
    const elapsed     = sameSession ? Date.now() - parseInt(storedTime!, 10) : 0;

    if (sameSession && elapsed >= TIMEOUT_MS) {
      // Tab was closed (or left idle) past the timeout and is now back — the
      // user just returned, so log out immediately rather than waiting.
      doLogout();
      return;
    }
    if (!sameSession) clearInactivityTracking();   // stale clock from a prior login
    silentExpired.current = false;
    scheduleExpiry();

    const handleActivity = () => {
      if (silentExpired.current) {
        ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity));
        doLogout();
        return;
      }
      scheduleExpiry();
    };

    ACTIVITY_EVENTS.forEach(evt =>
      window.addEventListener(evt, handleActivity, { passive: true }),
    );

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity));
    };
  }, [session, loading, scheduleExpiry, clearTimers, doLogout]);
}
