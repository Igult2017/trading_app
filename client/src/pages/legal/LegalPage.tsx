/** /legal — one document, one centred column, no sidebar.
 *
 * The sidebar and the mobile tab rail were REMOVED on 2026-08-08: "we are doing away with sidebar in
 * the legal pages". The reference page the user is matching has no navigation chrome at all — you
 * move between documents through the links in each document's opening paragraph, which DocHeader
 * renders. Do not reintroduce a rail.
 *
 * Text sits directly on the page ground, not in a card, for the same reason.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import SEOHead from '@/components/SEOHead';
import { usePublicTheme } from '@/context/PublicThemeContext';
import { tokens, SERIF, SANS, DocHeader } from './legalUI';
import { DOCS, docByParam } from './docsIndex';
import Terms from './docs/terms';
import Privacy from './docs/privacy';
import Risk from './docs/risk';
import Refunds from './docs/refunds';
import Notice from './docs/notice';
import { AcceptableUse, Cookies } from './docs/useAndCookies';

const BODIES: Record<string, (p: { dm: boolean }) => JSX.Element> = {
  terms: Terms, risk: Risk, privacy: Privacy, cookies: Cookies,
  refunds: Refunds, use: AcceptableUse, notice: Notice,
};

export default function LegalPage() {
  const { darkMode: dm } = usePublicTheme();
  const [location] = useLocation();
  const [active, setActive] = useState('terms');
  const t = tokens(dm);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('tab');
    if (p && DOCS.some(d => d.param === p)) setActive(p);
  }, [location]);

  function go(param: string) {
    setActive(param);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', param);
    window.history.pushState({}, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const Body = BODIES[active] ?? Terms;

  return (
    <>
      <SEOHead
        title={`${docByParam(active).title} — Trade & Journal`}
        description="Trade & Journal's terms of service, risk disclosure, privacy policy, cookie policy, refund terms, acceptable use and legal notice."
        canonical="/legal"
        noindex={false}
      />
      <div style={{ minHeight: '100vh', background: t.bg, transition: 'background .3s' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(36px,6vw,72px) 24px 110px' }}>
          <article style={{ fontFamily: SERIF }}>
            <DocHeader dm={dm} param={active} go={go} />
            <Body dm={dm} />
          </article>

          <footer style={{ marginTop: 56, paddingTop: 22, borderTop: `1px solid ${t.rule}` }}>
            <p style={{ fontFamily: SANS, fontSize: 12, lineHeight: 1.7, color: t.dim, margin: 0 }}>
              These documents describe the service as it operates today. We are a software provider
              and hold no financial services authorisation. Questions: legal@tradeandjournal.com
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
