import { Users, Radio, GitFork, Send } from 'lucide-react';
import { display, sans, homeTokens, page, MEASURE, TYPE } from '@/components/homeTokens';

/**
 * HomeCopier — what the FX Copier is. Added 2026-10-10.
 *
 * HIS ASK: *"i have realized the landing page makes no mention of fx copier that we have."*
 *
 * ⚠ HIS WORDING WAS SLIGHTLY OFF AND THE CORRECTION MATTERS, because it says what was actually
 * missing. The copier WAS named in four places — a chip in the hero (HomeHero.tsx:30), a slideshow
 * slide (HomeShowcase.tsx:42) and two pricing bullets (PricingSection.tsx:40,47). What was missing
 * is that none of them say what it DOES, and it was absent from the connector diagram, which is the
 * one place on the page that lists what you get. That is the gap this fills.
 *
 * THE COPY IS THE APP'S OWN WORDING, lifted from the setup screen the user actually sees
 * (client/src/components/copy/redesign/QcRoleStep.tsx:4-7). Written fresh it would drift from what
 * the product does within one edit; taken from the screen that configures it, it cannot.
 *
 * ⚠ BEFORE TRUSTING THIS PAGE, CHECK THE KILL SWITCH. `COPY_DRY_RUN` is a production environment
 * variable (confirmed present on the live app and on its preview copy, 2026-10-10). While it is ON,
 * copy_platform/dispatcher.py:390 computes the entire copy — filters, sizing, risk cap — then logs
 * "WOULD OPEN ... nothing sent" and returns, so NOTHING reaches the broker. The last recorded check
 * (2026-09-26) found it ON, with zero follower trades for two months.
 *
 * I COULD NOT READ TODAY'S VALUE: Coolify never returns variable values, nothing logs the flag at
 * boot, and no copy had been attempted since the container restarted, so the logs were silent on it
 * either way. This section therefore describes what the copier IS and what you can set up — it does
 * not promise that trades are being mirrored right now. If the switch is off and copies are flowing,
 * that wording can be made stronger; if it is on, this section is still truthful as written.
 */

/** Straight from the setup screen — see the note above. Do not reword without changing it there. */
const MODES = [
  {
    icon: Users, title: 'Copy a provider',
    body: "Mirror a verified provider's trades into your account, automatically — with your own lot sizing and risk caps.",
  },
  {
    icon: Radio, title: 'Be the provider',
    body: 'Broadcast your trades from a master account — followers copy you in real time.',
  },
  {
    icon: GitFork, title: 'Copy yourself',
    body: 'Mirror trades between two of your own connected accounts — source to target.',
  },
  {
    icon: Send, title: 'Copy a Telegram channel',
    body: 'Parse and auto-execute trade signals from a Telegram channel onto your account.',
  },
];

export default function HomeCopier({ darkMode }: { darkMode: boolean }) {
  const t = homeTokens(darkMode);

  return (
    <section id="copier" style={{ background: t.bg2, padding: '88px 0', transition: 'background 0.4s ease' }}>
      <div style={page()}>
        <p style={{ ...sans, textAlign: 'center', fontSize: TYPE.small, fontWeight: 700,
                    letterSpacing: '0.12em', textTransform: 'uppercase', color: t.accent,
                    margin: '0 0 14px' }}>
          FX Copier
        </p>
        <h2 style={{ ...display, fontSize: 'clamp(1.8rem,3.4vw,2.9rem)', fontWeight: 800,
                     textAlign: 'center', color: t.text, margin: '0 0 14px', lineHeight: 1.15,
                     letterSpacing: '-0.02em' }}>
          One trade. Every account.
        </h2>
        <p style={{ ...sans, textAlign: 'center', fontSize: TYPE.lead, color: t.muted,
                    lineHeight: 1.75, maxWidth: MEASURE, margin: '0 auto 56px' }}>
          Four ways to use it, all on cTrader, all with your own sizing and risk limits on top.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          {MODES.map(({ icon: Icon, title, body }) => (
            <div key={title} style={{
              display: 'flex', flexDirection: 'column', gap: 10, padding: 24, borderRadius: 16,
              background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow,
              transition: 'transform 0.2s ease, border-color 0.2s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = t.accent; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = t.border; }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon size={19} color={t.accent} strokeWidth={2} aria-hidden />
                <h3 style={{ ...sans, fontSize: TYPE.cardTitle, fontWeight: 700, color: t.text, margin: 0 }}>
                  {title}
                </h3>
              </div>
              <p style={{ ...sans, fontSize: TYPE.body, lineHeight: 1.7, color: t.muted, margin: 0, flex: 1 }}>
                {body}
              </p>
            </div>
          ))}
        </div>

        {/* The limits are the ones in PricingSection, so the two cannot disagree. */}
        <p style={{ ...sans, textAlign: 'center', fontSize: TYPE.small, color: t.muted, margin: '28px 0 0' }}>
          Included as an add-on from the Monthly plan — 1 master and 2 followed accounts, or 2 and 4 on Yearly.{' '}
          <a href="/#pricing" style={{ color: t.accent, fontWeight: 600, textDecoration: 'none' }}>
            See the plans &rarr;
          </a>
        </p>
      </div>
    </section>
  );
}
