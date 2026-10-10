/** Reviews — three rows of cards drifting sideways.
 *
 * HIS ASK, 2026-10-10: *"In the testimonials i want us to use this sideways slideshow type"*, with a
 * screenshot of Tradervue: three rows of review cards moving horizontally, staggered so each row
 * starts somewhere different, cards running off both edges with no hard stop.
 *
 * NO CAROUSEL LIBRARY. The sideways drift is the same CSS the broker strip already uses — a doubled
 * list moved from 0 to -50%, so the second copy arrives exactly where the first began and the loop
 * has no seam. Three rows, three speeds, the middle one reversed.
 *
 * ⚠ THERE ARE ONLY THREE REVIEWS AND THEY ARE INVENTED. The reference wall shows a dozen. I did not
 * write a dozen more, and nobody should: three made-up quotes behind an honest label is one thing,
 * a wall of twelve presented as a review feed is misrepresentation, which is a prohibited commercial
 * practice in the UK and EU and contradicts this platform's own Acceptable Use page. He chose option
 * A1 on 2026-10-10 — build the layout now, loop the three we have, replace them with real ones later.
 *
 * So each row starts at a DIFFERENT review (0, 1, 2) and runs at a different speed. That is what
 * stops three identical rows marching in lockstep. The moment real reviews arrive, drop them into
 * `reviews` and the rows stop repeating on their own.
 */
import { Star } from 'lucide-react';
import { page, TYPE } from '@/components/homeTokens';

const SERIF = { fontFamily: "'Playfair Display', Georgia, serif" } as const;
const SANS  = { fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" } as const;

/** PLACEHOLDER COPY — these are not real customers. See the warning at the top of this file.
 *  Replace with real, attributable reviews and delete the label in the markup below. */
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

/** Row 1 starts at review 0, row 2 at review 1, row 3 at review 2 — see the note above. */
const ROWS = [
  { from: 0, seconds: 54, reverse: false },
  { from: 1, seconds: 67, reverse: true  },
  { from: 2, seconds: 59, reverse: false },
];

/** Enough cards that a row is wider than any screen before it repeats. */
const PER_ROW = 6;
const rotate = (from: number) =>
  Array.from({ length: PER_ROW }, (_, i) => reviews[(from + i) % reviews.length]);

const initials = (name: string) =>
  name.split(/\s+/).map(w => w[0]).join('').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();

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
    star:   dm ? '#f5b942' : '#c8860d',
    avatar: dm ? '#1e293b' : '#eef2f0',
    shadow: dm ? 'none' : '0 1px 2px rgba(20,35,28,0.04), 0 8px 24px rgba(20,35,28,0.05)',
  };

  const Card = ({ r }: { r: typeof reviews[number] }) => (
    <figure style={{
      margin: 0, flexShrink: 0, width: 360, padding: 22, borderRadius: 14,
      background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span aria-hidden style={{
          flexShrink: 0, width: 38, height: 38, borderRadius: '50%', background: t.avatar,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...SANS, fontSize: TYPE.small, fontWeight: 700, color: t.dim,
        }}>{initials(r.name)}</span>
        <span>
          <span style={{ display: 'flex', gap: 2 }} role="img" aria-label="Rated 5 out of 5">
            {[...Array(5)].map((_, j) => (
              <Star key={j} size={13} style={{ fill: t.star, color: t.star }} aria-hidden />
            ))}
          </span>
          <span style={{ ...SANS, display: 'block', fontSize: TYPE.small, fontWeight: 600,
                         color: t.dim, marginTop: 3 }}>
            {r.name} &middot; {r.city}
          </span>
        </span>
      </div>
      {/* Clamped to three lines, like the reference — a wall of cards only reads if they are all
          the same height. The full quote stays in the markup for anyone reading with a screen
          reader or with CSS off. */}
      <blockquote style={{
        ...SANS, margin: 0, fontSize: TYPE.body, lineHeight: 1.65, color: t.body,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {r.quote}
      </blockquote>
    </figure>
  );

  return (
    <section id="reviews" style={{ background: t.bg, padding: '84px 0', transition: 'background .4s ease' }}>
      {/* ⚠ NO BACKTICKS ANYWHERE INSIDE THIS TEMPLATE, comments included — one inside a style
          literal is a runtime crash that still builds clean. Learned the hard way on this project.
          Reduced motion stops the drift, matching the broker strip. Hover pauses it so a card can
          actually be read. */}
      <style>{`
        /* -50% IS NOT THE SEAMLESS POINT WHEN THERE IS A GAP, and the error is visible. The row is
           12 cards wide: 12 x 360 + 11 x 20 = 4540. One full copy occupies 6 x (360 + 20) = 2280,
           but -50% of 4540 is 2270 -- so every loop the second copy lands 10px short of where the
           first began and the whole row jumps sideways once a minute. The missing 10px is exactly
           half the gap, because the row has one fewer gap than it has cards. */
        @keyframes tm-drift { 0% { transform: translateX(0) } 100% { transform: translateX(calc(-50% - 10px)) } }
        .tm-row { display: flex; gap: 20px; width: max-content; animation: tm-drift linear infinite; }
        .tm-row:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .tm-row { animation: none; } }
      `}</style>

      <div style={page()}>
        <p style={{ ...SANS, textAlign: 'center', fontSize: TYPE.small, fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: t.dim, marginBottom: 14 }}>
          Testimonials
        </p>
        <h2 style={{ ...SERIF, fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 700, textAlign: 'center',
                     color: t.ink, margin: '0 0 12px', letterSpacing: '-0.015em' }}>
          Loved by traders across the globe
        </h2>
        <p style={{ ...SANS, textAlign: 'center', fontSize: TYPE.lead, color: t.body, margin: '0 0 8px' }}>
          What traders say about Daily Trade Book
        </p>

        {/* ⚠ THE LABEL IS NOT DECORATION — IT IS WHAT MAKES THIS SECTION LAWFUL TO SHOW.
            The quotes are written examples, not real customers. DELETE THIS LABEL ONLY when every
            quote in `reviews` is a real, attributable review. */}
        <p style={{ ...SANS, textAlign: 'center', fontSize: TYPE.small, color: t.dim, margin: '0 0 44px' }}>
          Illustrative examples of how the platform is used — not real customer reviews.
        </p>
      </div>

      {/* FULL-BLEED, not inside the container: the cards are meant to run off both edges. */}
      <div style={{ display: 'grid', gap: 20, overflow: 'hidden' }}>
        {ROWS.map((row, i) => {
          const cards = rotate(row.from);
          return (
            <div key={i} style={{ overflow: 'hidden' }}>
              <div className="tm-row"
                   style={{
                     animationDuration: `${row.seconds}s`,
                     animationDirection: row.reverse ? 'reverse' : 'normal',
                     // Each row starts further along than the one above it, which is what gives the
                     // staggered look in his reference rather than three aligned columns.
                     marginLeft: -(i * 120),
                   }}>
                {/* Doubled: the second copy lands exactly where the first started, so -50% loops
                    seamlessly. aria-hidden on the copy so it is not read out twice. */}
                {cards.map((r, j) => <Card key={'a' + j} r={r} />)}
                <div aria-hidden style={{ display: 'contents' }}>
                  {cards.map((r, j) => <Card key={'b' + j} r={r} />)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
