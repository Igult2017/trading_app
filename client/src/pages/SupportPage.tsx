import { useState } from 'react';
import { usePublicTheme } from '@/context/PublicThemeContext';
import SEOHead from '@/components/SEOHead';

const F = "'DM Mono', 'Courier New', monospace";

export default function SupportPage() {
  const [form, setForm]     = useState({ user_name: '', user_email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError]   = useState('');
  const [open, setOpen]     = useState<number | null>(null);
  const { darkMode: dm } = usePublicTheme();

  const pageBg   = dm ? 'rgba(8,12,16,0.97)' : '#f8fafc';
  const cardBg   = dm ? '#0d1420' : '#ffffff';
  const sidebarBg= dm ? '#0a1018' : '#ffffff';
  const border   = dm ? 'rgba(255,255,255,0.07)' : '#e5e7eb';
  const textPrim = dm ? '#e2e8f0' : '#0f172a';
  const textMut  = dm ? '#64748b' : '#6b7280';
  const textBody = dm ? '#94a3b8' : '#374151';

  const inp: React.CSSProperties = {
    background: dm ? 'rgba(255,255,255,0.04)' : '#ffffff',
    border: `1px solid ${border}`,
    borderRadius: 2, padding: '11px 14px',
    color: textPrim,
    fontSize: 13, fontWeight: 400, outline: 'none',
    width: '100%', boxSizing: 'border-box',
    fontFamily: F, transition: 'border-color 0.2s',
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
    { q: 'How do I reset my password?',        a: 'Click the "Forgot Password" link on the login page. A reset link will be emailed to you and expires after 1 hour.' },
    { q: 'Is my journal data private?',         a: 'Yes. All your trade entries, notes, and screenshots are encrypted at rest and in transit. Only you can access your data.' },
    { q: 'Can I export my trade data?',         a: 'CSV and JSON export is available in the Analytics section. You can filter by session, date range, or strategy before exporting.' },
    { q: 'How do I import trades from MT4/5?',  a: 'Export your account history from the broker terminal as a CSV and use the Import panel in your Journal to map the columns.' },
    { q: 'Why is Trader AI not responding?',    a: 'Trader AI requires a Google Gemini API key. Ask your administrator to add GOOGLE_API_KEY to the server environment.' },
    { q: 'Can I connect my live broker?',       a: 'Live broker sync is available for select platforms. Check the Accounts section in your dashboard for available integrations.' },
    { q: 'How do I delete my account?',         a: 'Submit a ticket below with the subject "Account Deletion". We process it within 5 business days and export your data first.' },
    { q: 'Is there a mobile app?',              a: 'The platform is fully responsive on all modern mobile browsers. A dedicated native app is on the product roadmap.' },
    { q: 'How do I cancel my subscription?',    a: 'Go to Account Settings → Subscription → Cancel Plan. Cancellation takes effect at the end of the current billing period.' },
    { q: 'I found a bug — how do I report it?', a: 'Use the ticket form below, set the subject to "Bug Report", and include steps to reproduce, your browser, and a screenshot if possible.' },
  ];

  return (
    <>
    <SEOHead
      title="Support & Help Center"
      description="Get help with trade&amp;journal. Browse FAQs, contact our support team, and find answers to common questions about your trading journal."
      canonical="/support"
      noindex={false}
    />
    <div style={{ minHeight: '100vh', background: pageBg, transition: 'background 0.3s' }}>
      <style>{`
        .sp-layout { display:flex; gap:32px; align-items:flex-start; }
        .sp-sidebar { flex-shrink:0; width:220px; position:sticky; top:100px; }
        .sp-main { flex:1; min-width:0; }
        .sp-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        @media (max-width:768px) {
          .sp-layout { flex-direction:column; gap:20px; }
          .sp-sidebar { position:static; width:100%; }
          .sp-sidebar-inner { display:flex; gap:0; overflow-x:auto; scrollbar-width:none; }
          .sp-sidebar-inner::-webkit-scrollbar { display:none; }
          .sp-sidebar-contact { display:none; }
        }
        @media (max-width:540px) {
          .sp-card { padding:24px 18px !important; }
          .sp-form-grid { grid-template-columns:1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '36px 28px 80px' }}>
        <div className="sp-layout">

          {/* ── Sidebar ─────────────────────────────────────────────────────── */}
          <aside className="sp-sidebar">
            <div className="sp-sidebar-inner" style={{ background: sidebarBg, border: `1px solid ${border}`, borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 15, fontWeight: 400, letterSpacing: '0.01em', lineHeight: 1 }}>
                  <span style={{ color: dm ? '#f1f5f9' : '#0f172a' }}>trade</span><span style={{ color: '#2563eb' }}>&amp;</span><span style={{ color: dm ? '#f1f5f9' : '#0f172a' }}>journal</span>
                </span>
                <span style={{ fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: textMut, whiteSpace: 'nowrap' }}>Support</span>
              </div>
              {[
                { label: 'Submit a Ticket', href: '#ticket' },
                { label: 'FAQs',            href: '#faq' },
                { label: 'Privacy Policy',  href: '/legal?tab=privacy' },
                { label: 'Terms of Service',href: '/legal?tab=terms' },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  style={{
                    display: 'block', padding: '12px 16px',
                    borderBottom: `1px solid ${border}`,
                    fontFamily: F, fontSize: 12, fontWeight: 500,
                    color: textBody, textDecoration: 'none',
                    borderLeft: '3px solid transparent',
                    whiteSpace: 'nowrap',
                    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#2563eb';
                    e.currentTarget.style.borderLeftColor = '#2563eb';
                    e.currentTarget.style.background = dm ? 'rgba(37,99,235,0.08)' : '#eff6ff';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = textBody;
                    e.currentTarget.style.borderLeftColor = 'transparent';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {label}
                </a>
              ))}
            </div>

            {/* Contact info — hidden on mobile */}
            <div className="sp-sidebar-contact" style={{ background: sidebarBg, border: `1px solid ${border}`, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${border}` }}>
                <span style={{ fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: textMut }}>Contact</span>
              </div>
              {[
                { label: 'Email',    value: 'support@\ntradeandjournal.com', color: '#2563eb' },
                { label: 'Response', value: '24 – 48 hours',            color: '#059669' },
                { label: 'Hours',    value: 'Mon–Fri\n9am–6pm UTC',     color: '#7c3aed' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: '11px 16px', borderBottom: `1px solid ${border}` }}>
                  <div style={{ fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: F, fontSize: 11, color: textPrim, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{value}</div>
                </div>
              ))}
            </div>
          </aside>

          {/* ── Main content ────────────────────────────────────────────────── */}
          <div className="sp-main">

            {/* Intro card */}
            <div className="sp-card" style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 3, padding: '40px 48px', boxShadow: dm ? 'none' : '0 1px 3px rgba(0,0,0,0.05)', marginBottom: 20 }}>
              <h1 style={{ fontFamily: F, fontSize: 'clamp(0.9rem,1.6vw,1.1rem)', fontWeight: 700, color: textPrim, margin: '0 0 6px', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                Support Centre
              </h1>
              <p style={{ fontFamily: F, fontSize: 12, color: textMut, margin: '0 0 20px' }}>
                Last Updated: 01/01/2025
              </p>
              <p style={{ fontFamily: F, fontSize: 13, color: textBody, lineHeight: 1.9, margin: 0, maxWidth: 640 }}>
                Have a question, found a bug, or need help with your account? Browse the FAQ below or fill in the form to submit a support ticket. Our team responds within 24–48 hours on business days. You can also reach us directly at <strong style={{ color: textPrim }}>support@tradeandjournal.com</strong>.
              </p>
              {/* Contact strip — visible only on mobile */}
              <div style={{ display: 'none', marginTop: 20, gap: 10, flexWrap: 'wrap' }} className="sp-contact-strip">
                {[
                  { label: 'Email',    value: 'support@tradeandjournal.com', color: '#2563eb' },
                  { label: 'Response', value: '24–48 hours',             color: '#059669' },
                  { label: 'Hours',    value: 'Mon–Fri 9am–6pm UTC',     color: '#7c3aed' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: '10px 14px', border: `1px solid ${border}`, borderRadius: 2, background: dm ? 'rgba(255,255,255,0.02)' : '#f9fafb' }}>
                    <div style={{ fontFamily: F, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color, marginBottom: 3 }}>{label}</div>
                    <div style={{ fontFamily: F, fontSize: 11, color: textPrim }}>{value}</div>
                  </div>
                ))}
              </div>
              <style>{`.sp-contact-strip { display:none; } @media(max-width:768px){.sp-contact-strip{display:flex !important;}}`}</style>
            </div>

            {/* FAQ card */}
            <div id="faq" className="sp-card" style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 3, padding: '40px 48px', boxShadow: dm ? 'none' : '0 1px 3px rgba(0,0,0,0.05)', marginBottom: 20 }}>
              <h2 style={{ fontFamily: F, fontSize: 18, fontWeight: 700, color: textPrim, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
                Frequently Asked Questions
              </h2>
              <p style={{ fontFamily: F, fontSize: 12, color: textMut, margin: '0 0 24px' }}>
                Click a question to expand the answer.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {faqs.map(({ q, a }, i) => {
                  const isOpen = open === i;
                  return (
                    <div key={i} style={{ border: `1px solid ${isOpen ? (dm ? 'rgba(37,99,235,0.4)' : '#bfdbfe') : border}`, borderRadius: 2, overflow: 'hidden', transition: 'border-color 0.15s', background: isOpen ? (dm ? 'rgba(37,99,235,0.05)' : '#f8faff') : 'transparent' }}>
                      <button
                        onClick={() => setOpen(isOpen ? null : i)}
                        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 12 }}
                      >
                        <span style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: isOpen ? '#2563eb' : textPrim, transition: 'color 0.15s' }}>{q}</span>
                        <span style={{ fontFamily: F, fontSize: 18, color: isOpen ? '#2563eb' : textMut, flexShrink: 0, transform: isOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.15s, color 0.15s', display: 'inline-block', lineHeight: 1 }}>+</span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: '0 16px 14px' }}>
                          <p style={{ fontFamily: F, fontSize: 13, color: textBody, lineHeight: 1.85, margin: 0 }}>{a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ticket form card */}
            <div id="ticket" className="sp-card" style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 3, padding: '40px 48px', boxShadow: dm ? 'none' : '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h2 style={{ fontFamily: F, fontSize: 18, fontWeight: 700, color: textPrim, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
                Submit a Support Ticket
              </h2>
              <p style={{ fontFamily: F, fontSize: 12, color: textMut, margin: '0 0 24px' }}>
                We aim to respond to all tickets within 24–48 hours on business days.
              </p>

              {status === 'sent' ? (
                <div style={{ padding: '32px 24px', textAlign: 'center', border: `1px solid ${dm ? 'rgba(5,150,105,0.35)' : '#6ee7b7'}`, borderRadius: 3, background: dm ? 'rgba(5,150,105,0.06)' : '#f0fdf4' }}>
                  <div style={{ width: 46, height: 46, borderRadius: '50%', background: dm ? 'rgba(5,150,105,0.15)' : '#d1fae5', border: `1px solid ${dm ? 'rgba(5,150,105,0.4)' : '#6ee7b7'}`, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#059669', fontSize: 19 }}>✓</span>
                  </div>
                  <p style={{ fontFamily: F, fontWeight: 700, fontSize: 15, color: '#059669', marginBottom: 6 }}>Ticket Submitted.</p>
                  <p style={{ fontFamily: F, fontSize: 13, color: textBody, marginBottom: 18, lineHeight: 1.7 }}>Our team will respond within 24–48 hours.</p>
                  <button onClick={() => setStatus('idle')} style={{ background: '#2563eb', border: 'none', borderRadius: 2, padding: '10px 28px', color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', cursor: 'pointer', fontFamily: F }}>
                    Send Another
                  </button>
                </div>
              ) : (
                <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
                  <div className="sp-form-grid">
                    <div>
                      <label style={{ display: 'block', fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: textMut, marginBottom: 6 }}>Name</label>
                      <input style={inp} placeholder="Your name" value={form.user_name} onChange={e => setForm(p => ({ ...p, user_name: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: textMut, marginBottom: 6 }}>Email</label>
                      <input style={inp} placeholder="your@email.com" type="email" value={form.user_email} onChange={e => setForm(p => ({ ...p, user_email: e.target.value }))} required />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: textMut, marginBottom: 6 }}>Subject</label>
                    <input style={inp} placeholder="What is this about?" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} required />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontFamily: F, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: textMut, marginBottom: 6 }}>Message</label>
                    <textarea style={{ ...inp, minHeight: 140, resize: 'vertical' }} placeholder="Describe your issue in detail…" value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} required />
                  </div>
                  {status === 'error' && <p style={{ fontFamily: F, fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>}
                  <div>
                    <button type="submit" disabled={status === 'sending'} style={{ background: status === 'sending' ? '#93c5fd' : '#2563eb', border: 'none', borderRadius: 2, padding: '12px 32px', color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', cursor: status === 'sending' ? 'not-allowed' : 'pointer', transition: 'background 0.2s', fontFamily: F }}>
                      {status === 'sending' ? 'Sending…' : 'Submit Ticket'}
                    </button>
                  </div>
                </form>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
    </>
  );
}
