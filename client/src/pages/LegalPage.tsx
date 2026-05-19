import { useState } from 'react';
import { useLocation } from 'wouter';
import HomeHeader from '@/components/HomeHeader';
import HomeFooter from '@/components/HomeFooter';

const SECTIONS = ['Privacy Policy', 'Terms of Service', 'Contact & Support'] as const;
type Section = typeof SECTIONS[number];

const S: React.CSSProperties = { fontFamily: "'Montserrat', sans-serif" };

function Heading({ children, dark }: { children: React.ReactNode; dark: boolean }) {
  return (
    <h2 style={{ ...S, fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', color: dark ? '#c8d8e8' : '#334155', marginBottom: 20, marginTop: 40, textTransform: 'uppercase', borderBottom: `1px solid ${dark ? '#172233' : '#e2e8f0'}`, paddingBottom: 10 }}>
      {children}
    </h2>
  );
}

function Para({ children, dark }: { children: React.ReactNode; dark: boolean }) {
  return (
    <p style={{ ...S, fontSize: 13, fontWeight: 500, color: dark ? '#8aa0b8' : '#475569', lineHeight: 1.9, marginBottom: 16 }}>
      {children}
    </p>
  );
}

function Li({ children, dark }: { children: React.ReactNode; dark: boolean }) {
  return (
    <li style={{ ...S, fontSize: 13, fontWeight: 500, color: dark ? '#8aa0b8' : '#475569', lineHeight: 1.9, marginBottom: 8 }}>
      {children}
    </li>
  );
}

function PrivacyContent({ dark }: { dark: boolean }) {
  const strong = dark ? '#c8d8e8' : '#1e293b';
  return (
    <div>
      <Para dark={dark}>
        Effective Date: January 1, 2025. My FM | Journal ("we", "us", or "our") is committed to protecting your privacy.
        This Privacy Policy explains how we collect, use, and safeguard your information when you visit our website and use our services.
      </Para>

      <Heading dark={dark}>Information We Collect</Heading>
      <Para dark={dark}>We may collect the following types of information:</Para>
      <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
        <Li dark={dark}><strong style={{ color: strong }}>Account Information:</strong> Name, email address, and password when you register.</Li>
        <Li dark={dark}><strong style={{ color: strong }}>Journal Data:</strong> Trade entries, notes, screenshots, and performance data you input into the trading journal.</Li>
        <Li dark={dark}><strong style={{ color: strong }}>Usage Data:</strong> Pages visited, features used, and time spent on the platform.</Li>
        <Li dark={dark}><strong style={{ color: strong }}>Device Data:</strong> Browser type, IP address, and operating system for security and analytics purposes.</Li>
      </ul>

      <Heading dark={dark}>How We Use Your Information</Heading>
      <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
        <Li dark={dark}>To provide, maintain, and improve our trading journal and analytics tools.</Li>
        <Li dark={dark}>To authenticate your account and protect against unauthorized access.</Li>
        <Li dark={dark}>To send service-related communications and support responses.</Li>
        <Li dark={dark}>To analyze usage patterns and improve platform performance.</Li>
        <Li dark={dark}>To comply with legal obligations.</Li>
      </ul>

      <Heading dark={dark}>Data Security</Heading>
      <Para dark={dark}>
        We implement industry-standard security measures including encryption at rest and in transit, secure authentication, and regular security audits.
        Your trade journal data is private to your account and is never shared with or sold to third parties.
      </Para>

      <Heading dark={dark}>Data Retention</Heading>
      <Para dark={dark}>
        We retain your account data for as long as your account is active. You may request deletion of your account and associated data at any time by contacting our support team.
      </Para>

      <Heading dark={dark}>Cookies</Heading>
      <Para dark={dark}>
        We use essential cookies to maintain your session and preferences. We do not use advertising cookies or sell your data to advertisers.
      </Para>

      <Heading dark={dark}>Third-Party Services</Heading>
      <Para dark={dark}>
        We may use third-party services for hosting and analytics. These providers are contractually obligated to keep your data confidential and use it only to provide services to us.
      </Para>

      <Heading dark={dark}>Your Rights</Heading>
      <Para dark={dark}>
        You have the right to access, correct, or delete your personal data. You may also request a copy of the data we hold about you. Contact us at the address below to exercise these rights.
      </Para>

      <Heading dark={dark}>Changes to This Policy</Heading>
      <Para dark={dark}>
        We may update this Privacy Policy from time to time. We will notify you of significant changes by posting a notice on our website or emailing you directly.
      </Para>

      <Heading dark={dark}>Contact</Heading>
      <Para dark={dark}>
        For privacy-related inquiries, please contact us via our Support page or email <strong style={{ color: '#3b82f6' }}>privacy@myfmjournal.com</strong>.
      </Para>
    </div>
  );
}

function TermsContent({ dark }: { dark: boolean }) {
  return (
    <div>
      <Para dark={dark}>
        Effective Date: January 1, 2025. By accessing or using My FM | Journal, you agree to be bound by these Terms of Service.
        Please read them carefully before using our platform.
      </Para>

      <Heading dark={dark}>Acceptance of Terms</Heading>
      <Para dark={dark}>
        By creating an account or using any part of our services, you agree to these Terms. If you do not agree, you must not use My FM | Journal.
      </Para>

      <Heading dark={dark}>Description of Service</Heading>
      <Para dark={dark}>
        My FM | Journal provides an online trading journal, analytics tools, market session clock, economic calendar, and educational content.
        Our services are intended for informational and record-keeping purposes only.
      </Para>

      <Heading dark={dark}>Risk Disclaimer</Heading>
      <Para dark={dark}>
        Trading financial instruments involves substantial risk of loss and is not suitable for every investor. My FM | Journal provides
        educational content and analytical tools for informational purposes only. Nothing on this platform constitutes financial,
        investment, or trading advice. Past performance is not indicative of future results. Never trade with money you cannot afford to lose.
      </Para>

      <Heading dark={dark}>Account Responsibilities</Heading>
      <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
        <Li dark={dark}>You must be at least 18 years of age to use our services.</Li>
        <Li dark={dark}>You are responsible for maintaining the confidentiality of your account credentials.</Li>
        <Li dark={dark}>You are responsible for all activity that occurs under your account.</Li>
        <Li dark={dark}>You must provide accurate and truthful information during registration.</Li>
      </ul>

      <Heading dark={dark}>Prohibited Conduct</Heading>
      <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
        <Li dark={dark}>Attempting to gain unauthorized access to any part of the platform.</Li>
        <Li dark={dark}>Uploading malicious code, viruses, or harmful content.</Li>
        <Li dark={dark}>Using the platform for any illegal or fraudulent purpose.</Li>
        <Li dark={dark}>Reverse engineering or attempting to extract proprietary algorithms or data.</Li>
        <Li dark={dark}>Sharing your account with others or reselling access to our services.</Li>
      </ul>

      <Heading dark={dark}>Intellectual Property</Heading>
      <Para dark={dark}>
        All content on My FM | Journal, including text, graphics, logos, software, and data analysis tools, is the property of My FM | Journal
        and is protected by applicable intellectual property laws. You may not reproduce, distribute, or create derivative works without our
        express written permission.
      </Para>

      <Heading dark={dark}>Limitation of Liability</Heading>
      <Para dark={dark}>
        My FM | Journal shall not be liable for any direct, indirect, incidental, special, or consequential damages arising from
        your use of or inability to use our services, including but not limited to trading losses, data loss, or service interruptions.
      </Para>

      <Heading dark={dark}>Service Availability</Heading>
      <Para dark={dark}>
        We strive to maintain high availability but do not guarantee uninterrupted access. We reserve the right to modify, suspend,
        or discontinue any part of our service at any time without liability.
      </Para>

      <Heading dark={dark}>Termination</Heading>
      <Para dark={dark}>
        We reserve the right to suspend or terminate your account at our discretion if you violate these Terms. You may also delete your
        account at any time by contacting support.
      </Para>

      <Heading dark={dark}>Governing Law</Heading>
      <Para dark={dark}>
        These Terms shall be governed by and construed in accordance with applicable law. Any disputes shall be resolved through
        binding arbitration or in the courts of applicable jurisdiction.
      </Para>

      <Heading dark={dark}>Changes to Terms</Heading>
      <Para dark={dark}>
        We reserve the right to update these Terms at any time. Continued use of the platform after changes constitutes acceptance of the new Terms.
      </Para>
    </div>
  );
}

function ContactContent({ dark }: { dark: boolean }) {
  const [form, setForm] = useState({ user_name: '', user_email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const strong = dark ? '#c8d8e8' : '#1e293b';

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const r = await fetch('/api/support/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, priority: 'Medium', channel: 'email' }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed to send ticket');
      setStatus('sent');
      setForm({ user_name: '', user_email: '', subject: '', message: '' });
    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Failed to send ticket');
    }
  }

  const inp: React.CSSProperties = {
    ...S,
    background: dark ? '#0c1219' : '#f8fafc',
    border: `1px solid ${dark ? '#172233' : '#cbd5e1'}`,
    borderRadius: 8,
    padding: '12px 16px',
    color: dark ? '#c8d8e8' : '#0f172a',
    fontSize: 13,
    fontWeight: 600,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div>
      <Para dark={dark}>
        Have a question, found a bug, or need help with your account? Fill in the form below and our customer care team
        will respond as soon as possible. You can also reach us directly at{' '}
        <strong style={{ color: '#3b82f6' }}>support@myfmjournal.com</strong>.
      </Para>

      <Heading dark={dark}>Frequently Asked Questions</Heading>
      <ul style={{ paddingLeft: 24, marginBottom: 24 }}>
        <Li dark={dark}><strong style={{ color: strong }}>How do I reset my password?</strong> — Use the "Forgot Password" link on the login page.</Li>
        <Li dark={dark}><strong style={{ color: strong }}>Is my journal data private?</strong> — Yes, your data is encrypted and only visible to you.</Li>
        <Li dark={dark}><strong style={{ color: strong }}>Can I export my trades?</strong> — Export functionality is available in the Analytics section.</Li>
        <Li dark={dark}><strong style={{ color: strong }}>How do I delete my account?</strong> — Submit a ticket below with the subject "Account Deletion".</Li>
      </ul>

      <Heading dark={dark}>Send a Support Ticket</Heading>
      {status === 'sent' ? (
        <div style={{ background: dark ? '#0d1f12' : '#f0fdf4', border: `1px solid ${dark ? '#166534' : '#bbf7d0'}`, borderRadius: 12, padding: '24px', textAlign: 'center' }}>
          <p style={{ ...S, color: '#4ade80', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Ticket submitted successfully!</p>
          <p style={{ ...S, color: dark ? '#8aa0b8' : '#64748b', fontSize: 13 }}>Our team will get back to you within 24–48 hours.</p>
          <button onClick={() => setStatus('idle')} style={{ ...S, marginTop: 16, background: '#2563eb', border: 'none', borderRadius: 8, padding: '10px 24px', color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', cursor: 'pointer' }}>
            SEND ANOTHER
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <input style={inp} placeholder="Your name" value={form.user_name} onChange={e => setForm(p => ({ ...p, user_name: e.target.value }))} required />
            <input style={inp} placeholder="Your email" type="email" value={form.user_email} onChange={e => setForm(p => ({ ...p, user_email: e.target.value }))} required />
          </div>
          <input style={inp} placeholder="Subject" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} required />
          <textarea
            style={{ ...inp, minHeight: 140, resize: 'vertical' }}
            placeholder="How can we help?"
            value={form.message}
            onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
            required
          />
          {status === 'error' && <p style={{ ...S, color: '#f87171', fontSize: 12 }}>{error}</p>}
          <button
            type="submit"
            disabled={status === 'sending'}
            style={{ ...S, background: status === 'sending' ? '#1e3a6e' : '#2563eb', border: 'none', borderRadius: 8, padding: '13px 24px', color: '#fff', fontWeight: 800, fontSize: 12, letterSpacing: '0.1em', cursor: status === 'sending' ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}
          >
            {status === 'sending' ? 'SENDING...' : 'SUBMIT TICKET'}
          </button>
        </form>
      )}
    </div>
  );
}

export default function LegalPage() {
  const [active, setActive] = useState<Section>('Privacy Policy');
  const [location] = useLocation();
  const [darkMode, setDarkMode] = useState(false);
  const dm = darkMode;

  const pageBg     = dm ? '#080c10' : '#f8fafc';
  const stripBg    = dm ? '#0c1219' : '#ffffff';
  const stripBorder= dm ? '#172233' : '#e2e8f0';
  const cardBg     = dm ? '#0c1219' : '#ffffff';
  const cardBorder = dm ? '#172233' : '#e2e8f0';
  const titleColor = dm ? '#ffffff' : '#0f172a';

  return (
    <div style={{ minHeight: '100vh', background: pageBg, fontFamily: "'Montserrat', sans-serif", transition: 'background 0.3s' }}>
      <HomeHeader darkMode={darkMode} setDarkMode={setDarkMode} activePath={location} />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Tab strip */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 40, background: stripBg, borderRadius: 10, padding: 4, border: `1px solid ${stripBorder}`, transition: 'background 0.3s' }}>
          {SECTIONS.map(s => (
            <button
              key={s}
              onClick={() => setActive(s)}
              style={{
                flex: 1,
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 800,
                fontSize: 10,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '10px 8px',
                borderRadius: 7,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: active === s ? '#2563eb' : 'transparent',
                color: active === s ? '#ffffff' : (dm ? '#4a6580' : '#64748b'),
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Content card */}
        <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 14, padding: '32px 36px', transition: 'background 0.3s' }}>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 22, fontWeight: 900, letterSpacing: '-0.01em', color: titleColor, marginBottom: 8, marginTop: 0 }}>
            {active}
          </h1>
          <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#2563eb', marginBottom: 32, marginTop: 0 }}>
            My FM | Journal — LAST UPDATED MAY 2025
          </p>
          {active === 'Privacy Policy'    && <PrivacyContent dark={dm} />}
          {active === 'Terms of Service'  && <TermsContent   dark={dm} />}
          {active === 'Contact & Support' && <ContactContent dark={dm} />}
        </div>
      </div>
      <HomeFooter darkMode={darkMode} />
    </div>
  );
}
