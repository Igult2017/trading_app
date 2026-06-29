interface Props {
  name: string;
  onName: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  sessions: string[];
  onToggleSession: (s: string) => void;
}

const SESSIONS = ['London', 'New York', 'Tokyo', 'Sydney'];
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--t2)', marginBottom: 7 };

/** Step — provider's public strategy profile. */
export default function QcStrategyStep({ name, onName, description, onDescription, sessions, onToggleSession }: Props) {
  return (
    <>
      <div className="qc-eyebrow">Step 03 · Strategy</div>
      <h1 className="qc-h1" style={{ marginTop: 10, marginBottom: 6 }}>Tell followers about your strategy</h1>
      <div className="qc-sub">This is the public profile followers see before they copy you.</div>

      <div style={{ marginTop: 24 }}>
        <label style={labelStyle}>Strategy name</label>
        <input className="qc-inp" value={name} onChange={e => onName(e.target.value)} placeholder="e.g. Quantum Swing v3" />
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={labelStyle}>Description</label>
        <textarea
          rows={4}
          value={description}
          onChange={e => onDescription(e.target.value)}
          placeholder="Your edge, timeframes, risk approach…"
          style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--b2)', borderRadius: 8, padding: 12, color: 'var(--t1)', fontSize: 14, fontFamily: 'inherit', resize: 'none', outline: 'none' }}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <label style={labelStyle}>Active sessions</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {SESSIONS.map(s => {
            const on = sessions.includes(s);
            return (
              <span
                key={s}
                onClick={() => onToggleSession(s)}
                style={{
                  fontSize: 13, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--acc-bd)' : 'var(--b2)'}`,
                  background: on ? 'var(--acc-soft)' : 'var(--s2)',
                  color: on ? 'var(--acc-h)' : 'var(--t2)',
                }}
              >
                {s}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}
