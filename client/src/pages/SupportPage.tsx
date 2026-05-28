import { useState } from 'react';
import { usePublicTheme } from '@/context/PublicThemeContext';

const F = "'DM Mono', 'Courier New', monospace";

const C = {
  bg:       '#070d15',
  border:   'rgba(255,255,255,0.06)',
  text:     'rgba(255,255,255,0.88)',
  muted:    'rgba(255,255,255,0.38)',
  dim:      'rgba(255,255,255,0.55)',
  indigo:   '#6366f1',
  indigoL:  '#818cf8',
  green:    '#10b981',
  amber:    '#f59e0b',
  red:      '#f43f5e',
};

function Tag({ children, color = C.indigo }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
      textTransform: 'uppercase', color,
      background: `${color}18`, border: `1px solid ${color}35`,
      borderRadius: 4, padding: '3px 8px',
    }}>{children}</span>
  );
}

export default function SupportPage() {
  const [form, setForm]     = useState({ user_name: '', user_email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError]   = useState('');
  const [open, setOpen]     = useState<number | null>(null);
  usePublicTheme();

  const inp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${C.border}`,
    borderRadius: 8, padding: '12px 14px',
    color: C.text,
    fontSize: 12, fontWeight: 400, outline: 'none',
    width: '100%', boxSizing: 'border-box',
    fontFamily: F,
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

  const faqs = [
    {
      q: 'How do I reset my password?',
      a: 'Click the "Forgot Password" link on the login page. A reset link will be sent to your registered email address and will expire after 1 hour.',
    },
    {
      q: 'Is my journal data private and secure?',
      a: 'Yes. All your trade entries, notes, and screenshots are encrypted at rest (AES-256) and in transit (TLS 1.2+). No other user, team member, or third party can view your data.',
    },
    {
      q: 'Can I export my trade data?',
      a: 'CSV and JSON export is available in the Analytics section. You can filter by session, date range, or strategy before exporting.',
    },
    {
      q: 'How do I import trades from MT4 or MT5?',
      a: 'We support CSV import using the standard statement format. Export your account history from the broker terminal and map the columns in the Import panel inside your Journal.',
    },
    {
      q: 'Why is Trader AI not responding?',
      a: 'Trader AI requires a Google Gemini API key. If you are self-hosting, ask your administrator to add GOOGLE_API_KEY to the server environment variables.',
    },
    {
      q: 'Can I connect my live broker account?',
      a: 'Live broker sync is available for select platforms. Check the Accounts section in your dashboard to see current integrations and how to link your account.',
    },
    {
      q: 'How do I delete my account and data?',
      a: 'Submit a ticket below with the subject "Account Deletion". We will process it within 5 business days, export your data for you, then permanently delete everything.',
    },
    {
      q: 'Is there a mobile app?',
      a: 'The platform is fully responsive and works on all modern mobile browsers. A dedicated native app is on our product roadmap — follow our blog for announcements.',
    },
    {
      q: 'How do I upgrade or cancel my subscription?',
      a: 'Manage your plan from Account Settings → Subscription. Cancellations take effect at the end of the current billing cycle. No partial-period refunds are issued unless there was a billing error.',
    },
    {
      q: 'I found a bug — how do I report it?',
      a: 'Use the ticket form below and set the subject to "Bug Report". Include steps to reproduce, your browser, and a screenshot if possible. We aim to triage all bugs within 48 hours.',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: F }}>

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <section style={{
        background: 'linear-gradient(180deg, #0a1220 0%, #070d15 100%)',
        borderBottom: `1px solid ${C.border}`,
        padding: '60px 24px 52px',
      }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <Tag color={C.indigo}>My FM | Journal</Tag>
            <span style={{ fontFamily: F, fontSize: 10, color: C.muted }}>// Support Centre</span>
          </div>

          <h1 style={{
            fontFamily: F, fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)',
            fontWeight: 700, letterSpacing: '-0.03em',
            color: C.text, margin: '0 0 12px', lineHeight: 1.15,
          }}>
            We&apos;re here to{' '}
            <span style={{ color: C.indigo }}>help.</span>
          </h1>

          <p style={{ fontFamily: F, fontSize: 13, color: C.muted, margin: '0 0 36px', maxWidth: 480, lineHeight: 1.75 }}>
            Browse the FAQ below or submit a ticket. Our team responds within 24–48 hours on business days.
          </p>

          {/* Info strips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {[
              { label: 'Email',         value: 'support@myfmjournal.com',   color: C.indigo },
              { label: 'Response Time', value: '24 – 48 hours',              color: C.green  },
              { label: 'Hours',         value: 'Mon – Fri · 9am – 6pm UTC', color: C.amber  },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 18px', borderRadius: 10,
                background: `${color}0a`, border: `1px solid ${color}25`,
              }}>
                <div style={{ width: 2, height: 28, borderRadius: 1, background: color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: F, fontSize: 12, color: C.text }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '48px 24px 100px', display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* ── Left: FAQ ─────────────────────────────────────────────────────── */}
        <div style={{ flex: '1 1 400px', minWidth: 300 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 2, height: 12, background: C.indigo, borderRadius: 1 }} />
            <span style={{ fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted }}>FAQ</span>
          </div>
          <h2 style={{ fontFamily: F, fontSize: 18, fontWeight: 700, letterSpacing: '-0.025em', color: C.text, margin: '0 0 24px' }}>
            Common Questions
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {faqs.map(({ q, a }, i) => {
              const isOpen = open === i;
              return (
                <div key={i} style={{
                  background: isOpen ? 'rgba(99,102,241,0.05)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isOpen ? 'rgba(99,102,241,0.25)' : C.border}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  transition: 'border-color 0.18s, background 0.18s',
                }}>
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, padding: '14px 16px',
                      background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 2, height: 20, borderRadius: 1, background: isOpen ? C.indigo : C.border, flexShrink: 0, transition: 'background 0.18s' }} />
                      <span style={{ fontFamily: F, fontSize: 12, fontWeight: 700, color: isOpen ? C.text : C.dim }}>{q}</span>
                    </div>
                    <span style={{ fontFamily: F, fontSize: 14, color: isOpen ? C.indigo : C.muted, flexShrink: 0, transition: 'transform 0.18s, color 0.18s', display: 'inline-block', transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}>+</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 16px 16px 42px' }}>
                      <p style={{ fontFamily: F, fontSize: 12, color: C.muted, lineHeight: 1.8, margin: 0 }}>{a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Status indicators */}
          <div style={{ marginTop: 36, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 20px' }}>
            <div style={{ fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted, marginBottom: 14 }}>System Status</div>
            {[
              { service: 'Platform / App',        status: 'Operational', color: C.green },
              { service: 'API & Data Feeds',       status: 'Operational', color: C.green },
              { service: 'Trader AI (Gemini)',     status: 'Operational', color: C.green },
              { service: 'Economic Calendar',      status: 'Operational', color: C.green },
            ].map(({ service, status: s, color }) => (
              <div key={service} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: F, fontSize: 11, color: C.dim }}>{service}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                  <span style={{ fontFamily: F, fontSize: 10, color }}>{s}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Ticket form ─────────────────────────────────────────────── */}
        <div style={{ flex: '1 1 380px', minWidth: 300 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 2, height: 12, background: C.green, borderRadius: 1 }} />
            <span style={{ fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted }}>Contact</span>
          </div>
          <h2 style={{ fontFamily: F, fontSize: 18, fontWeight: 700, letterSpacing: '-0.025em', color: C.text, margin: '0 0 24px' }}>
            Submit a Ticket
          </h2>

          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${C.border}`,
            borderRadius: 16, padding: '28px',
          }}>
            {status === 'sent' ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${C.green}12`, border: `1px solid ${C.green}35`, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: C.green, fontSize: 22 }}>✓</span>
                </div>
                <p style={{ fontFamily: F, fontWeight: 700, fontSize: 14, color: C.green, marginBottom: 6 }}>Ticket Submitted.</p>
                <p style={{ fontFamily: F, fontSize: 12, color: C.muted, marginBottom: 24, lineHeight: 1.75 }}>
                  Our team will respond within 24–48 hours.<br />Check your inbox for a confirmation email.
                </p>
                <button
                  onClick={() => setStatus('idle')}
                  style={{ background: C.indigo, border: 'none', borderRadius: 8, padding: '11px 28px', color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: F }}
                >
                  Send Another
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>Name</label>
                    <input
                      style={inp}
                      placeholder="Your name"
                      value={form.user_name}
                      onChange={e => setForm(p => ({ ...p, user_name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>Email</label>
                    <input
                      style={inp}
                      placeholder="your@email.com"
                      type="email"
                      value={form.user_email}
                      onChange={e => setForm(p => ({ ...p, user_email: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>Subject</label>
                  <input
                    style={inp}
                    placeholder="What is this about?"
                    value={form.subject}
                    onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>Message</label>
                  <textarea
                    style={{ ...inp, minHeight: 150, resize: 'vertical' }}
                    placeholder="Describe your issue in detail — include steps to reproduce any bugs."
                    value={form.message}
                    onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                    required
                  />
                </div>

                {status === 'error' && (
                  <p style={{ fontFamily: F, fontSize: 12, color: C.red, margin: 0 }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={status === 'sending'}
                  style={{
                    background: status === 'sending' ? 'rgba(99,102,241,0.4)' : C.indigo,
                    border: 'none', borderRadius: 8,
                    padding: '14px 24px', color: '#fff',
                    fontWeight: 700, fontSize: 11,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    cursor: status === 'sending' ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s', fontFamily: F,
                  }}
                >
                  {status === 'sending' ? 'Sending…' : 'Submit Ticket →'}
                </button>

                <p style={{ fontFamily: F, fontSize: 11, color: C.muted, margin: 0, textAlign: 'center' }}>
                  Or email directly:{' '}
                  <span style={{ color: C.indigoL }}>support@myfmjournal.com</span>
                </p>
              </form>
            )}
          </div>

          {/* Quick links */}
          <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px' }}>
            <div style={{ fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted, marginBottom: 14 }}>Quick Links</div>
            {[
              { label: 'Privacy Policy',   href: '/legal' },
              { label: 'Terms of Service', href: '/legal' },
              { label: 'Account Settings', href: '/journal' },
            ].map(({ label, href }) => (
              <a key={label} href={href} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 0',
                borderBottom: `1px solid ${C.border}`,
                fontFamily: F, fontSize: 12, color: C.dim,
                textDecoration: 'none',
                transition: 'color 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.color = C.indigoL)}
                onMouseLeave={e => (e.currentTarget.style.color = C.dim)}
              >
                <span>{label}</span>
                <span style={{ fontSize: 12, color: C.muted }}>›</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
