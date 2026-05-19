import { useState } from 'react';
import { useLocation } from 'wouter';
import HomeHeader from '@/components/HomeHeader';
import HomeFooter from '@/components/HomeFooter';

export default function SupportPage() {
  const [form, setForm] = useState({
    user_name: '',
    user_email: '',
    subject: '',
    message: '',
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [location] = useLocation();

  const dm = darkMode;
  const pageBg    = dm ? '#080c10' : '#f8fafc';
  const text      = dm ? '#ffffff' : '#0f172a';
  const textMuted = dm ? '#94a3b8' : '#64748b';
  const cardBg    = dm ? 'rgba(255,255,255,0.05)' : '#ffffff';
  const cardBorder= dm ? 'rgba(255,255,255,0.10)' : '#e2e8f0';
  const inputBg   = dm ? 'rgba(0,0,0,0.30)' : '#f8fafc';
  const inputBorder=dm ? 'rgba(255,255,255,0.10)' : '#cbd5e1';
  const inputText = dm ? '#ffffff' : '#0f172a';

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
    background: inputBg,
    border: `1px solid ${inputBorder}`,
    borderRadius: 8,
    padding: '12px 16px',
    color: inputText,
    fontSize: 13,
    fontWeight: 500,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
    fontFamily: "'Poppins', sans-serif",
  };

  return (
    <div style={{ minHeight: '100vh', background: pageBg, color: text, transition: 'background 0.3s, color 0.3s', fontFamily: "'Poppins', sans-serif" }}>
      <HomeHeader darkMode={darkMode} setDarkMode={setDarkMode} activePath={location} />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '80px 24px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', marginBottom: 12, color: text }}>
          Customer Support
        </h1>
        <p style={{ color: textMuted, marginBottom: 32, fontSize: 14 }}>
          Send a ticket and our customer care team will handle it from the admin panel.
        </p>
        <form
          onSubmit={onSubmit}
          style={{ borderRadius: 16, border: `1px solid ${cardBorder}`, background: cardBg, padding: 24, display: 'grid', gap: 14 }}
        >
          <input style={inp} placeholder="Your name" value={form.user_name} onChange={e => setForm(p => ({ ...p, user_name: e.target.value }))} />
          <input style={inp} placeholder="Your email" type="email" value={form.user_email} onChange={e => setForm(p => ({ ...p, user_email: e.target.value }))} required />
          <input style={inp} placeholder="Subject" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} required />
          <textarea
            style={{ ...inp, minHeight: 160, resize: 'vertical' }}
            placeholder="How can we help?"
            value={form.message}
            onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
            required
          />
          <button
            disabled={status === 'sending'}
            style={{
              background: status === 'sending' ? '#1e3a6e' : '#2563eb',
              border: 'none',
              borderRadius: 8,
              padding: '13px 24px',
              color: '#fff',
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: status === 'sending' ? 'not-allowed' : 'pointer',
              opacity: status === 'sending' ? 0.7 : 1,
              transition: 'background 0.2s',
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            {status === 'sending' ? 'Sending…' : 'Submit Ticket'}
          </button>
          {status === 'sent'  && <p style={{ color: '#4ade80', fontSize: 13 }}>Ticket submitted successfully.</p>}
          {status === 'error' && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
        </form>
      </div>
      <HomeFooter />
    </div>
  );
}
