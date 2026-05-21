import { useState } from 'react';
import { usePageTracking } from '@/hooks/usePageTracking';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Globe, Clock, AlertCircle, ArrowRightLeft } from 'lucide-react';
import HomeHeader from '@/components/HomeHeader';
import HomeFooter from '@/components/HomeFooter';

interface CalendarEvent {
  date: string;
  time: string;
  currency: string;
  event: string;
  importance: 'High' | 'Medium' | 'Low';
  actual: string;
  forecast: string;
  previous: string;
  eventTime: string;
  category: string;
}

interface RateEntry {
  nominal: number;
  inflation: number | null;
  bank: string;
  live: boolean;
}

const currencyPairs = [
  { base: 'USD', quote: 'JPY' },
  { base: 'EUR', quote: 'USD' },
  { base: 'GBP', quote: 'USD' },
  { base: 'AUD', quote: 'USD' },
  { base: 'USD', quote: 'CAD' },
  { base: 'USD', quote: 'CHF' },
  { base: 'NZD', quote: 'USD' },
  { base: 'EUR', quote: 'GBP' },
];

const filterCategories = ['All', 'Currencies', 'Crypto', 'Commodities', 'Stocks', 'Rate Differentials'];
const IMPACT_LEVELS = ['All', 'High', 'Medium', 'Low'] as const;

