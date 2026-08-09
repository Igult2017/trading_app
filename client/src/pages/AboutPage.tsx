/** /about — who we are and what this is.
 *
 * Added 2026-08-08 ("add about page"). Shares the legal pages' layout language: light ground, serif
 * headings, single centred column, no navigation chrome.
 *
 * EVERY CLAIM HERE MUST STAY TRUE AND MUST MATCH THE LEGAL PAGES. An About page is where marketing
 * copy usually drifts into implying a track record, a licence, or a promise of returns — which would
 * contradict the Risk Disclosure sitting one click away and would be the first thing quoted back in
 * a complaint. No performance claims, no "we are regulated", no guarantees.
 */
import SEOHead from '@/components/SEOHead';
import { usePublicTheme } from '@/context/PublicThemeContext';
import { tokens, SERIF, SANS, H1, H2, P, DL, Note } from './legal/legalUI';

export default function AboutPage() {
  const { darkMode: dm } = usePublicTheme();
  const t = tokens(dm);

  return (
    <>
      <SEOHead
        title="About Trade & Journal"
        description="What Trade & Journal is, who builds it, and what it does not do. A trading journal, analytics, and copy trading for retail traders."
        canonical="/about"
        noindex={false}
      />
      <div style={{ minHeight: '100vh', background: t.bg, transition: 'background .3s' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(36px,6vw,72px) 24px 110px' }}>
          <article style={{ fontFamily: SERIF }}>
            <H1 dm={dm}>About</H1>
            <p style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 700, color: t.ink, margin: '0 0 22px' }}>
              Trade &amp; Journal — a trading journal that tells you the truth about your own trading.
            </p>

            <P dm={dm}>
              Most traders lose money and cannot say exactly why. The reasons are usually in their own
              history — the same setup taken at the wrong session, the stop moved for the third time
              that week, the winning strategy abandoned after two losses. That record is the most
              useful thing a trader owns, and almost nobody keeps it properly.
            </P>
            <P dm={dm}>
              This platform exists to keep it. You log what you did and why; it shows you the pattern
              you could not see from inside it.
            </P>

            <H2 dm={dm}>What it does</H2>
            <DL dm={dm} items={[
              ['The journal.', 'Log every trade with the screenshot, the reasoning and the state of mind behind it. This is the core of the product and the reason to use it.'],
              ['The analytics.', 'Win rate, expectancy, drawdown, performance by session, by pair, by setup, by how you felt. Your own numbers, not a benchmark.'],
              ['Copy trading.', 'Connect your own broker account and follow another user, or list your own account for others to follow. You choose the sizing and the limits, and you can stop at any time.'],
              ['Signals.', 'Trade setups published for education, including through Telegram. They show how a method is applied. They are not advice and not tailored to you.'],
            ]} />

            <H2 dm={dm}>What it is not</H2>
            <Note dm={dm} tone="warn">
              We are a software company, not a financial one. <strong>We are not a broker, not an
              adviser, and not authorised or regulated anywhere.</strong> We never hold your money —
              your funds stay with your own broker at all times. Nothing here is a recommendation to
              buy or sell anything, and nobody here can tell you what is right for your situation.
              Trading loses money for most people who try it.
            </Note>
            <P dm={dm}>
              You can read the detail in our{' '}
              <a href="/legal?tab=risk" style={{ color: t.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                Risk Disclosure
              </a>. We would rather you read it before you spend anything.
            </P>

            <H2 dm={dm}>Who builds it</H2>
            <P dm={dm}>
              A one-person company. It is built and operated from Kenya by a trader who wanted this
              tool to exist and could not find one that did the job, and it is used by traders around
              the world. The operating entity is being registered; those details will appear on the{' '}
              <a href="/legal?tab=notice" style={{ color: t.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                Legal Notice
              </a>{' '}page as soon as they exist.
            </P>

            <H2 dm={dm}>How we treat your data</H2>
            <P dm={dm}>
              Your journal is a private record and we treat it as one. We do not sell your data and
              we never share your individual trading history. You can export everything you have
              logged at any time, and you can have all of it deleted. There is no advertising or
              tracking on this platform. The full account is in the{' '}
              <a href="/legal?tab=privacy" style={{ color: t.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                Privacy &amp; Cookies
              </a>{' '}page.
            </P>

            <H2 dm={dm}>Talk to us</H2>
            <P dm={dm}>
              It is a small operation, so the person who replies is the person who built it. Use the{' '}
              <a href="/support" style={{ color: t.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                support page
              </a>{' '}or email <strong>support@tradeandjournal.com</strong>. We reply within 24–48
              hours on weekdays.
            </P>
          </article>

          <footer style={{ marginTop: 52, paddingTop: 22, borderTop: `1px solid ${t.rule}` }}>
            <p style={{ fontFamily: SANS, fontSize: 12, lineHeight: 1.7, color: t.dim, margin: 0 }}>
              Trade &amp; Journal is a software provider and holds no financial services
              authorisation. Trading carries a high risk of loss.
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
