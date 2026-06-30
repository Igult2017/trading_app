import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';

/**
 * useState that survives a page reload by mirroring to sessionStorage (per-tab).
 *
 * Use it for transient in-page UI state — which sub-view is open, a wizard's step
 * and inputs — so a refresh (or a same-tab re-login) returns the user to exactly
 * where they were. sessionStorage (not localStorage) is deliberate: it clears when
 * the tab closes, so stale UI state never lingers across browser restarts.
 */
export function usePersistedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / private mode */ }
  }, [key, value]);

  return [value, setValue];
}
