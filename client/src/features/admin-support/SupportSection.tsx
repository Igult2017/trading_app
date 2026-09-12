import { useState } from 'react';
import { Mail, MessageSquare, Phone, LifeBuoy } from 'lucide-react';
import { C, cs, btn, FONT, HFONT, R } from '@/components/admin-ui/tokens';
import { Pill, Panel } from '@/components/admin-ui/AdminUI';
import SupportConversation from './SupportConversation';
import BanDialog from './BanDialog';
import { whenLabel, statusTone } from './types';
import { useSupportTickets } from './useSupportTickets';
import { JustListSkeleton } from '@/features/admin-data/AdminSkeleton';

/**
 * Support — the conversation list, built to the design he supplied (2026-09-10).
 *
 * WHAT THIS REPLACED, and why none of it survived. The old "Customer Care" screen was four stat
 * tiles above a two-column grid, and three of those parts were showing things that were not true:
 *
 *   * "Avg Response 4m 12s" was a STRING typed into the component. Nothing measured it.
 *   * "CSAT Score" averaged a `satisfaction` field the loader never sets, so it was always 0.0/5.
 *   * when the tickets request failed it fell back to five INVENTED tickets — Alex Thompson,
 *     Sarah Chen and so on — presented exactly like real ones. An outage looked like a quiet day.
 *
 * The design has none of those, which is the main reason it is better. What is left is the thing
 * the screen is for: who wrote in, what about, when, and whether it is dealt with.
 */
const CHANNEL_ICON: Record<string, any> = { email: Mail, chat: MessageSquare, phone: Phone };
const FILTERS = ['All', 'Open', 'In Progress', 'Resolved'] as const;

export default function SupportSection({ bp, getAdminToken = null }: {
  bp: any;
  getAdminToken?: (() => Promise<string | null>) | null;
}) {
  const { tickets, loading, loadError, actionError, busy, patch, banUser, setActionError } =
    useSupportTickets(getAdminToken);
  const [filter, setFilter] = useState<string>('All');
  const [openId, setOpenId] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<{ userId: string; name: string } | null>(null);

  const counts = (f: string) => f === 'All' ? tickets.length : tickets.filter(t => t.status === f).length;
  const shown = filter === 'All' ? tickets : tickets.filter(t => t.status === filter);
  const open = tickets.find(t => t.dbId === openId) ?? null;

  const banModal = banTarget && (
    <BanDialog name={banTarget.name} onCancel={() => setBanTarget(null)}
      onConfirm={() => { banUser(banTarget.userId); setBanTarget(null); }} />
  );
  if (open) {
    return (
      <>
        <SupportConversation
          t={open} busy={busy}
          onBack={() => setOpenId(null)}
          onPatch={f => patch(open.dbId, f as Record<string, string>)}
          onBan={(userId, name) => userId
            ? setBanTarget({ userId, name })
            : setActionError('That conversation is not linked to an account, so it cannot be suspended.')}
        />
        {banModal}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1, minHeight: 0, fontFamily: FONT }}>
      {(loadError || actionError) && (
        <div style={{ padding: '12px 16px', borderRadius: R.ctl, fontFamily: FONT, fontSize: 13.5,
                      fontWeight: 600, background: 'rgba(220,38,38,0.09)', color: C.red }}>
          {loadError ?? actionError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const on = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{ ...btn, display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px',
                       borderRadius: 999, fontFamily: FONT, fontSize: 13.5, fontWeight: on ? 700 : 600,
                       background: on ? C.indigo : 'transparent', color: on ? '#fff' : C.muted,
                       border: `1px solid ${on ? C.indigo : C.border}`, whiteSpace: 'nowrap' }}>
              {f}
              <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.85 }}>{counts(f)}</span>
            </button>
          );
        })}
      </div>

      {loading ? <JustListSkeleton rows={5} /> : (
      <Panel>
        {shown.length === 0 ? (
          <div style={{ padding: '52px 22px', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px',
                          background: C.accentSoft, color: C.indigo, display: 'flex',
                          alignItems: 'center', justifyContent: 'center' }}>
              <LifeBuoy size={24} />
            </div>
            <p style={{ fontFamily: HFONT, fontSize: 17, fontWeight: 600, color: C.text, margin: '0 0 5px' }}>
              {loadError ? 'Nothing to show' : filter === 'All' ? 'No conversations yet' : `Nothing ${filter.toLowerCase()}`}
            </p>
            <p style={{ fontFamily: FONT, fontSize: 13.5, color: C.muted, margin: 0 }}>
              {loadError ? 'Fix the error above and reload.' : 'Messages from traders will appear here.'}
            </p>
          </div>
        ) : shown.map((t, i) => {
          const Icon = CHANNEL_ICON[t.channel] ?? Mail;
          return (
            <button key={t.dbId || i} onClick={() => setOpenId(t.dbId)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 14, width: '100%',
                       padding: bp.isMobile ? '14px 16px' : '15px 22px', textAlign: 'left',
                       background: 'transparent', border: 'none', cursor: 'pointer',
                       borderBottom: i < shown.length - 1 ? `1px solid ${C.border}` : 'none',
                       transition: 'background 0.13s' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.thead; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              <div style={{ width: 40, height: 40, flex: '0 0 40px', borderRadius: '50%',
                            background: C.accentSoft, color: C.indigo, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontFamily: HFONT, fontSize: 17, fontWeight: 700 }}>
                {t.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: C.text }}>{t.name}</span>
                  <Pill tone={statusTone(t.status)}>{t.status.toLowerCase()}</Pill>
                  {(t.priority === 'Critical' || t.priority === 'High') && (
                    <Pill tone={t.priority === 'Critical' ? 'bad' : 'warn'}>{t.priority.toLowerCase()}</Pill>
                  )}
                  <span style={{ marginLeft: 'auto', fontFamily: FONT, fontSize: 13, color: C.muted,
                                 whiteSpace: 'nowrap', paddingLeft: 10 }}>
                    {whenLabel(t.createdAt)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, minWidth: 0 }}>
                  <Icon size={14} style={{ color: C.muted, flexShrink: 0 }} />
                  <span style={{ fontFamily: FONT, fontSize: 13.5, color: C.muted, overflow: 'hidden',
                                 textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.subject}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </Panel>
      )}

      {banModal}
    </div>
  );
}
