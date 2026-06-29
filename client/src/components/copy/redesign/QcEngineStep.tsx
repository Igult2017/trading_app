import { Scale, Anchor, Percent, ChevronDown } from 'lucide-react';

type LotMode = 'mult' | 'fixed' | 'risk';

interface Props {
  lotMode: LotMode;
  onLotMode: (m: string) => void;
  multiplier: string;
  onMultiplier: (v: string) => void;
  direction: string;
  onDirection: (v: string) => void;
  pauseInactive: boolean;
  onPauseInactive: (v: boolean) => void;
}

const CARDS: { id: LotMode; icon: typeof Scale; title: string; desc: string }[] = [
  { id: 'mult', icon: Scale, title: 'Balance Multiplier', desc: 'Scale to your account size. Best for most.' },
  { id: 'fixed', icon: Anchor, title: 'Fixed Lot', desc: 'Always open a set lot, regardless of theirs.' },
  { id: 'risk', icon: Percent, title: 'Risk %', desc: 'Size by % of equity per trade.' },
];

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--t2)', marginBottom: 7 };

/** Step — lot sizing engine for a follower. */
export default function QcEngineStep({ lotMode, onLotMode, multiplier, onMultiplier, direction, onDirection, pauseInactive, onPauseInactive }: Props) {
  const inputMeta = lotMode === 'mult'
    ? { label: 'Multiplier', hint: '1.0 mirrors exactly · 0.5 = half their lot.' }
    : lotMode === 'fixed'
      ? { label: 'Fixed lot size', hint: 'Every copied trade opens at this exact lot.' }
      : { label: 'Risk per trade (%)', hint: 'Lot is computed from your equity and stop distance.' };

  return (
    <>
      <div className="qc-eyebrow">Step 04 · Engine</div>
      <h1 className="qc-h1" style={{ marginTop: 10, marginBottom: 6 }}>How should we size your trades?</h1>
      <div className="qc-sub">Choose how the provider's lot size maps onto your account.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 24 }}>
        {CARDS.map(c => {
          const I = c.icon;
          const sel = lotMode === c.id;
          return (
            <div
              key={c.id}
              onClick={() => onLotMode(c.id)}
              style={{ background: sel ? 'var(--acc-soft)' : 'var(--s1)', border: `1px solid ${sel ? 'var(--acc-bd)' : 'var(--b1)'}`, borderRadius: 12, padding: 16, cursor: 'pointer', transition: 'all .2s' }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 8, background: sel ? 'rgba(91,108,255,.18)' : 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, color: sel ? 'var(--acc-h)' : 'var(--t1)' }}>
                <I size={18} />
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{c.title}</h3>
              <p style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.5 }}>{c.desc}</p>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>{inputMeta.label}</label>
          <input className="qc-inp mono" value={multiplier} onChange={e => onMultiplier(e.target.value)} />
          <div className="qc-hint">{inputMeta.hint}</div>
        </div>
        <div>
          <label style={labelStyle}>Direction</label>
          <div style={{ height: 40, display: 'flex', alignItems: 'center', background: 'var(--s2)', border: '1px solid var(--b2)', borderRadius: 8, padding: '0 12px', position: 'relative' }}>
            <select
              value={direction}
              onChange={e => onDirection(e.target.value)}
              style={{ appearance: 'none', WebkitAppearance: 'none', background: 'transparent', border: 'none', outline: 'none', color: 'var(--t1)', fontSize: 14, fontFamily: 'inherit', width: '100%', cursor: 'pointer' }}
            >
              <option value="same">Same as provider</option>
              <option value="reverse">Reverse</option>
            </select>
            <ChevronDown size={16} style={{ color: 'var(--t3)', position: 'absolute', right: 12, pointerEvents: 'none' }} />
          </div>
          <div className="qc-hint">Or reverse to trade the opposite side.</div>
        </div>
      </div>

      <div className="qc-toggle-row" style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 10, padding: '14px 16px' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Pause if provider idle 7 days</div>
          <div className="qc-hint" style={{ marginTop: 2 }}>Avoids copying stale or abandoned signals</div>
        </div>
        <div className={`qc-sw${pauseInactive ? '' : ' off'}`} onClick={() => onPauseInactive(!pauseInactive)} />
      </div>
    </>
  );
}
