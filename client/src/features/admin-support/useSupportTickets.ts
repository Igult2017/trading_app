import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminData } from '@/features/admin-data/useAdminData';
import { type Ticket, toTicket } from './types';

/**
 * Loading and changing support conversations — everything that talks to the server, kept away
 * from the screen that draws them.
 *
 * NO INVENTED DATA. The screen this replaced fell back to five made-up tickets whenever the
 * request failed, presented exactly like real ones, so an outage looked like a quiet day. A
 * failure here sets `loadError` and leaves the list empty, which is the truth.
 *
 * CACHED SINCE 2026-09-12. The list used to be fetched into local state on every mount, so every
 * visit to Support showed "Loading conversations…" again. It reads through `useAdminData` now:
 * cached for a day, kept across a page reload, so only the FIRST visit ever waits.
 */
export function useSupportTickets(_getAdminToken?: (() => Promise<string | null>) | null) {
  const qc = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const KEY = '/api/admin/tickets';
  const { data: rows, loading, error: loadError } = useAdminData<any[]>(KEY, { fallback: [] });
  const tickets: Ticket[] = Array.isArray(rows) ? rows.map(toTicket) : [];

  /** Change a conversation's status, priority or reply. */
  const patch = async (dbId: string, fields: Record<string, string>) => {
    if (!dbId) { setActionError('That conversation has no database id, so it cannot be changed.'); return; }
    setBusy(true);
    try {
      const { authFetch } = await import('@/lib/queryClient');
      const r = await authFetch(`/api/admin/tickets/${dbId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
      });
      if (!r.ok) setActionError(`That did not save (${r.status})`);
      else {
        setActionError(null);
        // Write the change straight into the cache so the list updates without a round trip.
        qc.setQueryData<any[]>([KEY], (prev) =>
          Array.isArray(prev) ? prev.map(t => (String(t.id) === dbId ? { ...t, ...fields } : t)) : prev);
      }
    } catch (e: any) {
      setActionError(e?.message ?? 'That did not save');
    }
    setBusy(false);
  };

  const banUser = async (userId: string) => {
    try {
      const { authFetch } = await import('@/lib/queryClient');
      const r = await authFetch(`/api/admin/users/${userId}/ban`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ban' }),
      });
      if (!r.ok) setActionError(`Could not suspend that account (${r.status})`);
    } catch (e: any) {
      setActionError(e?.message ?? 'Could not suspend that account');
    }
  };

  return { tickets, loading, loadError, actionError, busy, patch, banUser, setActionError };
}
