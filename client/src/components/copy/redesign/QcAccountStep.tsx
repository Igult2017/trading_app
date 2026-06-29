import { Plus, RefreshCw, ShieldCheck } from 'lucide-react';

const CTMark = () => (
  <svg width={32} height={32} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
    <circle cx="50" cy="50" r="50" fill="#E5342A" />
    <path d="M41 23 C30 39 27 57 33 76 C52 71 64 53 62 32 C55 28 48 25 41 23 Z" fill="#fff" />
    <circle cx="63.5" cy="64" r="9.5" fill="#fff" />
  </svg>
);

export interface QcAcct { id: string; name: string; loginId: string; accountType?: string | null; balance?: string | null; currency?: string | null; }

/** Step 02 — pick a connected cTrader account (QC account picker). */
export default function QcAccountStep({
  accounts, value, onChange, onAddNew, onRefresh,
  eyebrow = 'Step 02 · Account',
  title = 'Connect the account to copy onto',
  sub = 'Pick one of your connected cTrader accounts — trades will be mirrored here.',
}: {
  accounts: QcAcct[]; value?: string; onChange: (id: string) => void;
  onAddNew?: () => void; onRefresh?: () => void;
  eyebrow?: string; title?: string; sub?: string;
}) {
  return (
    <>
      <div className="qc-eyebrow">{eyebrow}</div>
      <h1 className="qc-h1" style={{ marginTop: 10, marginBottom: 6 }}>{title}</h1>
      <div className="qc-sub">{sub}</div>

      <div className="qc-well" style={{ marginTop: 24 }}>
        {accounts.map(a => {
          const sel = value === a.id;
          const live = (a.accountType || '').toLowerCase() === 'live';
          return (
            <div key={a.id} className={`qc-acct${sel ? ' sel' : ''}`} onClick={() => onChange(a.id)}>
              <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}><CTMark /></div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{a.name}</div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--t3)' }}>#{a.loginId}</div>
              </div>
              <div className="mono" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 500 }}>
                {a.balance ? `${a.balance} ${a.currency ?? ''}`.trim() : ''}
              </div>
              <span className={`qc-badge ${live ? 'qc-b-live' : 'qc-b-demo'}`}>{live ? 'Live' : 'Demo'}</span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 18, marginTop: 14, paddingLeft: 4 }}>
        <button className="qc-toplink" style={{ padding: '4px 0', color: 'var(--acc)' }} onClick={onAddNew}><Plus size={13} /> Add a new account</button>
        <button className="qc-toplink" style={{ padding: '4px 0' }} onClick={onRefresh}><RefreshCw size={12} /> Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 22, background: 'var(--info-s)', border: '1px solid rgba(70,180,230,.2)', borderRadius: 10, padding: '12px 14px' }}>
        <ShieldCheck size={16} style={{ color: 'var(--info)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.6 }}>
          Connected securely via cTrader OAuth — no password is ever stored. Adding a new account opens a secure popup; you stay right here.
        </div>
      </div>
    </>
  );
}
