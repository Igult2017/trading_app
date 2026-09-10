import { useState } from 'react';
import { ChevronLeft, CheckCircle, AlertTriangle, Ban, RotateCcw, Send } from 'lucide-react';
import { C, cs, inp, lbl, btn, FONT, HFONT, R } from '@/components/admin-ui/tokens';
import { Pill } from '@/components/admin-ui/AdminUI';
import { type Ticket, whenLabel, statusTone } from './types';

/**
 * One conversation, opened from the list.
 *
 * The old screen showed this beside the queue in a half-width column and never showed the
 * MESSAGE — only its subject — so a reply was written without the question in front of you.
 */
export default function SupportConversation({ t, onBack, onPatch, onBan, busy }: {
  t: Ticket;
  onBack: () => void;
  onPatch: (fields: { status?: string; priority?: string; reply?: string }) => Promise<void>;
  onBan: (userId: string, name: string) => void;
  busy: boolean;
}) {
  const [reply, setReply] = useState('');

  const actions = [
    { label: 'Resolve',  icon: CheckCircle,   tone: C.green, run: () => onPatch({ status: 'Resolved' }) },
    { label: 'Escalate', icon: AlertTriangle, tone: C.amber, run: () => onPatch({ status: 'Escalated', priority: 'Critical' }) },
    { label: 'Re-open',  icon: RotateCcw,     tone: C.blue,  run: () => onPatch({ status: 'Open' }) },
    { label: 'Ban user', icon: Ban,           tone: C.red,   run: () => onBan(t.userId, t.name) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: FONT, maxWidth: 860 }}>
      <button type="button" onClick={onBack}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                 background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                 color: C.muted, fontFamily: FONT, fontSize: 14, fontWeight: 600 }}>
        <ChevronLeft size={16} /> Support
      </button>

      <div style={{ ...cs, overflow: 'hidden' }}>
        {/* who wrote in */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '18px 22px',
                      borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: '50%',
                        background: C.accentSoft, color: C.indigo, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontFamily: HFONT, fontSize: 18, fontWeight: 700 }}>
            {t.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: C.text }}>{t.name}</span>
              <Pill tone={statusTone(t.status)}>{t.status.toLowerCase()}</Pill>
              {(t.priority === 'Critical' || t.priority === 'High') && (
                <Pill tone={t.priority === 'Critical' ? 'bad' : 'warn'}>{t.priority.toLowerCase()}</Pill>
              )}
            </div>
            <div style={{ fontFamily: FONT, fontSize: 13, color: C.muted, marginTop: 3 }}>
              {t.email || 'no email on file'} · {t.channel} · {whenLabel(t.createdAt)}
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h2 style={{ margin: '0 0 10px', fontFamily: HFONT, fontSize: 18, fontWeight: 600, color: C.text }}>
              {t.subject}
            </h2>
            <p style={{ margin: 0, fontFamily: FONT, fontSize: 15, lineHeight: 1.7, color: C.text,
                        whiteSpace: 'pre-wrap' }}>
              {t.message || <span style={{ color: C.muted }}>No message body was sent with this.</span>}
            </p>
          </div>

          {t.reply && (
            <div style={{ background: C.thead, borderRadius: R.ctl, padding: '14px 16px',
                          borderLeft: `3px solid ${C.indigo}` }}>
              <div style={{ ...lbl, marginBottom: 6 }}>Your reply</div>
              <p style={{ margin: 0, fontFamily: FONT, fontSize: 14.5, lineHeight: 1.7, color: C.text,
                          whiteSpace: 'pre-wrap' }}>{t.reply}</p>
            </div>
          )}

          <div>
            <div style={{ ...lbl }}>{t.reply ? 'Replace the reply' : 'Reply'}</div>
            <textarea value={reply} onChange={e => setReply(e.target.value)} rows={5}
              placeholder="Write your response…"
              style={{ ...inp, resize: 'vertical', lineHeight: 1.7, minHeight: 120 }} />
            {/* SAYING WHAT ACTUALLY HAPPENS. The server stores the reply on the ticket row and
                sends nothing — no email, no in-app notification (server/routes.ts:5746). The old
                screen's caption claimed "Replies notify them in-app", which was not true. */}
            <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.muted, margin: '8px 0 0' }}>
              Saved against the conversation. Nothing is sent to them yet — delivery is not built.
            </div>
            <button
              onClick={async () => { if (reply.trim()) { await onPatch({ reply, status: 'In Progress' }); setReply(''); } }}
              disabled={busy || !reply.trim()}
              style={{ ...btn, marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8,
                       background: C.indigo, color: '#fff', padding: '11px 22px', borderRadius: 999,
                       fontFamily: FONT, fontSize: 14,
                       opacity: busy || !reply.trim() ? 0.45 : 1,
                       cursor: busy || !reply.trim() ? 'not-allowed' : 'pointer' }}>
              <Send size={15} /> {busy ? 'Saving…' : 'Save reply'}
            </button>
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
            <div style={{ ...lbl }}>Actions</div>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              {actions.map(a => (
                <button key={a.label} onClick={a.run} disabled={busy}
                  style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: 7,
                           padding: '9px 16px', borderRadius: 999, fontFamily: FONT, fontSize: 13.5,
                           background: 'transparent', color: a.tone,
                           border: `1px solid ${C.border2}`,
                           cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}>
                  <a.icon size={14} /> {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
