import { Plug, PenLine, BadgeCheck, Lock } from 'lucide-react';
import { sans, homeTokens, page, TYPE } from '@/components/homeTokens';

/**
 * HomeValueStrip — the four-card row under the slideshow. Added 2026-10-07 from the reference he
 * sent (its fourth screenshot).
 *
 * ⚠ EVERY CLAIM HERE WAS CHECKED AGAINST THE CODE, AND TWO OF THE REFERENCE'S FOUR CARDS COULD NOT
 * BE REUSED. This page was flagged by him on 2026-10-06 for saying things that were not true, so
 * nothing goes on it that cannot be pointed at:
 *
 *   * The reference's "Connect your platforms — MetaTrader 4 & 5, cTrader, Match-Trader, TradeLocker,
 *     Tradovate and major crypto exchanges" is SIX platforms. We integrate cTrader and nothing else.
 *     Split into two honest cards instead: cTrader auto-syncs, everything else is entered by hand.
 *   * The reference's "Web, iOS and Android — plus the mobile apps" is DROPPED entirely. There are no
 *     mobile apps. Do not add this card back without apps to point at.
 *   * "Free forever plan — not a trial" is true for us, but the cap is not optional detail: the Free
 *     tier is 30 trades a month (`PricingSection.tsx:24`), and analytics and backtesting are paid.
 *     Stating the cap here is what keeps the card honest.
 *   * "Private by default" is the one card that transfers unchanged, and it is checkable:
 *     `isPublic` is `boolean("is_public").default(false)` at `shared/schema.ts:61`, and every
 *     creation path in `server/routes.ts` sets it false.
 */
const CARDS = [
  {
    icon: Plug, title: 'Connect cTrader',
    body: 'Link a cTrader account and your fills import themselves — entry, stop, target and result, with no typing.',
    link: { label: 'See the plans', href: '/#pricing' },
  },
  {
    icon: PenLine, title: 'Any other broker',
    body: 'Not on cTrader? Enter trades by hand. The journal, analytics and drawdown tools work exactly the same.',
    link: null,
  },
  {
    icon: BadgeCheck, title: 'Free plan, not a trial',
    body: '$0 forever: core stats, the calendar and cTrader import, up to 30 trades a month. No card to start.',
    link: null,
  },
  {
    icon: Lock, title: 'Private by default',
    body: 'Your journal is yours. Nothing is shared or published unless you switch it on yourself.',
    link: null,
  },
];

export default function HomeValueStrip({ darkMode }: { darkMode: boolean }) {
  const t = homeTokens(darkMode);

  return (
    <section style={{ background: t.heroBg, padding: '64px 0 80px', transition: 'background 0.4s ease' }}>
      <div style={page()}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          {CARDS.map(({ icon: Icon, title, body, link }) => (
            <div key={title} style={{
              display: 'flex', flexDirection: 'column', gap: 10, padding: 24, borderRadius: 16,
              background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow,
              transition: 'transform 0.2s ease, border-color 0.2s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = t.accent; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = t.border; }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon size={19} color={t.accent} strokeWidth={2} aria-hidden />
                <h3 style={{ ...sans, fontSize: TYPE.cardTitle, fontWeight: 700, color: t.text, margin: 0 }}>{title}</h3>
              </div>
              <p style={{ ...sans, fontSize: TYPE.body, lineHeight: 1.7, color: t.muted, margin: 0, flex: 1 }}>{body}</p>
              {link && (
                <a href={link.href} style={{ ...sans, fontSize: TYPE.small, fontWeight: 600, color: t.accent, textDecoration: 'none' }}>
                  {link.label}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
