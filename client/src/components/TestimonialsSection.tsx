/** Reviews section.
 *
 * Restyled 2026-08-08 to the reference the user supplied: pale mint ground, white cards with soft
 * corners and a whisper of shadow, gold stars, the quote in italic serif, and a name/city block on
 * the left with a service pill on the right, both pinned to the bottom so every card ends level.
 *
 * SEE THE NOTE ON `reviews` BELOW before touching the copy.
 */
import { Star } from 'lucide-react';
import Brand from '@/components/Brand';

const SERIF = { fontFamily: "'Playfair Display', Georgia, serif" } as const;

/** PLACEHOLDER COPY — these are not real customers.
 *
 *  The names, cities and wording are invented, and they are near-rewrites of the reference site's
 *  own testimonials ("confirmation in under 2 minutes", "the dashboard is a dream, our whole company
 *  switched", "4 competitive offers within an hour"). Presenting invented reviews as genuine is a
 *  prohibited commercial practice in the EU and UK, and it contradicts the platform's own Acceptable
 *  Use page, which forbids users from misrepresenting results. Flagged to the owner 2026-08-08;
 *  replace with real, attributable reviews or label the section as illustrative before launch. */
const reviews = [
  {
    quote: "My trading has never been this consistent. The journal used MT5 auto-import and AI analysis that improved my edge immediately. Booking confirmation came in under 2 minutes of signup.",
    name: "Alex M.", city: "London", service: "Trade Journal",
  },
  {
    quote: "Used Trade&Journal for our trading desk monthly review. The analytics team is professional, the export dashboard is a dream. Our whole firm switched after the first month.",
    name: "Jordan K.", city: "New York", service: "Analytics",
  },
  {
    quote: "Post-session deep review was flawless. I used the AI Coach and had 4 competitive insights on my strategy within an hour. The stats transparency is a genuinely nice touch.",
    name: "Sarah T.", city: "Berlin", service: "AI Coach",
  },
];

export default function TestimonialsSection({ darkMode }: { darkMode: boolean }) {
  const dm = darkMode;
  const t = {
    bg:     dm ? 'rgba(15,23,42,0.6)' : '#f2f7f4',
    card:   dm ? '#0f172a' : '#ffffff',
    border: dm ? '#1e293b' : '#e6ece8',
    ink:    dm ? '#e8edf9' : '#16232b',   // 16.3:1 dark / 16.0:1 light
    body:   dm ? '#c7d0e4' : '#24322b',   // 11.5:1 dark / 13.4:1 light
    dim:    dm ? '#a6b3d1' : '#36423b',   // 8.4:1 dark / 10.5:1 light
    // Gold, but a shade deeper than the reference's. Bright #f5a623 measures 2.03:1 on white —
    // under the 3:1 minimum for a graphic that carries meaning, and a star rating carries meaning.
    // #c8860d reads as the same gold and clears it. The aria-label covers screen readers either way.
    star:   dm ? '#f5b942' : '#c8860d',
    pillBg: dm ? 'rgba(255,255,255,0.04)' : '#f6f9f7',
    shadow: dm ? 'none' : '0 1px 2px rgba(20,35,28,0.04), 0 8px 24px rgba(20,35,28,0.05)',
  };

  return (
    <section id="reviews" style={{ background: t.bg, padding: '84px 0', transition: 'background .4s ease' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px' }}>
        <p style={{ ...SERIF, textAlign: 'center', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.22em',
                    textTransform: 'uppercase', color: t.dim, marginBottom: 14 }}>
          Testimonials
        </p>
        <h2 style={{ ...SERIF, fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 700, textAlign: 'center',
                     color: t.ink, margin: '0 0 12px', letterSpacing: '-0.015em' }}>
          Loved by traders across the globe
        </h2>
        <p style={{ ...SERIF, textAlign: 'center', fontSize: 15, color: t.body, margin: '0 0 52px' }}>
          What traders say about <Brand />
        </p>

        {/* items-stretch + flex-1 on the quote = every card ends level, whatever the quote length */}
        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {reviews.map((r, i) => (
            <figure key={i} style={{
              margin: 0, padding: 28, borderRadius: 14, background: t.card,
              border: `1px solid ${t.border}`, boxShadow: t.shadow,
              display: 'flex', flexDirection: 'column', gap: 18,
            }}>
              <div style={{ display: 'flex', gap: 3 }} role="img" aria-label="Rated 5 out of 5">
                {[...Array(5)].map((_, j) => (
                  <Star key={j} size={17} style={{ fill: t.star, color: t.star }} aria-hidden />
                ))}
              </div>

              <blockquote style={{
                ...SERIF, margin: 0, flex: 1, fontStyle: 'italic', fontSize: 14.5,
                lineHeight: 1.75, color: t.body,
              }}>
                &ldquo;{r.quote}&rdquo;
              </blockquote>

              <figcaption style={{ display: 'flex', justifyContent: 'space-between',
                                   alignItems: 'flex-end', gap: 12 }}>
                <div>
                  <div style={{ ...SERIF, fontWeight: 700, fontSize: 14, color: t.ink }}>{r.name}</div>
                  <div style={{ ...SERIF, fontSize: 12.5, color: t.dim, marginTop: 2 }}>{r.city}</div>
                </div>
                <span style={{
                  ...SERIF, flexShrink: 0, padding: '4px 12px', borderRadius: 999,
                  border: `1px solid ${t.border}`, background: t.pillBg,
                  fontSize: 11.5, color: t.dim, whiteSpace: 'nowrap',
                }}>
                  {r.service}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
