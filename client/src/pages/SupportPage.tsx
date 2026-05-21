import { useState } from 'react';
import { usePublicTheme } from '@/context/PublicThemeContext';

export default function SupportPage() {
  const [form, setForm]     = useState({ user_name: '', user_email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError]   = useState('');
  const { darkMode, setDarkMode } = usePublicTheme();

  const dm = darkMode;
  const pageBg  = dm ? '#080c10' : '#f8fafc';
  const heroBg  = dm ? '#060b14' : 'rgba(241,245,249,0.8)';
  const cardBg  = dm ? '#0c1219' : '#ffffff';
  const border  = dm ? '#172233' : '#e2e8f0';
  const textPrim= dm ? '#f1f5f9' : '#0f172a';
  const textMut = dm ? '#64748b' : '#94a3b8';

  const inp: React.CSSProperties = {
    background: dm ? '#080c10' : '#f8fafc',
    border: `1px solid ${dm ? '#172233' : '#e2e8f0'}`,
    borderRadius: 8, padding: '12px 14px',
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
    <div style={{ minHeight: '100vh', background: pageBg, fontFamily: "'Poppins', sans-serif", transition: 'background 0.3s' }}>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section style={{ background: heroBg, borderBottom: `1px solid ${border}`, padding: '52px 24px 48px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#2563eb', marginBottom: 10 }}>
            My FM | Journal — Support
          </div>
          <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 'clamp(1.8rem,4vw,2.75rem)', fontWeight: 900, letterSpacing: '-0.03em', color: textPrim, margin: '0 0 10px', lineHeight: 1.1 }}>
            We're here to <span style={{ color: '#2563eb' }}>help.</span>
          </h1>
          <p style={{ fontSize: 15, fontWeight: 500, color: textMut, margin: '0 0 36px', maxWidth: 500, lineHeight: 1.65 }}>
            Submit a support ticket and our team will get back to you within 24–48 hours. You can also browse our FAQ below.
          </p>

          {/* Quick-info strips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {[
              { label: 'Email',         value: 'support@myfmjournal.com', color: '#2563eb' },
              { label: 'Response Time', value: '24 – 48 hours',           color: '#10b981' },
              { label: 'Support Hours', value: 'Mon – Fri · 9am – 6pm UTC', color: '#8b5cf6' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, background: cardBg, border: `1px solid ${border}`, boxShadow: dm ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ width: 3, height: 28, borderRadius: 99, background: color, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: textPrim }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px 80px', display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Left: FAQ */}
        <div style={{ flex: '1 1 340px', minWidth: 280 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: textMut, marginBottom: 6 }}>FAQ</div>
          <h2 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', color: textPrim, margin: '0 0 20px' }}>
            Common Questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { q: 'How do I reset my password?',    a: 'Use the "Forgot Password" link on the login page to receive a reset email.' },
              { q: 'Is my journal data private?',    a: 'Yes — your trades and notes are encrypted and only accessible to you.' },
              { q: 'Can I export my trades?',        a: 'Export to CSV is available inside the Analytics section of your journal.' },
              { q: 'How do I delete my account?',    a: 'Submit a ticket below with the subject "Account Deletion" and we\'ll process it promptly.' },
              { q: 'Can I import trades from MT4/5?',a: 'CSV import is supported. Check the import guide inside the Journal section.' },
              { q: 'Is there a mobile app?',         a: 'The platform is fully responsive. A dedicated mobile app is on our roadmap.' },
            ].map(({ q, a }) => (
              <div key={q} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12, boxShadow: dm ? 'none' : '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ width: 3, borderRadius: 99, background: '#2563eb', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: dm ? '#c8d8e8' : '#1e293b', marginBottom: 4 }}>{q}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: textMut, lineHeight: 1.6 }}>{a}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Ticket form */}
        <div style={{ flex: '1 1 380px', minWidth: 300 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: textMut, marginBottom: 6 }}>Contact</div>
          <h2 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', color: textPrim, margin: '0 0 20px' }}>
            Submit a Ticket
          </h2>

          <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 16, padding: '28px', boxShadow: dm ? 'none' : '0 1px 4px rgba(0,0,0,0.05)' }}>
            {status === 'sent' ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#10b981', fontSize: 22, fontWeight: 900 }}>✓</span>
                </div>
                <p style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 900, fontSize: 16, color: '#10b981', marginBottom: 6 }}>Ticket Submitted!</p>
                <p style={{ fontSize: 13, color: textMut, marginBottom: 20, lineHeight: 1.6 }}>Our team will respond within 24–48 hours. Check your inbox for a confirmation.</p>
                <button onClick={() => setStatus('idle')} style={{ background: '#2563eb', border: 'none', borderRadius: 8, padding: '11px 28px', color: '#fff', fontWeight: 800, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                  Send Another
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: textMut, marginBottom: 5 }}>Name</label>
                    <input style={inp} placeholder="Your name" value={form.user_name} onChange={e => setForm(p => ({ ...p, user_name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: textMut, marginBottom: 5 }}>Email</label>
                    <input style={inp} placeholder="your@email.com" type="email" value={form.user_email} onChange={e => setForm(p => ({ ...p, user_email: e.target.value }))} required />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: textMut, marginBottom: 5 }}>Subject</label>
                  <input style={inp} placeholder="What is this about?" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: textMut, marginBottom: 5 }}>Message</label>
                  <textarea style={{ ...inp, minHeight: 150, resize: 'vertical' }} placeholder="Describe your issue in detail…" value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} required />
                </div>
                {status === 'error' && <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{error}</p>}
                <button type="submit" disabled={status === 'sending'} style={{ background: status === 'sending' ? '#1e3a6e' : '#2563eb', border: 'none', borderRadius: 8, padding: '14px 24px', color: '#fff', fontWeight: 800, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: status === 'sending' ? 'not-allowed' : 'pointer', opacity: status === 'sending' ? 0.7 : 1, transition: 'background 0.2s', fontFamily: "'Poppins', sans-serif" }}>
                  {status === 'sending' ? 'Sending…' : 'Submit Ticket'}
                </button>
                <p style={{ fontSize: 11, color: textMut, margin: 0, textAlign: 'center' }}>
                  Or email us directly at <strong style={{ color: '#2563eb' }}>support@myfmjournal.com</strong>
                </p>
              </form>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
