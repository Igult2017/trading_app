import { Calendar, BarChart2, Diamond, PieChart, ArrowRight } from 'lucide-react';

const serif = { fontFamily: "'Playfair Display', serif" } as const;
const sans  = { fontFamily: "'Inter', sans-serif" } as const;

const features = [
  {
    icon: Calendar,
    title: "Stay Organised",
    desc: "Track your trades and review your performance by day, week, or month",
  },
  {
    icon: BarChart2,
    title: "Analyze Strategies",
    desc: "Easily analyze and compare the success rates of different strategies",
  },
  {
    icon: Diamond,
    title: "Spot Patterns",
    desc: "Identify patterns in your wins and losses to refine your trading schedule",
  },
  {
    icon: PieChart,
    title: "Professional Journaling",
    desc: "Journal your trades and thoughts like a pro trader",
  },
];

export default function HomeStatsSection({ darkMode }: { darkMode: boolean }) {
  const dm         = darkMode;
  const bg         = dm ? '#0b1220' : '#eef2ff';
  const ctaBg      = dm ? '#020817' : '#f0f5ff';
  const text       = dm ? '#f1f5f9' : '#0f172a';
  const muted      = dm ? '#94a3b8' : '#64748b';
  const border     = dm ? '#1e293b' : '#e0e7ff';
  const cardBg     = dm ? '#131e35' : '#ffffff';
  const cardBorder = dm ? '#1e3050' : '#e0e7ff';
  const pill       = dm ? '#1e293b' : '#ffffff';
  const pillBorder = dm ? '#334155' : '#d1daf5';
  const pillText   = dm ? '#94a3b8' : '#64748b';

  return (
    <>
      {/* ── Features grid ─────────────────────────────────────────────────── */}
      <section style={{ background: bg, padding: '88px 24px', transition: 'background 0.4s' }}>
        <div className="max-w-4xl mx-auto">

          <h2 style={{ ...serif, fontSize: 'clamp(1.9rem,3vw,2.6rem)', fontWeight: 800, color: text, textAlign: 'center', marginBottom: 14, letterSpacing: '-0.02em' }}>
            Unlock Powerful Insights
          </h2>
          <p style={{ ...sans, textAlign: 'center', fontSize: 15, color: muted, lineHeight: 1.75, maxWidth: 500, margin: '0 auto 60px' }}>
            The most comprehensive analytics dashboard that can be customised to your needs
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map(({ icon: Icon, title, desc }, i) => (
              <div
                key={i}
                className="group hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 cursor-default"
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                  borderRadius: 6,
                  padding: '28px 26px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 20,
                }}
              >
                {/* Icon box */}
                <div
                  className="group-hover:scale-110 transition-transform duration-300"
                  style={{
                    flexShrink: 0,
                    width: 50,
                    height: 50,
                    borderRadius: 13,
                    background: 'linear-gradient(135deg, #3b82f6 0%, #4338ca 100%)',
                    boxShadow: '0 4px 14px rgba(59,130,246,0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={22} color="#fff" strokeWidth={1.8} />
                </div>

                {/* Text */}
                <div>
                  <p style={{ ...sans, fontWeight: 700, fontSize: 16, color: text, marginBottom: 7 }}>
                    {title}
                  </p>
                  <p style={{ ...sans, fontSize: 14, color: muted, lineHeight: 1.7, margin: 0 }}>
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section style={{ background: ctaBg, padding: '80px 24px', textAlign: 'center', transition: 'background 0.4s' }}>
        <div className="max-w-xl mx-auto">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 999, border: `1px solid ${pillBorder}`, background: pill, fontSize: 12, color: pillText, marginBottom: 24, ...sans, fontWeight: 600 }}>
            ✦ Join 10,000+ traders across the globe
          </div>
          <h2 style={{ ...serif, fontSize: 'clamp(2rem,3.5vw,3rem)', fontWeight: 700, color: text, marginBottom: 16, lineHeight: 1.15 }}>
            Start journaling free.<br />
            <span style={{ color: '#2563eb' }}>Build your edge today.</span>
          </h2>
          <p style={{ ...sans, fontSize: 15, color: muted, marginBottom: 36, lineHeight: 1.75 }}>
            Connect your broker in under a minute and let the platform track, analyse, and sharpen your trading — no credit card required.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/auth?mode=signup" target="Smart_Journal"
              style={{ ...sans, padding: '13px 28px', borderRadius: 4, background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
              Start free <ArrowRight size={16} />
            </a>
            <a href="/#pricing"
              style={{ ...sans, padding: '13px 28px', borderRadius: 4, border: `1.5px solid ${border}`, color: text, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
              View pricing
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
