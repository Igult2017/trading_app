import React from 'react';
import { Check } from 'lucide-react';

interface Plan {
  name: string; price: string; period: string; tagline: string;
  features: string[]; cta: string; popular: boolean; badge: string | null;
}

const plans: Plan[] = [
  {
    name: 'Free', price: '$0', period: 'forever',
    tagline: 'Start tracking your trades with no commitment.',
    features: ['Core trade stats', 'Trade calendar view', 'MT4/MT5 integration', 'Basic P&L tracking', 'Up to 50 trades/month'],
    cta: 'Get Started Free', popular: false, badge: null,
  },
  {
    name: 'Weekly', price: '$7', period: 'week',
    tagline: 'Full access for traders testing the waters.',
    features: ['Everything in Free', 'Full trade journal', 'Detailed analytics', 'Strategy audit', 'Unlimited trades'],
    cta: 'Start Weekly', popular: false, badge: null,
  },
  {
    name: 'Monthly', price: '$20', period: 'month',
    tagline: 'The complete platform for serious traders.',
    features: ['Everything in Weekly', 'AI Coach (Trader AI)', 'Behaviour analysis', 'Export reports (PDF/CSV)', 'TradeSync Copier add-on'],
    cta: 'Start Monthly', popular: true, badge: 'Most Popular',
  },
  {
    name: 'Yearly', price: '$180', period: 'year',
    tagline: 'Maximum value for committed traders.',
    features: ['Everything in Monthly', 'SMC Signal Scanner', 'Priority support', 'Onboarding session', 'TradeSync Copier add-on'],
    cta: 'Start Yearly', popular: false, badge: 'Best Value — $15/mo',
  },
];

export default function PricingSection({ darkMode }: { darkMode: boolean }) {
  const cardBg   = darkMode ? '#0f172a' : '#ffffff';
  const border   = darkMode ? '#1e293b' : '#e2e8f0';
  const text     = darkMode ? '#ffffff' : '#0f172a';
  const muted    = darkMode ? '#94a3b8' : '#64748b';
  const sectionBg = darkMode ? 'rgba(15,23,42,0.6)' : 'rgba(241,245,249,0.8)';
  const hFont = { fontFamily: "'Oswald', sans-serif", fontWeight: 700, letterSpacing: '0.02em' } as const;
  const bFont = { fontFamily: "'Montserrat', sans-serif", fontWeight: 800 } as const;

  return (
    <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8" style={{ background: sectionBg, transition: 'all 0.4s ease' }}>
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl text-center mb-4" style={{ ...hFont, color: text }}>Simple, Transparent Pricing</h2>
        <p className="text-xl text-center mb-16 max-w-3xl mx-auto" style={{ color: muted }}>
          Choose the plan that fits your trading journey. No hidden fees, cancel anytime.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
          {plans.map((plan) => {
            const hot = plan.popular;
            return (
              <div key={plan.name} style={{
                position: 'relative', borderRadius: '16px', padding: '28px 24px',
                background: hot ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : cardBg,
                border: hot ? 'none' : `1px solid ${border}`,
                boxShadow: hot ? '0 20px 60px rgba(37,99,235,0.35)' : 'none',
                transition: 'all 0.3s ease',
              }}>
                {plan.badge && (
                  <div style={{
                    position: 'absolute', top: '-14px',
                    left: hot ? '50%' : 'auto', right: hot ? 'auto' : '16px',
                    transform: hot ? 'translateX(-50%)' : 'none',
                    background: hot ? 'linear-gradient(to right, #60a5fa, #3b82f6)' : 'linear-gradient(to right, #2563eb, #1d4ed8)',
                    color: '#fff', padding: '4px 14px', borderRadius: '9999px',
                    fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap',
                  }}>{plan.badge}</div>
                )}

                <h3 style={{ ...hFont, fontSize: '22px', marginBottom: '8px', color: hot ? '#fff' : text }}>{plan.name}</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '8px' }}>
                  <span style={{ ...bFont, fontSize: '40px', color: hot ? '#fff' : text }}>{plan.price}</span>
                  <span style={{ fontSize: '14px', color: hot ? 'rgba(255,255,255,0.75)' : muted }}>/ {plan.period}</span>
                </div>
                <p style={{ fontSize: '13px', marginBottom: '20px', color: hot ? 'rgba(255,255,255,0.8)' : muted }}>{plan.tagline}</p>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: hot ? 'rgba(255,255,255,0.9)' : text }}>
                      <Check size={15} style={{ color: hot ? '#93c5fd' : '#2563eb', flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>

                <a href="/auth?mode=signup" target="myfm_journal" style={{
                  display: 'block', textAlign: 'center', padding: '12px', borderRadius: '9999px',
                  background: hot ? 'rgba(255,255,255,0.15)' : 'transparent',
                  border: `2px solid ${hot ? 'rgba(255,255,255,0.5)' : border}`,
                  color: hot ? '#fff' : text,
                  ...bFont, fontSize: '14px', textDecoration: 'none', transition: 'all 0.2s ease',
                }}>{plan.cta}</a>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
