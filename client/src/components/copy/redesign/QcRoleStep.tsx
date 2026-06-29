import { Users, Radio, GitFork, Send, Check } from 'lucide-react';

const ROLES = [
  { id: 'follower', icon: Users,   title: 'Copy Follower',   desc: "Mirror a verified provider's trades into your account, automatically — with your own lot sizing and risk caps." },
  { id: 'provider', icon: Radio,   title: 'Signal Provider', desc: 'Broadcast your trades from a master account — followers copy you in real time.' },
  { id: 'self',     icon: GitFork, title: 'Self-Copy',       desc: 'Mirror trades between two of your own connected accounts — source to target.' },
  { id: 'telegram', icon: Send,    title: 'Telegram Signals',desc: 'Parse and auto-execute trade signals from a Telegram channel onto your account.' },
];

/** Step 01 — pick a role. Maps to data.role: follower | provider | self | telegram. */
export default function QcRoleStep({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <>
      <div className="qc-eyebrow">Step 01 · Identity</div>
      <h1 className="qc-h1" style={{ marginTop: 10, marginBottom: 6 }}>How do you want to use Trade Sync?</h1>
      <div className="qc-sub">Pick a role to set up. You can run more than one — and change this anytime.</div>
      <div className="qc-cards">
        {ROLES.map(r => {
          const I = r.icon;
          const sel = value === r.id;
          return (
            <div key={r.id} className={`qc-card${sel ? ' sel' : ''}`} onClick={() => onChange(r.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="ic"><I size={20} /></div>
                  <h3>{r.title}</h3>
                  <p>{r.desc}</p>
                </div>
                <div className={`qc-chk${sel ? ' on' : ''}`}>{sel && <Check size={12} strokeWidth={3} />}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
