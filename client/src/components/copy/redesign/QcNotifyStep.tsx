import { UserPlus, Send, CheckCircle2, MessageCircle } from 'lucide-react';

export interface NotifyValues {
  onNewFollower: boolean;
  onSignalSent: boolean;
  onSignalClosed: boolean;
  telegramAlerts: boolean;
}

interface Props {
  values: NotifyValues;
  onToggle: (k: string) => void;
}

const ROWS: { key: keyof NotifyValues; icon: typeof UserPlus; title: string; desc: string }[] = [
  { key: 'onNewFollower', icon: UserPlus, title: 'New follower', desc: 'Get pinged when someone starts copying you.' },
  { key: 'onSignalSent', icon: Send, title: 'Signal sent', desc: 'Notify when a trade is broadcast to followers.' },
  { key: 'onSignalClosed', icon: CheckCircle2, title: 'Signal closed', desc: 'Notify when a copied position is closed out.' },
  { key: 'telegramAlerts', icon: MessageCircle, title: 'Telegram alerts', desc: 'Mirror these notifications to your Telegram.' },
];

/** Step — provider notification preferences. */
export default function QcNotifyStep({ values, onToggle }: Props) {
  return (
    <>
      <div className="qc-eyebrow">Step 05 · Notify</div>
      <h1 className="qc-h1" style={{ marginTop: 10, marginBottom: 6 }}>Stay in the loop</h1>
      <div className="qc-sub">Pick the events worth a notification. You can change these anytime.</div>

      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ROWS.map(r => {
          const I = r.icon;
          const on = values[r.key];
          return (
            <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)', flexShrink: 0 }}>
                  <I size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{r.title}</div>
                  <div className="qc-hint" style={{ marginTop: 2 }}>{r.desc}</div>
                </div>
              </div>
              <div className={`qc-sw${on ? '' : ' off'}`} onClick={() => onToggle(r.key)} />
            </div>
          );
        })}
      </div>
    </>
  );
}
