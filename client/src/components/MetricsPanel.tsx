import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/queryClient';
import { useSessionBalance } from '@/hooks/useSessionBalance';
import TradingLoader, { useDelayedLoading } from '@/components/TradingLoader';

/* ─────────────────────────────────────────────────────────────────────
   DESIGN TOKENS  (matches attached reference)
───────────────────────────────────────────────────────────────────── */
const D = {
  bg:       '#0A0C10',
  bg2:      '#111318',
  bg3:      '#0E1016',
  bg4:      '#0C0E14',
  bdOuter:  '#1E2330',
  bdInner:  '#1A1F2E',
  bdRow:    '#12161E',
  bdDiv:    '#141820',
  text:     '#C8CDD8',
  label:    '#4A5568',
  muted:    '#5A6278',
  dim:      '#2E3545',
  sub:      '#3A4050',
  green:    '#1D9E75',
  greenBg:  '#0A2016',
  greenBd:  '#0F3020',
  red:      '#E24B4A',
  redBg:    '#1E0A0A',
  redBd:    '#3A1010',
  amber:    '#EF9F27',
  amberBg:  '#1E1200',
  amberBd:  '#3A2200',
  blue:     '#378ADD',
  blueBg:   '#0A1628',
  blueBd:   '#0F2A4A',
  purple:   '#7F77DD',
  purpleBg: '#140F28',
  purpleBd: '#251B4A',
  cyan:     '#4AE8D8',
  cyanBg:   '#0A2028',
  cyanBd:   '#0F3038',
  gray:     '#4A5568',
  grayBg:   '#12151C',
  grayBd:   '#1A1F2E',
};

const MONO: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace",
};

/* ─── helpers ─────────────────────────────────────────────────────── */
const pColor = (v: number | null | undefined) =>
  v == null ? D.label : v >= 65 ? D.green : v >= 50 ? D.amber : D.red;

const fmt    = (v: number | null | undefined, d = 0) => v == null ? '--' : v.toFixed(d);
const fmtPL  = (v: number) => v >= 0 ? `+$${Math.abs(v).toLocaleString()}` : `-$${Math.abs(v).toLocaleString()}`;
const fmtPct = (v: number) => `${Math.round(v)}%`;
const wr     = (obj: any): number | null => obj?.winRate ?? null;
const ct     = (obj: any): number => obj?.count ?? 0;

type ChipVariant = 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'cyan' | 'gray' | 'neutral';
const pVariant = (v: number | null | undefined): ChipVariant =>
  v == null ? 'neutral' : v >= 65 ? 'green' : v >= 50 ? 'amber' : 'red';

/* ─────────────────────────────────────────────────────────────────────
   ATOM COMPONENTS
───────────────────────────────────────────────────────────────────── */
const chipColors: Record<ChipVariant, { bg: string; color: string; border: string }> = {
  green:   { bg: D.greenBg,  color: D.green,  border: D.greenBd },
  red:     { bg: D.redBg,    color: D.red,     border: D.redBd },
  amber:   { bg: D.amberBg,  color: D.amber,   border: D.amberBd },
  blue:    { bg: D.blueBg,   color: D.blue,    border: D.blueBd },
  purple:  { bg: D.purpleBg, color: D.purple,  border: D.purpleBd },
  cyan:    { bg: D.cyanBg,   color: D.cyan,    border: D.cyanBd },
  gray:    { bg: D.grayBg,   color: D.gray,    border: D.grayBd },
  neutral: { bg: D.grayBg,   color: D.sub,     border: D.grayBd },
};

const Chip = ({ children, variant = 'neutral' as ChipVariant }: { children: React.ReactNode; variant?: ChipVariant }) => {
  const c = chipColors[variant] || chipColors.neutral;
  return (
    <span style={{
      ...MONO,
      fontSize: 9, fontWeight: 600,
      padding: '1px 6px', borderRadius: 20,
      background: c.bg, color: c.color, border: `0.5px solid ${c.border}`,
      letterSpacing: '0.04em', whiteSpace: 'nowrap' as const, lineHeight: '16px',
    }}>
      {children}
    </span>
  );
};

const Panel = ({ title, badge, badgeColor = 'gray' as ChipVariant, children, style = {} as React.CSSProperties }: any) => (
  <div style={{ background: D.bg3, border: `0.5px solid ${D.bdInner}`, borderRadius: 10, overflow: 'hidden', ...style }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: `0.5px solid ${D.bdInner}`, background: D.bg4 }}>
      <span style={{ ...MONO, fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: D.label }}>
        {title}
      </span>
      {badge && <Chip variant={badgeColor as ChipVariant}>{badge}</Chip>}
    </div>
    <div style={{ padding: '8px 12px 10px' }}>{children}</div>
  </div>
);

const DivLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ ...MONO, fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: D.dim, padding: '7px 0 3px', borderBottom: `0.5px solid ${D.bdDiv}`, marginBottom: 1 }}>
    {children}
  </div>
);

const SectionDivider = ({ label }: { label: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
    <div style={{ flex: 1, height: '0.5px', background: D.bdInner }} />
    <span style={{ ...MONO, fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: D.dim }}>{label}</span>
    <div style={{ flex: 1, height: '0.5px', background: D.bdInner }} />
  </div>
);

const SubLabel = ({ children, style = {} as React.CSSProperties }: any) => (
  <div style={{ ...MONO, fontSize: 8, color: D.dim, textTransform: 'uppercase' as const, letterSpacing: '0.1em', borderTop: `0.5px solid ${D.bdRow}`, paddingTop: 7, marginTop: 9, marginBottom: 5, ...style }}>
    {children}
  </div>
);

const Row = ({ label, children, noBorder = false }: { label: React.ReactNode; children?: React.ReactNode; noBorder?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: noBorder ? 'none' : `0.5px solid ${D.bdRow}` }}>
    <span style={{ ...MONO, fontSize: 10, color: D.muted, display: 'flex', alignItems: 'center', gap: 6 }}>{label}</span>
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>{children}</div>
  </div>
);

const Dot = ({ color }: { color: string }) => (
  <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: color }} />
);

const PipBar = ({ filled, total = 5, winPct }: { filled: number; total?: number; winPct: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ width: 16, height: 3, borderRadius: 2, background: i < filled ? D.green : D.bdInner }} />
      ))}
    </div>
    <span style={{ ...MONO, fontSize: 9, color: D.green, minWidth: 28, textAlign: 'right' as const, fontWeight: 600 }}>{winPct}</span>
  </div>
);

const Scroll = ({ children }: { children: React.ReactNode }) => (
  <div className="mp-scroll">{children}</div>
);

/* ─── DATA ROW helpers ─────────────────────────────────────────────── */
const DR = ({ label, value, vc }: { label: string; value: string; vc?: string }) => (
  <Row label={label}>
    <span style={{ ...MONO, fontSize: 10, fontWeight: 600, color: vc || D.text }}>{value}</span>
  </Row>
);

const Bar = ({ label, pct, sub, count }: { label: string; pct: number | null | undefined; sub?: string; count?: number }) => {
  const v = pct != null ? Math.round(pct) : null;
  return (
    <Row label={label}>
      {count != null && <Chip variant="gray">{count}</Chip>}
      {sub && <span style={{ ...MONO, fontSize: 9, color: D.dim }}>{sub}</span>}
      <Chip variant={pVariant(v)}>{v != null ? `${v}%` : '—'}</Chip>
    </Row>
  );
};

const YN = ({ label, yes, no }: { label: string; yes: number | null | undefined; no: number | null | undefined }) => (
  <Row label={label}>
    <Chip variant={yes != null ? 'green' : 'neutral'}>{yes != null ? `Yes ${Math.round(yes)}%` : 'Yes —'}</Chip>
    <Chip variant={no != null ? 'red' : 'neutral'}>{no != null ? `No ${Math.round(no)}%` : 'No —'}</Chip>
  </Row>
);

const BoolYN = ({ label, data }: { label: string; data: any }) => (
  <YN label={label} yes={data?.yes?.winRate} no={data?.no?.winRate} />
);

const Multi = ({ label, options }: { label?: string; options: { label: string; pct: number | null | undefined }[] }) => (
  <Row label={label || ''}>
    {options.map((o, i) => (
      <Chip key={i} variant={pVariant(o.pct)}>
        {o.label.slice(0, 5)} {o.pct != null ? `${Math.round(o.pct)}%` : '—'}
      </Chip>
    ))}
  </Row>
);

const SplitBar = ({ label, win, loss: _loss, count, labelSize = 10 }: { label: string; win: number; loss: number; count?: number; labelSize?: number }) => (
  <Row label={<span style={{ fontSize: labelSize }}>{label}</span>}>
    {count != null && <Chip variant="gray">{count}</Chip>}
    <Chip variant={pVariant(win)}>{win}%</Chip>
  </Row>
);

/* ─── Score impact → pip bar ─────────────────────────────────────── */
function scoreRowFromImpact(arr: any[]): { score: string; pct: number | null }[] {
  if (!Array.isArray(arr) || arr.length === 0)
    return [{ score: '4.5', pct: null }, { score: '4.0', pct: null }, { score: '3.5', pct: null }, { score: '3.0', pct: null }];
  return arr.map((b: any) => ({ score: String(b.score), pct: b.winRate ?? null }));
}

