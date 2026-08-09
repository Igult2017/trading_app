/** /support — "Help & support".
 *
 * Rebuilt 2026-08-08 to the design supplied by the user: mint-grey ground, large serif heading, a
 * one-line subtitle, and a single white card holding the form — name and email side by side, then
 * subject, then message, then a deep-green pill button with a send icon.
 *
 * The submit behaviour is UNCHANGED: same POST to /api/support/ticket with the same four field
 * names. This was a restyle, not a rewrite of the backend contract.
 *
 * Replaces the old 268-line pages/SupportPage.tsx (mono type, sidebar, blue square buttons).
 */
import { useState } from 'react';
import { Send } from 'lucide-react';
import SEOHead from '@/components/SEOHead';
import { usePublicTheme } from '@/context/PublicThemeContext';
import { sTokens, fieldStyle, buttonStyle, SERIF } from './supportUI';
import SupportFaq from './SupportFaq';

export default function SupportPage() {
  const { darkMode: dm } = usePublicTheme();
  const [form, setForm] = useState({ user_name: '', user_email: '', subject: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const t = sTokens(dm);
  const field = fieldStyle(dm);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending'); setError('');
    try {
      const r = await fetch('/api/support/ticket', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not send your message.');
      setStatus('sent');
      setForm({ user_name: '', user_email: '', subject: '', message: '' });
    } catch (err) {
      setStatus('error'); setError(err instanceof Error ? err.message : 'Could not send your message.');
    }
  }

  return (
    <>
      <SEOHead
        title="Help & Support"
        description="Get help with Trade & Journal. Send us a message and we will reply by email, or browse answers to common questions."
        canonical="/support"
        noindex={false}
      />
      <div style={{ minHeight: '100vh', background: t.bg, transition: 'background .3s' }}>
        <style>{`
          .sp-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
          @media (max-width:560px) { .sp-row { grid-template-columns:1fr; } }
          .sp-field:focus { border-color:${t.accent} !important; box-shadow:0 0 0 3px ${t.accent}22; }
          /* Without this the placeholder takes the browser default, which is lighter than the token
             and below the contrast minimum — the token alone does not reach it. */
          .sp-field::placeholder { color:${t.dim}; opacity:1; }
          .sp-send:hover:not(:disabled) { background:${t.accentHv}; transform:translateY(-1px); }
        `}</style>

        <div style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(36px,6vw,64px) 24px 96px' }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(1.9rem,4vw,2.6rem)', fontWeight: 700,
                       color: t.ink, margin: '0 0 8px', letterSpacing: '-0.015em', lineHeight: 1.15 }}>
            Help &amp; support
          </h1>
          <p style={{ fontFamily: SERIF, fontSize: 15.5, lineHeight: 1.7, color: t.body, margin: '0 0 26px' }}>
            Have a question or a problem? Send us a message and we will reply by{' '}
            <a href="mailto:support@tradeandjournal.com" style={{ color: t.link, textDecoration: 'underline', textUnderlineOffset: 2 }}>
              email
            </a>.
          </p>

          <div style={{ background: t.card, border: `1px solid ${t.rule}`, borderRadius: 14,
                        padding: 'clamp(20px,3.5vw,30px)' }}>
            {status === 'sent' ? (
              <div style={{ background: t.okBg, borderRadius: 10, padding: '26px 22px', textAlign: 'center' }}>
                <p style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, color: t.ink, margin: '0 0 6px' }}>
                  Message sent
                </p>
                <p style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.7, color: t.body, margin: '0 0 18px' }}>
                  Thanks — we have it. We reply by email, usually within 24–48 hours on weekdays.
                </p>
                <button onClick={() => setStatus('idle')} style={buttonStyle(dm, false)} className="sp-send">
                  Send another
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
                <div className="sp-row">
                  <input className="sp-field" style={field} placeholder="Your name" aria-label="Your name"
                         value={form.user_name} onChange={set('user_name')} required />
                  <input className="sp-field" style={field} placeholder="Your email" aria-label="Your email"
                         type="email" value={form.user_email} onChange={set('user_email')} required />
                </div>
                <input className="sp-field" style={field} placeholder="Subject" aria-label="Subject"
                       value={form.subject} onChange={set('subject')} required />
                <textarea className="sp-field" style={{ ...field, minHeight: 132, resize: 'vertical' }}
                          placeholder="Message" aria-label="Message"
                          value={form.message} onChange={set('message')} required />

                {status === 'error' && (
                  <p role="alert" style={{ fontFamily: SERIF, fontSize: 14, color: t.errInk, margin: 0 }}>
                    {error}
                  </p>
                )}

                <div>
                  <button type="submit" disabled={status === 'sending'} className="sp-send"
                          style={buttonStyle(dm, status === 'sending')}>
                    <Send size={15} aria-hidden />
                    {status === 'sending' ? 'Sending…' : 'Send message'}
                  </button>
                </div>
              </form>
            )}
          </div>

          <SupportFaq dm={dm} />
        </div>
      </div>
    </>
  );
}
