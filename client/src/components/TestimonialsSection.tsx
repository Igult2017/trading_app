import { Star } from 'lucide-react';

const serif = { fontFamily: "'Playfair Display', serif" } as const;
const sans  = { fontFamily: "'Inter', sans-serif" } as const;

const reviews = [
  {
    quote: "My trading has never been this consistent. The journal used MT5 auto-import and AI analysis that improved my edge immediately. Booking confirmation came in under 2 minutes of signup.",
    name: "Alex M.", city: "London", service: "Trade Journal",
  },
  {
    quote: "Used MyfmJournal for our trading desk monthly review. The analytics team is professional, the export dashboard is a dream. Our whole firm switched after the first month.",
    name: "Jordan K.", city: "New York", service: "Analytics",
  },
  {
    quote: "Post-session deep review was flawless. I used the AI Coach and had 4 competitive insights on my strategy within an hour. The stats transparency is a genuinely nice touch.",
    name: "Sarah T.", city: "Berlin", service: "AI Coach",
  },
];

export default function TestimonialsSection({ darkMode }: { darkMode: boolean }) {
  const dm     = darkMode;
  const bg     = dm ? 'rgba(15,23,42,0.6)' : '#f8fafc';
  const card   = dm ? '#0f172a' : '#ffffff';
  const border = dm ? '#1e293b' : '#e2e8f0';
  const text   = dm ? '#f1f5f9' : '#0f172a';
  const muted  = dm ? '#94a3b8' : '#64748b';

  return (
    <section id="reviews" style={{ background: bg, padding: '80px 0', transition: 'all 0.4s ease' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 24px' }}>
        <p style={{ textAlign: 'center', fontSize: 10, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#2563eb', marginBottom: 14, ...sans }}>
          TESTIMONIALS
        </p>
        <h2 style={{ ...serif, fontSize: 'clamp(1.8rem,3vw,2.6rem)', fontWeight: 900, textAlign: 'center', color: text, marginBottom: 10 }}>
          Loved by thousands across the globe
        </h2>
        <p style={{ textAlign: 'center', fontSize: 15, color: muted, marginBottom: 56, ...sans }}>
          Real reviews from verified MyfmJournal traders
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          {reviews.map((r, i) => (
            <div key={i} style={{ padding: '28px 24px', borderRadius: 6, border: `1px solid ${border}`, background: card, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {[...Array(5)].map((_, j) => (
                  <Star key={j} size={16} className="fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p style={{ fontSize: 14, color: muted, lineHeight: 1.75, flex: 1, ...sans }}>"{r.quote}"</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: text, ...sans }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: muted, ...sans }}>{r.city}</div>
                </div>
                <span style={{ padding: '3px 10px', borderRadius: 4, border: `1px solid ${border}`, fontSize: 11, color: muted, ...sans }}>
                  {r.service}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
