import { BarChart3, Calendar, Search } from 'lucide-react';
import HomeHeader from "@/components/HomeHeader";
import { usePublicTheme } from "@/context/PublicThemeContext";
import HomeFooter from "@/components/HomeFooter";
import PricingSection from "@/components/PricingSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import HomeStatsSection from "@/components/HomeStatsSection";
import HomeHero from "@/components/HomeHero";
import HomeShowcase from "@/components/HomeShowcase";
import HomeValueStrip from "@/components/HomeValueStrip";
import HomeConnectDiagram from "@/components/HomeConnectDiagram";
import HomeCopier from "@/components/HomeCopier";
import { display, sans, homeTokens, page, MEASURE, TYPE } from "@/components/homeTokens";

/**
 * HomePage — the landing page, re-laid-out 2026-10-07 on the reference design he supplied.
 *
 * HIS ASK: *"I want us to use this design for the landing page with our text. Dont copy it blindly...
 * we need the top text then the slideshow below it then everything follows well organized."*
 *
 * So this file is now a COMPOSITION, not a page: each band is its own component, in his order. It was
 * 225 lines holding the hero, two marquees and the brokers inline; adding three more sections to that
 * would have pushed it past 400.
 *
 * WHAT MOVED, so nothing is hunted for:
 *   hero (two columns -> one centred)        -> `HomeHero.tsx`
 *   the 13 product screens                   -> `HomeShowcase.tsx`   (NEW — his slideshow)
 *   four value cards                         -> `HomeValueStrip.tsx` (NEW)
 *   the brokers marquee + connector diagram  -> `HomeConnectDiagram.tsx` (NEW; the marquee was its
 *                                               own section here and is now folded in beside the
 *                                               claim it is the evidence for)
 *   the shared colours and type roles        -> `homeTokens.ts`
 *
 * WHAT WAS DELETED: the trust marquee — a scrolling strip of six claims that sat between the hero and
 * "How it works". Everything it said is now stated properly in the hero chips and the four value
 * cards, and two scrolling strips within one screen of each other read as clutter. Agreed with him in
 * the plan of 2026-10-07; it is in git if he wants it back.
 *
 * ⚠ "Trusted by 10,000+ retail traders" IS GONE FROM THIS PAGE, on his decision of 2026-10-07
 * (option A1). It was an unverifiable number and it appeared twice. The second copy lived in
 * `HomeStatsSection.tsx` and went in the same change — if one comes back, check the other.
 */

const steps = [
  // ⚠ "MT4/MT5" WAS FALSE AND IS THE REASON HE FLAGGED THIS PAGE. The platform integrates cTrader
  // and nothing else; a MetaTrader user can still journal by hand, but nothing auto-imports for them.
  { n: "01", icon: <Search size={20} />,    title: "Connect your broker",       desc: "Link your cTrader account in seconds. Trades import automatically — no manual entry needed." },
  { n: "02", icon: <Calendar size={20} />,  title: "Log & journal trades",      desc: "Capture context, screenshots, and psychology for every trade. Build a searchable decision database." },
  { n: "03", icon: <BarChart3 size={20} />, title: "Analyse & build your edge", desc: "Spot patterns in wins and losses. Refine strategy, timing, and execution habits with AI insights." },
];

// ⚠ ONLY BROKERS THAT ACTUALLY OFFER cTRADER — his instruction, 2026-10-06. The old list was 18 and
// mostly wrong: of those, only Pepperstone, IC Markets, FxPro and FP Markets offer cTrader at all.
// OANDA, XM, Exness, FXCM, AvaTrade, Tickmill, Admirals, Axi, LMAX, InstaForex, HFM, ThinkMarkets,
// Vantage and EasyMarkets do not — Axi explicitly discontinued it. Listing them told a MetaTrader
// user their trades would import automatically, and they would not.
//
// ⚠ EVERY NAME BELOW IS ONE I VERIFIED. If more are added, verify first — this list is a promise
// about what will auto-sync, and a wrong one is a support ticket at best.
//
// "50+ brokers" STAYS TRUE and is deliberately conservative: over 250 brokers and prop firms offer
// cTrader, so anyone on one of them can connect. These nine are the well-known examples.
const BROKERS = [
  "Pepperstone", "IC Markets", "FxPro", "FP Markets", "Fusion Markets",
  "BlackBull Markets", "GO Markets", "Blueberry Markets", "Purple Trading",
];

export default function HomePage() {
  const { darkMode, setDarkMode } = usePublicTheme();
  const dm = darkMode;
  const t  = homeTokens(dm);

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, transition: 'all 0.4s ease', ...sans }}>
      <style>{`@keyframes hp-mq{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}.hp-mq{display:inline-flex;animation:hp-mq 44s linear infinite}@media (prefers-reduced-motion:reduce){.hp-mq{animation:none}}`}</style>
      <HomeHeader darkMode={dm} setDarkMode={setDarkMode} activePath="/" />

      <HomeHero darkMode={dm} />
      <HomeShowcase darkMode={dm} />
      <HomeValueStrip darkMode={dm} />
      <HomeConnectDiagram darkMode={dm} brokers={BROKERS} />
      <HomeCopier darkMode={dm} />

      {/* ── How it works ─────────────────────────────────────────────── */}
      {/* `id="features"` is the header's Features link — renaming it breaks that nav item. */}
      <section id="features" style={{ padding: '96px 0', background: t.bg2, transition: 'all 0.4s ease' }}>
        <div style={page()}>
          <h2 style={{ ...display, fontSize: 'clamp(1.7rem,2.8vw,2.4rem)', textAlign: 'center', marginBottom: 12, color: t.text, fontWeight: 700 }}>
            How Daily Trade Book works
          </h2>
          <p style={{ textAlign: 'center', fontSize: TYPE.lead, color: t.muted, maxWidth: MEASURE, margin: '0 auto 72px', lineHeight: 1.75, ...sans }}>
            From broker connection to edge-building in three steps — no manual entry, no hassle.
          </p>
          <div className="grid md:grid-cols-3 gap-12">
            {steps.map((s, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                  <span style={{ ...display, fontSize: '2.55rem', lineHeight: 1, color: t.accentSoft, fontWeight: 400 }}>{s.n}</span>
                  <div style={{ width: 38, height: 38, borderRadius: 10, border: `1.5px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.accent, flexShrink: 0 }}>
                    {s.icon}
                  </div>
                </div>
                <h3 style={{ ...sans, fontSize: TYPE.cardTitle, fontWeight: 700, marginBottom: 10, color: t.text }}>{s.title}</h3>
                <p style={{ fontSize: TYPE.body, color: t.muted, lineHeight: 1.8, ...sans }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <HomeStatsSection darkMode={dm} />
      <PricingSection darkMode={dm} />
      <TestimonialsSection darkMode={dm} />
      <HomeFooter darkMode={dm} />
    </div>
  );
}
