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
import { useSearch, useLocation } from 'wouter';
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
  // useSearch, NOT useLocation. wouter's useLocation returns the PATHNAME ONLY, and the footer links
  // here differ only in their query string (/legal?tab=terms vs ?tab=privacy). Because the footer
  // uses wouter's <Link>, clicking is client-side with no reload — so with useLocation the pathname
  // never changed, the effect below never re-ran, and clicking a different legal link did nothing at
  // all once you were already on /legal. Reported 2026-08-08: "I am clicking some and I can't see
  // change in the pages". useSearch subscribes to the query string, which is what actually changes.
  const search = useSearch();
  const [, navigate] = useLocation();
  const [active, setActive] = useState('terms');
  const t = tokens(dm);

  // Links that predate the 2026-08-08 rebuild. Without this, ?tab=contact fell through to Terms and
  // showed the wrong document with no sign anything was wrong — the footer pointed there for months.
  const LEGACY: Record<string, string> = { contact: 'notice' };

  useEffect(() => {
    const raw = new URLSearchParams(search).get('tab');
    const p = raw ? (LEGACY[raw] ?? raw) : null;
    if (p && DOCS.some(d => d.param === p)) setActive(p);
  }, [search]);

  // Navigate through wouter, not window.history. A raw pushState updates the address bar but wouter
  // never sees it, so useSearch would keep returning the old query and the two navigation routes
  // (footer links vs the cross-links inside a document) would drift apart. The URL is the single
  // source of truth; the effect above turns it into state. Back and forward work as a result.
  function go(param: string) {
    navigate(`/legal?tab=${param}`);
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