function scoreToPip(scores: { score: string; pct: number | null }[]): { filled: number; winPct: string } {
  const withData = scores.filter(b => b.pct != null);
  if (withData.length === 0) return { filled: 0, winPct: '—' };
  const avgWR    = withData.reduce((s, b) => s + (b.pct || 0), 0) / withData.length;
  const avgScore = withData.reduce((s, b) => s + parseFloat(b.score), 0) / withData.length;
  return { filled: Math.min(5, Math.max(0, Math.round(avgScore))), winPct: `${Math.round(avgWR)}%` };
}

const ScoreRow = ({ label, scores }: { label: string; scores: { score: string; pct: number | null }[] }) => {
  const { filled, winPct } = scoreToPip(scores);
  return (
    <Row label={label}>
      <PipBar filled={filled} winPct={winPct} />
    </Row>
  );
};

/* ─────────────────────────────────────────────────────────────────────
   EQUITY CHART  (wiring unchanged, tokens updated)
───────────────────────────────────────────────────────────────────── */
const EquityChart = ({ equityCurve, equityGrowth }: { equityCurve: any[]; equityGrowth?: any }) => {
  const [view, setView] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const H = 160; const W = 600;

  const groupedPoints = (() => {
    if (!equityCurve || equityCurve.length === 0) return [];
    if (view === 'DAILY') return equityCurve.map((e: any) => {
      const d = e.date ? new Date(e.date) : null;
      const label = (d && !isNaN(d.getTime()))
        ? d.toLocaleString('default', { month: 'short', day: 'numeric' })
        : `#${e.tradeNumber}`;
      return { ...e, _label: label };
    });
    const buckets = new Map<string, any>();
    for (const e of equityCurve) {
      const d = e.date ? new Date(e.date) : null;
      let key: string; let label: string;
      if (!d || isNaN(d.getTime())) { key = `t${e.tradeNumber}`; label = `#${e.tradeNumber}`; }
      else if (view === 'WEEKLY') {
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
        key = `${d.getFullYear()}-W${week}`; label = `W${week}`;
      } else {
        key = `${d.getFullYear()}-${d.getMonth()}`;
        label = d.toLocaleString('default', { month: 'short' });
      }
      buckets.set(key, { ...e, _label: label });
    }
    return Array.from(buckets.values());
  })();

  const buildPts = (): [number, number][] => {
    if (groupedPoints.length === 0) return [[0, H / 2], [W, H / 2]];
    const vals = groupedPoints.map((e: any) => e.cumulativePL);
    const minV = Math.min(...vals); const maxV = Math.max(...vals); const range = maxV - minV || 1;
    return groupedPoints.map((e: any, i: number) => {
      const x = groupedPoints.length > 1 ? (i / (groupedPoints.length - 1)) * W : W / 2;
      const y = H - ((e.cumulativePL - minV) / range) * H * 0.85 - H * 0.075;
      return [x, Math.max(0, Math.min(H, y))];
    });
  };
  const pts  = buildPts();
  const path = pts.reduce((a: string, [x, y]: [number, number], i: number) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1]; const cx = px + (x - px) / 2;
    return `${a} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, '');
  const fill = `${path} L${pts[pts.length - 1][0]},${H} L0,${H} Z`;
  const last = pts[pts.length - 1];
  const labs = (() => {
    if (groupedPoints.length === 0) return ['--'];
    const step = Math.max(1, Math.floor(groupedPoints.length / 5));
    return groupedPoints
      .filter((_: any, i: number) => i % step === 0 || i === groupedPoints.length - 1)
      .map((e: any) => e._label ?? `#${e.tradeNumber}`);
  })();
  const yLabels = (() => {
    if (groupedPoints.length === 0) return ['--', '--', '--', '--'];
    const vals = groupedPoints.map((e: any) => e.cumulativePL);
    const maxV = Math.max(...vals); const minV = Math.min(...vals); const range = maxV - minV || 1;
    return [maxV, maxV - range * 0.33, maxV - range * 0.66, minV].map(v =>
      v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`
    );
  })();
  const balance  = equityGrowth?.currentBalance ?? 0;
  const startBal = equityGrowth?.startingBalance ?? 0;
  const retPct   = equityGrowth?.totalReturnPct  ?? 0;
  const totalPL2 = equityGrowth?.totalPL ?? 0;
  const isPos2   = totalPL2 >= 0;
  const fmtBal   = (v: number) => v ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '--';

  return (
    <div style={{ background: D.bg3, border: `0.5px solid ${D.bdInner}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '9px 12px', borderBottom: `0.5px solid ${D.bdInner}`, background: D.bg4 }}>
        <span style={{ ...MONO, fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: D.label }}>Equity Curve</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ ...MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase' as const, padding: '2px 8px', border: `0.5px solid ${view === v ? D.cyan : D.bdInner}`, background: view === v ? `${D.cyan}18` : 'transparent', color: view === v ? D.cyan : D.label, cursor: 'pointer', outline: 'none', borderRadius: 4 }}>
              {v}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {([['Balance', fmtBal(balance), isPos2 ? D.green : D.red], ['Return', retPct ? `${retPct >= 0 ? '+' : ''}${retPct.toFixed(2)}%` : '--', isPos2 ? D.green : D.red], ['Start', fmtBal(startBal), D.text]] as [string, string, string][]).map(([l, v, c], i) => (
            <div key={i} style={{ textAlign: 'right' as const }}>
              <div style={{ ...MONO, fontSize: 7, color: D.dim, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 1 }}>{l}</div>
              <span style={{ ...MONO, fontSize: 9, fontWeight: 600, color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '10px 14px 8px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 6, paddingBottom: 18 }}>
            {yLabels.map((l, i) => <span key={i} style={{ ...MONO, fontSize: 7, color: D.dim }}>{l}</span>)}
          </div>
          <div style={{ flex: 1 }}>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="mp-eq-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={D.cyan} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={D.cyan} stopOpacity="0.01" />
                </linearGradient>
              </defs>
              {[0, 0.33, 0.66, 1].map((p, i) => <line key={i} x1="0" y1={p * H} x2={W} y2={p * H} stroke={D.bdRow} strokeWidth="0.5" />)}
              <path d={fill} fill="url(#mp-eq-grad)" />
              <path d={path} fill="none" stroke={D.cyan} strokeWidth="1.5" />
              <circle cx={last[0]} cy={last[1]} r="4" fill={D.bg3} stroke={D.cyan} strokeWidth="1.5" />
              <circle cx={last[0]} cy={last[1]} r="1.5" fill={D.cyan} />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {labs.map((l: string, i: number) => <span key={i} style={{ ...MONO, fontSize: 7, color: D.dim }}>{l}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═════════════════════════════════════════════════════════════════════
   MAIN EXPORT
═════════════════════════════════════════════════════════════════════ */
export default function MetricsPanel({ sessionId }: { sessionId?: string | null }) {
  const [strat, setStrat] = useState('ALL STRATEGIES');

  const queryUrl = sessionId
    ? `/api/metrics/compute?sessionId=${sessionId}`
    : '/api/metrics/compute';

  const { tradeCount, isLoading: balLoading } = useSessionBalance(sessionId);
  const hasTrades = tradeCount > 0;

  const { data: metricsData, isLoading, isFetching, isError } = useQuery<{ success: boolean; metrics: any }>({
    queryKey: ['/api/metrics/compute', sessionId],
    queryFn: async () => {
      const r = await authFetch(queryUrl);
      if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
      return r.json();
    },
    enabled: !!sessionId && hasTrades,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4000),
  });

  /* ── CSS ── */
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
    .mp-root, .mp-root *, .mp-root *::before, .mp-root *::after { box-sizing: border-box; margin: 0; padding: 0; }
    .mp-root { font-family: 'JetBrains Mono', 'Fira Mono', 'Courier New', monospace; background: ${D.bg}; color: ${D.text}; }
    .mp-kpi  { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; padding: 8px 0; background: ${D.bg}; border-bottom: 0.5px solid ${D.bdInner}; }
    .mp-page { padding: 12px 0; display: flex; flex-direction: column; gap: 10px; }
    .mp-g4   { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .mp-g3   { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .mp-g2   { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .mp-scroll      { max-height: 400px; overflow-y: auto; }
    .mp-scroll::-webkit-scrollbar { width: 3px; }
    .mp-scroll::-webkit-scrollbar-thumb { background: ${D.bdInner}; border-radius: 2px; }
    .mp-dtable      { width: 100%; border-collapse: collapse; }
    .mp-dtable th   { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: ${D.label}; text-transform: uppercase; letter-spacing: 0.1em; padding: 7px 10px; text-align: left; border-bottom: 0.5px solid ${D.bdInner}; font-weight: 500; }
    .mp-dtable td   { font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 7px 10px; border-bottom: 0.5px solid ${D.bdRow}; color: ${D.text}; }
    .mp-dtable tr:last-child td { border-bottom: none; }
    .mp-select      { font-family: 'JetBrains Mono', monospace; font-size: 9px; background: ${D.bg4}; color: ${D.muted}; border: 0.5px solid ${D.bdInner}; padding: 2px 6px; outline: none; cursor: pointer; border-radius: 4px; letter-spacing: 0.06em; }
    .mp-strat-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
    .mp-eq-grid     { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }
    @media (max-width: 1024px) {
      .mp-page { padding: 10px 0; gap: 8px; }
      .mp-g4   { grid-template-columns: repeat(2, 1fr); }
      .mp-g3   { grid-template-columns: repeat(2, 1fr); }
      .mp-kpi  { grid-template-columns: repeat(4, 1fr); }
      .mp-eq-grid   { grid-template-columns: 1fr; }
      .mp-strat-grid{ grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .mp-page { padding: 8px 0; gap: 8px; }
      .mp-g4, .mp-g3, .mp-g2 { grid-template-columns: 1fr; }
      .mp-kpi  { grid-template-columns: repeat(2, 1fr); padding: 8px 0; }
      .mp-kpi-cell:last-child { grid-column: 1 / -1; }
      .mp-eq-grid { grid-template-columns: 1fr; }
      .mp-strat-grid { grid-template-columns: 1fr; }
    }
  `;

  /* ── GUARDS ── */
  const showMetricsLoader = useDelayedLoading(!!sessionId && (isLoading || (balLoading && !metricsData)));
  if (showMetricsLoader) return (
    <div className="mp-root" style={{ minHeight: '100vh', background: D.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{css}</style>
      <TradingLoader size="sm" message="Loading metrics…" />
    </div>
  );

  /* ── EXTRACT ── */
  const m                      = metricsData?.metrics        || {};
  const core                   = m.core                      || {};
  const streaks                = m.streaks                   || {};
  const sessionBreakdown       = m.sessionBreakdown          || {};
  const instrumentBreakdown    = m.instrumentBreakdown       || {};
  const directionBias          = m.directionBias             || {};
  const exitAnalysis           = m.exitAnalysis              || {};
  const riskMetrics            = m.riskMetrics               || {};
  const equityCurve: any[]     = m.equityCurve               || [];
  const equityGrowth           = m.equityGrowth;
  const strategyPerformance    = m.strategyPerformance       || {};
  const setupFrequency         = m.setupFrequency            || {};
  const tradeGrades            = m.tradeGrades               || {};
  const dayOfWeekBreakdown     = m.dayOfWeekBreakdown        || {};
  const timeframeBreakdown     = m.timeframeBreakdown        || {};
  const psychology             = m.psychology                || {};
  const marketRegime           = m.marketRegime              || {};
  const setupTags              = m.setupTags                 || {};
  const candlePatterns         = m.candlePatterns            || {};
  const candleIndicatorTFMatrix= m.candleIndicatorTFMatrix   || {};
  const durationBreakdown      = m.durationBreakdown         || {};
  const sessionPhase           = m.sessionPhase              || {};
  const sessionPhaseBySession  = m.sessionPhaseBySession     || {};
  const instrSessMatrix        = m.instrumentSessionMatrix         || {};
  const instrPhaseMomMatrix    = m.instrumentPhaseMomentumMatrix   || {};
  const stratMarketMatrix      = m.strategyMarketMatrix            || {};
  const orderTypeBreakdown     = m.orderTypeBreakdown        || {};
  const riskHeatBreakdown      = m.riskHeatBreakdown         || {};
  const newsImpactBreakdown    = m.newsImpactBreakdown       || {};
  const maeMfe                 = m.maeMfe                    || {};
  const rrAnalysis             = m.rrAnalysis                || {};
  const setupFreqAnnualised    = m.setupFrequencyAnnualised  || {};

  const boolImpacts  = psychology.booleanImpacts  || {};
  const catBreakdown = psychology.categoricals    || {};
  const scoreImpacts = psychology.scoreImpacts    || {};
  const tfEntry      = timeframeBreakdown.entry   || {};
  const tfAnalysis   = timeframeBreakdown.analysis || {};
  const tfContext    = timeframeBreakdown.context  || {};
  const regimeData   = marketRegime.regime        || {};
  const volatilityData = marketRegime.volatility  || {};
  const durationBuckets = durationBreakdown.buckets       || {};
  const timingCtxData   = durationBreakdown.timingContext || {};

  /* ── DERIVED ── */
  const totalPL      = core.totalPL      || 0;
  const winRate      = core.winRate      || 0;
  const expectancy   = core.expectancy   || 0;
  const totalTrades  = core.totalTrades  || 0;
  const profitFactor = core.profitFactor || 0;
  const pfDisplay    = profitFactor >= 999 ? '∞' : profitFactor.toFixed(2);
  const avgRR        = core.avgRR        || 0;
  const wins         = core.wins         || 0;
  const losses       = core.losses       || 0;
  const avgWin       = core.avgWin       || 0;
  const avgLoss      = core.avgLoss      || 0;
  const netGrowthPct = equityGrowth?.totalReturnPct ?? null;
  const maxDD        = streaks.maxDrawdown     || 0;
  const currentDD    = streaks.currentDrawdown || 0;
  const isPos        = totalPL >= 0;
  const winLossRatio = avgLoss > 0 ? (avgWin / avgLoss).toFixed(1) : '0';

  const longData    = directionBias.long    || {};
  const shortData   = directionBias.short   || {};
  const unknownData = directionBias.unknown || {};
  const longWR      = longData.winRate    || 0;
  const shortWR     = shortData.winRate   || 0;
  const unknownWR   = unknownData.winRate || 0;
  const longTrades    = longData.trades    || 0;
  const shortTrades   = shortData.trades   || 0;
  const unknownTrades = unknownData.trades || 0;

  const stratEntries = Object.entries(strategyPerformance).map(([name, d]: [string, any]) => ({
    name, wr: d.winRate ?? null, trades: d.trades || 0, pl: d.pl || 0,
  }));
  const strategies = ['ALL STRATEGIES', ...Object.keys(strategyPerformance).filter(k => k !== 'Unclassified')];

  const instrEntries      = Object.entries(instrumentBreakdown).map(([pair, d]: [string, any]) => ({ pair, wr: Math.round(d.winRate || 0), loss: 100 - Math.round(d.winRate || 0) }));
  const dayEntries        = Object.entries(dayOfWeekBreakdown).map(([day, d]: [string, any]) => ({ day, wr: Math.round((d as any).winRate || 0), count: (d as any).count || 0 }));
  const tfEntries         = Object.entries(tfEntry).map(([tf, d]: [string, any]) => ({ tf, wr: Math.round((d as any).winRate || 0), count: (d as any).count || 0 }));
  const sessEntries       = Object.entries(sessionBreakdown).map(([name, d]: [string, any]) => ({ name, wr: Math.round((d as any).winRate || 0), count: (d as any).count || 0 }));
  const exitEntries       = Object.entries(exitAnalysis).map(([reason, d]: [string, any]) => ({ reason, pct: Math.round((d as any).winRate || 0), ct: (d as any).count || 0 }));
  const candleEntries     = Object.entries(candlePatterns).map(([pat, d]: [string, any]) => ({ pat, wr: Math.round((d as any).winRate || 0), ct: (d as any).count || 0 }));
  const orderEntries      = Object.entries(orderTypeBreakdown).map(([ot, d]: [string, any]) => ({ ot, wr: Math.round((d as any).winRate || 0), ct: (d as any).count || 0 }));
  const sessionPhaseEntries   = Object.entries(sessionPhaseBySession).map(([k, d]: [string, any]) => ({ k, wr: (d as any).winRate ?? null, count: (d as any).count || 0 }));
  const instrSessEntries      = Object.entries(instrSessMatrix).map(([k, d]: [string, any]) => ({ k, win: Math.round((d as any).winRate || 0), loss: 100 - Math.round((d as any).winRate || 0), count: (d as any).count || 0 }));
  const instrPhaseMomEntries  = Object.entries(instrPhaseMomMatrix).map(([k, d]: [string, any]) => ({ k, win: Math.round((d as any).winRate || 0), loss: 100 - Math.round((d as any).winRate || 0), count: (d as any).count || 0 }));
  const newsEntries       = Object.entries(newsImpactBreakdown).map(([k, d]: [string, any]) => ({ k, wr: Math.round((d as any).winRate || 0), r: (d as any).avgRR?.toFixed(2) || '--' }));

  const riskOfRuin = (() => {
    if (winRate <= 0 || profitFactor <= 0) return 100;
    const wr2 = winRate / 100; const lr = 1 - wr2;
    if (lr === 0) return 0;
    return Math.max(0, Math.min(100, Math.round(Math.pow(lr / wr2, 10) * 100)));
  })();
  const rorStatus = riskOfRuin < 5 ? '✓ SAFE' : riskOfRuin < 20 ? '~ MODERATE' : riskOfRuin < 50 ? '⚠ ELEVATED' : '✕ CRITICAL';
  const rorColor  = riskOfRuin < 5 ? D.green : riskOfRuin < 20 ? D.amber : D.red;

  const topStrat = stratEntries.length > 0 ? stratEntries.reduce((a, b) => a.pl > b.pl ? a : b) : null;

  const ddPct        = equityGrowth?.startingBalance && maxDD > 0 ? ((maxDD / equityGrowth.startingBalance) * 100).toFixed(2) : '0.00';
  const currentDDPct = equityGrowth?.startingBalance && currentDD > 0 ? ((currentDD / equityGrowth.startingBalance) * 100).toFixed(2) : '0.00';

  const catWR = (field: string, label: string): number | null => catBreakdown[field]?.[label]?.winRate ?? null;

  const mgmtOpts = ['Rule-based', 'Discretionary', 'Hybrid'].map(l => ({
    label: l === 'Discretionary' ? 'Discret.' : l === 'Rule-based' ? 'Rule-Based' : l,
    pct: catWR('managementType', l),
  }));

  const entryMethodOpts = [
    { l: 'Market Entry', wr: catBreakdown.orderType?.['Market']?.winRate ?? null },
    { l: 'Limit Entry',  wr: catBreakdown.orderType?.['Limit']?.winRate  ?? null },
    { l: 'Stop Entry',   wr: catBreakdown.orderType?.['Stop']?.winRate   ?? null },
  ];

  const fmtFreq = (v: number | undefined): string => {
    if (v == null || isNaN(v)) return '--';
    if (v === 0) return '0';
    if (v >= 10) return v.toFixed(1);
    if (v >= 1)  return v.toFixed(2);
    if (v >= 0.1) return v.toFixed(2);
    if (v > 0)   return v.toFixed(3);
    return '0';
  };
  const setupFreqRows = Object.entries(setupFreqAnnualised).map(([name, d]: [string, any]) => ({
    n: name,
    d: fmtFreq(d.perDay), w: fmtFreq(d.perWeek), mo: fmtFreq(d.perMonth),
    y: (d.perYear == null || isNaN(d.perYear)) ? '--' : fmtFreq(d.perYear),
    wr: `${Math.round(setupTags[name]?.winRate || 0)}%`,
    pc: (setupTags[name]?.winRate || 0) >= 60 ? D.green : D.amber,
  }));

  /* ─── KPI DATA ── */
  const kpis = [
    { l: 'Total P&L',     v: fmtPL(totalPL),          s: isPos ? 'Profit' : 'Loss',    positive: isPos ? true : false },
    { l: 'Win Rate',      v: fmtPct(winRate),          s: `${wins}W · ${losses}L`,      positive: winRate >= 50 },
    { l: 'R Expectancy',  v: expectancy.toFixed(2),    s: 'Per trade',                  positive: null as boolean | null },
    { l: 'Trades',        v: `${totalTrades}`,         s: 'This period',                positive: null as boolean | null },
    { l: 'Profit Factor', v: pfDisplay,                s: 'Gross ratio',                positive: profitFactor >= 1 },
    { l: 'Avg R:R',       v: `1:${avgRR.toFixed(1)}`, s: 'Achieved',                   positive: null as boolean | null },
    {
      l: 'Net Growth',
      v: netGrowthPct != null ? `${netGrowthPct >= 0 ? '+' : ''}${netGrowthPct.toFixed(1)}%` : '--',
      s: 'Account growth',
      positive: netGrowthPct == null ? null : netGrowthPct >= 0,
    },
  ];

  /* ─── RENDER ── */
  return (
    <div className="mp-root">
      <style>{css}</style>

      {/* ── SYNC INDICATOR ── */}
      {isFetching && !isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 16px', background: D.bg, borderBottom: `0.5px solid ${D.bdRow}` }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: D.cyan, flexShrink: 0, animation: 'mp-pulse 1.2s ease-in-out infinite' }} />
          <span style={{ ...MONO, fontSize: 8, color: D.dim, letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Syncing…</span>
        </div>
      )}

      {/* ── KPI STRIP ── */}
      <div className="mp-kpi">
        {kpis.map((k, i) => (
          <div key={i} className="mp-kpi-cell" style={{ background: D.bg2, border: `0.5px solid ${D.bdOuter}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ ...MONO, fontSize: 9, color: D.label, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 5 }}>{k.l}</div>
            <div style={{ ...MONO, fontSize: 17, fontWeight: 600, lineHeight: 1.1, color: k.positive === true ? D.green : k.positive === false ? D.red : D.text, marginBottom: 3 }}>{k.v}</div>
            <div style={{ ...MONO, fontSize: 9, color: D.sub }}>{k.s}</div>
          </div>
        ))}
      </div>

      <div className="mp-page">

        {/* ─── CORE QUALITY METRICS ─── */}
        <SectionDivider label="Core Quality Metrics" />
        <div className="mp-g4">

          {/* Market Regime */}
          <Panel title="Market Regime" badge="Volatility" badgeColor="cyan">
            <DivLabel>Regime</DivLabel>
            {[
              { label: 'Bullish', dot: D.green, obj: regimeData['Bullish'] ?? regimeData['Trending'] },
              { label: 'Bearish', dot: D.red,   obj: regimeData['Bearish'] ?? regimeData['Bear'] },
              { label: 'Ranging', dot: D.dim,   obj: regimeData['Ranging'] ?? regimeData['Range'] },
            ].map((r, i) => (
              <Row key={i} label={<><Dot color={r.dot} />{r.label}</>}>
                <Chip variant="gray">{ct(r.obj)}</Chip>
                <Chip variant={pVariant(wr(r.obj))}>{wr(r.obj) != null ? `${Math.round(wr(r.obj)!)}%` : '—'}</Chip>
              </Row>
            ))}
            <DivLabel>Volatility State</DivLabel>
            {[
              { label: 'Low',    obj: volatilityData['Low'] },
              { label: 'Normal', obj: volatilityData['Normal'] },
              { label: 'High',   obj: volatilityData['High'] },
            ].map((v, i, arr) => (
              <Row key={i} label={v.label} noBorder={i === arr.length - 1}>
                <Chip variant="gray">{ct(v.obj)}</Chip>
                <Chip variant={pVariant(wr(v.obj))}>{wr(v.obj) != null ? `${Math.round(wr(v.obj)!)}%` : '—'}</Chip>
              </Row>
            ))}
          </Panel>

          {/* Execution Precision */}
          <Panel title="Execution Precision" badge="Score → Win%" badgeColor="blue">
            <Scroll>
              <div style={{ ...MONO, fontSize: 8, color: D.dim, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Score · win rate at threshold</div>
              <ScoreRow label="Entry Precision"   scores={scoreRowFromImpact(scoreImpacts.entryPrecisionScore)} />
              <ScoreRow label="Timing Quality"    scores={scoreRowFromImpact(scoreImpacts.timingQualityScore)} />
              <ScoreRow label="Market Alignment"  scores={scoreRowFromImpact(scoreImpacts.marketAlignmentScore)} />
              <ScoreRow label="Setup Clarity"     scores={scoreRowFromImpact(scoreImpacts.setupClarityScore)} />
              <ScoreRow label="Confluence Score"  scores={scoreRowFromImpact(scoreImpacts.confluenceScore)} />
              <ScoreRow label="Signal Validation" scores={scoreRowFromImpact(scoreImpacts.signalValidationScore)} />
              <DivLabel>Planned vs Actual · avg pips</DivLabel>
              <DR label="Entry Deviation" value={riskMetrics.avgEntryDeviation != null ? `${riskMetrics.avgEntryDeviation.toFixed(2)} pips` : '--'} vc={D.green} />
              <DR label="SL Deviation"   value={riskMetrics.avgSLDeviation    != null ? `${riskMetrics.avgSLDeviation.toFixed(2)} pips`    : '--'} vc={D.amber} />
              <DR label="TP Deviation"   value={riskMetrics.avgTPDeviation    != null ? `${riskMetrics.avgTPDeviation.toFixed(2)} pips`    : '--'} vc={D.green} />
              <DivLabel>Breakeven Effect</DivLabel>
              <Row label="Breakeven Applied">
                <Chip variant={boolImpacts.breakevenApplied?.yes?.winRate != null ? 'green' : 'neutral'}>
                  Yes {boolImpacts.breakevenApplied?.yes?.winRate != null ? `${Math.round(boolImpacts.breakevenApplied.yes.winRate)}%` : '—'}
                </Chip>
                <Chip variant={boolImpacts.breakevenApplied?.no?.winRate != null ? 'red' : 'neutral'}>
                  No {boolImpacts.breakevenApplied?.no?.winRate != null ? `${Math.round(boolImpacts.breakevenApplied.no.winRate)}%` : '—'}
                </Chip>
              </Row>
              <Multi label="Management Type" options={mgmtOpts} />
            </Scroll>
          </Panel>

          {/* Clarity & Confluence */}
          <Panel title="Clarity & Confluence" badge="Confluence" badgeColor="purple">
            <Scroll>
              <div style={{ ...MONO, fontSize: 8, color: D.dim, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>High / Low split</div>
              <Multi label="Clarity Level" options={[
                { label: 'High', pct: (() => { const arr = scoreImpacts.setupClarityScore; if (!arr) return null; const hi = arr.find((b: any) => b.score === '4.5'); return hi?.winRate ?? null; })() },
                { label: 'Low',  pct: (() => { const arr = scoreImpacts.setupClarityScore; if (!arr) return null; const lo = arr.find((b: any) => b.score === '3.0'); return lo?.winRate ?? null; })() },
              ]} />
              <DR label="Setup Clarity Avg"
                value={catBreakdown.setupClarityScore ? `${Math.round((Object.values(catBreakdown.setupClarityScore || {}) as any[]).reduce((a: number, b: any) => a + (b.winRate || 0), 0) / (Object.keys(catBreakdown.setupClarityScore || {}).length || 1))}%` : '--'}
                vc={D.green} />
              <DivLabel>Yes / No</DivLabel>
              <BoolYN label="MTF Alignment"         data={boolImpacts.mtfAlignment} />
              <BoolYN label="Trend Alignment"       data={boolImpacts.trendAlignment} />
              <BoolYN label="HTF Key Level Present" data={boolImpacts.htfKeyLevelPresent} />
              <BoolYN label="Key Level Respect"     data={boolImpacts.keyLevelRespected} />
              <DivLabel>Key Level Type</DivLabel>
              {Object.keys(catBreakdown.keyLevelType || {}).length > 0
                ? Object.entries(catBreakdown.keyLevelType || {}).map(([label, d]: [string, any], i) => (
                    <Bar key={i} label={label} pct={d?.winRate ?? null} count={d?.count || 0} />
                  ))
                : <span style={{ ...MONO, fontSize: 9, color: D.dim }}>No key level data yet</span>
              }
              <Multi label="Momentum" options={['Strong', 'Moderate', 'Weak'].map(l => ({ label: l, pct: catBreakdown.momentumValidity?.[l]?.winRate ?? null }))} />
              <BoolYN label="Target Logic" data={boolImpacts.targetLogic} />
              <Multi label="Order Type" options={['Limit', 'Market', 'Stop'].map(l => ({ label: l, pct: catBreakdown.orderType?.[l]?.winRate ?? null }))} />
            </Scroll>
          </Panel>

          {/* Psychology & Discipline */}
          <Panel title="Psychology & Discipline" badge="Psychology" badgeColor="amber">
            <Scroll>
              <div style={{ ...MONO, fontSize: 8, color: D.dim, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>High / Medium / Low</div>
              <Multi label="Rules Followed"      options={['High', 'Medium', 'Low'].map(l => ({ label: l, pct: catBreakdown.rulesFollowed?.[l]?.winRate ?? null }))} />
              <Multi label="Confidence"          options={['High', 'Medium', 'Low'].map(l => ({ label: l, pct: catBreakdown.confidenceLevel?.[l]?.winRate ?? null }))} />
              <Multi label="Energy Level"        options={['High', 'Medium', 'Low'].map(l => ({ label: l, pct: catBreakdown.energyLevel?.[l]?.winRate ?? null }))} />
              <Multi label="Focus Level"         options={['High', 'Medium', 'Low'].map(l => ({ label: l, pct: catBreakdown.focusLevel?.[l]?.winRate ?? null }))} />
              <Multi label="Confidence at Entry" options={['High', 'Medium', 'Low'].map(l => ({ label: l, pct: catBreakdown.confidenceAtEntry?.[l]?.winRate ?? null }))} />
              <Multi label="Emotional State"     options={['Calm', 'Neutral', 'Emotional'].map(l => ({ label: l, pct: catBreakdown.emotionalState?.[l]?.winRate ?? null }))} />
              <DivLabel>Yes / No</DivLabel>
              <BoolYN label="External Distraction" data={boolImpacts.externalDistraction} />
              <BoolYN label="Setup Fully Valid"     data={boolImpacts.setupFullyValid} />
              <BoolYN label="Any Rule Broken"       data={boolImpacts.ruleBroken} />
              <BoolYN label="FOMO Trades"           data={boolImpacts.fomoTrade} />
              <BoolYN label="Revenge Trades"        data={boolImpacts.revengeTrade} />
              <BoolYN label="Boredom Trades"        data={boolImpacts.boredomTrade} />
              <BoolYN label="Emotional Trades"      data={boolImpacts.emotionalTrade} />
              <DivLabel>Discipline &amp; Consistency</DivLabel>
              <DR label="Discipline Index"  value={psychology.discipline  != null ? `${psychology.discipline}%`  : '--'} vc={pColor(psychology.discipline)} />
              <DR label="Patience Index"    value={psychology.patience    != null ? `${psychology.patience}%`    : '--'} vc={pColor(psychology.patience)} />
              <DR label="Consistency Index" value={psychology.consistency != null ? `${psychology.consistency}%` : '--'} vc={pColor(psychology.consistency)} />
            </Scroll>
          </Panel>
        </div>

        {/* ─── DIRECTION · SETUP · EXIT · GOVERNANCE ─── */}
        <SectionDivider label="Direction · Setup · Exit · Governance" />
        <div className="mp-g4">

          {/* Direction & Bias */}
          <Panel title="Direction & Bias" badge="Direction" badgeColor="amber">
            <Scroll>
              <DivLabel>Direction</DivLabel>
              <Bar label="Long"  pct={Math.round(longWR)  || 0} count={longTrades} />
              <Bar label="Short" pct={Math.round(shortWR) || 0} count={shortTrades} />
              {unknownTrades > 0 && <Bar label="Unknown" pct={Math.round(unknownWR) || 0} count={unknownTrades} />}
              <DivLabel>HTF Bias</DivLabel>
              <Bar label="Bull"  pct={catBreakdown.htfBias?.['Bull']?.winRate  ?? null} count={ct(catBreakdown.htfBias?.['Bull'])} />
              <Bar label="Bear"  pct={catBreakdown.htfBias?.['Bear']?.winRate  ?? null} count={ct(catBreakdown.htfBias?.['Bear'])} />
              <Bar label="Range" pct={catBreakdown.htfBias?.['Range']?.winRate ?? null} count={ct(catBreakdown.htfBias?.['Range'])} />
              {(() => {
                const tagged  = (ct(catBreakdown.htfBias?.['Bull']) || 0) + (ct(catBreakdown.htfBias?.['Bear']) || 0) + (ct(catBreakdown.htfBias?.['Range']) || 0);
                const missing = Math.max(0, totalTrades - tagged);
                return missing > 0 ? <Bar label="Unknown" pct={null} count={missing} /> : null;
              })()}
              <DivLabel>Directional Bias</DivLabel>
              <Bar label="Long Bias"  pct={Math.round(longWR)  || 0} count={longTrades} />
              <Bar label="Short Bias" pct={Math.round(shortWR) || 0} count={shortTrades} />
              {unknownTrades > 0 && <Bar label="No Bias" pct={Math.round(unknownWR) || 0} count={unknownTrades} />}
            </Scroll>
          </Panel>

          {/* Setup Tags & Trade Grade */}
          <Panel title="Setup Tags & Trade Grade" badge="Setup · Grade" badgeColor="amber">
            <Scroll>
              <DivLabel>Setup Tag</DivLabel>
              {Object.entries(setupTags).map(([name, d]: [string, any], i) => (
                <Bar key={i} label={name} pct={d.winRate ?? null} count={d.count || 0} />
              ))}
              {Object.keys(setupTags).length === 0 && <span style={{ ...MONO, fontSize: 9, color: D.dim }}>No setup data yet</span>}
              <DivLabel>Trade Grade</DivLabel>
              {(['A', 'B', 'C', 'D', 'F'] as const).map(g => (
                <Bar key={g} label={g} pct={tradeGrades[g]?.winRate ?? null} count={tradeGrades[g]?.count || 0} />
              ))}
            </Scroll>
          </Panel>

          {/* Exit Causation */}
          <Panel title="Exit Causation" badge="Exit Analysis" badgeColor="red">
            <Scroll>
              {exitEntries.length > 0
                ? exitEntries.map((x, i) => (
                    <Row key={i} label={x.reason}>
                      <Chip variant="gray">{x.ct}</Chip>
                      <Chip variant={pVariant(x.pct)}>{x.pct}%</Chip>
                    </Row>
                  ))
                : <span style={{ ...MONO, fontSize: 9, color: D.dim }}>No exit data yet</span>
              }
              <DivLabel>Planned vs Achieved R:R</DivLabel>
              <DR label="Avg Planned R:R"  value={rrAnalysis.avgPlannedRR  != null ? `1:${rrAnalysis.avgPlannedRR.toFixed(1)}`  : '--'} />
              <DR label="Avg Achieved R:R" value={rrAnalysis.avgAchievedRR != null ? `1:${rrAnalysis.avgAchievedRR.toFixed(1)}` : '--'} vc={D.green} />
              <DR label="R:R Slippage"     value={rrAnalysis.avgRRSlippage != null ? `${rrAnalysis.avgRRSlippage.toFixed(2)}R`  : '--'} vc={D.amber} />
            </Scroll>
          </Panel>

          {/* Rule Governance */}
          <Panel title="Rule Governance" badge="Compliance" badgeColor="cyan">
            <Scroll>
              <DivLabel>Compliance</DivLabel>
              <BoolYN label="Setup Fully Valid" data={boolImpacts.setupFullyValid} />
              <BoolYN label="Any Rule Broken"   data={boolImpacts.ruleBroken} />
              <BoolYN label="Worth Repeating"   data={boolImpacts.worthRepeating} />
              <DivLabel>Impulse Control</DivLabel>
              <BoolYN label="FOMO Trades"      data={boolImpacts.fomoTrade} />
              <BoolYN label="Revenge Trades"   data={boolImpacts.revengeTrade} />
              <BoolYN label="Boredom Trades"   data={boolImpacts.boredomTrade} />
              <BoolYN label="Emotional Trades" data={boolImpacts.emotionalTrade} />
              <DivLabel>Risk State</DivLabel>
              <DR label="Avg Risk %" value={riskMetrics.avgRiskPercent  != null ? `${riskMetrics.avgRiskPercent.toFixed(2)}%`   : '--'} />
              <DR label="Avg Spread" value={riskMetrics.avgSpreadAtEntry != null ? `${riskMetrics.avgSpreadAtEntry.toFixed(2)} pips` : '--'} />
            </Scroll>
          </Panel>
        </div>

        {/* ─── ADVANCED ANALYTICS ─── */}
        <SectionDivider label="Advanced Analytics" />
        <div className="mp-g3">

          {/* News & Catalyst */}
          <Panel title="News & Catalyst" badge="Fundamental" badgeColor="amber">
            {newsEntries.length > 0
              ? newsEntries.map((x, i) => <Bar key={i} label={x.k} pct={x.wr || null} sub={`${x.r}R`} />)
              : ['High Impact', 'Medium Impact', 'Low Impact', 'None / Clean'].map((k, i) => <Bar key={i} label={k} pct={null} />)
            }
          </Panel>

          {/* ATF + Session + Instrument */}
          <Panel title="ATF + Session + Instrument" badge="Asset · TF · Session" badgeColor="green">
            {instrSessEntries.length > 0
              ? instrSessEntries.slice(0, 8).map((x, i) => <SplitBar key={i} label={x.k} win={x.win} loss={x.loss} count={x.count} />)
              : <span style={{ ...MONO, fontSize: 9, color: D.dim }}>No combined data yet</span>
            }
            {instrSessEntries.length > 8 && (
              <div style={{ borderTop: `0.5px solid ${D.bdRow}`, paddingTop: 6, textAlign: 'center' as const }}>
                <span style={{ ...MONO, fontSize: 8, color: D.dim }}>+ {instrSessEntries.length - 8} more</span>
              </div>
            )}
          </Panel>

          {/* Session */}
          <Panel title="Session" badge="Session · Phase" badgeColor="blue">
            <DivLabel>By Session Name</DivLabel>
            {sessEntries.length > 0
              ? sessEntries.map((x, i) => <Bar key={i} label={x.name} pct={x.wr || null} count={x.count} />)
              : <span style={{ ...MONO, fontSize: 9, color: D.dim }}>No session data yet</span>
            }
            <DivLabel>By Session Phase</DivLabel>
            {(() => {
              const DEFAULT_PHASES = [
                'LONDON Open', 'LONDON Mid', 'LONDON Close',
                'NEW YORK Open', 'NEW YORK Mid', 'NEW YORK Close',
                'TOKYO Open', 'TOKYO Mid', 'TOKYO Close',
              ];
              const phaseMapCI: Record<string, { wr: number | null; count: number }> = {};
              sessionPhaseEntries.forEach(x => { phaseMapCI[x.k.toUpperCase()] = { wr: x.wr ?? null, count: x.count }; });
              const merged = DEFAULT_PHASES.map(phase => {
                const found = phaseMapCI[phase.toUpperCase()];
                return { k: phase, wr: found?.wr ?? null, count: found?.count ?? 0 };
              });
              const defaultKeys = new Set(DEFAULT_PHASES.map(p => p.toUpperCase()));
              const extras = sessionPhaseEntries.filter(x => !defaultKeys.has(x.k.toUpperCase()));
              const all = [...merged, ...extras.map(x => ({ k: x.k, wr: x.wr ?? null, count: x.count }))];
              return all.map((x, i) => <Bar key={i} label={x.k} pct={x.wr} count={x.count} />);
            })()}
          </Panel>
        </div>

        {/* ─── DAY · DURATION · RISK SIZING ─── */}
        <SectionDivider label="Day · Duration · Risk Sizing" />
        <div className="mp-g3">

          {/* Day of Week */}
          <Panel title="Day of Week" badge="Win% · R Expectancy" badgeColor="amber">
            {dayEntries.length > 0
              ? dayEntries.map((x, i) => <Bar key={i} label={x.day} pct={x.wr || null} count={x.count} />)
              : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d, i) => <Bar key={i} label={d} pct={null} />)
            }
          </Panel>

          {/* Duration & Timing */}
          <Panel title="Duration & Timing" badge="Hold Time" badgeColor="cyan">
            <DivLabel>Duration Bucket</DivLabel>
            <Bar label="0–30 min"   pct={durationBuckets['0-30 min']?.winRate   ?? null} count={durationBuckets['0-30 min']?.count   || 0} />
            <Bar label="30–120 min" pct={durationBuckets['30-120 min']?.winRate ?? null} count={durationBuckets['30-120 min']?.count || 0} />
            <Bar label="2–8 hrs"    pct={durationBuckets['2-8 hrs']?.winRate    ?? null} count={durationBuckets['2-8 hrs']?.count    || 0} />
            <Bar label="8+ hrs"     pct={durationBuckets['8+ hrs']?.winRate     ?? null} count={durationBuckets['8+ hrs']?.count     || 0} />
            <DivLabel>Timing Context</DivLabel>
            {Object.keys(timingCtxData).length > 0
              ? Object.keys(timingCtxData).map(l => <Bar key={l} label={l} pct={timingCtxData[l]?.winRate ?? null} count={ct(timingCtxData[l])} />)
              : <Bar label="No data" pct={null} />
            }
          </Panel>

          {/* Risk & Position Sizing */}
          <Panel title="Risk & Position Sizing" badge="Heat Analysis" badgeColor="amber">
            <DR label="Avg Risk %" value={riskMetrics.avgRiskPercent != null ? `${riskMetrics.avgRiskPercent.toFixed(2)}%` : '--'} />
            <DR label="Max Risk %" value={riskMetrics.maxRiskPercent != null ? `${riskMetrics.maxRiskPercent.toFixed(2)}%` : '--'} />
            <DR label="Min Risk %" value={riskMetrics.minRiskPercent != null ? `${riskMetrics.minRiskPercent.toFixed(2)}%` : '--'} />
            <DR label="Avg Spread" value={riskMetrics.avgSpreadAtEntry != null ? `${riskMetrics.avgSpreadAtEntry.toFixed(2)} pips` : '--'} />
            <DivLabel>Risk Heat</DivLabel>
            <Bar label="Low Heat"    pct={riskHeatBreakdown['Low']?.winRate    ?? null} count={ct(riskHeatBreakdown['Low'])} />
            <Bar label="Medium Heat" pct={riskHeatBreakdown['Medium']?.winRate ?? null} count={ct(riskHeatBreakdown['Medium'])} />
            <Bar label="High Heat"   pct={riskHeatBreakdown['High']?.winRate   ?? null} count={ct(riskHeatBreakdown['High'])} />
          </Panel>
        </div>

        {/* ─── MAE / MFE · CANDLE PATTERNS · EXECUTION ─── */}
        <SectionDivider label="MAE / MFE · Candle Patterns · Execution" />
        <div className="mp-g3">

          {/* MAE / MFE */}
          <Panel title="MAE / MFE Analysis" badge="Entry Quality" badgeColor="cyan">
            <DivLabel>MAE — Adverse Excursion</DivLabel>
            <DR label="Avg MAE"   value={maeMfe.avgMAE   != null ? `${maeMfe.avgMAE.toFixed(2)} pips`   : '--'} vc={D.red} />
            <DR label="Worst MAE" value={maeMfe.worstMAE != null ? `${maeMfe.worstMAE.toFixed(2)} pips` : '--'} vc={D.red} />
            <DR label="MAE > SL"  value={maeMfe.maeGtSLCount != null ? `${maeMfe.maeGtSLCount} trades` : '--'} vc={maeMfe.maeGtSLCount === 0 ? D.green : D.red} />
            {maeMfe.avgMAE != null && (
              <DR label="MAE / MFE ratio" value={maeMfe.avgMAEMFERatio != null ? `${(maeMfe.avgMAEMFERatio * 100).toFixed(0)}%` : '--'} vc={D.red} />
            )}
            <DivLabel>MFE — Favourable Excursion</DivLabel>
            <DR label="Avg MFE"          value={maeMfe.avgMFE  != null ? `+${maeMfe.avgMFE.toFixed(2)} pips`  : '--'} vc={D.green} />
            <DR label="Best MFE"         value={maeMfe.bestMFE != null ? `+${maeMfe.bestMFE.toFixed(2)} pips` : '--'} vc={D.green} />
            <DR label="Avg Capture Rate" value={maeMfe.avgMFECapture != null ? `${maeMfe.avgMFECapture.toFixed(1)}% of MFE` : '--'} vc={D.cyan} />
            <DivLabel>Entry Quality</DivLabel>
            <DR label="MAE / MFE Ratio" value={maeMfe.avgMAEMFERatio != null ? `${maeMfe.avgMAEMFERatio.toFixed(3)}${maeMfe.avgMAEMFERatio < 0.35 ? ' · Good' : maeMfe.avgMAEMFERatio < 0.6 ? ' · Fair' : ' · Poor'}` : '--'}
              vc={maeMfe.avgMAEMFERatio != null ? (maeMfe.avgMAEMFERatio < 0.35 ? D.green : maeMfe.avgMAEMFERatio < 0.6 ? D.amber : D.red) : D.dim} />
          </Panel>

          {/* Candle Pattern × Timeframe */}
          <Panel title="Candle Pattern × Timeframe" badge="Patterns · Indicators" badgeColor="green">
            <Scroll>
              <div style={{ ...MONO, fontSize: 8, color: D.dim, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Pattern · Indicator · TF → Performance</div>
              {Object.entries(candleIndicatorTFMatrix).length > 0
                ? Object.entries(candleIndicatorTFMatrix).map(([key, d]: [string, any], i) => (
                    <Row key={i} label={key}>
                      {d.winRate != null && <Chip variant="gray">{d.count}</Chip>}
                      <Chip variant={pVariant(d.winRate ?? null)}>{d.winRate != null ? `${Math.round(d.winRate)}%` : '—'}</Chip>
                    </Row>
                  ))
                : (
                  <div>
                    <span style={{ ...MONO, fontSize: 9, color: D.dim }}>No combined data yet</span>
                    {candleEntries.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <DivLabel>Candle Patterns (standalone)</DivLabel>
                        {candleEntries.map((x, i) => (
                          <Row key={i} label={x.pat}>
                            <Chip variant="gray">{x.ct}</Chip>
                            <Chip variant={pVariant(x.wr)}>{x.wr != null ? `${x.wr}%` : '—'}</Chip>
                          </Row>
                        ))}
                      </div>
                    )}
                  </div>
                )
              }
            </Scroll>
          </Panel>

          {/* Execution Metrics */}
          <Panel title="Execution Metrics" badge="Entry Timing · Slippage" badgeColor="amber">
            <DR label="Avg Spread at Entry" value={riskMetrics.avgSpreadAtEntry != null ? `${riskMetrics.avgSpreadAtEntry.toFixed(2)} pips` : '--'} vc={D.green} />
            <DR label="Avg R:R Achieved"    value={avgRR ? `1:${avgRR.toFixed(1)}` : '--'} vc={D.cyan} />
            <DivLabel>Order Type</DivLabel>
            {orderEntries.length > 0
              ? orderEntries.map((x, i) => (
                  <Row key={i} label={x.ot}>
                    <Chip variant="gray">{x.ct}</Chip>
                    <Chip variant={pVariant(x.wr)}>{x.wr != null ? `${x.wr}%` : '—'}</Chip>
                  </Row>
                ))
              : <span style={{ ...MONO, fontSize: 9, color: D.dim }}>No order type data</span>
            }
            <DivLabel>Entry Method</DivLabel>
            {entryMethodOpts.map((x, i) => <Bar key={i} label={x.l} pct={x.wr} />)}
          </Panel>
        </div>

        {/* ─── INSTRUMENT MATRIX · TIMEFRAME PERFORMANCE ─── */}
        <SectionDivider label="Instrument Matrix · Timeframe Performance" />
        <div className="mp-g3">

          {/* Instrument × Phase × Momentum */}
          <Panel title="Instrument · Session Phase · Momentum" badge="Win / Loss" badgeColor="cyan" style={{ height: 480 }}>
            <Scroll>
              <DivLabel>Instrument × Phase × Momentum</DivLabel>
              {instrPhaseMomEntries.length > 0
                ? instrPhaseMomEntries.map((x, i) => <SplitBar key={i} label={x.k} win={x.win} loss={x.loss} count={x.count} />)
                : <span style={{ ...MONO, fontSize: 9, color: D.dim }}>No combined data yet</span>
              }
            </Scroll>
          </Panel>

          {/* Strategy × Market Regime */}
          <Panel title="Strategy × Market Regime" badge="Full Matrix" badgeColor="green" style={{ height: 480 }}>
            <Scroll>
              {Object.entries(stratMarketMatrix).length > 0
                ? Object.entries(stratMarketMatrix).map(([stratName, regimes]: [string, any]) => {
                    const regimeColor: Record<string, string> = { Bullish: D.green, Bearish: D.red, Ranging: D.amber, Unknown: D.dim, Bear: D.red, Bull: D.green, Range: D.amber };
                    const totalT = Object.values(regimes).reduce((s: number, d: any) => s + (d.count || 0), 0);
                    return (
                      <div key={stratName}>
                        <SubLabel style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{stratName}</span>
                          <span style={{ color: D.dim, fontWeight: 400 }}>{totalT} trade{totalT !== 1 ? 's' : ''}</span>
                        </SubLabel>
                        {Object.entries(regimes).map(([regime, d]: [string, any]) => (
                          <Row key={regime} label={<><Dot color={regimeColor[regime] || D.muted} />{regime}</>}>
                            <Chip variant="gray">{d.count}</Chip>
                            <Chip variant={pVariant(Math.round(d.winRate || 0))}>{Math.round(d.winRate || 0)}%</Chip>
                          </Row>
                        ))}
                      </div>
                    );
                  })
                : <span style={{ ...MONO, fontSize: 9, color: D.dim }}>No strategy/regime data yet</span>
              }
            </Scroll>
          </Panel>

          {/* Timeframe Breakdown */}
          <Panel title="Timeframe" badge="Entry · Analysis · Context" badgeColor="amber" style={{ height: 480 }}>
            <Scroll>
              <DivLabel>Entry TF</DivLabel>
              {tfEntries.length > 0
                ? tfEntries.map((x, i) => (
                    <Row key={i} label={x.tf}>
                      {x.wr != 0 && <Chip variant="gray">{x.count}</Chip>}
                      <Chip variant={pVariant(x.wr || null)}>{x.wr ? `${x.wr}%` : '—'}</Chip>
                    </Row>
                  ))
                : <span style={{ ...MONO, fontSize: 9, color: D.dim }}>No entry TF data</span>
              }
              <DivLabel>Analysis TF</DivLabel>
              {Object.entries(tfAnalysis).map(([tf, d]: [string, any], i) => (
                <Row key={i} label={tf}>
                  {d.winRate != null && <Chip variant="gray">{d.count || 0}</Chip>}
                  <Chip variant={pVariant(d.winRate ?? null)}>{d.winRate != null ? `${Math.round(d.winRate)}%` : '—'}</Chip>
                </Row>
              ))}
              {Object.keys(tfAnalysis).length === 0 && <span style={{ ...MONO, fontSize: 9, color: D.dim }}>No analysis TF data</span>}
              <DivLabel>Context TF</DivLabel>
              {Object.entries(tfContext).map(([tf, d]: [string, any], i) => (
                <Row key={i} label={tf}>
                  {d.winRate != null && <Chip variant="gray">{d.count || 0}</Chip>}
                  <Chip variant={pVariant(d.winRate ?? null)}>{d.winRate != null ? `${Math.round(d.winRate)}%` : '—'}</Chip>
                </Row>
              ))}
              {Object.keys(tfContext).length === 0 && <span style={{ ...MONO, fontSize: 9, color: D.dim }}>No context TF data</span>}
            </Scroll>
          </Panel>
        </div>

        {/* ─── STRATEGY DRILL-DOWN ─── */}
        <SectionDivider label="Strategy Drill-Down" />
        <div style={{ background: D.bg3, border: `0.5px solid ${D.bdInner}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderBottom: `0.5px solid ${D.bdInner}`, background: D.bg4 }}>
            <span style={{ ...MONO, fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: D.label }}>Strategy Drill-Down</span>
            <select value={strat} onChange={e => setStrat(e.target.value)} className="mp-select" data-testid="select-strategy-drill">
              {strategies.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="mp-strat-grid">
            <div style={{ borderRight: `0.5px solid ${D.bdInner}`, padding: '10px 12px' }}>
              <DivLabel>Bias</DivLabel>
              {[
                { bias: 'Bullish', ct: `(${longTrades})`,    wr2: `${Math.round(longWR)}%`,    c: D.green, show: true },
                { bias: 'Bearish', ct: `(${shortTrades})`,   wr2: `${Math.round(shortWR)}%`,   c: D.red,   show: true },
                { bias: 'Unknown', ct: `(${unknownTrades})`, wr2: `${Math.round(unknownWR)}%`, c: D.amber, show: unknownTrades > 0 },
              ].filter(x => x.show).map((x, i) => (
                <Row key={i} label={<><Dot color={x.c} />{x.bias} <span style={{ ...MONO, fontSize: 8, color: D.dim }}>{x.ct}</span></>}>
                  <span style={{ ...MONO, fontSize: 10, fontWeight: 600, color: x.c }}>{x.wr2}</span>
                </Row>
              ))}
              <Row label="Current Streak" noBorder>
                <span style={{ ...MONO, fontSize: 9, fontWeight: 600, color: streaks.currentStreakType === 'win' ? D.green : D.red }}>
                  {(streaks.currentStreakType || '--').toUpperCase()} × {streaks.currentStreakCount || 0}
                </span>
              </Row>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <DivLabel>Top Performer</DivLabel>
              {topStrat ? (
                <>
                  <Row label={topStrat.name}>
                    <Chip variant="green">Edge +</Chip>
                  </Row>
                  <DR label="Win Rate" value={`${Math.round(topStrat.wr ?? 0)}%`} vc={D.green} />
                  <DR label="Trades"   value={`${topStrat.trades}`} />
                  <DR label="Net P/L"  value={fmtPL(topStrat.pl)} vc={topStrat.pl >= 0 ? D.green : D.red} />
                </>
              ) : <span style={{ ...MONO, fontSize: 9, color: D.dim }}>No strategy data yet</span>}
            </div>
          </div>
        </div>

        {/* ─── RISK PERFORMANCE ─── */}
        <SectionDivider label="Risk Performance" />
        <div className="mp-g4">

          <Panel title="Drawdown" badge="Current Period" badgeColor="red">
            <DR label="Max DD"     value={maxDD > 0 ? `-$${maxDD.toLocaleString()} (${ddPct}%)` : '$0 (0.00%)'} vc={D.red} />
            <DR label="Current DD" value={currentDD > 0 ? `-$${currentDD.toLocaleString()} (${currentDDPct}%)` : '$0 (0.00%)'} vc={currentDD > 0 ? D.amber : D.green} />
            <DR label="Balance"    value={equityGrowth?.currentBalance ? `$${equityGrowth.currentBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '--'} vc={D.green} />
            <DR label="Period"     value="THIS SESSION" vc={D.dim} />
            {maxDD > 0 && <DR label="DD Used" value={`${currentDDPct}%`} vc={currentDD > 0 ? D.red : D.green} />}
          </Panel>

          <Panel title="Avg Win / Loss" badge="P&amp;L Stats" badgeColor="green">
            <DR label="Avg Win"          value={`$${Math.round(avgWin).toLocaleString()}`}  vc={D.green} />
            <DR label="Avg Loss"         value={`$${Math.round(avgLoss).toLocaleString()}`} vc={D.red} />
            <DR label="Win / Loss Ratio" value={winLossRatio}                               vc={D.cyan} />
            <DR label="Total Wins"       value={`${wins}`}                                  vc={D.green} />
            <DR label="Total Losses"     value={`${losses}`}                                vc={D.red} />
          </Panel>

          <Panel title="Streaks" badge="Win / Loss" badgeColor="cyan">
            <DR label="Longest Win Streak"  value={`${streaks.maxWinStreak  || 0}`} vc={D.green} />
            <DR label="Longest Loss Streak" value={`${streaks.maxLossStreak || 0}`} vc={D.red} />
            <DR label="Current Streak"
              value={`${(streaks.currentStreakType || '--').toUpperCase()} × ${streaks.currentStreakCount || 0}`}
              vc={streaks.currentStreakType === 'win' ? D.green : D.red} />
            <DR label="Recovery Sequences" value={`${streaks.recoverySequences || 0}`} />
          </Panel>

          <Panel title="Risk of Ruin" badge="Account Safety" badgeColor="amber">
            <DR label="Ruin Probability" value={`${riskOfRuin}%`}       vc={rorColor} />
            <DR label="Win Rate"         value={fmtPct(winRate)}         vc={winRate >= 50 ? D.green : D.red} />
            <DR label="Risk per Trade"   value={riskMetrics.avgRiskPercent != null ? `${riskMetrics.avgRiskPercent.toFixed(2)}%` : '--'} vc={D.cyan} />
            <DR label="Profit Factor"    value={pfDisplay}               vc={profitFactor >= 1 ? D.green : D.red} />
            <DR label="Risk Status"      value={rorStatus}               vc={rorColor} />
          </Panel>
        </div>

        {/* ─── EQUITY CURVE ─── */}
        <SectionDivider label="Equity Curve · Period Summary" />
        <div className="mp-eq-grid">
          <EquityChart equityCurve={equityCurve} equityGrowth={equityGrowth} />
          <Panel title="Period Summary" badge="Performance" badgeColor="cyan">
            <DR label="Total P/L"     value={fmtPL(totalPL)}             vc={isPos ? D.green : D.red} />
            <DR label="Win Rate"      value={fmtPct(winRate)}             vc={winRate >= 50 ? D.green : D.red} />
            <DR label="Profit Factor" value={pfDisplay}                   vc={profitFactor >= 1 ? D.green : D.red} />
            <DR label="Expectancy"    value={`${expectancy.toFixed(2)}R`} vc={expectancy > 0 ? D.green : D.red} />
            <DR label="Total Trades"  value={`${totalTrades}`} />
            <DR label="Avg R:R"       value={`1:${avgRR.toFixed(1)}`} />
            {equityGrowth?.totalReturnPct != null && (
              <DR label="Return %"
                value={`${equityGrowth.totalReturnPct >= 0 ? '+' : ''}${equityGrowth.totalReturnPct.toFixed(2)}%`}
                vc={equityGrowth.totalReturnPct >= 0 ? D.green : D.red} />
            )}
          </Panel>
        </div>

        {/* ─── STRATEGY PERFORMANCE TABLE ─── */}
        <SectionDivider label="Strategy Performance — Market Conditions" />
        <div style={{ background: D.bg3, border: `0.5px solid ${D.bdInner}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '9px 12px', borderBottom: `0.5px solid ${D.bdInner}`, background: D.bg4 }}>
            <span style={{ ...MONO, fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: D.label }}>
              Strategy Performance in Bullish, Bearish and Ranging Markets
            </span>
          </div>
          <div style={{ padding: '8px 12px', overflowX: 'auto' as const }}>
            <table className="mp-dtable">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th style={{ color: D.green }}>Bullish</th>
                  <th style={{ color: D.red }}>Bearish</th>
                  <th style={{ color: D.amber }}>Ranging</th>
                  <th style={{ color: D.cyan }}>Trades</th>
                  <th style={{ color: D.cyan }}>Win Rate</th>
                  <th style={{ textAlign: 'right' as const }}>Net P/L</th>
                </tr>
              </thead>
              <tbody>
                {stratEntries.length > 0
                  ? stratEntries.map((s, i) => {
                      const matrix = stratMarketMatrix[s.name] || {};
                      const bullWR = matrix['Bullish']?.winRate ?? matrix['Bull']?.winRate    ?? matrix['Trending']?.winRate ?? null;
                      const bearWR = matrix['Bearish']?.winRate ?? matrix['Bear']?.winRate    ?? null;
                      const rangWR = matrix['Ranging']?.winRate ?? matrix['Range']?.winRate   ?? null;
                      return (
                        <tr key={i}>
                          <td style={{ ...MONO }}>{s.name}</td>
                          <td style={{ color: D.green }}>{bullWR != null ? `${Math.round(bullWR)}%` : '--'}</td>
                          <td style={{ color: D.red }}>{bearWR != null ? `${Math.round(bearWR)}%` : '--'}</td>
                          <td style={{ color: D.amber }}>{rangWR != null ? `${Math.round(rangWR)}%` : '--'}</td>
                          <td style={{ color: D.muted }}>{s.trades}</td>
                          <td style={{ color: pColor(s.wr ?? null) }}>{s.wr != null ? `${Math.round(s.wr)}%` : '--'}</td>
                          <td style={{ ...MONO, fontSize: 10, fontWeight: 600, color: s.pl >= 0 ? D.green : D.red, textAlign: 'right' as const }}>{fmtPL(s.pl)}</td>
                        </tr>
                      );
                    })
                  : <tr><td colSpan={7} style={{ textAlign: 'center' as const, color: D.dim }}>No strategy data yet</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── SETUP OCCURRENCE FREQUENCY ─── */}
        <SectionDivider label="Setup Occurrence Frequency" />
        <div style={{ background: D.bg3, border: `0.5px solid ${D.bdInner}`, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ padding: '9px 12px', borderBottom: `0.5px solid ${D.bdInner}`, background: D.bg4 }}>
            <span style={{ ...MONO, fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: D.label }}>
              Setup Occurrence Frequency — Per Day / Week / Month / Year
            </span>
          </div>
          <div style={{ padding: '8px 12px', overflowX: 'auto' as const }}>
            <table className="mp-dtable">
              <thead>
                <tr>
                  <th>Setup</th>
                  <th style={{ color: D.cyan }}>Per Day</th>
                  <th style={{ color: D.cyan }}>Per Week</th>
                  <th style={{ color: D.cyan }}>Per Month</th>
                  <th style={{ color: D.cyan }}>Per Year</th>
                  <th style={{ color: D.amber }}>Win Rate</th>
                  <th style={{ textAlign: 'right' as const }}>Trades</th>
                </tr>
              </thead>
              <tbody>
                {setupFreqRows.length > 0
                  ? setupFreqRows.map((r, i) => (
                      <tr key={i}>
                        <td style={{ ...MONO }}>{r.n}</td>
                        <td>{r.d}</td><td>{r.w}</td><td>{r.mo}</td><td>{r.y}</td>
                        <td style={{ color: r.pc, fontWeight: 600 }}>{r.wr}</td>
                        <td style={{ color: D.amber, textAlign: 'right' as const }}>{setupTags[r.n]?.count || 0}</td>
                      </tr>
                    ))
                  : <tr><td colSpan={7} style={{ textAlign: 'center' as const, color: D.dim }}>No setup data yet</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