function impactStyle(imp: string): React.CSSProperties {
  switch (imp) {
    case 'High':   return { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' };
    case 'Medium': return { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' };
    default:       return { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' };
  }
}

export default function EconomicCalendarPage() {
  usePageTracking('calendar');
  const [filter, setFilter]           = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [ccyFilter, setCcyFilter]     = useState('All');
  const [impactFilter, setImpactFilter] = useState('All');
  const [darkMode, setDarkMode]       = useState(false);
  const [location] = useLocation();

  const dm = darkMode;

  const pageBg   = dm ? 'rgba(8,12,16,0.97)'  : '#f8fafc';
  const cardBg   = dm ? '#0c1219'              : '#ffffff';
  const border   = dm ? '#172233'              : '#e2e8f0';
  const textPrim = dm ? '#f1f5f9'              : '#0f172a';
  const textMut  = dm ? '#64748b'              : '#475569';
  const inputBg  = dm ? '#0c1219'              : '#f8fafc';
  const thBg     = dm ? '#0f1923'              : '#f8fafc';

  const { data: eventsRaw, isFetching: fetchingEvents } = useQuery<CalendarEvent[]>({
    queryKey: ['/api/homepage/calendar'],
    queryFn: () => fetch('/api/homepage/calendar').then(r => r.json()).then(d => Array.isArray(d) ? d : []).catch(() => []),
    staleTime: 5 * 60 * 1000,
    gcTime:    60 * 60 * 1000,
    placeholderData: (prev) => prev ?? [],
    refetchInterval: (query) => (!query.state.data || (query.state.data as CalendarEvent[]).length === 0) ? 20_000 : false,
  });
  const { data: bankDataRaw, isFetching: fetchingRates } = useQuery<Record<string, RateEntry>>({
    queryKey: ['/api/homepage/rates'],
    queryFn: () => fetch('/api/homepage/rates').then(r => r.json()).then(d => (d && typeof d === 'object' ? d : {})).catch(() => ({})),
    staleTime: 5 * 60 * 1000,
    gcTime:    60 * 60 * 1000,
    placeholderData: (prev) => prev ?? {},
  });
  const events   = eventsRaw   ?? [];
  const bankData = bankDataRaw ?? {};
  const fetching = fetchingEvents || fetchingRates;

  const availableCurrencies = ['All', ...Array.from(new Set(events.map(e => e.currency))).filter(Boolean).sort()];

  const filteredEvents = events.filter(event => {
    if (filter === 'Rate Differentials') return false;
    const matchesCategory = filter === 'All' || event.category === filter;
    const matchesSearch   = event.event.toLowerCase().includes(searchQuery.toLowerCase()) || event.currency.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCcy      = ccyFilter === 'All' || event.currency === ccyFilter;
    const matchesImpact   = impactFilter === 'All' || event.importance === impactFilter;
    return matchesCategory && matchesSearch && matchesCcy && matchesImpact;
  });

  /* ── shared element styles ───────────────────────────────────────────── */
  const selectStyle: React.CSSProperties = {
    appearance: 'none', background: inputBg, border: `1px solid ${border}`,
    borderRadius: 8, padding: '10px 36px 10px 14px',
    color: textPrim, fontSize: 12, fontFamily: "'Poppins',sans-serif",
    fontWeight: 600, outline: 'none', cursor: 'pointer',
    transition: 'border-color 0.2s',
  };
  const thStyle: React.CSSProperties = {
    padding: '12px 20px', fontSize: 9, fontWeight: 800,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    fontFamily: "'Poppins',sans-serif", color: textMut,
    background: thBg, borderBottom: `1px solid ${border}`,
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ minHeight: '100vh', background: pageBg, fontFamily: "'Poppins',sans-serif", transition: 'background 0.3s' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=Poppins:wght@400;500;600;700&display=swap');
        .ec-filter-btn { font-family:'Poppins',sans-serif; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; padding:10px 18px; border:none; cursor:pointer; transition:all 0.18s; white-space:nowrap; }
        .ec-tr:hover td { background:${dm ? 'rgba(255,255,255,0.03)' : '#f8fafc'} !important; }
        .ec-input { font-family:'Poppins',sans-serif; font-size:13px; font-weight:500; background:${inputBg}; border:1px solid ${border}; border-radius:8px; padding:10px 14px; color:${textPrim}; outline:none; width:100%; transition:border-color 0.2s; }
        .ec-input::placeholder { color:${dm ? '#334155' : '#94a3b8'}; }
        .ec-input:focus { border-color:#2563eb; }
        .ec-card { background:${cardBg}; border:1px solid ${border}; border-radius:12px; overflow:hidden; }
        .ec-select-wrap { position:relative; display:inline-block; }
        .ec-select-wrap::after { content:''; position:absolute; right:12px; top:50%; transform:translateY(-50%); border:4px solid transparent; border-top-color:${textMut}; pointer-events:none; margin-top:2px; }
      `}</style>

      <HomeHeader darkMode={darkMode} setDarkMode={setDarkMode} activePath={location} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{ background: dm ? 'rgba(8,12,16,0.97)' : '#ffffff', borderBottom: `1px solid ${border}`, padding: '52px 28px 44px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#3b82f6', marginBottom: 10 }}>
            My FM | Journal — Live Data
          </div>
          <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 900, fontSize: 'clamp(28px,4vw,46px)', letterSpacing: '-0.03em', color: textPrim, margin: '0 0 12px', lineHeight: 1.1 }}>
            Economic <span style={{ color: '#2563eb' }}>Calendar</span>
          </h1>
          <p style={{ fontSize: 14, fontWeight: 500, color: textMut, margin: 0, maxWidth: 520, lineHeight: 1.7 }}>
            Live macro events, central bank rate data, and currency pair differentials — updated in real time.
          </p>
        </div>
      </div>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '36px 28px 64px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Filter tabs + UTC badge ───────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', background: cardBg, border: `1px solid ${border}`, borderRadius: 10, overflow: 'hidden', flexWrap: 'nowrap', overflowX: 'auto' }}>
              {filterCategories.map(cat => (
                <button key={cat} className="ec-filter-btn"
                  style={{ background: filter === cat ? '#2563eb' : 'transparent', color: filter === cat ? '#ffffff' : textMut, borderRight: `1px solid ${border}` }}
                  onClick={() => setFilter(cat)}>
                  {cat}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: cardBg, border: `1px solid ${border}`, borderRadius: 8, padding: '8px 14px', fontSize: 11, fontWeight: 700, color: textMut, letterSpacing: '0.08em' }}>
              <Clock size={13} color="#3b82f6" />
              <span>UTC</span>
            </div>
          </div>

          {/* ── Search + filters row ──────────────────────────────────────── */}
          {filter !== 'Rate Differentials' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input className="ec-input" type="text" placeholder="Search events or currency…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ flex: 1, minWidth: 200 }} />

              <div className="ec-select-wrap">
                <select style={selectStyle} value={ccyFilter} onChange={e => setCcyFilter(e.target.value)}>
                  {availableCurrencies.map(c => <option key={c} value={c}>{c === 'All' ? 'All CCY' : c}</option>)}
                </select>
              </div>

              <div className="ec-select-wrap">
                <select style={selectStyle} value={impactFilter} onChange={e => setImpactFilter(e.target.value)}>
                  {IMPACT_LEVELS.map(l => <option key={l} value={l}>{l === 'All' ? 'All Impact' : `${l} Impact`}</option>)}
                </select>
              </div>

              {(ccyFilter !== 'All' || impactFilter !== 'All' || searchQuery) && (
                <button onClick={() => { setCcyFilter('All'); setImpactFilter('All'); setSearchQuery(''); }}
                  style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 8, padding: '10px 16px', fontSize: 11, fontWeight: 700, color: textMut, cursor: 'pointer', fontFamily: "'Poppins',sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Clear
                </button>
              )}
            </div>
          )}

          {/* ── Fetching indicator (subtle — shown while background refresh runs) */}
          {fetching && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: dm ? '#0f1923' : '#eff6ff', border: `1px solid ${dm ? '#1e2d3d' : '#bfdbfe'}`, borderRadius: 8, alignSelf: 'flex-start' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" style={{ animation: 'ec-spin 0.8s linear infinite', flexShrink: 0 }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <style>{`@keyframes ec-spin { to { transform: rotate(360deg); } }`}</style>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {events.length === 0 ? 'Fetching live calendar data…' : 'Refreshing…'}
              </span>
            </div>
          )}

          {/* ── Rate Differentials ────────────────────────────────────────── */}
          {filter === 'Rate Differentials' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* Central Bank Rates */}
              <div className="ec-card" style={{ minWidth: 0 }}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Globe size={14} color="#2563eb" />
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#2563eb' }}>Terminal Rates</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: textMut }}>Real Yields</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['CCY', 'Nominal', 'Inflation', 'Real Rate'].map((h, i) => (
                          <th key={h} style={{ ...thStyle, textAlign: i > 0 ? 'right' : 'left', color: h === 'Real Rate' ? '#2563eb' : textMut }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(bankData).map(([ccy, data]) => {
                        const realRate = data.inflation != null ? data.nominal - data.inflation : null;
                        return (
                          <tr key={ccy} className="ec-tr">
                            <td style={{ padding: '10px 16px', borderBottom: `1px solid ${border}` }}>
                              <div style={{ fontWeight: 700, fontSize: 11, color: textPrim }}>{ccy}</div>
                              {data.live && <div style={{ fontSize: 8, fontWeight: 700, color: '#16a34a', letterSpacing: '0.08em', textTransform: 'uppercase' }}>live</div>}
                            </td>
                            <td style={{ padding: '10px 16px', borderBottom: `1px solid ${border}`, textAlign: 'right', fontSize: 11, fontWeight: 500, color: textMut }}>{data.nominal.toFixed(2)}%</td>
                            <td style={{ padding: '10px 16px', borderBottom: `1px solid ${border}`, textAlign: 'right', fontSize: 11, fontWeight: 500, color: textMut }}>{data.inflation != null ? `${data.inflation.toFixed(2)}%` : '—'}</td>
                            <td style={{ padding: '10px 16px', borderBottom: `1px solid ${border}`, textAlign: 'right', fontSize: 11, fontWeight: 700, color: realRate == null ? textMut : realRate > 0 ? '#2563eb' : '#dc2626' }}>
                              {realRate != null ? `${realRate.toFixed(2)}%` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pair Differentials */}
              <div className="ec-card" style={{ minWidth: 0 }}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ArrowRightLeft size={14} color="#2563eb" />
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#2563eb' }}>Pair Differentials</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  {currencyPairs.filter(p => bankData[p.base] && bankData[p.quote]).map(pair => {
                    const diff = bankData[pair.base].nominal - bankData[pair.quote].nominal;
                    const isCarry = Math.abs(diff) > 3;
                    return (
                      <div key={`${pair.base}${pair.quote}`} style={{ padding: '12px 16px', borderBottom: `1px solid ${border}`, borderRight: `1px solid ${border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 11, color: textPrim }}>{pair.base}/{pair.quote}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: diff > 0 ? '#16a34a' : '#dc2626' }}>{diff > 0 ? 'BULLISH' : 'BEARISH'}</span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: textPrim, marginBottom: 4 }}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(2)}%
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 500, color: textMut, borderTop: `1px solid ${border}`, paddingTop: 6, marginTop: 6 }}>
                          <span>{pair.base} {bankData[pair.base].nominal.toFixed(2)}%</span>
                          {isCarry && <span style={{ color: '#2563eb', fontWeight: 700 }}>CARRY</span>}
                          <span>{pair.quote} {bankData[pair.quote].nominal.toFixed(2)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* ── Calendar table ────────────────────────────────────────────── */}
          {filter !== 'Rate Differentials' && (
            <div className="ec-card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Date</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Time</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>CCY</th>
                    <th style={{ ...thStyle, textAlign: 'left', width: '99%' }}>Event</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Impact</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Actual</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Forecast</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Prev</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((item, idx) => {
                    const actualNum   = parseFloat(item.actual);
                    const forecastNum = parseFloat(item.forecast);
                    const hasNumbers  = !isNaN(actualNum) && !isNaN(forecastNum) && item.actual !== '-';
                    const actualColor = item.actual === '-' ? textMut : hasNumbers && actualNum > forecastNum ? '#16a34a' : hasNumbers ? '#dc2626' : textPrim;
                    const rowBg = cardBg;
                    const rowBorder = `1px solid ${border}`;
                    return (
                      <tr key={idx} className="ec-tr">
                        <td style={{ padding: '14px 20px', borderBottom: rowBorder, background: rowBg, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: textPrim, fontFamily: "'Poppins',sans-serif" }}>{item.date}</td>
                        <td style={{ padding: '14px 20px', borderBottom: rowBorder, background: rowBg, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 500, color: textMut }}>{item.time}</td>
                        <td style={{ padding: '14px 20px', borderBottom: rowBorder, background: rowBg, whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '2px 8px', background: dm ? '#1e2d3d' : '#eff6ff', color: '#2563eb', fontSize: 10, fontWeight: 800, fontFamily: "'Montserrat',sans-serif", borderRadius: 4, letterSpacing: '0.05em' }}>
                            {item.currency}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px', borderBottom: rowBorder, background: rowBg }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: textPrim, fontFamily: "'Poppins',sans-serif", lineHeight: 1.4 }}>{item.event}</div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: textMut, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>{item.category}</div>
                        </td>
                        <td style={{ padding: '14px 20px', borderBottom: rowBorder, background: rowBg, whiteSpace: 'nowrap', textAlign: 'center' }}>
                          <span style={{ ...impactStyle(item.importance), padding: '3px 10px', fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 4, display: 'inline-block', fontFamily: "'Poppins',sans-serif" }}>
                            {item.importance}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px', borderBottom: rowBorder, background: rowBg, whiteSpace: 'nowrap', textAlign: 'right', fontSize: 12, fontWeight: 700, color: actualColor, fontFamily: "'Montserrat',sans-serif" }}>{item.actual}</td>
                        <td style={{ padding: '14px 20px', borderBottom: rowBorder, background: rowBg, whiteSpace: 'nowrap', textAlign: 'right', fontSize: 12, fontWeight: 600, color: textMut }}>{item.forecast}</td>
                        <td style={{ padding: '14px 20px', borderBottom: rowBorder, background: rowBg, whiteSpace: 'nowrap', textAlign: 'right', fontSize: 12, fontWeight: 600, color: textMut }}>{item.previous}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredEvents.length === 0 && (
                <div style={{ padding: '72px 24px', textAlign: 'center' }}>
                  <AlertCircle size={28} color={dm ? '#334155' : '#cbd5e1'} style={{ margin: '0 auto 16px' }} />
                  <p style={{ fontSize: 11, fontWeight: 700, color: textMut, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
                    {events.length === 0 && fetchingEvents ? 'Fetching live calendar data…' : 'No matching events found'}
                  </p>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      <HomeFooter darkMode={darkMode} />
    </div>
  );
}
