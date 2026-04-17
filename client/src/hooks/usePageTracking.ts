import { useEffect, useRef } from 'react';

const SESSION_KEY = 'fsdz_session_id';

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function usePageTracking(page: string) {
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    const sessionId = getSessionId();
    startRef.current = Date.now();

    // Record page view
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, sessionId }),
    }).catch(() => {});

    // Record duration on unmount / page hide
    const recordDuration = () => {
      const durationSeconds = Math.round((Date.now() - startRef.current) / 1000);
      if (durationSeconds < 2) return; // ignore bounces
      navigator.sendBeacon('/api/track', JSON.stringify({ page, sessionId, durationSeconds }));
    };

    window.addEventListener('beforeunload', recordDuration);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') recordDuration();
    });

    return () => {
      recordDuration();
      window.removeEventListener('beforeunload', recordDuration);
    };
  }, [page]);
}
