import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const LAST_ACTIVITY_KEY = "inactivity_last_activity";

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
  "click",
];

/**
 * Auto-logs the user out after 10 minutes of inactivity.
 *
 * Behaviour:
 *  - After 10 min of inactivity the session is silently marked as expired.
 *    The page remains visible exactly as-is — no toast, no redirect.
 *  - The moment the user does ANYTHING (click, key, scroll…) they are
 *    signed out, shown a notification, and redirected to /auth.
 *  - While the user is active the timer resets on every activity event.
 *  - Works even when the tab was closed: last-activity timestamp is
 *    persisted in localStorage, checked on every mount, so reopening
 *    the tab after >10 min will trigger the deferred logout on first touch.
 */
export function useInactivityLogout() {
  const { session, signOut } = useAuth();
  const [, navigate] = useLocation();

  const signOutRef  = useRef(signOut);
  const navigateRef = useRef(navigate);
  signOutRef.current  = signOut;
  navigateRef.current = navigate;

  const logoutTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silentExpired = useRef(false);

  const clearTimers = useCallback(() => {
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    logoutTimer.current = null;
  }, []);

  const scheduleExpiry = useCallback(() => {
    clearTimers();
    // Persist last-activity so tab-close/reopen can detect stale sessions
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    logoutTimer.current = setTimeout(() => {
      silentExpired.current = true;
    }, TIMEOUT_MS);
  }, [clearTimers]);

  useEffect(() => {
    if (!session) {
      clearTimers();
      silentExpired.current = false;
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      return;
    }

    // ── Cross-tab / tab-reopen detection ──────────────────────────────────
    // If the tab was closed while the timer was running, the in-memory flag
    // is gone but localStorage still holds the last-activity stamp.
    // Check it now: if enough time has elapsed, pre-arm the expired flag so
    // the very first user action triggers the deferred logout.
    const stored = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (stored) {
      const elapsed = Date.now() - parseInt(stored, 10);
      if (elapsed >= TIMEOUT_MS) {
        silentExpired.current = true;
      }
    }

    // Start fresh timer only when the session is not already expired
    if (!silentExpired.current) {
      scheduleExpiry();
    }

    const handleActivity = async () => {
      if (silentExpired.current) {
        silentExpired.current = false;
        clearTimers();
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        ACTIVITY_EVENTS.forEach(evt =>
          window.removeEventListener(evt, handleActivity),
        );

        toast({
          title: "Signed out due to inactivity",
          description:
            "You were automatically signed out after 10 minutes of inactivity. Please log in again.",
          duration: 7_000,
        });

        await signOutRef.current();
        navigateRef.current('/auth');
        return;
      }

      scheduleExpiry();
    };

    ACTIVITY_EVENTS.forEach(evt =>
      window.addEventListener(evt, handleActivity, { passive: true }),
    );

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(evt =>
        window.removeEventListener(evt, handleActivity),
      );
    };
  }, [session, scheduleExpiry, clearTimers]);
}
