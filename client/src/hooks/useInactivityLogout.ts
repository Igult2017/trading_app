import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

const TIMEOUT_MS   = 10 * 60 * 1000;  // 10 minutes
const WARNING_MS   =  9 * 60 * 1000;  //  9 minutes — warn 1 min before

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

  const logoutTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnToastId  = useRef<string | null>(null);

  const clearTimers = useCallback(() => {
    if (logoutTimer.current)  clearTimeout(logoutTimer.current);
    if (warnTimer.current)    clearTimeout(warnTimer.current);
    logoutTimer.current = null;
    warnTimer.current   = null;
  }, []);

  const dismissWarning = useCallback(() => {
    if (warnToastId.current) {
      toast({ id: warnToastId.current, open: false } as any);
      warnToastId.current = null;
    }
  }, []);

  const resetTimers = useCallback(() => {
    clearTimers();
    dismissWarning();

    warnTimer.current = setTimeout(() => {
      const { id } = toast({
        title: "Still there?",
        description: "You'll be signed out in 1 minute due to inactivity.",
        variant: "destructive",
        duration: 60_000,
      });
      warnToastId.current = id ?? null;
    }, WARNING_MS);

    logoutTimer.current = setTimeout(async () => {
      dismissWarning();
      toast({
        title: "Signed out",
        description: "You were signed out after 10 minutes of inactivity.",
        duration: 6_000,
      });
      await signOut();
    }, TIMEOUT_MS);
  }, [clearTimers, dismissWarning, signOut]);

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
