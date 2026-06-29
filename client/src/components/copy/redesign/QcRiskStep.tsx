import { AlertTriangle, Check } from 'lucide-react';

export interface RiskAcks {
  provider: boolean;
  understand: boolean;
  terms: boolean;
}

interface Props {
  acks: RiskAcks;
  onToggle: (k: string) => void;
}

const ACKS: { key: keyof RiskAcks; text: string }[] = [
  { key: 'provider', text: 'I confirm I am a genuine signal provider and the trades I broadcast are my own.' },
  { key: 'understand', text: 'I understand followers will execute real-money trades based on my signals.' },
  { key: 'terms', text: 'I accept the TradeSync provider terms and the risk that followers may incur losses.' },
];

/** Step — provider risk disclosure with acknowledgement checkboxes. */
export default function QcRiskStep({ acks, onToggle }: Props) {
  return (
    <>
      <div className="qc-eyebrow">Step 06 · Risk</div>
      <h1 className="qc-h1" style={{ marginTop: 10, marginBottom: 6 }}>Risk disclosure</h1>
      <div className="qc-sub">Followers trade real money based on your signals. Please confirm before going live.</div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--warn-s)', border: '1px solid rgba(245,166,35,.2)', borderRadius: 10, padding: '13px 15px', marginTop: 22 }}>
        <AlertTriangle size={16} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>
          Past performance never guarantees future results. TradeSync does not verify your strategy or guarantee follower profitability.
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {ACKS.map(a => {
          const on = acks[a.key];
          return (
            <div
              key={a.key}
              onClick={() => onToggle(a.key)}
              style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 10, padding: '14px 16px', marginTop: 10, cursor: 'pointer' }}
            >
              <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${on ? 'var(--acc)' : 'var(--b2)'}`, background: on ? 'var(--acc)' : 'transparent', color: '#fff' }}>
                {on && <Check size={13} strokeWidth={3} />}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--t2)', lineHeight: 1.5 }}>{a.text}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
