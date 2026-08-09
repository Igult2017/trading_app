/**
 * Shared inactivity-logout constants + helper.
 * Lives in its own module so AuthContext and useInactivityLogout can both call
 * clearInactivityTracking() without creating a circular import.
 */
/** How long a signed-in user can be idle before they are signed out silently.
 *
 *  Raised from 10 minutes to 3 hours on 2026-08-08 at the owner's request. Ten minutes is a banking
 *  timeout; this is a journal people leave open beside a chart all session, and being signed out
 *  mid-analysis was the cost. Nothing here holds money or places trades on its own, so the exposure
 *  from a longer window is an unattended screen rather than a funds risk.
 *
 *  This single constant drives BOTH paths: the live timer while the tab is open, and the
 *  elapsed-time check when a tab is reopened after being closed. Changing it here changes both. */
export const INACTIVITY_TIMEOUT_MS = 3 * 60 * 60 * 1000;   // 3 hours
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
