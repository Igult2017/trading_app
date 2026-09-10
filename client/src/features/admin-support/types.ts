/** One support conversation, as the screen needs it. */
export interface Ticket {
  /** The database row id — every write needs it, and a row without one cannot be replied to. */
  dbId: string;
  name: string;
  email: string;
  subject: string;
  /** The full text the person wrote. The old screen dropped this on the floor and showed only the
   *  subject, so a reply was written without ever seeing the question. */
  message: string;
  reply: string;
  priority: string;
  status: string;
  channel: string;
  createdAt: string;
  userId: string;
}

const TITLE = (s: string) =>
  s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());

/** Turn one database row into a Ticket, tolerating both snake_case and camelCase. */
export function toTicket(r: any): Ticket {
  const msg = typeof r?.message === 'string' ? r.message : '';
  return {
    dbId:      String(r?.id ?? ''),
    name:      TITLE(String(r?.user_name ?? r?.userName ?? '').trim() || 'Unknown'),
    email:     String(r?.user_email ?? r?.userEmail ?? ''),
    subject:   String(r?.subject ?? '').trim() || msg.slice(0, 70) || 'No subject',
    message:   msg,
    reply:     String(r?.reply ?? ''),
    priority:  String(r?.priority ?? 'Medium'),
    status:    String(r?.status ?? 'Open'),
    channel:   String(r?.channel ?? 'email'),
    createdAt: String(r?.created_at ?? r?.createdAt ?? ''),
    userId:    String(r?.user_id ?? r?.userId ?? ''),
  };
}

/** "06 Sep, 14:25" — the shape used on the reference design. */
export function whenLabel(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const day = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}, ${time}`;
}

/** Which pill colour a status gets. */
export function statusTone(status: string): 'good' | 'warn' | 'accent' | 'bad' | 'neutral' {
  const s = status.toLowerCase();
  if (s === 'resolved') return 'good';
  if (s === 'open') return 'warn';
  if (s === 'in progress') return 'accent';
  if (s === 'escalated') return 'bad';
  return 'neutral';
}
