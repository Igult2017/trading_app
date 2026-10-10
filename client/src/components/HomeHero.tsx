import { BookOpen, Copy, BarChart3, ClipboardCheck, Diamond, Brain } from 'lucide-react';
import StartFreeButton, { GRADIENT_RING_CSS, DARK_STOPS, LIGHT_STOPS } from '@/components/StartFreeButton';
import { display, sans, homeTokens, page, MEASURE, TYPE } from '@/components/homeTokens';

/**
 * HomeHero — the centred opening block, rebuilt 2026-10-07 from the layout he picked.
 *
 * HIS ASK: *"we need the top text then the slideshow below it then everything follows"*. So this is
 * ONE centred column — badge, headline, one supporting line, two buttons, a reassurance line, and
 * the six feature chips. The hero was a two-column split before (copy left, six cards right); the
 * cards became the chip row, which is how six features survive a single centred column.
 *
 * TWO THINGS DELIBERATELY NOT COPIED FROM THE REFERENCE:
 *
 *   1. ITS PRIMARY BUTTON IS A SOLID BLUE BOX. Ours stays `StartFreeButton` — the gradient-outline
 *      button built from artwork he supplied on 2026-08-07 (*"We borrow this design for start free
 *      cards"*). Swapping it for a generic blue box would quietly undo a brand decision he made.
 *
 *   2. ITS BADGE READS "Trusted by …". Ours no longer does. The old badge said "Trusted by 10,000+
 *      retail traders" — a number nobody can verify, which he agreed on 2026-10-07 to drop (A1). The
 *      badge now says something that is true and checkable instead.
 *
 * THE EMAIL BOX THAT USED TO SIT HERE IS GONE, and nothing was lost: it had no `value`, no
 * `onChange`, no `name` and no surrounding form. It collected nothing — it only looked like it did.
 */

// His own six features and his own tier words, 2026-10-06. Not a paraphrase — do not "tidy" these.
const FEATURES = [
  { icon: BookOpen,      title: 'Live auto journaling', tier: 'Free'     },
  { icon: Copy,          title: 'Copier',               tier: 'Premium'  },
  { icon: BarChart3,     title: 'Analytics',            tier: 'Freemium' },
  { icon: ClipboardCheck,title: 'Drawdown tracking',    tier: 'Freemium' },
  { icon: Diamond,       title: 'Edge Builder',         tier: 'Included' },
  { icon: Brain,         title: 'Backtesting',          tier: 'Premium'  },
];

