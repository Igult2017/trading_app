import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

const TIMEOUT_MS         = 10 * 60 * 1000;
const LAST_ACTIVITY_KEY  = "inactivity_last_activity";
const LAST_SESSION_KEY   = "inactivity_session_id";

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel", "click",
];

/**
 * Auto-logs the user out after 10 minutes of inactivity.
 *
 * The session ID is stored alongside the timestamp so that stale timestamps
 * from a previous session are never applied to a fresh sign-in — that was the
 * root cause of the immediate-logout-after-sign-in bug.
 */
export function useInactivityLogout() {
  const { session, signOut, loading } = useAuth();
  const [, navigate] = useLocation();

  const signOutRef  = useRef(signOut);
  const navigateRef = useRef(navigate);
  signOutRef.current  = signOut;
  navigateRef.current = navigate;

  // Always holds the current session ID so scheduleExpiry can stamp it
  // without needing session as a useCallback dependency.
  const sessionIdRef = useRef<string>("");
  sessionIdRef.current = session?.access_token ?? "";

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

  useEffect(() => {
    if (!session) {
      if (!loading) {
        clearTimers();
        silentExpired.current = false;
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        localStorage.removeItem(LAST_SESSION_KEY);
      }
      return;
    }

    // ── Tab-close / reopen detection ──────────────────────────────────────
    // Only apply the stored timestamp if it belongs to THIS session.
    // A timestamp from a previous session must never trigger logout on a
    // fresh sign-in — that was the bug causing immediate sign-out.
    const storedTime = localStorage.getItem(LAST_ACTIVITY_KEY);
    const storedSid  = localStorage.getItem(LAST_SESSION_KEY);

    if (storedTime && storedSid === session.access_token) {
      // Same session resumed after tab close — check elapsed time
      const elapsed = Date.now() - parseInt(storedTime, 10);
      if (elapsed >= TIMEOUT_MS) {
        silentExpired.current = true;
      }
    } else {
      // Different or missing session ID — wipe stale data from old session
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      localStorage.removeItem(LAST_SESSION_KEY);
      silentExpired.current = false;
    }

    if (!silentExpired.current) {
      scheduleExpiry();
    }

    const handleActivity = async () => {
      if (silentExpired.current) {
        silentExpired.current = false;
        clearTimers();
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        localStorage.removeItem(LAST_SESSION_KEY);
        ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity));

        toast({
          title: "Signed out due to inactivity",
          description: "You were automatically signed out after 10 minutes of inactivity. Please log in again.",
          duration: 7_000,
        });

        await signOutRef.current();
        navigateRef.current("/auth");
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
  }, [session, loading, scheduleExpiry, clearTimers]);
}
