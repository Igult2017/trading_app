import { useState } from 'react';
import { useLocation } from 'wouter';
import HomeHeader from '@/components/HomeHeader';
import HomeFooter from '@/components/HomeFooter';

const SECTIONS = ['Privacy Policy', 'Terms of Service', 'Contact & Support'] as const;
type Section = typeof SECTIONS[number];

/* ── Shared typography helpers ─────────────────────────────────────────────── */
function SectionLabel({ children, color = '#2563eb' }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function DocHeading({ children, dm }: { children: React.ReactNode; dm: boolean }) {
  return (
    <h2 style={{
      fontFamily: "'Montserrat',sans-serif", fontSize: 11, fontWeight: 800,
      letterSpacing: '0.12em', textTransform: 'uppercase',
      color: dm ? '#94a3b8' : '#64748b',
      marginTop: 36, marginBottom: 12, paddingBottom: 10,
      borderBottom: `1px solid ${dm ? '#172233' : '#f1f5f9'}`,
    }}>
      {children}
    </h2>
  );
}

function Para({ children, dm }: { children: React.ReactNode; dm: boolean }) {
  return (
    <p style={{ fontSize: 13, fontWeight: 500, color: dm ? '#8aa0b8' : '#475569', lineHeight: 1.9, marginBottom: 14, marginTop: 0 }}>
      {children}
    </p>
  );
}

function Li({ children, dm }: { children: React.ReactNode; dm: boolean }) {
  return (
    <li style={{ fontSize: 13, fontWeight: 500, color: dm ? '#8aa0b8' : '#475569', lineHeight: 1.9, marginBottom: 8 }}>
      {children}
    </li>
  );
}

/* ── Privacy ────────────────────────────────────────────────────────────────── */
function PrivacyContent({ dm }: { dm: boolean }) {
  const hi = dm ? '#c8d8e8' : '#1e293b';
  return (
    <div>
      <Para dm={dm}>
        Effective Date: January 1, 2025. My FM | Journal ("we", "us", or "our") is committed to protecting your privacy.
        This Privacy Policy explains how we collect, use, and safeguard your information when you visit our website and use our services.
      </Para>

      <DocHeading dm={dm}>Information We Collect</DocHeading>
      <Para dm={dm}>We may collect the following types of information:</Para>
      <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
        <Li dm={dm}><strong style={{ color: hi }}>Account Information:</strong> Name, email address, and password when you register.</Li>
        <Li dm={dm}><strong style={{ color: hi }}>Journal Data:</strong> Trade entries, notes, screenshots, and performance data you input into the trading journal.</Li>
        <Li dm={dm}><strong style={{ color: hi }}>Usage Data:</strong> Pages visited, features used, and time spent on the platform.</Li>
        <Li dm={dm}><strong style={{ color: hi }}>Device Data:</strong> Browser type, IP address, and operating system for security and analytics purposes.</Li>
      </ul>

      <DocHeading dm={dm}>How We Use Your Information</DocHeading>
      <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
        <Li dm={dm}>To provide, maintain, and improve our trading journal and analytics tools.</Li>
        <Li dm={dm}>To authenticate your account and protect against unauthorized access.</Li>
        <Li dm={dm}>To send service-related communications and support responses.</Li>
        <Li dm={dm}>To analyze usage patterns and improve platform performance.</Li>
        <Li dm={dm}>To comply with legal obligations.</Li>
      </ul>

      <DocHeading dm={dm}>Data Security</DocHeading>
      <Para dm={dm}>
        We implement industry-standard security measures including encryption at rest and in transit, secure authentication, and regular security audits.
        Your trade journal data is private to your account and is never shared with or sold to third parties.
      </Para>

      <DocHeading dm={dm}>Data Retention</DocHeading>
      <Para dm={dm}>
        We retain your account data for as long as your account is active. You may request deletion of your account and associated data at any time by contacting our support team.
      </Para>

      <DocHeading dm={dm}>Cookies</DocHeading>
      <Para dm={dm}>
        We use essential cookies to maintain your session and preferences. We do not use advertising cookies or sell your data to advertisers.
      </Para>

      <DocHeading dm={dm}>Third-Party Services</DocHeading>
      <Para dm={dm}>
        We may use third-party services for hosting and analytics. These providers are contractually obligated to keep your data confidential and use it only to provide services to us.
      </Para>

      <DocHeading dm={dm}>Your Rights</DocHeading>
      <Para dm={dm}>
        You have the right to access, correct, or delete your personal data. You may also request a copy of the data we hold about you. Contact us at the address below to exercise these rights.
      </Para>

      <DocHeading dm={dm}>Changes to This Policy</DocHeading>
      <Para dm={dm}>
        We may update this Privacy Policy from time to time. We will notify you of significant changes by posting a notice on our website or emailing you directly.
      </Para>

      <DocHeading dm={dm}>Contact</DocHeading>
      <Para dm={dm}>
        For privacy-related inquiries, please contact us via our Support page or email{' '}
        <strong style={{ color: '#2563eb' }}>privacy@myfmjournal.com</strong>.
      </Para>
    </div>
  );
}

/* ── Terms ──────────────────────────────────────────────────────────────────── */
function TermsContent({ dm }: { dm: boolean }) {
  return (
    <div>
      <Para dm={dm}>
        Effective Date: January 1, 2025. By accessing or using My FM | Journal, you agree to be bound by these Terms of Service.
        Please read them carefully before using our platform.
      </Para>

      <DocHeading dm={dm}>Acceptance of Terms</DocHeading>
      <Para dm={dm}>
        By creating an account or using any part of our services, you agree to these Terms. If you do not agree, you must not use My FM | Journal.
      </Para>

      <DocHeading dm={dm}>Description of Service</DocHeading>
      <Para dm={dm}>
        My FM | Journal provides an online trading journal, analytics tools, market session clock, economic calendar, and educational content.
        Our services are intended for informational and record-keeping purposes only.
      </Para>

      <DocHeading dm={dm}>Risk Disclaimer</DocHeading>
      <Para dm={dm}>
        Trading financial instruments involves substantial risk of loss and is not suitable for every investor. My FM | Journal provides
        educational content and analytical tools for informational purposes only. Nothing on this platform constitutes financial,
        investment, or trading advice. Past performance is not indicative of future results. Never trade with money you cannot afford to lose.
      </Para>

      <DocHeading dm={dm}>Account Responsibilities</DocHeading>
      <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
        <Li dm={dm}>You must be at least 18 years of age to use our services.</Li>
        <Li dm={dm}>You are responsible for maintaining the confidentiality of your account credentials.</Li>
        <Li dm={dm}>You are responsible for all activity that occurs under your account.</Li>
        <Li dm={dm}>You must provide accurate and truthful information during registration.</Li>
      </ul>

      <DocHeading dm={dm}>Prohibited Conduct</DocHeading>
      <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
        <Li dm={dm}>Attempting to gain unauthorized access to any part of the platform.</Li>
        <Li dm={dm}>Uploading malicious code, viruses, or harmful content.</Li>
        <Li dm={dm}>Using the platform for any illegal or fraudulent purpose.</Li>
        <Li dm={dm}>Reverse engineering or attempting to extract proprietary algorithms or data.</Li>
        <Li dm={dm}>Sharing your account with others or reselling access to our services.</Li>
      </ul>

      <DocHeading dm={dm}>Intellectual Property</DocHeading>
      <Para dm={dm}>
        All content on My FM | Journal, including text, graphics, logos, software, and data analysis tools, is the property of My FM | Journal
        and is protected by applicable intellectual property laws. You may not reproduce, distribute, or create derivative works without our express written permission.
      </Para>

      <DocHeading dm={dm}>Limitation of Liability</DocHeading>
      <Para dm={dm}>
        My FM | Journal shall not be liable for any direct, indirect, incidental, special, or consequential damages arising from
        your use of or inability to use our services, including but not limited to trading losses, data loss, or service interruptions.
      </Para>

      <DocHeading dm={dm}>Service Availability</DocHeading>
      <Para dm={dm}>
        We strive to maintain high availability but do not guarantee uninterrupted access. We reserve the right to modify, suspend,
        or discontinue any part of our service at any time without liability.
      </Para>

      <DocHeading dm={dm}>Termination</DocHeading>
      <Para dm={dm}>
        We reserve the right to suspend or terminate your account at our discretion if you violate these Terms. You may also delete your account at any time by contacting support.
      </Para>

      <DocHeading dm={dm}>Governing Law</DocHeading>
      <Para dm={dm}>
        These Terms shall be governed by and construed in accordance with applicable law. Any disputes shall be resolved through binding arbitration or in the courts of applicable jurisdiction.
      </Para>

      <DocHeading dm={dm}>Changes to Terms</DocHeading>
      <Para dm={dm}>
        We reserve the right to update these Terms at any time. Continued use of the platform after changes constitutes acceptance of the new Terms.
      </Para>
    </div>
  );
}

/* ── Contact ────────────────────────────────────────────────────────────────── */
function ContactContent({ dm }: { dm: boolean }) {
  const [form, setForm]     = useState({ user_name: '', user_email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError]   = useState('');

  const hi = dm ? '#c8d8e8' : '#1e293b';
  const cardBg  = dm ? '#0c1219' : '#f8fafc';
  const cardBrd = dm ? '#172233' : '#e2e8f0';
  const inp: React.CSSProperties = {
    background: dm ? '#080c10' : '#ffffff',
    border: `1px solid ${dm ? '#172233' : '#e2e8f0'}`,
    borderRadius: 8, padding: '11px 14px',
    color: dm ? '#c8d8e8' : '#0f172a',
    fontSize: 13, fontWeight: 500, outline: 'none',
    width: '100%', boxSizing: 'border-box',
    fontFamily: "'Poppins', sans-serif",
    transition: 'border-color 0.2s',
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending'); setError('');
    try {
      const r = await fetch('/api/support/ticket', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, priority: 'Medium', channel: 'email' }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed to send ticket');
      setStatus('sent');
      setForm({ user_name: '', user_email: '', subject: '', message: '' });
    } catch (err: any) { setStatus('error'); setError(err.message || 'Failed to send ticket'); }
  }

  return (
    <div>
      <Para dm={dm}>
        Have a question, found a bug, or need help with your account? Fill in the form below and our support team will respond within 24–48 hours.
        You can also reach us at <strong style={{ color: '#2563eb' }}>support@myfmjournal.com</strong>.
      </Para>

      {/* Quick info cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: 32 }}>
        {[
          { label: 'Email', value: 'support@myfmjournal.com', color: '#2563eb' },
          { label: 'Response Time', value: '24 – 48 hours', color: '#10b981' },
          { label: 'Hours', value: 'Mon – Fri, 9am – 6pm UTC', color: '#8b5cf6' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: color, marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: dm ? '#c8d8e8' : '#1e293b', lineHeight: 1.4 }}>{value}</div>
          </div>
        ))}
      </div>

      <DocHeading dm={dm}>Frequently Asked Questions</DocHeading>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
        {[
          { q: 'How do I reset my password?', a: 'Use the "Forgot Password" link on the login page.' },
          { q: 'Is my journal data private?',  a: 'Yes, your data is encrypted and only visible to you.' },
          { q: 'Can I export my trades?',      a: 'Export functionality is available in the Analytics section.' },
          { q: 'How do I delete my account?',  a: 'Submit a ticket below with the subject "Account Deletion".' },
        ].map(({ q, a }) => (
          <div key={q} style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 12 }}>
            <div style={{ width: 3, borderRadius: 99, background: '#2563eb', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: hi, marginBottom: 3 }}>{q}</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: dm ? '#64748b' : '#64748b' }}>{a}</div>
            </div>
          </div>
        ))}
      </div>

      <DocHeading dm={dm}>Send a Support Ticket</DocHeading>
      {status === 'sent' ? (
        <div style={{ background: dm ? '#0d1f12' : '#f0fdf4', border: `1px solid ${dm ? '#166534' : '#bbf7d0'}`, borderRadius: 12, padding: '28px', textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#10b981', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 20, fontWeight: 900 }}>✓</span>
          </div>
          <p style={{ fontWeight: 800, fontSize: 15, color: '#10b981', marginBottom: 6 }}>Ticket submitted successfully!</p>
          <p style={{ fontSize: 13, color: dm ? '#8aa0b8' : '#64748b', marginBottom: 16 }}>Our team will get back to you within 24–48 hours.</p>
          <button onClick={() => setStatus('idle')} style={{ background: '#2563eb', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#fff', fontWeight: 800, fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
            SEND ANOTHER
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input style={inp} placeholder="Your name" value={form.user_name} onChange={e => setForm(p => ({ ...p, user_name: e.target.value }))} required />
            <input style={inp} placeholder="Your email" type="email" value={form.user_email} onChange={e => setForm(p => ({ ...p, user_email: e.target.value }))} required />
          </div>
          <input style={inp} placeholder="Subject" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} required />
          <textarea style={{ ...inp, minHeight: 130, resize: 'vertical' }} placeholder="How can we help?" value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} required />
          {status === 'error' && <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={status === 'sending'} style={{ background: status === 'sending' ? '#1e3a6e' : '#2563eb', border: 'none', borderRadius: 8, padding: '13px 24px', color: '#fff', fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: status === 'sending' ? 'not-allowed' : 'pointer', opacity: status === 'sending' ? 0.7 : 1, transition: 'background 0.2s', fontFamily: "'Poppins', sans-serif" }}>
            {status === 'sending' ? 'Sending…' : 'Submit Ticket'}
          </button>
        </form>
      )}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */
const HERO: Record<Section, { icon: string; title: string; sub: string; color: string }> = {
  'Privacy Policy':    { icon: '🔒', title: 'Privacy Policy',    sub: 'How we collect, use, and protect your data.',                  color: '#8b5cf6' },
  'Terms of Service':  { icon: '📋', title: 'Terms of Service',   sub: 'Rules and responsibilities for using My FM | Journal.',        color: '#2563eb' },
  'Contact & Support': { icon: '💬', title: 'Contact & Support',  sub: 'Reach our team or browse answers to common questions.',        color: '#10b981' },
};

export default function LegalPage() {
  const [active, setActive]     = useState<Section>('Privacy Policy');
  const [location]              = useLocation();
  const [darkMode, setDarkMode] = useState(false);
  const dm = darkMode;

  const pageBg  = dm ? '#080c10' : '#f8fafc';
  const cardBg  = dm ? '#0c1219' : '#ffffff';
  const border  = dm ? '#172233' : '#e2e8f0';
  const textPrim= dm ? '#f1f5f9' : '#0f172a';
  const textMut = dm ? '#64748b' : '#94a3b8';
  const heroBg  = dm ? '#060b14' : 'rgba(241,245,249,0.8)';
  const hero    = HERO[active];

  return (
    <div style={{ minHeight: '100vh', background: pageBg, fontFamily: "'Poppins', sans-serif", transition: 'background 0.3s' }}>
      <HomeHeader darkMode={darkMode} setDarkMode={setDarkMode} activePath={location} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ background: heroBg, borderBottom: `1px solid ${border}`, padding: '52px 24px 48px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <SectionLabel color={hero.color}>My FM | Journal — Last Updated May 2025</SectionLabel>
          <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 'clamp(1.75rem,4vw,2.75rem)', fontWeight: 900, letterSpacing: '-0.03em', color: textPrim, margin: '10px 0 10px', lineHeight: 1.1 }}>
            {hero.title.split(' ').slice(0, -1).join(' ')}{' '}
            <span style={{ color: hero.color }}>{hero.title.split(' ').slice(-1)[0]}</span>
          </h1>
          <p style={{ fontSize: 15, fontWeight: 500, color: textMut, margin: '0 0 32px', maxWidth: 540, lineHeight: 1.6 }}>
            {hero.sub}
          </p>

          {/* Tab navigation */}
          <div style={{ display: 'inline-flex', gap: 4, background: cardBg, borderRadius: 10, padding: 4, border: `1px solid ${border}` }}>
            {SECTIONS.map(s => (
              <button
                key={s}
                onClick={() => setActive(s)}
                style={{
                  fontFamily: "'Poppins', sans-serif",
                  fontWeight: 700, fontSize: 11,
                  letterSpacing: '0.06em',
                  padding: '9px 18px',
                  borderRadius: 7, border: 'none', cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: active === s ? '#2563eb' : 'transparent',
                  color: active === s ? '#ffffff' : (dm ? '#475569' : '#64748b'),
                  whiteSpace: 'nowrap',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px', display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>

        {/* Sidebar quick-nav */}
        <aside style={{ flexShrink: 0, width: 180, position: 'sticky', top: 90, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SECTIONS.map(s => {
            const h = HERO[s];
            return (
              <button
                key={s}
                onClick={() => setActive(s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10, border: 'none',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  background: active === s ? (dm ? 'rgba(37,99,235,0.12)' : 'rgba(37,99,235,0.07)') : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ width: 3, height: 28, borderRadius: 99, background: active === s ? h.color : (dm ? '#172233' : '#e2e8f0'), flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: active === s ? h.color : (dm ? '#475569' : '#94a3b8'), lineHeight: 1.3 }}>{s}</span>
              </button>
            );
          })}
        </aside>

        {/* Main card */}
        <div style={{ flex: 1, minWidth: 0, background: cardBg, border: `1px solid ${border}`, borderRadius: 16, padding: '32px 36px', boxShadow: dm ? 'none' : '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, paddingBottom: 20, borderBottom: `1px solid ${border}` }}>
            <div style={{ width: 4, height: 36, borderRadius: 99, background: hero.color }} />
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: hero.color, marginBottom: 4 }}>
                My FM | Journal
              </div>
              <h2 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', color: textPrim, margin: 0 }}>
                {active}
              </h2>
            </div>
          </div>

          {active === 'Privacy Policy'    && <PrivacyContent dm={dm} />}
          {active === 'Terms of Service'  && <TermsContent   dm={dm} />}
          {active === 'Contact & Support' && <ContactContent dm={dm} />}
        </div>
      </div>

      <HomeFooter darkMode={darkMode} />
    </div>
  );
}
