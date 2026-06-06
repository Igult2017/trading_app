import { ArrowRight } from 'lucide-react';

const serif = { fontFamily: "'Playfair Display', serif" } as const;
const sans  = { fontFamily: "'Inter', sans-serif" } as const;

const stats = [
  { value: "10,000+", label: "Active traders" },
  { value: "1M+",     label: "Trades logged" },
  { value: "50+",     label: "Broker integrations" },
  { value: "100%",    label: "Free to start" },
];

export default function HomeStatsSection({ darkMode }: { darkMode: boolean }) {
  const dm     = darkMode;
  const bg     = dm ? '#0f172a' : '#f8fafc';
  const ctaBg  = dm ? '#020817' : '#f0f5ff';
  const text   = dm ? '#f1f5f9' : '#0f172a';
  const muted  = dm ? '#94a3b8' : '#64748b';
  const border = dm ? '#1e293b' : '#e2e8f0';
  const pill   = dm ? '#1e293b' : '#ffffff';
  const pillBorder = dm ? '#334155' : '#d1daf5';
  const pillText   = dm ? '#94a3b8' : '#64748b';

  return (
    <>
      {/* ── Stats bar ───────────────────────────────────────────────── */}
      <section style={{ background: bg, padding: '72px 24px', transition: 'background 0.4s' }}>
        <div className="max-w-5xl mx-auto">
          <h2 style={{ ...serif, fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 700, color: text, textAlign: 'center', marginBottom: 8 }}>
            Our trading impact
          </h2>
          <p style={{ textAlign: 'center', fontSize: 14, color: muted, marginBottom: 56, ...sans }}>
            Every MyfmJournal session makes you a sharper trader
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
            {stats.map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ ...serif, fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 900, color: text, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 13, color: muted, marginTop: 8, ...sans }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${border}`, marginTop: 56, paddingTop: 20, textAlign: 'center', fontSize: 12, color: dm ? '#475569' : '#94a3b8', ...sans }}>
            MyfmJournal offers free journal access · Funded by premium analytics subscriptions
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section style={{ background: ctaBg, padding: '80px 24px', textAlign: 'center', transition: 'background 0.4s' }}>
        <div className="max-w-xl mx-auto">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 999, border: `1px solid ${pillBorder}`, background: pill, fontSize: 12, color: pillText, marginBottom: 24, ...sans, fontWeight: 600 }}>
            ✦ Join 10,000+ traders across the globe
          </div>
          <h2 style={{ ...serif, fontSize: 'clamp(2rem,3.5vw,3rem)', fontWeight: 700, color: text, marginBottom: 16, lineHeight: 1.15 }}>
            Start journaling free.<br />
            <span style={{ color: '#2563eb' }}>Build your edge today.</span>
          </h2>
          <p style={{ fontSize: 15, color: muted, marginBottom: 36, lineHeight: 1.75, ...sans }}>
            Connect your broker in under a minute and let the platform track, analyse, and sharpen your trading — no credit card required.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/auth?mode=signup" target="myfm_journal"
              style={{ padding: '13px 28px', borderRadius: 10, background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, ...sans }}>
              Start free <ArrowRight size={16} />
            </a>
            <a href="/#pricing"
              style={{ padding: '13px 28px', borderRadius: 10, border: `1.5px solid ${border}`, color: text, fontSize: 14, fontWeight: 600, textDecoration: 'none', ...sans }}>
              View pricing
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
