import React, { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import SourceChart from './SourceChart';
import CountryTable from './CountryTable';
import PagesTable from './PagesTable';

const C = {
  bg: 'var(--admin-bg)', card: 'var(--admin-card)', border: 'var(--admin-border)',
  text: '#c2d8ef', muted: '#4e6a88', indigo: 'var(--admin-accent)', indigoL: 'var(--admin-accentL)',
};
const HFONT = 'var(--admin-header-font)';

type Period = 'week' | 'month' | 'year';

interface TrafficData {
  bySources:      { source: string; visits: number; pct: number }[];
  byCountry:      { country: string; countryCode: string; visits: number; pct: number }[];
  bySection:      { section: string; visits: number; pct: number }[];
  sourceOverTime: { label: string; [key: string]: number | string }[];
  totalVisits:    number;
}

export default function TrafficSection({ getAdminToken }: { getAdminToken: () => Promise<string | null> }) {
  const [period, setPeriod]   = useState<Period>('month');
  const [data, setData]       = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAdminToken().then(token => {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return fetch(`/api/admin/traffic-breakdown?period=${period}`, { headers });
    }).then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  const btn = (p: Period) => ({
    padding: '6px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    textTransform: 'uppercase' as const, letterSpacing: '0.08em', border: 'none',
    background: period === p ? C.indigo : 'transparent',
    color:      period === p ? 'white'  : C.muted,
    transition: 'all 0.15s',
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, padding: '0 2px', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 2px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Globe size={18} style={{ color: C.indigoL }} />
          <h2 style={{ color: 'white', fontSize: 16, fontWeight: 700, fontFamily: HFONT, margin: 0 }}>Traffic Analytics</h2>
          {data && (
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>
              {data.totalVisits.toLocaleString()} visits
            </span>
          )}
        </div>
        <div style={{ display: 'flex', background: C.card, border: `1px solid ${C.border}` }}>
          {(['week', 'month', 'year'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={btn(p)}>{p}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: C.muted, fontSize: 13 }}>Loading traffic data…</p>
        </div>
      ) : !data ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: C.muted, fontSize: 13 }}>Failed to load — try refreshing</p>
        </div>
      ) : (
        <>
          <SourceChart bySources={data.bySources} sourceOverTime={data.sourceOverTime} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <CountryTable rows={data.byCountry} />
            <PagesTable   rows={data.bySection} />
          </div>
          {data.totalVisits === 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, padding: '20px', textAlign: 'center' }}>
              <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>
                No traffic data for this period yet. Data populates as visitors arrive — existing page views show as Unknown until new visits come in.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
