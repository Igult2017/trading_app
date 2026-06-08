import React from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';

const C = {
  card: 'var(--admin-card)', border: 'var(--admin-border)',
  text: '#c2d8ef', muted: '#4e6a88', bg: 'var(--admin-bg)',
};

const SOURCE_COLORS: Record<string, string> = {
  Google:    '#4285F4',
  Facebook:  '#1877F2',
  TikTok:    '#ff0050',
  X:         '#e7e7e7',
  YouTube:   '#FF0000',
  Instagram: '#E1306C',
  LinkedIn:  '#0A66C2',
  Reddit:    '#FF4500',
  Direct:    '#00c8e0',
  Other:     '#4e6a88',
  Unknown:   '#2a3a50',
};

function colorFor(source: string) {
  return SOURCE_COLORS[source] ?? '#4e6a88';
}

interface SourceRow    { source: string; visits: number; pct: number; }
interface TimeRow      { label: string; [key: string]: number | string; }

interface Props {
  bySources:      SourceRow[];
  sourceOverTime: TimeRow[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0c1018', border: '1px solid #1b2840', padding: '10px 14px', fontSize: 11 }}>
      <p style={{ color: '#c2d8ef', margin: '0 0 6px', fontWeight: 700 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ margin: '2px 0', color: p.fill ?? p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

export default function SourceChart({ bySources, sourceOverTime }: Props) {
  const sources = [...new Set(sourceOverTime.flatMap(r => Object.keys(r).filter(k => k !== 'label')))];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 6 }}>
      {/* Donut */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, padding: '14px 18px' }}>
        <p style={{ color: 'white', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px' }}>Source Split</p>
        {bySources.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '40px 0' }}>No data yet</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={bySources} dataKey="visits" nameKey="source" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {bySources.map((r, i) => <Cell key={i} fill={colorFor(r.source)} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {bySources.slice(0, 6).map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.text }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorFor(r.source), display: 'inline-block' }} />
                    {r.source}
                  </span>
                  <span style={{ color: 'white', fontWeight: 700 }}>{r.pct}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Stacked bar */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, padding: '14px 18px' }}>
        <p style={{ color: 'white', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px' }}>Traffic Over Time</p>
        {sourceOverTime.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '40px 0' }}>No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={sourceOverTime} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1b2840" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, color: C.muted }} />
              {sources.map(s => (
                <Bar key={s} dataKey={s} stackId="a" fill={colorFor(s)} radius={s === sources[sources.length - 1] ? [2, 2, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
