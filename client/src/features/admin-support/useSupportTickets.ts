import { useEffect, useState } from 'react';
import { type Ticket, toTicket } from './types';

/**
 * Loading and changing support conversations — everything that talks to the server, kept away
 * from the screen that draws them.
 *
 * NO INVENTED DATA. The screen this replaced fell back to five made-up tickets whenever the
 * request failed, presented exactly like real ones, so an outage looked like a quiet day. A
 * failure here sets `loadError` and leaves the list empty, which is the truth.
 */
export function useSupportTickets(getAdminToken: (() => Promise<string | null>) | null) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const headers = async (withBody = false) => {
    const token = await getAdminToken?.();
    const h: Record<string, string> = {};
    if (withBody) h['Content-Type'] = 'application/json';
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/tickets', { headers: await headers() });
      if (!r.ok) {
        setLoadError(`Could not load conversations (${r.status})`);
        setTickets([]);
      } else {
        const rows = await r.json();
        setTickets(Array.isArray(rows) ? rows.map(toTicket) : []);
        setLoadError(null);
      }
    } catch (e: any) {
      setLoadError(e?.message ?? 'Could not reach the server');
      setTickets([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  /** Change a conversation's status, priority or reply. */
  const patch = async (dbId: string, fields: Record<string, string>) => {
    if (!dbId) { setActionError('That conversation has no database id, so it cannot be changed.'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/tickets/${dbId}`, {
        method: 'PATCH', headers: await headers(true), body: JSON.stringify(fields),
      });
      if (!r.ok) setActionError(`That did not save (${r.status})`);
      else {
        setActionError(null);
        setTickets(p => p.map(t => (t.dbId === dbId ? ({ ...t, ...fields } as Ticket) : t)));
      }
    } catch (e: any) {
      setActionError(e?.message ?? 'That did not save');
    }
    setBusy(false);
  };

  const banUser = async (userId: string) => {
    try {
      const r = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'PATCH', headers: await headers(true), body: JSON.stringify({ action: 'ban' }),
      });
      if (!r.ok) setActionError(`Could not suspend that account (${r.status})`);
    } catch (e: any) {
      setActionError(e?.message ?? 'Could not suspend that account');
    }
  };

  return { tickets, loading, loadError, actionError, busy, patch, banUser, setActionError };
}