export default function HomeHero({ darkMode }: { darkMode: boolean }) {
  const t = homeTokens(darkMode);
  // Same stops the Start Free button uses for this theme, so the badge ring matches it exactly.
  const [ringA, ringB, ringC] = darkMode ? DARK_STOPS : LIGHT_STOPS;

  return (
    // ⚠ THE TOP PADDING HAS TO CLEAR THE NAV, WHICH IS `position: fixed` AND 101px TALL (measured,
    // not assumed — it sits OVER this section, whose own top is y=0). At `lg:pt-24` (96px) the badge
    // rendered underneath it. 192px leaves a ~91px breath below the nav, which is the airy opening
    // the reference has. If the ticker band or nav height changes, re-measure this.
    //
    // The bottom padding is large on purpose: the showcase panel is pulled UP into it, so the panel
    // tucks under the hero the way it does in the reference rather than starting a new band.
    <section
      className="pt-36 pb-36 lg:pt-48 lg:pb-44"
      style={{ background: t.heroBg, transition: 'background 0.4s ease', textAlign: 'center' }}
    >
      <div style={page()}>

        {/* Badge — his wording and his ring, 2026-10-10: *"Change this to DailyTradeBook. Trusted by
            over 10,000 protraders. Then give it that lining/ring in image 2."* Image 2 was the Start
            Free button, so the outline is literally that button's, shared from
            StartFreeButton.GRADIENT_RING_CSS rather than copied — see the note there.

            ⚠ THE 10,000 FIGURE IS BACK, AND HE ASKED FOR IT. I removed it from this page on
            2026-10-06 as a number nobody could verify (his option A1, which also took it out of
            HomeStatsSection). It is his claim to make; recording here only that it is a claim, so a
            later session does not "tidy" it away again or assume it was checked. */}
        <style>{GRADIENT_RING_CSS}</style>
        <div className="sfb-ring" style={{
          // 12px, not a 999 pill — his note, 2026-10-10: *"Its corners are too sharp. Reduce border
          // radius."* 12 is the Start Free button's own radius, so the badge and the button match in
          // shape as well as in ring, which is what asking for that ring implied.
          display: 'inline-flex', alignItems: 'center', gap: 9, padding: '8px 18px', borderRadius: 12,
          background: t.card, fontSize: TYPE.small, fontWeight: 600,
          color: t.muted, marginBottom: 28, ...sans,
          // The ring reads these; same stops as the button, per theme, so the two always match.
          ['--sfb-a' as string]: ringA, ['--sfb-b' as string]: ringB, ['--sfb-c' as string]: ringC,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.live, flexShrink: 0 }} />
          DailyTradeBook. Trusted by over 10,000 protraders.
        </div>

        {/* HIS WORDS, set the way the reference sets a headline — one big line and a coloured second
            line (option B1, approved 2026-10-07). "Daily Trade Book" moved up into the badge so the
            headline is two lines instead of three; at this size three lines filled the whole screen. */}
        <h1 style={{
          ...display, fontSize: 'clamp(2.1rem,5.2vw,4rem)', lineHeight: 1.08, fontWeight: 900,
          color: t.text, margin: '0 0 22px', letterSpacing: '-0.02em', textWrap: 'balance',
        }}>
          Traders Workspace<br />
          <span style={{ color: t.accent }}>For building real edge.</span>
        </h1>

        <p style={{ ...sans, fontSize: TYPE.lead, color: t.muted, lineHeight: 1.7, margin: '0 auto 34px', maxWidth: MEASURE }}>
          Log trades, capture decisions, and build your edge &mdash; for free.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <StartFreeButton dark={darkMode} />
          <a href="/#pricing" style={{
            ...sans, display: 'inline-flex', alignItems: 'center', alignSelf: 'center', padding: '15px 26px',
            borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.card, color: t.text,
            fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textDecoration: 'none',
            transition: 'border-color 0.2s, transform 0.18s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.transform = 'none'; }}>
            Compare plans
          </a>
        </div>

        {/* Both halves are true: PricingSection has a $0 'forever' tier and it takes no card. */}
        <p style={{ ...sans, fontSize: TYPE.small, color: t.muted, margin: '0 0 44px' }}>
          Free plan available &middot; No credit card needed
        </p>

        {/* The six features as chips. These were cards in the hero's right column until 2026-10-07.
            They used to break OUT of a narrow 880px text column with a negative-margin trick; the
            container is the full page width now, so they simply sit in it.

            ⚠ A GRID, NOT `flex-wrap`, AND THAT IS THE POINT. Measured, the six chips need 1203px on
            one line but their natural widths are uneven (153px to 239px), so wrapping gave 5-then-1
            at 1120 and 4-then-2 at 880 — both read as a mistake rather than a layout. Equal columns
            make the chips one object: six across on a wide screen, three on a tablet, two on a phone,
            every row full. Stacking the tier under the title is what lets six fit at all. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
             style={{ gap: 10 }}>
          {FEATURES.map(({ icon: Icon, title, tier }) => (
            <span key={title} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12,
              border: `1px solid ${t.border}`, background: t.card, boxShadow: t.shadow, ...sans,
              textAlign: 'left', transition: 'border-color 0.2s, transform 0.18s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.transform = 'none'; }}>
              <Icon size={17} color={t.accent} strokeWidth={2} aria-hidden style={{ flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: TYPE.chip, fontWeight: 700, color: t.text, lineHeight: 1.25 }}>{title}</span>
                <span style={{ display: 'block', fontSize: TYPE.small, fontWeight: 600, color: t.muted, lineHeight: 1.3 }}>{tier}</span>
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
