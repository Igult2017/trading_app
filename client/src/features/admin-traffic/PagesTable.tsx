import React from 'react';
import { BookOpen, TrendingUp, Globe, BarChart2, Activity, ShoppingBag, Clock, Briefcase, Zap, Lock, HelpCircle } from 'lucide-react';

const C = {
  card: 'var(--admin-card)', border: 'var(--admin-border)',
  text: '#c2d8ef', muted: '#4e6a88',
  green: '#00d48a', greenL: '#00ff9d',
};

const SECTION_ICONS: Record<string, React.ComponentType<any>> = {
  'Journal':           BookOpen,
  'Landing Page':      Globe,
  'Blog':              BookOpen,
  'Trade History':     Clock,
  'Analytics':         BarChart2,
  'Markets':           TrendingUp,
  'Assets':            ShoppingBag,
  'Accounts':          Briefcase,
  'Signals':           Zap,
  'Economic Calendar': Activity,
  'Auth':              Lock,
  'Other':             HelpCircle,
};

interface SectionRow { section: string; visits: number; pct: number; }

export default function PagesTable({ rows }: { rows: SectionRow[] }) {
  const max = rows[0]?.visits ?? 1;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
        <span style={{ color: 'white', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Page Sections</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: C.muted }}>by visits</span>
      </div>
      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {rows.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '32px 0' }}>No data yet</p>
        ) : rows.map((r, i) => {
          const Icon = SECTION_ICONS[r.section] ?? Activity;
          return (
            <div key={i} style={{ padding: '10px 18px', borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Icon size={12} style={{ color: C.muted }} />
                  <span style={{ color: C.text, fontSize: 12 }}>{r.section}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>{r.visits.toLocaleString()}</span>
                  <span style={{ color: C.muted, fontSize: 10 }}>{r.pct}%</span>
                </div>
              </div>
              <div style={{ height: 3, background: 'rgba(8,14,24,0.8)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(r.visits / max) * 100}%`, background: `linear-gradient(90deg, ${C.green}, ${C.greenL})`, opacity: 0.7, transition: 'width 0.6s ease' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
