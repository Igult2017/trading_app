import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────
   DESIGN TOKENS  (exact from mock)
───────────────────────────────────────────────────────────────────── */
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@300;400;500;600;700;800;900&family=Barlow:wght@300;400;500;600&family=Share+Tech+Mono&display=swap');`;

const P = {
  bg:       '#0D0F1C',
  bg2:      '#121526',
  bg3:      '#171A30',
  line:     '#1E2240',
  line2:    '#252848',
  dim:      '#6A7299',
  muted:    '#8A93B8',
  body:     '#B0B8D4',
  bright:   '#D8DCF0',
  white:    '#EEF0FA',
  green:    '#4AE88A', greenDim: '#1A3A30',
  red:      '#E84A4A', redDim:   '#3A1A1A',
  amber:    '#E8B84A', amberDim: '#3A2E1A',
  cyan:     '#4AE8D8', cyanDim:  '#1A3A38',
};

const pColor = (v: number) => v >= 65 ? P.green : v >= 50 ? P.amber : P.red;

/* ─────────────────────────────────────────────────────────────────────
   ATOM COMPONENTS
───────────────────────────────────────────────────────────────────── */
const Mono = ({
  children, size = 11, color = P.muted, weight = 400,
  upper = true, spacing = '0.14em', style = {} as React.CSSProperties, className = '',
}: any) => (
  <span className={className} style={{
    fontFamily: "'Share Tech Mono',monospace", fontSize: size, color,
    fontWeight: weight, letterSpacing: spacing,
    textTransform: upper ? 'uppercase' : 'none', ...style,
  }}>{children}</span>
);

const Cond = ({
  children, size = 14, color = P.bright, weight = 600,
  upper = true, style = {} as React.CSSProperties, className = '',
}: any) => (
  <span className={className} style={{
    fontFamily: "'Barlow Condensed',sans-serif", fontSize: size, color,
    fontWeight: weight, letterSpacing: '0.06em',
    textTransform: upper ? 'uppercase' : 'none', lineHeight: 1, ...style,
  }}>{children}</span>
);

const Num = ({ children, size = 17, color = P.green, style = {} as React.CSSProperties }: any) => (
  <span style={{
    fontFamily: "'Barlow Condensed',sans-serif", fontSize: size, color,
    fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1, ...style,
  }}>{children}</span>
);

/* ─────────────────────────────────────────────────────────────────────
   DECORATIVE CORNERS
───────────────────────────────────────────────────────────────────── */
const Corner = ({ size = 6, color = P.dim, pos }: { size?: number; color?: string; pos: 'tl'|'tr'|'bl'|'br' }) => {
  const borders: Record<string, React.CSSProperties> = {
    tl: { top: 0, left: 0,    borderTop: `1px solid ${color}`, borderLeft:  `1px solid ${color}` },
    tr: { top: 0, right: 0,   borderTop: `1px solid ${color}`, borderRight: `1px solid ${color}` },
    bl: { bottom: 0, left: 0,  borderBottom: `1px solid ${color}`, borderLeft:  `1px solid ${color}` },
    br: { bottom: 0, right: 0, borderBottom: `1px solid ${color}`, borderRight: `1px solid ${color}` },
  };
  return <div style={{ position: 'absolute', width: size, height: size, ...borders[pos] }} />;
};

