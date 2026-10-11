import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '@/lib/queryClient';
import type { AdminNotification, AdminUnreadCounts } from './types';
import { ADMIN_NOTIF_REFETCH_MS } from './constants';

export function useAdminNotifications() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [counts, setCounts] = useState<AdminUnreadCounts>({ messages: 0, alerts: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [nRes, cRes] = await Promise.all([
        authFetch('/api/admin/notifications'),
        authFetch('/api/admin/notifications/counts'),
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
    try { await authFetch(`/api/admin/notifications/${id}/read`, { method: 'PATCH' }); } catch {}
    fetchAll();
  }, [fetchAll]);

  // NO `category` ARGUMENT (2026-10-11). It scoped the action to the open filter tab; the tabs are
  // gone on his instruction, so every caller marks everything. The server still accepts
  // `?category=`, so narrowing is one argument away if it is ever wanted again.
  const markAllRead = useCallback(async () => {
    try { await authFetch('/api/admin/notifications/read-all', { method: 'PATCH' }); } catch {}
    fetchAll();
  }, [fetchAll]);

  const deleteOne = useCallback(async (id: string) => {
    try { await authFetch(`/api/admin/notifications/${id}`, { method: 'DELETE' }); } catch {}
    fetchAll();
  }, [fetchAll]);

  const clearAll = useCallback(async () => {
    try { await authFetch('/api/admin/notifications/clear', { method: 'DELETE' }); } catch {}
    fetchAll();
  }, [fetchAll]);

  return { notifications, counts, loading, markRead, markAllRead, deleteOne, clearAll, refresh: fetchAll };
}
