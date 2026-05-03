import { useState, useEffect, useCallback, useRef } from 'react';
import type { AdminNotification, AdminUnreadCounts, AdminNotifCategory } from './types';
import { ADMIN_NOTIF_REFETCH_MS } from './constants';

async function adminFetch(path: string, opts?: RequestInit) {
  let token: string | null = null;
  try {
    const { supabase } = await import('@/lib/supabase');
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token ?? null;
    }
  } catch {}
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((opts?.headers as Record<string, string>) ?? {}),
    },
  });
}

export function useAdminNotifications() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [counts, setCounts] = useState<AdminUnreadCounts>({ messages: 0, alerts: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [nRes, cRes] = await Promise.all([
        adminFetch('/api/admin/notifications'),
        adminFetch('/api/admin/notifications/counts'),
      ]);
      if (nRes.ok) setNotifications(await nRes.json());
      if (cRes.ok) setCounts(await cRes.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, ADMIN_NOTIF_REFETCH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchAll]);

  const markRead = useCallback(async (id: string) => {
    await adminFetch(`/api/admin/notifications/${id}/read`, { method: 'PATCH' });
    fetchAll();
  }, [fetchAll]);

  const markAllRead = useCallback(async (category?: AdminNotifCategory) => {
    const path = category
      ? `/api/admin/notifications/read-all?category=${category}`
      : '/api/admin/notifications/read-all';
    await adminFetch(path, { method: 'PATCH' });
    fetchAll();
  }, [fetchAll]);

  const deleteOne = useCallback(async (id: string) => {
    await adminFetch(`/api/admin/notifications/${id}`, { method: 'DELETE' });
    fetchAll();
  }, [fetchAll]);

  const clearAll = useCallback(async (category?: AdminNotifCategory) => {
    const path = category
      ? `/api/admin/notifications/clear?category=${category}`
      : '/api/admin/notifications/clear';
    await adminFetch(path, { method: 'DELETE' });
    fetchAll();
  }, [fetchAll]);

  return { notifications, counts, loading, markRead, markAllRead, deleteOne, clearAll, refresh: fetchAll };
}
