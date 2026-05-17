import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

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
    logoutTimer.current = setTimeout(() => {
      silentExpired.current = true;
    }, TIMEOUT_MS);
  }, [clearTimers]);

  useEffect(() => {
    if (!session) {
      clearTimers();
      silentExpired.current = false;
      return;
    }

    scheduleExpiry();

    const handleActivity = async () => {
      if (silentExpired.current) {
        silentExpired.current = false;
        clearTimers();
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
