import React from 'react';
import { Check } from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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
    features: ['Everything in Monthly', 'Priority support', 'Onboarding session', 'TradeSync Copier add-on'],
    cta: 'Start Yearly', popular: false, badge: 'Best Value — $15/mo',
  },
];

export default function PricingSection({ darkMode }: { darkMode: boolean }) {
  return (
    <section
      id="pricing"
      className={cn('py-20 px-4 sm:px-6 lg:px-8 transition-colors duration-300',
        darkMode ? 'bg-slate-900/60' : 'bg-slate-50/80')}
    >
      <div className="max-w-6xl mx-auto">
        <h2
          className={cn('text-4xl text-center mb-4 font-bold tracking-tight',
            darkMode ? 'text-white' : 'text-slate-900')}
          style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 400 }}
        >
          Simple, Transparent Pricing
        </h2>
        <p className={cn('text-xl text-center mb-16 max-w-3xl mx-auto', darkMode ? 'text-slate-400' : 'text-slate-500')}>
          Choose the plan that fits your trading journey. No hidden fees, cancel anytime.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
          {plans.map((plan) => (
            <div key={plan.name} className="relative pt-3">
              {plan.badge && (
                <div className={cn(
                  'absolute top-0 z-10 px-3 py-1 rounded-full text-xs font-bold text-white whitespace-nowrap',
                  plan.popular
                    ? 'left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-400 to-blue-500'
                    : 'right-4 bg-gradient-to-r from-blue-600 to-blue-700'
                )}>
                  {plan.badge}
                </div>
              )}

              <Card className={cn(
                'flex flex-col h-full transition-all duration-300',
                plan.popular
                  ? 'bg-gradient-to-br from-blue-700 to-blue-600 border-none text-white shadow-[0_20px_60px_rgba(37,99,235,0.4)]'
                  : darkMode
                    ? 'bg-slate-900 border-slate-700 text-white'
                    : 'bg-white border-slate-200 text-slate-900'
              )}>
                <CardHeader className="pb-2">
                  <div className={cn('text-xl font-bold tracking-tight', plan.popular ? 'text-white' : '')}
                    style={{ fontFamily: "'Playfair Display', serif" }}>
                    {plan.name}
                  </div>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-4xl font-extrabold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                      {plan.price}
                    </span>
                    <span className={cn('text-sm', plan.popular ? 'text-blue-200' : darkMode ? 'text-slate-400' : 'text-slate-500')}>
                      / {plan.period}
                    </span>
                  </div>
                  <p className={cn('text-xs mt-1', plan.popular ? 'text-blue-100' : darkMode ? 'text-slate-400' : 'text-slate-500')}>
                    {plan.tagline}
                  </p>
                </CardHeader>

                <CardContent className="flex-1 pt-2">
                  <ul className="space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check size={14} className={cn('shrink-0', plan.popular ? 'text-blue-200' : 'text-blue-500')} />
                        <span className={plan.popular ? 'text-blue-50' : darkMode ? 'text-slate-200' : 'text-slate-700'}>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="pt-4">
                  <a
                    href="/auth?mode=signup"
                    target="myfm_journal"
                    className={cn(
                      'w-full text-center py-3 rounded-full text-sm font-bold transition-all duration-200 hover:opacity-90',
                      plan.popular
                        ? 'bg-white/20 border-2 border-white/50 text-white hover:bg-white/30'
                        : darkMode
                          ? 'border-2 border-slate-600 text-white hover:border-blue-500'
                          : 'border-2 border-slate-200 text-slate-800 hover:border-blue-400'
                    )}
                    style={{ fontFamily: "'Montserrat', sans-serif", display: 'block', textDecoration: 'none' }}
                  >
                    {plan.cta}
                  </a>
                </CardFooter>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
