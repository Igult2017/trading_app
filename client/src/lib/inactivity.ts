/**
 * Shared inactivity-logout constants + helper.
 * Lives in its own module so AuthContext and useInactivityLogout can both call
 * clearInactivityTracking() without creating a circular import.
 */
export const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;   // 10 minutes
export const LAST_ACTIVITY_KEY = "inactivity_last_activity";
export const LAST_SESSION_KEY  = "inactivity_session_id";

/** Reset the inactivity clock — call on a fresh sign-in so a new login never
 *  inherits a previous (e.g. tab-closed) session's activity timestamp. */
export function clearInactivityTracking(): void {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    localStorage.removeItem(LAST_SESSION_KEY);
  } catch {}
}
