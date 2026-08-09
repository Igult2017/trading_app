/** The FAQ accordion, restyled to match the support page design.
 *
 * Kept from the previous /support page rather than dropped — the design supplied on 2026-08-08
 * showed the header and the form, which is the top of the page; it said nothing about removing the
 * answers underneath, and deleting working content nobody asked to remove is not a redesign.
 */
import { useState } from 'react';
import { sTokens, SERIF } from './supportUI';

const FAQS = [
  { q: 'How do I reset my password?',        a: 'Click the "Forgot Password" link on the login page. A reset link will be emailed to you and expires after 1 hour.' },
  { q: 'Is my journal data private?',        a: 'Yes. Your trade entries, notes and screenshots are encrypted in transit and at rest, and we never sell or share your individual trading data.' },
  { q: 'Can I export my trade data?',        a: 'CSV and JSON export is available in the Analytics section. You can filter by session, date range or strategy before exporting.' },
  { q: 'How do I import trades from MT4/5?', a: 'Export your account history from the broker terminal as a CSV, then use the Import panel in your Journal to map the columns.' },
  { q: 'Can I connect my live broker?',      a: 'Broker sync is available for selected platforms. Check the Accounts section in your dashboard for what is currently supported.' },
  { q: 'How do I cancel my subscription?',   a: 'Account Settings → Subscription → Cancel Plan. Cancellation takes effect at the end of the period you have already paid for. See the Cancellation & Refunds page for your rights.' },
  { q: 'How do I delete my account?',        a: 'You can delete it from your profile settings. If you would rather we did it, send a message above with the subject "Account Deletion" — we export your data first and process it within 5 business days.' },
  { q: 'I found a bug — how do I report it?', a: 'Use the form above with the subject "Bug Report", and include the steps to reproduce it, your browser, and a screenshot if you have one.' },
];

export default function SupportFaq({ dm }: { dm: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const t = sTokens(dm);

  return (
    <section style={{ maxWidth: 640, margin: '54px auto 0' }}>
      <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(1.2rem,2.2vw,1.5rem)', fontWeight: 700,
                   color: t.ink, margin: '0 0 18px', letterSpacing: '-0.01em' }}>
        Common questions
      </h2>

      <div style={{ background: t.card, border: `1px solid ${t.rule}`, borderRadius: 14, overflow: 'hidden' }}>
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={i} style={{ borderTop: i ? `1px solid ${t.rule}` : 'none' }}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                         width: '100%', gap: 16, background: 'none', border: 'none', cursor: 'pointer',
                         textAlign: 'left', padding: '16px 20px',
                         fontFamily: SERIF, fontSize: 15, fontWeight: isOpen ? 700 : 400,
                         color: isOpen ? t.ink : t.body }}>
                {f.q}
                <span aria-hidden style={{ color: t.dim, fontSize: 18, lineHeight: 1, flexShrink: 0,
                                           transform: isOpen ? 'rotate(45deg)' : 'none',
                                           transition: 'transform .18s' }}>+</span>
              </button>
              {isOpen && (
                <p style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.75, color: t.body,
                            margin: 0, padding: '0 20px 18px' }}>
                  {f.a}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
