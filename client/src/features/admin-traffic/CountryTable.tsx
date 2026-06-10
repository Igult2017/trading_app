import React from 'react';

const C = {
  card: 'var(--admin-card)', border: 'var(--admin-border)',
  text: '#c2d8ef', muted: '#4e6a88', indigo: 'var(--admin-accent)',
  indigoL: 'var(--admin-accentL)',
};

interface CountryRow { country: string; countryCode: string; visits: number; pct: number; }

function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code ?? '')) return '🌐';
  return String.fromCodePoint(...Array.from(code.toUpperCase()).map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

export default function CountryTable({ rows }: { rows: CountryRow[] }) {
  const max = rows[0]?.visits ?? 1;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.indigo, boxShadow: `0 0 6px ${C.indigo}` }} />
        <span style={{ color: 'white', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>By Country</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: C.muted }}>{rows.length} countries</span>
      </div>
      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {rows.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '32px 0' }}>No data yet</p>
        ) : rows.map((r, i) => (
          <div key={i} style={{ padding: '10px 18px', borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ color: C.text, fontSize: 12 }}>{flagEmoji(r.countryCode)} {r.country}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>{r.visits.toLocaleString()}</span>
                <span style={{ color: C.muted, fontSize: 10 }}>{r.pct}%</span>
              </div>
            </div>
            <div style={{ height: 3, background: 'rgba(8,14,24,0.8)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(r.visits / max) * 100}%`, background: `linear-gradient(90deg, ${C.indigo}, ${C.indigoL})`, opacity: 0.7, transition: 'width 0.6s ease' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
