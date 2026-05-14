import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const WARNING_MS =  9 * 60 * 1000; //  9 minutes — warn 1 min before

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
 * Shows a warning toast at the 9-minute mark.
 * Resets on any mouse, keyboard, scroll or touch activity.
 * Only active while a session exists.
 */
export function useInactivityLogout() {
  const { session, signOut } = useAuth();

  // Keep signOut in a ref so our callbacks never need it as a dep,
  // which would cause the timers to restart on every render.
  // Update synchronously during render — no extra useEffect needed.
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  const logoutTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissWarn  = useRef<(() => void) | null>(null);

  const clearTimers = useCallback(() => {
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    if (warnTimer.current)   clearTimeout(warnTimer.current);
    logoutTimer.current = null;
    warnTimer.current   = null;
  }, []);

  const dismissWarning = useCallback(() => {
    if (dismissWarn.current) {
      dismissWarn.current();
      dismissWarn.current = null;
    }
  }, []);

  // Stable callback — deps are only the two stable callbacks above.
  // signOut is accessed via ref so it does NOT appear in deps.
  const resetTimers = useCallback(() => {
    clearTimers();
    dismissWarning();

    warnTimer.current = setTimeout(() => {
      const { dismiss } = toast({
        title: "Still there?",
        description: "You'll be signed out in 1 minute due to inactivity.",
        variant: "destructive",
        duration: 60_000,
      });
      dismissWarn.current = dismiss;
    }, WARNING_MS);

    logoutTimer.current = setTimeout(async () => {
      dismissWarning();
      toast({
        title: "Signed out",
        description: "You were signed out after 10 minutes of inactivity.",
        duration: 6_000,
      });
      await signOutRef.current();
    }, TIMEOUT_MS);
  }, [clearTimers, dismissWarning]); // signOut intentionally via ref

  useEffect(() => {
    if (!session) {
      clearTimers();
      dismissWarning();
      return;
    }

    resetTimers();

    const handleActivity = () => resetTimers();

    ACTIVITY_EVENTS.forEach(evt =>
      window.addEventListener(evt, handleActivity, { passive: true }),
    );

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(evt =>
        window.removeEventListener(evt, handleActivity),
      );
    };
  }, [session, resetTimers, clearTimers, dismissWarning]);
}
