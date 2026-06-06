import { ArrowRight } from 'lucide-react';

const serif = { fontFamily: "'DM Serif Display', serif" } as const;
const sans  = { fontFamily: "'Plus Jakarta Sans', sans-serif" } as const;

const stats = [
  { value: "10,000+", label: "Active traders" },
  { value: "1M+",     label: "Trades logged" },
  { value: "50+",     label: "Broker integrations" },
  { value: "100%",    label: "Free to start" },
];

export default function HomeStatsSection({ darkMode }: { darkMode: boolean }) {
  return (
    <>
      {/* ── Stats bar ───────────────────────────────────────────────── */}
      <section style={{ background: '#0f172a', padding: '72px 24px' }}>
        <div className="max-w-5xl mx-auto">
          <h2 style={{ ...serif, fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 900, color: '#ffffff', textAlign: 'center', marginBottom: 8 }}>
            Our trading impact
          </h2>
          <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 56, ...sans }}>
            Every MyfmJournal session makes you a sharper trader
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
            {stats.map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ ...serif, fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 900, color: '#ffffff', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 8, ...sans }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 56, paddingTop: 20, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.25)', ...sans }}>
            MyfmJournal offers free journal access · Funded by premium analytics subscriptions
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section style={{ background: '#f0f5ff', padding: '80px 24px', textAlign: 'center' }}>
        <div className="max-w-xl mx-auto">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 999, border: '1px solid #d1daf5', fontSize: 12, color: '#64748b', marginBottom: 24, ...sans, fontWeight: 600 }}>
            ✦ Join 10,000+ traders across the globe
          </div>
          <h2 style={{ ...serif, fontSize: 'clamp(2rem,3.5vw,3rem)', fontWeight: 400, color: '#0f172a', marginBottom: 16, lineHeight: 1.15 }}>
            Start journaling free.<br />
            <span style={{ color: '#2563eb' }}>Build your edge today.</span>
          </h2>
          <p style={{ fontSize: 15, color: '#64748b', marginBottom: 36, lineHeight: 1.75, ...sans }}>
            Connect your broker in under a minute and let the platform track, analyse, and sharpen your trading — no credit card required.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/auth?mode=signup" target="myfm_journal"
              style={{ padding: '13px 28px', borderRadius: 10, background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, ...sans }}>
              Start free <ArrowRight size={16} />
            </a>
            <a href="/#pricing"
              style={{ padding: '13px 28px', borderRadius: 10, border: '1.5px solid #cbd5e1', color: '#0f172a', fontSize: 14, fontWeight: 600, textDecoration: 'none', ...sans }}>
              View pricing
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
