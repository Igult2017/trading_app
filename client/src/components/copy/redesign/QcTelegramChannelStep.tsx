import { CheckCircle2 } from 'lucide-react';

interface Props {
  channel: string;
  onChannel: (v: string) => void;
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--t2)', marginBottom: 7 };
const PC = { background: 'var(--s2)', border: '1px solid var(--b1)', borderRadius: 8, padding: '10px 12px' };
const PK = { fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase' as const, letterSpacing: '.05em' };
const PV = { fontSize: 14, fontWeight: 600, marginTop: 3 };

/** Step — connect a Telegram channel; shows bot-detected note + live parsed preview. */
export default function QcTelegramChannelStep({ channel, onChannel }: Props) {
  return (
    <>
      <div className="qc-eyebrow">Step 03 · Channel</div>
      <h1 className="qc-h1" style={{ marginTop: 10, marginBottom: 6 }}>Connect a Telegram channel</h1>
      <div className="qc-sub">Add our bot to the channel, then we parse and auto-execute its signals.</div>

      <div style={{ marginTop: 24 }}>
        <label style={labelStyle}>Channel</label>
        <input className="qc-inp" value={channel} onChange={e => onChannel(e.target.value)} placeholder="@quantum_signals" />
        <div className="qc-hint">Public @handle or invite link. Our bot must be a member.</div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--ok-s)', border: '1px solid rgba(47,203,126,.2)', borderRadius: 10, padding: '11px 14px', marginTop: 14 }}>
        <CheckCircle2 size={16} style={{ color: 'var(--ok)', flexShrink: 0 }} />
        <div style={{ fontSize: 13, color: 'var(--t2)' }}>
          Bot detected in channel · <span className="mono">@TradeSyncBot</span> is an admin
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--t2)', marginBottom: 7 }}>Live preview — last message parsed</label>
        <div className="mono" style={{ background: 'var(--inset)', border: '1px solid var(--b1)', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: 'var(--t2)', lineHeight: 1.7 }}>
          <span className="qc-badge qc-b-live" style={{ marginRight: 6 }}>SIGNAL</span>
          BUY XAUUSD @ 2318.4<br />SL 2310.0 · TP 2336.0 · risk 1%
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12 }}>
          <div style={PC}><div style={PK}>Symbol</div><div className="mono" style={PV}>XAUUSD</div></div>
          <div style={PC}><div style={PK}>Side</div><div className="qc-up" style={PV}>▲ Buy</div></div>
          <div style={PC}><div style={PK}>Entry</div><div className="mono" style={PV}>2318.4</div></div>
          <div style={PC}><div style={PK}>SL / TP</div><div className="mono" style={PV}>2310 / 2336</div></div>
        </div>
      </div>
    </>
  );
}
