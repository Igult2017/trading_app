/** Reviews section.
 *
 * Restyled 2026-08-08 to the reference the user supplied: pale mint ground, white cards with soft
 * corners and a whisper of shadow, gold stars, the quote in italic serif, and a name/city block on
 * the left with a service pill on the right, both pinned to the bottom so every card ends level.
 *
 * SEE THE NOTE ON `reviews` BELOW before touching the copy.
 */
import { Star } from 'lucide-react';
import { page, TYPE } from '@/components/homeTokens';

const SERIF = { fontFamily: "'Playfair Display', Georgia, serif" } as const;
// The pull-quote stays in the serif on purpose — a testimonial set in it reads as a quotation.
// Everything around it (eyebrow, supporting line, name and role) is there to be read (2026-08-30).
const SANS  = { fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" } as const;

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
    quote: "I connected my cTrader account and three months of history was just there. What changed my trading was the session breakdown — I could finally see that nearly all my losses came from London opens I had no business taking.",
    name: "Alex M.", city: "London", service: "Live auto journaling",
  },
  {
    quote: "We run a four-trader desk and the monthly review used to take a full day of spreadsheets. Now I export the analytics and we talk about the trades instead of assembling the numbers.",
    name: "Jordan K.", city: "New York", service: "Analytics",
  },
  {
    quote: "The drawdown tracking is what sold me. I am on a prop evaluation and knowing exactly how much daily room I have left, before I place the trade, has kept me from blowing two of them.",
    name: "Sarah T.", city: "Berlin", service: "Drawdown tracking",
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
      <div style={page()}>
        <p style={{ ...SANS, textAlign: 'center', fontSize: TYPE.small, fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: t.dim, marginBottom: 14 }}>
          Testimonials
        </p>
        <h2 style={{ ...SERIF, fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 700, textAlign: 'center',
                     color: t.ink, margin: '0 0 12px', letterSpacing: '-0.015em' }}>
          Loved by traders across the globe
        </h2>
        <p style={{ ...SANS, textAlign: 'center', fontSize: TYPE.lead, color: t.body, margin: '0 0 52px' }}>
          {/* His new name, 2026-10-06 — landing-page copy only. The `Brand` component (header
              wordmark, footer, sign-in box, browser tab) still reads Trade&Journal on his
              instruction: *"i will give you the new logo later then we change the logo and
              everything later."* Deliberate, temporary mismatch. */}
          What traders say about Daily Trade Book
        </p>

        {/* ⚠ THE LABEL IS NOT DECORATION — IT IS WHAT MAKES THIS SECTION LAWFUL TO SHOW.
            The quotes below are written examples, not real customers. Presenting invented reviews as
            genuine is a prohibited commercial practice in the EU and the UK, is actionable under the
            FTC's endorsement rules in the US, and contradicts this platform's own Acceptable Use page,
            which forbids users from misrepresenting results. He asked on 2026-10-06 to *"make it more
            convincing and realistic for now"* and to keep it until he has real ones; this is that,
            with the one addition that keeps it honest.
            DELETE THIS LABEL ONLY when every quote below is a real, attributable review. */}
        <p style={{ ...SANS, textAlign: 'center', fontSize: TYPE.small, color: t.dim, margin: '-38px 0 52px' }}>
          Illustrative examples of how the platform is used — not real customer reviews.
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
                ...SANS, margin: 0, flex: 1, fontStyle: 'italic', fontSize: TYPE.body,
                lineHeight: 1.75, color: t.body,
              }}>
                &ldquo;{r.quote}&rdquo;
              </blockquote>

              <figcaption style={{ display: 'flex', justifyContent: 'space-between',
                                   alignItems: 'flex-end', gap: 12 }}>
                <div>
                  <div style={{ ...SANS, fontWeight: 700, fontSize: TYPE.chip, color: t.ink }}>{r.name}</div>
                  <div style={{ ...SANS, fontSize: TYPE.small, color: t.dim, marginTop: 2 }}>{r.city}</div>
                </div>
                <span style={{
                  ...SANS, flexShrink: 0, padding: '4px 12px', borderRadius: 999,
                  border: `1px solid ${t.border}`, background: t.pillBg,
                  fontSize: TYPE.small, color: t.dim, whiteSpace: 'nowrap',
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
