interface Props {
  maxDailyLossPct: string;
  onMaxDailyLossPct: (v: string) => void;
  maxFollowers: string;
  onMaxFollowers: (v: string) => void;
  pauseOnDrawdown: boolean;
  onPauseOnDrawdown: (v: boolean) => void;
  maxDrawdownPct: string;
  onMaxDrawdownPct: (v: string) => void;
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--t2)', marginBottom: 7 };

/** Step — provider exposure limits (daily loss cap, follower cap, drawdown auto-pause). */
export default function QcLimitsStep({
  maxDailyLossPct, onMaxDailyLossPct,
  maxFollowers, onMaxFollowers,
  pauseOnDrawdown, onPauseOnDrawdown,
  maxDrawdownPct, onMaxDrawdownPct,
}: Props) {
  return (
    <>
      <div className="qc-eyebrow">Step 04 · Limits</div>
      <h1 className="qc-h1" style={{ marginTop: 10, marginBottom: 6 }}>Set your exposure limits</h1>
      <div className="qc-sub">Guardrails that protect you and your followers if a day goes wrong.</div>

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>Max daily loss (%)</label>
          <input className="qc-inp mono" value={maxDailyLossPct} onChange={e => onMaxDailyLossPct(e.target.value)} placeholder="2.0" />
          <div className="qc-hint">Copying pauses for the day once this is hit.</div>
        </div>
        <div>
          <label style={labelStyle}>Max followers</label>
          <input className="qc-inp mono" value={maxFollowers} onChange={e => onMaxFollowers(e.target.value)} placeholder="Unlimited" />
          <div className="qc-hint">Cap how many accounts can copy you.</div>
        </div>
      </div>

      <div className="qc-toggle-row" style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 10, padding: '14px 16px' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Pause on drawdown</div>
          <div className="qc-hint" style={{ marginTop: 2 }}>Stop broadcasting if your equity falls past a threshold.</div>
        </div>
        <div className={`qc-sw${pauseOnDrawdown ? '' : ' off'}`} onClick={() => onPauseOnDrawdown(!pauseOnDrawdown)} />
      </div>

      {pauseOnDrawdown && (
        <div style={{ marginTop: 18 }}>
          <label style={labelStyle}>Max drawdown (%)</label>
          <input className="qc-inp mono" value={maxDrawdownPct} onChange={e => onMaxDrawdownPct(e.target.value)} placeholder="10.0" />
          <div className="qc-hint">Broadcasting auto-pauses once peak-to-trough loss exceeds this.</div>
        </div>
      )}
    </>
  );
}
