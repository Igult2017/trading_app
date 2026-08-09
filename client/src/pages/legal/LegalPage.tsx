/** /legal — the shell: navigation, layout, theming. The documents live in ./docs.
 *
 * Replaces the old single 562-line pages/LegalPage.tsx, which held three documents, a support form
 * and an FAQ in one file. Contact & Support moved OUT of "Legal" — a support form is not a legal
 * document — and now lives on the Legal Notice page as a contact and complaints route.
 *
 * Design follows the reference page supplied 2026-08-08: light ground, serif headings, definition
 * bullets, bordered callouts. Dark mode is carried too; the public site has one.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import SEOHead from '@/components/SEOHead';
import { usePublicTheme } from '@/context/PublicThemeContext';
import { tokens, SERIF, SANS } from './legalUI';
import Terms from './docs/terms';
import Privacy from './docs/privacy';
import Risk from './docs/risk';
import Refunds from './docs/refunds';
import Notice from './docs/notice';
import { AcceptableUse, Cookies } from './docs/useAndCookies';

const DOCS = [
  { param: 'terms',    label: 'Terms of Service',    Body: Terms },
  { param: 'risk',     label: 'Risk & No Advice',    Body: Risk },
  { param: 'privacy',  label: 'Privacy Policy',      Body: Privacy },
  { param: 'cookies',  label: 'Cookie Policy',       Body: Cookies },
  { param: 'refunds',  label: 'Cancellation & Refunds', Body: Refunds },
  { param: 'use',      label: 'Acceptable Use',      Body: AcceptableUse },
  { param: 'notice',   label: 'Legal Notice & Complaints', Body: Notice },
] as const;

export default function LegalPage() {
  const { darkMode: dm } = usePublicTheme();
  const [location] = useLocation();
  const [active, setActive] = useState<string>('terms');
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

  const current = DOCS.find(d => d.param === active) ?? DOCS[0];
  const Body = current.Body;

  const navBtn = (on: boolean) => ({
    display: 'block', width: '100%', textAlign: 'left' as const, cursor: 'pointer',
    fontFamily: SANS, fontSize: 13, fontWeight: on ? 600 : 400,
    color: on ? t.accent : t.dim,
    background: on ? (dm ? 'rgba(122,167,255,0.10)' : '#eef3fe') : 'transparent',
    border: 'none', borderRadius: 7, padding: '9px 12px', marginBottom: 2,
    transition: 'color .15s, background .15s',
  });

  return (
    <>
      <SEOHead
        title="Legal — Terms, Privacy, Risk Disclosure"
        description="Trade & Journal's terms of service, privacy policy, risk disclosure, cookie policy, refund terms, acceptable use and legal notice."
        canonical="/legal"
        noindex={false}
      />
      <div style={{ minHeight: '100vh', background: t.bg, transition: 'background .3s' }}>
        <style>{`
          .lg-wrap { display:flex; gap:36px; align-items:flex-start; }
          .lg-side { flex-shrink:0; width:232px; position:sticky; top:96px; }
          .lg-tabs { display:none; }
          .lg-main { flex:1; min-width:0; }
          @media (max-width:860px) {
            .lg-wrap { flex-direction:column; gap:0; }
            .lg-side { display:none; }
            .lg-tabs { display:flex; overflow-x:auto; gap:6px; padding:0 0 16px; scrollbar-width:none; }
            .lg-tabs::-webkit-scrollbar { display:none; }
            .lg-main { width:100%; }
          }
        `}</style>

        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px 96px' }}>
          <div className="lg-tabs">
            {DOCS.map(d => (
              <button key={d.param} onClick={() => go(d.param)}
                      style={{ ...navBtn(active === d.param), width: 'auto', whiteSpace: 'nowrap', marginBottom: 0 }}>
                {d.label}
              </button>
            ))}
          </div>

          <div className="lg-wrap">
            <nav className="lg-side" aria-label="Legal documents">
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, letterSpacing: '0.09em',
                            textTransform: 'uppercase', color: t.dim, padding: '0 12px 10px' }}>
                Legal
              </div>
              {DOCS.map(d => (
                <button key={d.param} onClick={() => go(d.param)}
                        aria-current={active === d.param ? 'page' : undefined}
                        style={navBtn(active === d.param)}>
                  {d.label}
                </button>
              ))}
            </nav>

            <main className="lg-main">
              <article style={{ background: t.card, border: `1px solid ${t.rule}`, borderRadius: 14,
                                padding: 'clamp(24px,4vw,52px)', fontFamily: SERIF }}>
                <Body dm={dm} />
              </article>
              <p style={{ fontFamily: SANS, fontSize: 12, color: t.dim, textAlign: 'center',
                          margin: '22px 0 0', lineHeight: 1.6 }}>
                These documents describe the service as it operates today. We are a software provider
                and hold no financial services authorisation.
              </p>
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