/* ─────────────────────────────────────────────────────────────────────
   PANEL
───────────────────────────────────────────────────────────────────── */
const Panel = ({ title, accent = P.green, tag, children, style = {} as React.CSSProperties }: any) => (
  <div style={{ background: P.bg2, border: `1px solid ${P.line2}`, position: 'relative', ...style }}>
    <Corner pos="tl" color={accent} /><Corner pos="tr" color={accent} />
    <Corner pos="bl" color={P.line2} /><Corner pos="br" color={P.line2} />
    <div style={{
      borderBottom: `1px solid ${P.line2}`, padding: '7px 12px', background: P.bg3,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 2, height: 12, background: accent, flexShrink: 0 }} />
        <Cond size={11} color={P.bright} weight={700}>{title}</Cond>
      </div>
      {tag && <Mono size={8} color={P.dim}>{tag}</Mono>}
    </div>
    <div style={{ padding: 12 }}>{children}</div>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────
   DIVIDER
───────────────────────────────────────────────────────────────────── */
const Divider = ({ label }: { label: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0' }}>
    <div style={{ flex: 1, height: 1, background: `linear-gradient(to right,transparent,${P.line2})` }} />
    <Mono size={9} color={P.dim}>{label}</Mono>
    <div style={{ flex: 1, height: 1, background: `linear-gradient(to left,transparent,${P.line2})` }} />
  </div>
);

/* ─────────────────────────────────────────────────────────────────────
   SUB LABEL
───────────────────────────────────────────────────────────────────── */
const SubLabel = ({ children, style = {} as React.CSSProperties }: any) => (
  <div style={{
    fontFamily: "'Share Tech Mono',monospace", fontSize: 9, color: P.muted,
    textTransform: 'uppercase', letterSpacing: '0.18em',
    borderTop: `1px solid ${P.line}`, paddingTop: 7, marginTop: 9, marginBottom: 5,
    ...style,
  }}>{children}</div>
);

/* ─────────────────────────────────────────────────────────────────────
   DATA ROW
───────────────────────────────────────────────────────────────────── */
const DR = ({ label, value, vc }: { label: string; value: string; vc?: string }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '5px 0', borderBottom: `1px solid ${P.line}`,
  }}>
    <Mono size={10} color={P.body}>{label}</Mono>
    <Mono size={11} color={vc || P.bright} weight={500}>{value}</Mono>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────
   BAR
───────────────────────────────────────────────────────────────────── */
const Bar = ({ label, pct, sub }: { label: string; pct: number; sub?: string }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
      <Mono size={10} color={P.body}>{label}</Mono>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        {sub && <Mono size={9} color={P.muted}>{sub}</Mono>}
        <Num size={17} color={pColor(pct)}>{pct}<span style={{ fontSize: 9, opacity: 0.6 }}>%</span></Num>
      </div>
    </div>
    <div style={{ height: 2, background: P.line2 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: pColor(pct), opacity: 0.85 }} />
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────
   YES / NO ROW
───────────────────────────────────────────────────────────────────── */
const YN = ({ label, yes, no }: { label: string; yes: number; no: number }) => (
  <div style={{ display: 'flex', borderBottom: `1px solid ${P.line}`, alignItems: 'stretch' }}>
    <div style={{ flex: 1, padding: '5px 7px', borderRight: `1px solid ${P.line}` }}>
      <Mono size={10} color={P.body}>{label}</Mono>
    </div>
    <div style={{ width: 52, padding: '3px 5px', borderRight: `1px solid ${P.line}`, textAlign: 'center' }}>
      <Mono size={7} color={P.dim} style={{ display: 'block', marginBottom: 1 }}>YES</Mono>
      <Cond size={13} color={pColor(yes)} weight={700}>{yes}%</Cond>
    </div>
    <div style={{ width: 52, padding: '3px 5px', textAlign: 'center' }}>
      <Mono size={7} color={P.dim} style={{ display: 'block', marginBottom: 1 }}>NO</Mono>
      <Cond size={13} color={pColor(no)} weight={700}>{no}%</Cond>
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────
   MULTI OPTION
───────────────────────────────────────────────────────────────────── */
const Multi = ({ label, options }: { label?: string; options: { label: string; pct: number }[] }) => (
  <div style={{ marginBottom: 6 }}>
    {label && <Mono size={9} color={P.muted} style={{ display: 'block', marginBottom: 4 }}>{label}</Mono>}
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${options.length},1fr)`,
      gap: 1, background: P.line,
    }}>
      {options.map((o, i) => (
        <div key={i} style={{ background: P.bg2, padding: '5px 4px', textAlign: 'center' }}>
          <Mono size={8} color={P.muted} style={{ display: 'block', marginBottom: 1 }}>{o.label}</Mono>
          <Cond size={13} color={pColor(o.pct)} weight={700}>{o.pct}%</Cond>
        </div>
      ))}
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────
   SCORE ROW
───────────────────────────────────────────────────────────────────── */
const ScoreRow = ({ label, scores }: { label: string; scores: { score: string; pct: number }[] }) => (
  <div style={{ marginBottom: 6 }}>
    <Mono size={9} color={P.muted} style={{ display: 'block', marginBottom: 4 }}>{label}</Mono>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: P.line }}>
      {scores.map((s, i) => (
        <div key={i} style={{ background: P.bg2, padding: '5px 3px', textAlign: 'center' }}>
          <Mono size={8} color={P.muted} style={{ display: 'block' }}>{s.score}</Mono>
          <Cond size={13} color={pColor(s.pct)} weight={700}>{s.pct}%</Cond>
          <div style={{ height: 1, background: P.line2, marginTop: 2 }}>
            <div style={{ width: `${s.pct}%`, height: '100%', background: pColor(s.pct) }} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────
   SPLIT BAR
───────────────────────────────────────────────────────────────────── */
const SplitBar = ({ label, win, loss }: { label: string; win: number; loss: number }) => (
  <div style={{ marginBottom: 9 }}>
    <Mono size={10} color={P.body} style={{ display: 'block', marginBottom: 3 }}>{label}</Mono>
    <div style={{ height: 2, display: 'flex', gap: 1 }}>
      <div style={{ flex: win,  background: P.green, opacity: 0.8 }} />
      <div style={{ flex: loss, background: P.red,   opacity: 0.8 }} />
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
      <Mono size={7} color={P.green}>{win}% WIN</Mono>
      <Mono size={7} color={loss > 0 ? P.red : P.dim}>{loss}% LOSS</Mono>
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────
   SCROLL WRAPPER
───────────────────────────────────────────────────────────────────── */
const Scroll = ({ children }: { children: React.ReactNode }) => (
  <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 2 }} className="mp-scroll">
    {children}
  </div>
);

/* ─────────────────────────────────────────────────────────────────────
   EQUITY CHART
───────────────────────────────────────────────────────────────────── */
const EquityChart = ({ equityCurve, equityGrowth }: { equityCurve: any[]; equityGrowth?: any }) => {
  const [view, setView] = useState<'DAILY'|'WEEKLY'|'MONTHLY'>('WEEKLY');
  const H = 160; const W = 600;

  const buildPts = (): [number, number][] => {
    if (!equityCurve || equityCurve.length === 0) return [[0, H / 2], [W, H / 2]];
    const vals  = equityCurve.map((e: any) => e.cumulativePL);
    const minV  = Math.min(...vals);
    const maxV  = Math.max(...vals);
    const range = maxV - minV || 1;
    return equityCurve.map((e: any, i: number) => {
      const x = equityCurve.length > 1 ? (i / (equityCurve.length - 1)) * W : W / 2;
      const y = H - ((e.cumulativePL - minV) / range) * H * 0.85 - H * 0.075;
      return [x, Math.max(0, Math.min(H, y))];
    });
  };

  const pts  = buildPts();
  const path = pts.reduce((a, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1]; const cx = px + (x - px) / 2;
    return `${a} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, '');
  const fill = `${path} L${pts[pts.length - 1][0]},${H} L0,${H} Z`;
  const last = pts[pts.length - 1];

  const labs = (() => {
    if (!equityCurve || equityCurve.length === 0) return ['--'];
    const step = Math.max(1, Math.floor(equityCurve.length / 5));
    return equityCurve
      .filter((_: any, i: number) => i % step === 0 || i === equityCurve.length - 1)
      .map((e: any) => `#${e.tradeNumber}`);
  })();

  const yLabels = (() => {
    if (!equityCurve || equityCurve.length === 0) return ['--','--','--','--'];
    const vals  = equityCurve.map((e: any) => e.cumulativePL);
    const maxV  = Math.max(...vals); const minV = Math.min(...vals);
    const range = maxV - minV || 1;
    return [maxV, maxV - range * 0.33, maxV - range * 0.66, minV]
      .map(v => v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
  })();

  const balance  = equityGrowth?.currentBalance  ?? 0;
  const startBal = equityGrowth?.startingBalance ?? 0;
  const retPct   = equityGrowth?.totalReturnPct  ?? 0;
  const totalPL  = equityGrowth?.totalPL         ?? 0;
  const isPos    = totalPL >= 0;
  const fmtBal   = (v: number) => v ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '--';

  return (
    <div style={{ background: P.bg2, border: `1px solid ${P.line2}`, position: 'relative' }}>
      <Corner pos="tl" color={P.cyan} /><Corner pos="tr" color={P.cyan} />
      <Corner pos="bl" color={P.line2} /><Corner pos="br" color={P.line2} />
      <div style={{ borderBottom: `1px solid ${P.line2}`, padding: '7px 12px', background: P.bg3,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 2, height: 12, background: P.cyan }} />
          <Cond size={11} color={P.bright} weight={700}>Equity Curve</Cond>
        </div>
        <div style={{ display: 'flex', gap: 1 }}>
          {(['DAILY','WEEKLY','MONTHLY'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              fontFamily: "'Share Tech Mono',monospace", fontSize: 8, letterSpacing: '0.12em',
              textTransform: 'uppercase', padding: '3px 9px',
              border: `1px solid ${view === v ? P.cyan : P.line2}`,
              background: view === v ? `${P.cyan}18` : 'transparent',
              color: view === v ? P.cyan : P.muted, cursor: 'pointer', outline: 'none',
            }}>{v}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 18 }}>
          {([
            ['BALANCE', fmtBal(balance),  isPos ? P.green : P.red],
            ['RETURN',  retPct ? `${retPct >= 0 ? '+' : ''}${retPct.toFixed(2)}%` : '--', isPos ? P.green : P.red],
            ['START',   fmtBal(startBal), P.body],
          ] as [string,string,string][]).map(([l, v, c], i) => (
            <div key={i} style={{ textAlign: 'right' }}>
              <Mono size={7} color={P.dim} style={{ display: 'block' }}>{l}</Mono>
              <Cond size={15} color={c} weight={700}>{v}</Cond>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 6, paddingBottom: 18 }}>
            {yLabels.map((l, i) => <Mono key={i} size={7} color={P.dim}>{l}</Mono>)}
          </div>
          <div style={{ flex: 1 }}>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="mp-eq-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={P.cyan} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={P.cyan} stopOpacity="0.01" />
                </linearGradient>
              </defs>
              {[0, 0.33, 0.66, 1].map((p, i) => (
                <line key={i} x1="0" y1={p * H} x2={W} y2={p * H} stroke={P.line} strokeWidth="1" />
              ))}
              <path d={fill} fill="url(#mp-eq-grad)" />
              <path d={path} fill="none" stroke={P.cyan} strokeWidth="1.5" />
              <circle cx={last[0]} cy={last[1]} r="4" fill={P.bg2} stroke={P.cyan} strokeWidth="1.5" />
              <circle cx={last[0]} cy={last[1]} r="1.5" fill={P.cyan} />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {labs.map((l: string, i: number) => <Mono key={i} size={7} color={P.dim}>{l}</Mono>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────── */
const fmtPL  = (v: number) => v >= 0 ? `+$${Math.abs(v).toLocaleString()}` : `-$${Math.abs(v).toLocaleString()}`;
const fmtPct = (v: number) => `${Math.round(v)}%`;

/* ═════════════════════════════════════════════════════════════════════
   MAIN EXPORT
═════════════════════════════════════════════════════════════════════ */
export default function MetricsPanel({ sessionId }: { sessionId?: string | null }) {
  const [strat, setStrat] = useState('ALL STRATEGIES');

  const queryUrl = sessionId
    ? `/api/metrics/compute?sessionId=${sessionId}`
    : '/api/metrics/compute';

  const { data: metricsData, isLoading, isError } = useQuery<{ success: boolean; metrics: any }>({
    queryKey: ['/api/metrics/compute', sessionId],
    queryFn:  () => fetch(queryUrl).then(r => r.json()),
    enabled:  !!sessionId,
  });

  /* ── CSS ── */
  const css = `
    ${FONTS}
    .mp-root, .mp-root *, .mp-root *::before, .mp-root *::after { box-sizing:border-box; margin:0; padding:0; }
    .mp-root {
      font-family:'Barlow',sans-serif;
      background:${P.bg};
      color:${P.body};
    }
    .mp-root::before {
      content:''; position:fixed; inset:0; pointer-events:none; z-index:9999;
      background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.025) 2px,rgba(0,0,0,0.025) 4px);
    }
    .mp-kpi { display:grid; grid-template-columns:repeat(7,1fr); gap:8px; padding:8px 20px; background:${P.bg}; border-bottom:1px solid ${P.line2}; }
    .mp-kpi-cell { background:${P.bg2}; border:1px solid ${P.line2}; padding:10px 14px 12px; position:relative; overflow:hidden; }
    .mp-kpi-cell::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; }
    .mp-kpi-pos::before { background:linear-gradient(to right,${P.green},transparent); }
    .mp-kpi-neg::before { background:linear-gradient(to right,${P.red},transparent); }
    .mp-kpi-neu::before { background:linear-gradient(to right,${P.line2},transparent); }
    .mp-page   { padding:14px 20px; display:flex; flex-direction:column; gap:12px; }
    .mp-g4     { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
    .mp-g3     { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
    .mp-g2     { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
    .mp-scroll { max-height:420px; overflow-y:auto; }
    .mp-scroll::-webkit-scrollbar { width:2px; }
    .mp-scroll::-webkit-scrollbar-thumb { background:${P.line2}; }
    .mp-dtable { width:100%; border-collapse:collapse; }
    .mp-dtable th { font-family:'Share Tech Mono',monospace; font-size:9px; color:${P.dim}; text-transform:uppercase; letter-spacing:0.16em; padding:7px 11px; text-align:left; border-bottom:1px solid ${P.line2}; font-weight:400; }
    .mp-dtable td { font-family:'Share Tech Mono',monospace; font-size:10px; padding:8px 11px; border-bottom:1px solid ${P.line}; color:${P.bright}; }
    .mp-dtable tr:last-child td { border-bottom:none; }
    .mp-dn { font-family:'Barlow Condensed',sans-serif; font-size:13px; font-weight:600; letter-spacing:0.05em; }
    .mp-select { font-family:'Share Tech Mono',monospace; font-size:9px; background:${P.bg3}; color:${P.muted}; border:1px solid ${P.line2}; padding:2px 6px; outline:none; cursor:pointer; }
    .mp-strat-grid { display:grid; grid-template-columns:1fr 1fr; gap:0; }
    .mp-eq-grid    { display:grid; grid-template-columns:2fr 1fr; gap:12px; }
    @media(max-width:1024px){
      .mp-page  { padding:10px 14px; gap:10px; }
      .mp-g4    { grid-template-columns:repeat(2,1fr); }
      .mp-g3    { grid-template-columns:1fr; }
      .mp-kpi   { grid-template-columns:repeat(4,1fr); }
      .mp-eq-grid    { grid-template-columns:1fr; }
      .mp-strat-grid { grid-template-columns:1fr; }
    }
    @media(max-width:640px){
      .mp-page { padding:8px 10px; gap:8px; }
      .mp-g4,.mp-g3,.mp-g2 { grid-template-columns:1fr; }
      .mp-kpi { grid-template-columns:repeat(2,1fr); padding:8px 10px; }
      .mp-kpi-cell:last-child { grid-column:1/-1; }
      .mp-eq-grid    { grid-template-columns:1fr; }
      .mp-strat-grid { grid-template-columns:1fr; }
    }
  `;

  /* ── GUARDS ── */
  if (!sessionId) return (
    <div className="mp-root" style={{ minHeight:300, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <style>{css}</style>
      <Mono size={11} color={P.dim} data-testid="text-metrics-no-session">No session selected — pick a session to view metrics.</Mono>
    </div>
  );
  if (isLoading) return (
    <div className="mp-root" style={{ minHeight:300, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
      <style>{css}</style>
      <style>{`@keyframes mp-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      <Loader2 style={{ color:P.cyan, animation:'mp-spin 1s linear infinite', width:28, height:28 }} />
      <Mono size={11} color={P.dim} data-testid="text-metrics-loading">Computing metrics…</Mono>
    </div>
  );
  if (isError || (metricsData && !metricsData.success)) return (
    <div className="mp-root" style={{ minHeight:300, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <style>{css}</style>
      <Mono size={11} color={P.red} data-testid="text-metrics-error">Failed to compute metrics. Please try again.</Mono>
    </div>
  );

  /* ── EXTRACT ── */
  const m                   = metricsData?.metrics        || {};
  const core                = m.core                      || {};
  const streaks             = m.streaks                   || {};
  const sessionBreakdown    = m.sessionBreakdown          || {};
  const instrumentBreakdown = m.instrumentBreakdown       || {};
  const directionBias       = m.directionBias             || {};
  const exitAnalysis        = m.exitAnalysis              || {};
  const riskMetrics         = m.riskMetrics               || {};
  const equityCurve: any[]  = m.equityCurve               || [];
  const equityGrowth        = m.equityGrowth;
  const strategyPerformance = m.strategyPerformance       || {};
  const setupFrequency      = m.setupFrequency            || {};
  const tradeGrades         = m.tradeGrades               || {};
  const psychology          = m.psychology                || {};
  const dayOfWeekBreakdown  = m.dayOfWeekBreakdown        || {};
  const timeframeBreakdown  = m.timeframeBreakdown        || {};

  if ((core.totalTrades || 0) === 0) return (
    <div className="mp-root" style={{ minHeight:300, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <style>{css}</style>
      <Mono size={11} color={P.dim} data-testid="text-metrics-empty">No trades recorded yet — add journal entries to see metrics.</Mono>
    </div>
  );

  /* ── DERIVED ── */
  const totalPL      = core.totalPL      || 0;
  const winRate      = core.winRate      || 0;
  const expectancy   = core.expectancy   || 0;
  const totalTrades  = core.totalTrades  || 0;
  const profitFactor = core.profitFactor || 0;
  const avgRR        = core.avgRR        || 0;
  const wins         = core.wins         || 0;
  const losses       = core.losses       || 0;
  const avgWin       = core.avgWin       || 0;
  const avgLoss      = core.avgLoss      || 0;
  const rulesAdh     = riskMetrics.rulesAdherence || 0;
  const maxDD        = streaks.maxDrawdown        || 0;
  const isPos        = totalPL >= 0;
  const winLossRatio = avgLoss > 0 ? (avgWin / avgLoss).toFixed(1) : '0';

  const longData    = directionBias.long  || {};
  const shortData   = directionBias.short || {};
  const longWR      = longData.winRate    || 0;
  const shortWR     = shortData.winRate   || 0;
  const longTrades  = longData.trades     || 0;
  const shortTrades = shortData.trades    || 0;

  const stratEntries = Object.entries(strategyPerformance).map(([name, d]: [string, any]) => ({
    name, wr: d.winRate || 0, trades: d.trades || 0, pl: d.pl || 0,
  }));
  const strategies = ['ALL STRATEGIES', ...Object.keys(strategyPerformance).filter(k => k !== 'Unclassified')];

  const instrEntries = Object.entries(instrumentBreakdown).map(([pair, d]: [string, any]) => ({
    pair, wr: Math.round(d.winRate || 0), loss: 100 - Math.round(d.winRate || 0),
  }));

  const dayEntries  = Object.entries(dayOfWeekBreakdown).map(([day, d]: [string, any]) => ({ day, wr: Math.round((d as any).winRate || 0) }));
  const tfEntries   = Object.entries(timeframeBreakdown).map(([tf, d]: [string, any])   => ({ tf,  wr: Math.round((d as any).winRate || 0) }));
  const sessEntries = Object.entries(sessionBreakdown).map(([name, d]: [string, any])   => ({ name, wr: Math.round((d as any).winRate || 0) }));
  const exitEntries = Object.entries(exitAnalysis).map(([reason, d]: [string, any])      => ({ reason, pct: Math.round((d as any).winRate || 0), ct: (d as any).count || 0 }));

  const riskOfRuin = (() => {
    if (winRate <= 0 || profitFactor <= 0) return 100;
    const wr = winRate / 100; const lr = 1 - wr;
    if (lr === 0) return 0;
    return Math.max(0, Math.min(100, Math.round(Math.pow(lr / wr, 10) * 100)));
  })();
  const rorStatus = riskOfRuin < 5 ? '✓ SAFE' : riskOfRuin < 20 ? '~ MODERATE' : riskOfRuin < 50 ? '⚠ ELEVATED' : '✕ CRITICAL';
  const rorColor  = riskOfRuin < 5 ? P.green : riskOfRuin < 20 ? P.amber : P.red;

  const topStrat = stratEntries.length > 0 ? stratEntries.reduce((a, b) => a.pl > b.pl ? a : b) : null;

  const ddPct = equityGrowth?.startingBalance
    ? ((Math.abs(maxDD) / equityGrowth.startingBalance) * 100).toFixed(2)
    : '0.00';

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  return (
    <div className="mp-root">
      <style>{css}</style>

      {/* KPI STRIP */}
      <div className="mp-kpi">
        {[
          { l:'Total P&L',       v:fmtPL(totalPL),          s:isPos?'profit':'loss',   cls:isPos?'mp-kpi-pos':'mp-kpi-neg' },
          { l:'Win Rate',        v:fmtPct(winRate),          s:`${wins}W · ${losses}L`, cls:winRate>=50?'mp-kpi-pos':'mp-kpi-neg' },
          { l:'R Expectancy',    v:expectancy.toFixed(2),    s:'per trade',             cls:expectancy>0?'mp-kpi-pos':'mp-kpi-neg' },
          { l:'Trades',          v:`${totalTrades}`,         s:'this period',           cls:'mp-kpi-neu' },
          { l:'Profit Factor',   v:profitFactor.toFixed(2),  s:'gross ratio',           cls:profitFactor>=1?'mp-kpi-pos':'mp-kpi-neg' },
          { l:'Avg R:R',         v:`1:${avgRR.toFixed(1)}`,  s:'achieved',              cls:'mp-kpi-neu' },
          { l:'Rules Adherence', v:fmtPct(rulesAdh),         s:'followed',              cls:rulesAdh>=80?'mp-kpi-pos':'mp-kpi-neg' },
        ].map((k, i) => (
          <div key={i} className={`mp-kpi-cell ${k.cls}`} data-testid={`metric-kpi-${i}`}>
            <Mono size={8} color={P.muted} style={{ display:'block', marginBottom:6, letterSpacing:'0.16em' }}>{k.l}</Mono>
            <Cond size={26}
              color={k.cls==='mp-kpi-pos'?P.green:k.cls==='mp-kpi-neg'?P.red:P.bright}
              weight={700} style={{ display:'block', lineHeight:1, marginBottom:5 }}>{k.v}</Cond>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:16, height:1, background:k.cls==='mp-kpi-pos'?P.greenDim:k.cls==='mp-kpi-neg'?P.redDim:P.line2 }} />
              <Mono size={8} color={P.dim}>{k.s}</Mono>
            </div>
          </div>
        ))}
      </div>

      <div className="mp-page">

        {/* ─── CORE QUALITY METRICS ─── */}
        <Divider label="Core Quality Metrics" />
        <div className="mp-g4">

          <Panel title="Market Regime — Impact on Win" accent={P.cyan} tag="REGIME · VOLATILITY">
            <Bar label="Trending" pct={67} />
            <Bar label="Ranging"  pct={38} />
            <Bar label="Volatile" pct={44} />
            <SubLabel>Volatility State — Impact on Win</SubLabel>
            <Bar label="Low"    pct={58} />
            <Bar label="Normal" pct={67} />
            <Bar label="High"   pct={39} />
          </Panel>

          <Panel title="Execution Precision — Impact on Win" accent={P.amber} tag="SCORE → WIN%">
            <Scroll>
              <ScoreRow label="Entry Precision"   scores={[{score:'4.5',pct:70},{score:'4.0',pct:62},{score:'3.5',pct:51},{score:'3.0',pct:38}]} />
              <ScoreRow label="Timing Quality"    scores={[{score:'4.5',pct:72},{score:'4.0',pct:65},{score:'3.5',pct:54},{score:'3.0',pct:41}]} />
              <ScoreRow label="Market Alignment"  scores={[{score:'4.5',pct:75},{score:'4.0',pct:68},{score:'3.5',pct:57},{score:'3.0',pct:44}]} />
              <ScoreRow label="Setup Clarity"     scores={[{score:'4.5',pct:70},{score:'4.0',pct:63},{score:'3.5',pct:55},{score:'3.0',pct:43}]} />
              <ScoreRow label="Confluence Score"  scores={[{score:'4.5',pct:73},{score:'4.0',pct:66},{score:'3.5',pct:58},{score:'3.0',pct:45}]} />
              <ScoreRow label="Signal Validation" scores={[{score:'4.5',pct:71},{score:'4.0',pct:64},{score:'3.5',pct:53},{score:'3.0',pct:42}]} />
              <SubLabel>Planned vs Actual (Avg Pips)</SubLabel>
              <DR label="Entry Deviation" value="+0.8 pips" vc={P.green} />
              <DR label="SL Deviation"    value="−0.3 pips" vc={P.amber} />
              <DR label="TP Deviation"    value="+1.2 pips" vc={P.green} />
              <SubLabel>Breakeven Applied — Impact</SubLabel>
              <div style={{ marginBottom:6 }}>
                <Mono size={8} color={P.dim} style={{ display:'block', marginBottom:4 }}>Impact on Loss</Mono>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:P.line }}>
                  {([['YES','39%',P.green],['NO','61%',P.red]] as [string,string,string][]).map(([l,v,c],i) => (
                    <div key={i} style={{ background:P.bg2, padding:'5px 4px', textAlign:'center' }}>
                      <Mono size={7} color={P.dim} style={{ display:'block' }}>{l}</Mono>
                      <Cond size={13} color={c} weight={700}>{v}</Cond>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:8 }}>
                <Mono size={8} color={P.dim} style={{ display:'block', marginBottom:4 }}>Impact on Profit</Mono>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:P.line }}>
                  {([['YES','56%',P.green],['NO','44%',P.amber]] as [string,string,string][]).map(([l,v,c],i) => (
                    <div key={i} style={{ background:P.bg2, padding:'5px 4px', textAlign:'center' }}>
                      <Mono size={7} color={P.dim} style={{ display:'block' }}>{l}</Mono>
                      <Cond size={13} color={c} weight={700}>{v}</Cond>
                    </div>
                  ))}
                </div>
              </div>
              <Multi label="Management Type — Impact on Win"
                options={[{label:'Rule-Based',pct:64},{label:'Discret.',pct:51},{label:'Hybrid',pct:58}]} />
            </Scroll>
          </Panel>

          <Panel title="Clarity & Confluence — Impact on Win" accent={P.green} tag="CONFLUENCE">
            <Scroll>
              <Multi label="Clarity Level — Impact on Win" options={[{label:'High',pct:69},{label:'Low',pct:46}]} />
              <DR label="Setup Clarity Avg — Impact on Win" value="68%" vc={P.green} />
              <DR label="Confluence Avg — Impact on Win"   value="66%" vc={P.green} />
              <SubLabel>Yes / No — Impact on Win</SubLabel>
              <YN label="MTF Alignment"         yes={70} no={43} />
              <YN label="Trend Alignment"       yes={72} no={45} />
              <YN label="HTF Key Level Present" yes={74} no={48} />
              <YN label="Key Level Respect"     yes={69} no={44} />
              <SubLabel>Key Level Type — Impact on Win</SubLabel>
              <Multi label="" options={[{label:'Support',pct:63},{label:'Resist.',pct:60},{label:'Supply',pct:55},{label:'Demand',pct:67}]} />
              <YN label="Momentum: Strong" yes={71} no={46} />
              <ScoreRow label="Momentum Score — Impact on Win"
                scores={[{score:'4.5',pct:73},{score:'4.0',pct:65},{score:'3.5',pct:56},{score:'3.0',pct:42}]} />
              <YN label="Target Logic" yes={68} no={47} />
              <Multi label="Timing Context — Impact on Win" options={[{label:'Good',pct:66},{label:'Poor',pct:41}]} />
              <Multi label="Order Type — Impact on Win"     options={[{label:'Limit',pct:67},{label:'Market',pct:52},{label:'Stop',pct:49}]} />
            </Scroll>
          </Panel>

          <Panel title="Psychology & Discipline — Impact on Win" accent={P.red} tag="PSYCHOLOGY">
            <Scroll>
              <Multi label="Rules Followed — Impact on Win/Loss" options={[{label:'High',pct:71},{label:'Low',pct:38}]} />
              <Multi label="Confidence — Impact on Win/Loss"     options={[{label:'High',pct:69},{label:'Low',pct:42}]} />
              <Multi label="Energy Level — Impact on Win/Loss"   options={[{label:'High',pct:65},{label:'Low',pct:44}]} />
              <Multi label="Focus Level — Impact on Win"         options={[{label:'High',pct:70},{label:'Low',pct:43}]} />
              <Multi label="Confidence at Entry — Impact on Win" options={[{label:'High',pct:68},{label:'Low',pct:46}]} />
              <Multi label="Emotional State — Impact on Win"     options={[{label:'Calm',pct:66},{label:'Emotional',pct:39}]} />
              <SubLabel>Yes / No — Impact on Win</SubLabel>
              <YN label="External Distraction" yes={41} no={64} />
              <YN label="Setup Fully Valid"     yes={72} no={37} />
              <YN label="Any Rule Broken"       yes={35} no={68} />
              <YN label="FOMO Trades"           yes={28} no={66} />
              <YN label="Revenge Trades"        yes={24} no={65} />
              <YN label="Boredom Trades"        yes={33} no={64} />
              <YN label="Emotional Trades"      yes={31} no={67} />
              <SubLabel>Edge States</SubLabel>
              <Multi label="Emotional Edge — Impact on Win" options={[{label:'Stable',pct:69},{label:'Unstable',pct:36}]} />
              <Multi label="Focus State — Impact on Win"    options={[{label:'Focused',pct:71},{label:'Unfocused',pct:40}]} />
            </Scroll>
          </Panel>
        </div>

        {/* ─── DIRECTION · SETUP · EXIT · GOVERNANCE ─── */}
        <Divider label="Direction · Setup · Exit · Governance" />
        <div className="mp-g4">

          <Panel title="Direction & Bias — Impact on Win" accent={P.amber} tag="DIRECTION">
            <Scroll>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Direction</SubLabel>
              <Bar label={`Long  (${longTrades} trade${longTrades!==1?'s':''})`}  pct={Math.round(longWR)  || 0} />
              <Bar label={`Short (${shortTrades} trade${shortTrades!==1?'s':''})`} pct={Math.round(shortWR) || 0} />
              <SubLabel>HTF Bias — Impact on Win</SubLabel>
              <Bar label="Bull"  pct={75} />
              <Bar label="Bear"  pct={40} />
              <Bar label="Range" pct={32} />
              <SubLabel>Directional Bias — Impact on Win</SubLabel>
              <Bar label="Long Bias"  pct={70} />
              <Bar label="Short Bias" pct={45} />
            </Scroll>
          </Panel>

          <Panel title="Setup Tags & Trade Grade — Impact on Win" accent={P.amber} tag="SETUP · GRADE">
            <Scroll>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Setup Tag — Impact on Win</SubLabel>
              <Bar label="Breakout     (4)" pct={74} />
              <Bar label="Reversal     (6)" pct={51} />
              <Bar label="Continuation (5)" pct={68} />
              <Bar label="Pullback     (8)" pct={63} />
              <Bar label="Momentum     (5)" pct={71} />
              <SubLabel>Trade Grade — Impact on Win</SubLabel>
              <Bar label={`A — Textbook   (${tradeGrades.A||0})`}  pct={90} />
              <Bar label={`B — Solid      (${tradeGrades.B||0})`}  pct={70} />
              <Bar label={`C — Acceptable (${tradeGrades.C||0})`}  pct={50} />
              <Bar label={`D — Marginal   (${tradeGrades.D||0})`}  pct={25} />
              <Bar label={`F — Poor       (${tradeGrades.F||0})`}  pct={10} />
            </Scroll>
          </Panel>

          <Panel title="Exit Causation — Impact on Win" accent={P.red} tag="EXIT ANALYSIS">
            <Scroll>
              {(exitEntries.length > 0 ? exitEntries : [
                {reason:'Target Hit',       pct:67,ct:0},{reason:'Stop Hit',         pct:33,ct:0},
                {reason:'Emotional Exit',   pct:0, ct:0},{reason:'Structure Change', pct:0, ct:0},
                {reason:'Time Exit',        pct:0, ct:0},{reason:'News',             pct:0, ct:0},
              ]).map((x, i) => (
                <div key={i} style={{ marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:3 }}>
                    <Mono size={9} color={P.muted}>{x.reason} <span style={{color:P.dim}}>({x.ct})</span></Mono>
                    <Num size={17} color={pColor(x.pct)}>{x.pct}<span style={{fontSize:9,opacity:0.6}}>%</span></Num>
                  </div>
                  <div style={{ height:2, background:P.line2 }}>
                    <div style={{ height:'100%', width:`${x.pct||1}%`, background:pColor(x.pct), opacity:0.85 }} />
                  </div>
                </div>
              ))}
              <SubLabel>Planned vs Achieved R:R</SubLabel>
              <DR label="Avg Planned R:R"  value={`1:${avgRR.toFixed(1)}`} />
              <DR label="Avg Achieved R:R" value="1:2.5" vc={P.green} />
              <DR label="R:R Slippage"     value="−0.3R" vc={P.amber} />
            </Scroll>
          </Panel>

          <Panel title="Rule Governance — Impact on Win" accent={P.cyan} tag="COMPLIANCE">
            <Scroll>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Compliance — Impact on Win</SubLabel>
              <YN label="Setup Fully Valid" yes={72} no={37} />
              <YN label="Any Rule Broken"   yes={35} no={68} />
              <YN label="Worth Repeating"   yes={71} no={44} />
              <SubLabel>Impulse Control — Impact on Win</SubLabel>
              <YN label="FOMO Trades"      yes={28} no={66} />
              <YN label="Revenge Trades"   yes={24} no={65} />
              <YN label="Boredom Trades"   yes={33} no={64} />
              <YN label="Emotional Trades" yes={31} no={67} />
              <SubLabel>Portfolio State at Entry</SubLabel>
              <DR label="Avg Open Trades"     value="1.2" />
              <DR label="Avg Total Risk Open" value="1.8%" />
              <DR label="Correlated Exposure" value="33% Yes" vc={P.amber} />
            </Scroll>
          </Panel>
        </div>

        {/* ─── ADVANCED ANALYTICS ─── */}
        <Divider label="Advanced Analytics" />
        <div className="mp-g3">

          <Panel title="News & Catalyst — Impact on Win" accent={P.amber} tag="FUNDAMENTAL">
            {[{l:'High Impact',wr:29,r:'−0.80'},{l:'Medium Impact',wr:44,r:'0.60'},{l:'Low Impact',wr:55,r:'1.40'},{l:'None / Clean',wr:67,r:'2.83'}]
              .map((x, i) => <Bar key={i} label={x.l} pct={x.wr} sub={x.r+'R'} />)}
          </Panel>

          <Panel title="ATF + Session + Instrument — Impact on Win" accent={P.green} tag="ASSET · TF · SESSION">
            {(instrEntries.length > 0
              ? instrEntries.slice(0,4).map(ie => ({ label:ie.pair, win:ie.wr, loss:ie.loss }))
              : [{label:'EURUSD / H1 / London',win:100,loss:0},{label:'NAS100 / H1 / New York',win:52,loss:48},{label:'XAUUSD / M15 / London',win:48,loss:52}]
            ).map((x, i) => <SplitBar key={i} label={x.label} win={x.win} loss={x.loss} />)}
            <div style={{ borderTop:`1px solid ${P.line}`, paddingTop:8, textAlign:'center' }}>
              <Mono size={8} color={P.dim}>+ 12 Other Active Clusters</Mono>
            </div>
          </Panel>

          <Panel title="Session — Impact on Win" accent={P.cyan} tag="SESSION · PHASE">
            <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>By Session Name</SubLabel>
            {(sessEntries.length > 0
              ? sessEntries
              : [{name:'London',wr:70},{name:'New York',wr:55},{name:'NY Overlap',wr:38},{name:'Tokyo',wr:31},{name:'Sydney',wr:24}]
            ).map((x, i) => <Bar key={i} label={x.name} pct={x.wr} />)}
            <SubLabel>By Session Phase</SubLabel>
            <Bar label="Open"  pct={72} />
            <Bar label="Mid"   pct={40} />
            <Bar label="Close" pct={25} />
          </Panel>
        </div>

        {/* ─── DAY · DURATION · RISK SIZING ─── */}
        <Divider label="Day · Duration · Risk Sizing" />
        <div className="mp-g3">

          <Panel title="Day of Week — Impact on Win" accent={P.amber} tag="WIN% · R EXPECTANCY">
            {(dayEntries.length > 0
              ? dayEntries
              : [{day:'Monday',wr:67},{day:'Tuesday',wr:80},{day:'Wednesday',wr:55},{day:'Thursday',wr:70},{day:'Friday',wr:40}]
            ).map((x, i) => <Bar key={i} label={x.day} pct={x.wr} />)}
          </Panel>

          <Panel title="Duration & Timing — Impact on Win" accent={P.cyan} tag="HOLD TIME">
            <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Duration Bucket — Impact on Win</SubLabel>
            <Bar label="0–30 min   (3)" pct={50} />
            <Bar label="30–120 min (6)" pct={75} />
            <Bar label="2–8 hrs    (8)" pct={63} />
            <Bar label="8+ hrs     (4)" pct={41} />
            <SubLabel>Timing Context — Impact on Win</SubLabel>
            <Bar label="Impulse"       pct={75} />
            <Bar label="Correction"    pct={45} />
            <Bar label="Consolidation" pct={30} />
          </Panel>

          <Panel title="Risk & Position Sizing — Impact on Win" accent={P.amber} tag="HEAT ANALYSIS">
            <DR label="Avg Risk %"           value={riskMetrics.avgRiskPercent?`${riskMetrics.avgRiskPercent}%`:'1.1%'} />
            <DR label="Max Risk %"           value={riskMetrics.maxRiskPercent?`${riskMetrics.maxRiskPercent}%`:'2.0%'} />
            <DR label="Min Risk %"           value="0.5%" />
            <DR label="Avg Lot Size"         value="0.35" />
            <DR label="Avg SL Distance"      value="18 pips" />
            <DR label="Avg TP Distance"      value="52 pips" />
            <DR label="Avg Spread at Entry"  value="1.4 pips" />
            <DR label="Avg ATR at Entry"     value="0.0048" />
            <DR label="Avg Monetary Risk"    value="$215" />
            <DR label="Avg Potential Reward" value="$620" />
            <SubLabel>Risk Heat — Impact on Win</SubLabel>
            <Bar label="Low Heat"    pct={80} />
            <Bar label="Medium Heat" pct={55} />
            <Bar label="High Heat"   pct={26} />
          </Panel>
        </div>

        {/* ─── MAE / MFE · CANDLE PATTERNS · EXECUTION ─── */}
        <Divider label="MAE / MFE · Candle Patterns · Execution" />
        <div className="mp-g3">

          <Panel title="MAE / MFE Analysis" accent={P.cyan} tag="ENTRY QUALITY">
            <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>MAE — Adverse Excursion</SubLabel>
            <DR label="Avg MAE"   value={riskMetrics.avgMAE?`${riskMetrics.avgMAE} pip`:'−12 pip'} vc={P.red} />
            <DR label="Worst MAE" value="−22 pip" vc={P.red} />
            <DR label="MAE > SL"  value="0 trades" vc={P.green} />
            <div style={{ margin:'6px 0 10px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                <Mono size={7} color={P.dim}>Avg MAE as % of SL</Mono>
                <Mono size={7} color={P.red}>67%</Mono>
              </div>
              <div style={{ height:2, background:P.line2 }}><div style={{ width:'67%', height:'100%', background:P.red, opacity:0.7 }} /></div>
            </div>
            <SubLabel>MFE — Favourable Excursion</SubLabel>
            <DR label="Avg MFE"          value={riskMetrics.avgMFE?`+${riskMetrics.avgMFE} pip`:'+48 pip'} vc={P.green} />
            <DR label="Best MFE"         value="+87 pip" vc={P.green} />
            <DR label="Avg Capture Rate" value="68% of MFE" vc={P.cyan} />
            <div style={{ margin:'6px 0 10px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                <Mono size={7} color={P.dim}>Avg MFE captured</Mono>
                <Mono size={7} color={P.cyan}>68%</Mono>
              </div>
              <div style={{ height:2, background:P.line2 }}><div style={{ width:'68%', height:'100%', background:P.cyan, opacity:0.7 }} /></div>
            </div>
            <SubLabel>Entry Quality</SubLabel>
            <DR label="MAE / MFE Ratio" value="0.25 · Good" vc={P.green} />
            <div style={{ marginTop:8, padding:'6px 10px', background:`${P.green}0A`, border:`1px solid ${P.greenDim}` }}>
              <Mono size={7} color={P.dim}>Signal · </Mono>
              <Mono size={7} color={P.green}>Entry timing is tight — low adverse drift vs captured move</Mono>
            </div>
          </Panel>

          <Panel title="Candle Pattern · TF · Indicator Status — Impact on Win" accent={P.green} tag="PATTERNS · TF · INDICATORS">
            <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Candle Pattern × Timeframe</SubLabel>
            {[
              {l:'Engulfing  / M5', wr:82,ct:4},{l:'Engulfing  / H1', wr:78,ct:4},
              {l:'Pin Bar    / M15',wr:75,ct:5},{l:'Pin Bar    / H1', wr:60,ct:4},
              {l:'FVG Fill   / M5', wr:72,ct:6},{l:'Inside Bar / H1', wr:55,ct:5},
              {l:'Doji       / M15',wr:41,ct:5},
            ].map((x, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
                <Mono size={9} color={P.muted}>{x.l} <span style={{color:P.dim}}>({x.ct})</span></Mono>
                <Cond size={13} color={pColor(x.wr)} weight={700}>{x.wr}%</Cond>
              </div>
            ))}
            <SubLabel>Indicator Status — Impact on Win</SubLabel>
            {[
              {l:'RSI oversold + pattern', v:'78%',c:P.green},{l:'MACD cross aligned',     v:'74%',c:P.green},
              {l:'Volume spike on break',  v:'81%',c:P.green},{l:'RSI overbought entry',   v:'38%',c:P.red},
              {l:'No indicator confluence',v:'44%',c:P.amber},
            ].map((x, i) => <DR key={i} label={x.l} value={x.v} vc={x.c} />)}
          </Panel>

          <Panel title="Execution Metrics — Impact on Win" accent={P.amber} tag="ENTRY TIMING · SLIPPAGE">
            <DR label="Fill Slippage (Avg)" value="−0.15 pips" vc={P.green} />
            <DR label="TFS Alignment (Avg)" value="1.4R"        vc={P.cyan} />
            <SubLabel>Order Type — Impact on Win</SubLabel>
            {[{l:'Market',wr:67,ct:2},{l:'Limit',wr:100,ct:1},{l:'Stop',wr:0,ct:0},{l:'Stop-Limit',wr:0,ct:0}].map((x, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
                <Mono size={9} color={P.muted}>{x.l} <span style={{color:P.dim}}>({x.ct})</span></Mono>
                <Cond size={13} color={x.wr>=70?P.green:x.wr>=50?P.amber:P.dim} weight={700}>{x.wr}%</Cond>
              </div>
            ))}
            <SubLabel>Entry Method — Impact on Win</SubLabel>
            <Bar label="Market Entry" pct={65} />
            <Bar label="Limit Entry"  pct={82} />
            <Bar label="Stop Entry"   pct={49} />
          </Panel>
        </div>

        {/* ─── INSTRUMENT MATRIX · TIMEFRAME PERFORMANCE ─── */}
        <Divider label="Instrument Matrix · Timeframe Performance" />
        <div className="mp-g3">

          <Panel title="Instrument · Session Phase · Momentum — Impact on Win" accent={P.cyan} tag="WIN / LOSS" style={{ height:480 }}>
            <Scroll>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Instrument × Session — Win Rate</SubLabel>
              {(instrEntries.length > 0
                ? instrEntries.slice(0,6).map(ie => ({ p:ie.pair, wr:ie.wr, loss:ie.loss }))
                : [{p:'EURUSD / London Open',wr:78,loss:22},{p:'EURUSD / London Mid',wr:44,loss:56},{p:'NAS100 / NY Open',wr:67,loss:33},{p:'NAS100 / NY Mid',wr:40,loss:60},{p:'XAUUSD / London Open',wr:71,loss:29},{p:'GBPUSD / London Open',wr:63,loss:37}]
              ).map((x, i) => <SplitBar key={i} label={x.p} win={x.wr} loss={x.loss} />)}
              <SubLabel>Session Phase — Impact on Win</SubLabel>
              <Bar label="Open  — high liquidity flush" pct={74} />
              <Bar label="Mid   — consolidation range"  pct={42} />
              <Bar label="Close — thin / fading volume" pct={28} />
              <SubLabel>Momentum at Entry — Impact on Win</SubLabel>
              <YN label="Strong momentum confirmed" yes={74} no={43} />
              <YN label="Momentum with HTF align"   yes={78} no={38} />
              <YN label="Counter-momentum entry"    yes={29} no={61} />
              <ScoreRow label="Momentum Score → Win%"
                scores={[{score:'4.5',pct:76},{score:'4.0',pct:64},{score:'3.5',pct:51},{score:'3.0',pct:34}]} />
            </Scroll>
          </Panel>

          <Panel title="Asset + Strategy + Session + Condition" accent={P.green} tag="FULL MATRIX" style={{ height:480 }}>
            <Scroll>
              {[
                {p:'EURUSD / Silver Bullet / London / Trend',     win:100,loss:0},
                {p:'EURUSD / ICT Breaker  / London / Range',      win:40, loss:60},
                {p:'NAS100 / Silver Bullet / NY Open / Trending', win:67, loss:33},
                {p:'NAS100 / ICT Breaker  / NY Mid  / Volatile',  win:33, loss:67},
                {p:'XAUUSD / Silver Bullet / London / Trending',  win:75, loss:25},
                {p:'XAUUSD / London Open  / London / Volatile',   win:38, loss:62},
                {p:'GBPUSD / Silver Bullet / London / Trend',     win:71, loss:29},
              ].map((x, i) => <SplitBar key={i} label={x.p} win={x.win} loss={x.loss} />)}
            </Scroll>
          </Panel>

          <Panel title="Timeframe — Impact on Win" accent={P.amber} tag="ENTRY · ANALYSIS · CONTEXT" style={{ height:480 }}>
            <Scroll>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Entry TF</SubLabel>
              {(tfEntries.length > 0
                ? tfEntries.map(x => ({ l:x.tf, wr:x.wr, r:'' }))
                : [{l:'M1',wr:50,r:'2.00R'},{l:'M5',wr:100,r:'4.60R'},{l:'M15',wr:60,r:'2.10R'}]
              ).map((x, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
                  <Mono size={9} color={P.muted}>{x.l}</Mono>
                  <Cond size={13} color={pColor(x.wr)} weight={600}>{x.wr}%{x.r?` · ${x.r}`:''}</Cond>
                </div>
              ))}
              <SubLabel>Analysis TF</SubLabel>
              {[{l:'H1',wr:70,r:'2.80R'},{l:'H4',wr:50,r:'2.00R'},{l:'30M',wr:60,r:'1.90R'}].map((x, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
                  <Mono size={9} color={P.muted}>{x.l}</Mono>
                  <Cond size={13} color={pColor(x.wr)} weight={600}>{x.wr}% · {x.r}</Cond>
                </div>
              ))}
              <SubLabel>Context TF</SubLabel>
              {[{l:'D1',wr:100,r:'4.60R'},{l:'H4',wr:50,r:'2.00R'},{l:'W1',wr:28,r:'0.00R'}].map((x, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
                  <Mono size={9} color={P.muted}>{x.l}</Mono>
                  <Cond size={13} color={pColor(x.wr)} weight={600}>{x.wr}% · {x.r}</Cond>
                </div>
              ))}
            </Scroll>
          </Panel>
        </div>

        {/* ─── STRATEGY DRILL-DOWN ─── */}
        <Divider label="Strategy Drill-Down" />
        <div style={{ background:P.bg2, border:`1px solid ${P.line2}`, position:'relative' }}>
          <Corner pos="tl" color={P.green} /><Corner pos="tr" color={P.green} />
          <Corner pos="bl" color={P.line2} /><Corner pos="br" color={P.line2} />
          <div style={{ borderBottom:`1px solid ${P.line2}`, padding:'7px 12px', background:P.bg3, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:2, height:12, background:P.green }} />
              <Cond size={11} color={P.bright} weight={700}>Strategy Drill-Down</Cond>
            </div>
            <select value={strat} onChange={e => setStrat(e.target.value)} className="mp-select" data-testid="select-strategy-drill">
              {strategies.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="mp-strat-grid">
            <div style={{ borderRight:`1px solid ${P.line2}`, padding:'10px 14px' }}>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Bias — Impact on Win</SubLabel>
              {[
                { bias:'Bullish', ct:`${longTrades} trade${longTrades!==1?'s':''}`,  wr:`${Math.round(longWR)}%`,  c:P.green },
                { bias:'Bearish', ct:`${shortTrades} trade${shortTrades!==1?'s':''}`, wr:`${Math.round(shortWR)}%`, c:P.red },
              ].map((x, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:`1px solid ${P.line}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:3, height:3, borderRadius:'50%', background:x.c }} />
                    <div>
                      <Mono size={9} color={x.c} style={{ display:'block' }}>{x.bias}</Mono>
                      <Mono size={7} color={P.dim}>{x.ct}</Mono>
                    </div>
                  </div>
                  <Cond size={14} color={x.c} weight={700}>{x.wr}</Cond>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', paddingTop:8 }}>
                <Mono size={8} color={P.dim}>Current Streak</Mono>
                <Mono size={9} color={streaks.currentStreakType==='win'?P.green:P.red}>
                  {(streaks.currentStreakType||'--').toUpperCase()} × {streaks.currentStreakCount||0}
                </Mono>
              </div>
            </div>
            <div style={{ padding:'10px 14px' }}>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Top Performer</SubLabel>
              {topStrat ? (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:`1px solid ${P.line}` }}>
                    <Mono size={9} color={P.green}>{topStrat.name}</Mono>
                    <div style={{ padding:'2px 6px', border:`1px solid ${P.line2}` }}><Mono size={7} color={P.dim}>EDGE +</Mono></div>
                  </div>
                  <DR label="Win Rate" value={`${Math.round(topStrat.wr)}%`} vc={P.green} />
                  <DR label="Trades"   value={`${topStrat.trades}`} />
                  <DR label="Net P/L"  value={fmtPL(topStrat.pl)} vc={topStrat.pl>=0?P.green:P.red} />
                </>
              ) : <Mono size={9} color={P.dim}>No strategy data yet</Mono>}
            </div>
          </div>
        </div>

        {/* ─── RISK PERFORMANCE ─── */}
        <Divider label="Risk Performance" />
        <div className="mp-g4">

          <Panel title="Drawdown" accent={P.red} tag="CURRENT PERIOD">
            <DR label="Max DD"     value={maxDD!==0?`${fmtPL(maxDD)} (${ddPct}%)`:'$0 (0.00%)'} vc={P.red} />
            <DR label="Current DD" value={maxDD!==0?`${ddPct}% · ${fmtPL(maxDD)}`:'0.00% · $0'}  vc={P.amber} />
            <DR label="Balance"    value={equityGrowth?.currentBalance?`$${equityGrowth.currentBalance.toLocaleString(undefined,{maximumFractionDigits:0})}`:'--'} vc={P.green} />
            <DR label="Period"     value="THIS SESSION" vc={P.dim} />
            {maxDD!==0 && (
              <div style={{ marginTop:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <Mono size={8} color={P.dim}>DD USED</Mono>
                  <Mono size={8} color={P.red}>{ddPct}%</Mono>
                </div>
                <div style={{ height:2, background:P.line2 }}>
                  <div style={{ width:`${Math.min(100,parseFloat(ddPct))}%`, height:'100%', background:P.red }} />
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Avg Win / Loss" accent={P.green} tag="P&L STATS">
            <DR label="Avg Win"          value={`$${Math.round(avgWin).toLocaleString()}`}  vc={P.green} />
            <DR label="Avg Loss"         value={`$${Math.round(avgLoss).toLocaleString()}`} vc={P.red} />
            <DR label="Win / Loss Ratio" value={winLossRatio}                               vc={P.cyan} />
            <DR label="Total Wins"       value={`${wins}`}                                  vc={P.green} />
            <DR label="Total Losses"     value={`${losses}`}                                vc={P.red} />
          </Panel>

          <Panel title="Streaks" accent={P.cyan} tag="WIN / LOSS">
            <DR label="Longest Win Streak"  value={`${streaks.maxWinStreak||0}`}  vc={P.green} />
            <DR label="Longest Loss Streak" value={`${streaks.maxLossStreak||0}`} vc={P.red} />
            <DR label="Current Streak"
              value={`${(streaks.currentStreakType||'--').toUpperCase()} × ${streaks.currentStreakCount||0}`}
              vc={streaks.currentStreakType==='win'?P.green:P.red} />
            <DR label="Recovery Sequences" value={`${streaks.recoverySequences||0}`} />
          </Panel>

          <Panel title="Risk of Ruin" accent={P.amber} tag="ACCOUNT SAFETY">
            <DR label="Ruin Probability" value={`${riskOfRuin}%`}         vc={rorColor} />
            <DR label="Win Rate"         value={fmtPct(winRate)}           vc={winRate>=50?P.green:P.red} />
            <DR label="Risk per Trade"   value={riskMetrics.avgRiskPercent?`${riskMetrics.avgRiskPercent}%`:'--'} vc={P.cyan} />
            <DR label="Profit Factor"    value={profitFactor.toFixed(2)}   vc={profitFactor>=1?P.green:P.red} />
            <DR label="Risk Status"      value={rorStatus}                 vc={rorColor} />
          </Panel>
        </div>

        {/* ─── EQUITY CURVE ─── */}
        <Divider label="Equity Curve · Risk of Ruin" />
        <div className="mp-eq-grid">
          <EquityChart equityCurve={equityCurve} equityGrowth={equityGrowth} />
          <Panel title="Period Summary" accent={P.cyan} tag="PERFORMANCE">
            <DR label="Total P/L"     value={fmtPL(totalPL)}             vc={isPos?P.green:P.red} />
            <DR label="Win Rate"      value={fmtPct(winRate)}             vc={winRate>=50?P.green:P.red} />
            <DR label="Profit Factor" value={profitFactor.toFixed(2)}     vc={profitFactor>=1?P.green:P.red} />
            <DR label="Expectancy"    value={`${expectancy.toFixed(2)}R`}  vc={expectancy>0?P.green:P.red} />
            <DR label="Total Trades"  value={`${totalTrades}`} />
            <DR label="Avg R:R"       value={`1:${avgRR.toFixed(1)}`} />
            {equityGrowth?.totalReturnPct!=null && (
              <DR label="Return %"
                value={`${equityGrowth.totalReturnPct>=0?'+':''}${equityGrowth.totalReturnPct.toFixed(2)}%`}
                vc={equityGrowth.totalReturnPct>=0?P.green:P.red} />
            )}
          </Panel>
        </div>

        {/* ─── STRATEGY PERFORMANCE TABLE ─── */}
        <Divider label="Strategy Performance — Market Conditions" />
        <div style={{ background:P.bg2, border:`1px solid ${P.line2}`, position:'relative' }}>
          <Corner pos="tl" color={P.cyan} /><Corner pos="tr" color={P.cyan} />
          <Corner pos="bl" color={P.line2} /><Corner pos="br" color={P.line2} />
          <div style={{ borderBottom:`1px solid ${P.line2}`, padding:'7px 12px', background:P.bg3, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:2, height:12, background:P.cyan }} />
            <Cond size={11} color={P.bright} weight={700}>Strategy Performance — Impact on Win in Bullish, Bearish and Ranging Markets</Cond>
          </div>
          <div style={{ padding:12, overflowX:'auto' }}>
            <table className="mp-dtable">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th style={{color:P.green}}>Bullish</th>
                  <th style={{color:P.red}}>Bearish</th>
                  <th style={{color:P.amber}}>Ranging</th>
                  <th style={{color:P.amber}}>Liquidity</th>
                  <th style={{color:P.cyan}}>Trend Aligned</th>
                  <th style={{textAlign:'right'}}>Net P/L</th>
                </tr>
              </thead>
              <tbody>
                {(stratEntries.length > 0
                  ? stratEntries.map(s => ({n:s.name,bu:`${Math.round(s.wr)}%`,be:'--',ra:'--',lq:'--',al:`${Math.round(s.wr)}%`,pl:fmtPL(s.pl),pc:s.pl>=0?P.green:P.red}))
                  : [{n:'SMC Breaker',bu:'74%',be:'29%',ra:'35%',lq:'High',al:'74%',pl:'+$900',pc:P.green},{n:'Silver Bullet',bu:'68%',be:'33%',ra:'41%',lq:'High',al:'68%',pl:'+$1,200',pc:P.green}]
                ).map((r, i) => (
                  <tr key={i}>
                    <td className="mp-dn">{r.n}</td>
                    <td style={{color:P.green}}>{r.bu}</td>
                    <td style={{color:P.red}}>{r.be}</td>
                    <td style={{color:P.amber}}>{r.ra}</td>
                    <td style={{color:P.amber}}>{r.lq}</td>
                    <td style={{color:P.cyan}}>{r.al}</td>
                    <td style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:17,fontWeight:700,color:r.pc,textAlign:'right'}}>{r.pl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── SETUP OCCURRENCE FREQUENCY ─── */}
        <Divider label="Setup Occurrence Frequency" />
        <div style={{ background:P.bg2, border:`1px solid ${P.line2}`, position:'relative', marginBottom:8 }}>
          <Corner pos="tl" color={P.amber} /><Corner pos="tr" color={P.amber} />
          <Corner pos="bl" color={P.line2} /><Corner pos="br" color={P.line2} />
          <div style={{ borderBottom:`1px solid ${P.line2}`, padding:'7px 12px', background:P.bg3, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:2, height:12, background:P.amber }} />
            <Cond size={11} color={P.bright} weight={700}>Setup Occurrence Frequency — Per Day / Week / Month / Year</Cond>
          </div>
          <div style={{ padding:12, overflowX:'auto' }}>
            <table className="mp-dtable">
              <thead>
                <tr>
                  <th>Setup</th>
                  <th style={{color:P.cyan}}>Per Day</th>
                  <th style={{color:P.cyan}}>Per Week</th>
                  <th style={{color:P.cyan}}>Per Month</th>
                  <th style={{color:P.cyan}}>Per Year</th>
                  <th style={{color:P.amber}}>Win Rate</th>
                  <th style={{textAlign:'right'}}>Best Period</th>
                </tr>
              </thead>
              <tbody>
                {(Object.entries(setupFrequency).length > 0
                  ? Object.entries(setupFrequency).map(([name, count]: [string, any]) => {
                      const sd = strategyPerformance[name] || {};
                      const wr = Math.round(sd.winRate || 0);
                      return { n:name, d:`${count}`, w:`${count*5}`, mo:`${count*20}`, y:`${count*240}`, wr:`${wr}%`, pc:wr>=60?P.green:P.amber, best:'--' };
                    })
                  : [
                      {n:'Silver Bullet',d:'1–2',w:'5–8',  mo:'20–32',y:'240–384',wr:'67%',pc:P.green,best:'London Open'},
                      {n:'SMC Breaker',  d:'0–1',w:'2–4',  mo:'8–16', y:'96–192', wr:'74%',pc:P.green,best:'NY Session'},
                      {n:'Breakout',     d:'0–1',w:'1–3',  mo:'4–12', y:'48–144', wr:'74%',pc:P.green,best:'Tuesday'},
                      {n:'Pullback',     d:'1–3',w:'5–10', mo:'20–40',y:'240–480',wr:'63%',pc:P.green,best:'Monday'},
                      {n:'FVG Fill',     d:'1–3',w:'5–12', mo:'20–48',y:'240–576',wr:'70%',pc:P.green,best:'London'},
                    ]
                ).map((r, i) => (
                  <tr key={i}>
                    <td className="mp-dn">{r.n}</td>
                    <td>{r.d}</td><td>{r.w}</td><td>{r.mo}</td><td>{r.y}</td>
                    <td style={{color:r.pc,fontWeight:600}}>{r.wr}</td>
                    <td style={{color:P.amber,textAlign:'right'}}>{r.best}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
