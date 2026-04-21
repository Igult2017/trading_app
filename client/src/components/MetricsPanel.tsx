import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/queryClient';
import { Loader2 } from 'lucide-react';
import { useSessionBalance } from '@/hooks/useSessionBalance';

/* ─────────────────────────────────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────────────────────────────────── */

const P = {
  bg:'#0D0F1C', bg2:'#121526', bg3:'#171A30',
  line:'#1E2240', line2:'#252848',
  dim:'#6A7299', muted:'#8A93B8', body:'#B0B8D4', bright:'#D8DCF0', white:'#EEF0FA',
  green:'#4AE88A', greenDim:'#1A3A30',
  red:'#E84A4A',   redDim:'#3A1A1A',
  amber:'#E8B84A', amberDim:'#3A2E1A',
  cyan:'#4AE8D8',  cyanDim:'#1A3A38',
};

const pColor = (v: number | null | undefined) => {
  if (v == null) return P.dim;
  return v >= 65 ? P.green : v >= 50 ? P.amber : P.red;
};

const fmt  = (v: number | null | undefined, decimals = 0) =>
  v == null ? '--' : v.toFixed(decimals);
const fmtPL  = (v: number) => v >= 0 ? `+$${Math.abs(v).toLocaleString()}` : `-$${Math.abs(v).toLocaleString()}`;
const fmtPct = (v: number) => `${Math.round(v)}%`;

/* ── helpers to safely pull win-rate from metric objects ─────────── */
const wr   = (obj: any): number | null => obj?.winRate ?? null;
const wrR  = (obj: any): number       => Math.round(wr(obj) ?? 0);
const ct   = (obj: any): number       => obj?.count ?? 0;

/* ─────────────────────────────────────────────────────────────────────
   ATOM COMPONENTS
───────────────────────────────────────────────────────────────────── */
const Mono = ({ children, size=11, color=P.muted, weight=400, upper=true, spacing='0.14em', style={} as React.CSSProperties, className='' }: any) => (
  <span className={className} style={{ fontFamily:"'DM Mono',monospace", fontSize:size, color, fontWeight:weight, letterSpacing:spacing, textTransform:upper?'uppercase':'none', ...style }}>{children}</span>
);
const Cond = ({ children, size=14, color=P.bright, weight=600, upper=true, style={} as React.CSSProperties, className='' }: any) => (
  <span className={className} style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:size, color, fontWeight:weight, letterSpacing:'0.06em', textTransform:upper?'uppercase':'none', lineHeight:1, ...style }}>{children}</span>
);
const Num = ({ children, size=9, color=P.green, style={} as React.CSSProperties }: any) => (
  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:size, color, fontWeight:400, letterSpacing:'0.05em', lineHeight:1, ...style }}>{children}</span>
);

/* ─────────────────────────────────────────────────────────────────────
   DECORATIVE CORNERS
───────────────────────────────────────────────────────────────────── */
const Corner = (_props: { size?:number; color?:string; pos:'tl'|'tr'|'bl'|'br' }) => null;

/* ─────────────────────────────────────────────────────────────────────
   PANEL
───────────────────────────────────────────────────────────────────── */
const Panel = ({ title, accent=P.green, tag, children, style={} as React.CSSProperties }: any) => (
  <div style={{ background:P.bg2, border:`1px solid ${P.line2}`, position:'relative', ...style }}>
    <div style={{ borderBottom:`1px solid ${P.line2}`, padding:'7px 12px', background:P.bg3, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:2, height:12, background:accent, flexShrink:0 }} />
        <Cond size={8} color={P.bright} weight={700}>{title}</Cond>
      </div>
      {tag && <Mono size={8} color="#5B9BF0" style={{ fontStyle:'italic' }}>{tag}</Mono>}
    </div>
    <div className="mp-panel-body" style={{ padding:12 }}>{children}</div>
  </div>
);

const Divider = ({ label }: { label:string }) => (
  <div style={{ display:'flex', alignItems:'center', gap:12, margin:'2px 0' }}>
    <div style={{ flex:1, height:1, background:`linear-gradient(to right,transparent,${P.line2})` }} />
    <Mono size={9} color={P.dim}>{label}</Mono>
    <div style={{ flex:1, height:1, background:`linear-gradient(to left,transparent,${P.line2})` }} />
  </div>
);

const SubLabel = ({ children, style={} as React.CSSProperties }: any) => (
  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:P.muted, textTransform:'uppercase', letterSpacing:'0.18em', borderTop:`1px solid ${P.line}`, paddingTop:7, marginTop:9, marginBottom:5, ...style }}>{children}</div>
);

const DR = ({ label, value, vc }: { label:string; value:string; vc?:string }) => (
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
    <Mono size={10} color={P.body}>{label}</Mono>
    <Mono size={9} color={vc||P.bright} weight={500}>{value}</Mono>
  </div>
);

const Bar = ({ label, pct, sub, count }: { label:string; pct:number|null|undefined; sub?:string; count?:number }) => {
  const val = pct != null ? Math.round(pct) : null;
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
      <Mono size={10} color={P.body}>{label}</Mono>
      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
        {count != null && <Mono size={9} color={P.cyan}>({count})</Mono>}
        {sub && <Mono size={9} color={P.dim}>{sub}</Mono>}
        {val == null
          ? <Mono size={10} color={P.dim}>--</Mono>
          : <Num color={pColor(val)} style={{ fontSize:10 }}>{val}<span style={{ fontSize:8, opacity:0.7 }}>%</span></Num>
        }
      </div>
    </div>
  );
};

const YN = ({ label, yes, no }: { label:string; yes:number|null|undefined; no:number|null|undefined }) => (
  <div style={{ display:'flex', borderBottom:`1px solid ${P.line}`, alignItems:'stretch' }}>
    <div style={{ flex:1, padding:'5px 7px', borderRight:`1px solid ${P.line}` }}>
      <Mono size={10} color={P.body}>{label}</Mono>
    </div>
    <div style={{ width:52, padding:'3px 5px', borderRight:`1px solid ${P.line}`, textAlign:'center' }}>
      <Mono size={7} color={P.dim} style={{ display:'block', marginBottom:1 }}>YES</Mono>
      {yes == null ? <Mono size={7} color={P.dim}>--</Mono> : <Num color={pColor(yes)} style={{ fontSize:7 }}>{Math.round(yes)}%</Num>}
    </div>
    <div style={{ width:52, padding:'3px 5px', textAlign:'center' }}>
      <Mono size={7} color={P.dim} style={{ display:'block', marginBottom:1 }}>NO</Mono>
      {no == null ? <Mono size={7} color={P.dim}>--</Mono> : <Num color={pColor(no)} style={{ fontSize:7 }}>{Math.round(no)}%</Num>}
    </div>
  </div>
);

/* Impact-of-boolean helper: pulls yes/no win rates from psychology.booleanImpacts */
const BoolYN = ({ label, data }: { label:string; data:any }) => (
  <YN label={label} yes={data?.yes?.winRate} no={data?.no?.winRate} />
);

const Multi = ({ label, options }: { label?:string; options:{ label:string; pct:number|null|undefined }[] }) => (
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:`1px solid ${P.line}`, gap:8 }}>
    {label ? <Mono size={9} color={P.muted} style={{ flexShrink:1, whiteSpace:'normal', wordBreak:'break-word' }}>{label}</Mono> : <span/>}
    <div style={{ display:'flex', gap:14, flexShrink:0 }}>
      {options.map((o,i) => (
        <div key={i} style={{ textAlign:'right', minWidth:30 }}>
          <Mono size={8} color={P.dim} style={{ display:'block' }}>{o.label}</Mono>
          {o.pct == null
            ? <Mono size={8} color={P.dim}>--</Mono>
            : <Num color={pColor(o.pct)} style={{ fontSize:8 }}>{Math.round(o.pct)}%</Num>
          }
        </div>
      ))}
    </div>
  </div>
);

const ScoreRow = ({ label, scores }: { label:string; scores:{ score:string; pct:number|null|undefined }[] }) => (
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:`1px solid ${P.line}`, gap:8 }}>
    <Mono size={9} color={P.muted} style={{ flexShrink:0 }}>{label}</Mono>
    <div style={{ display:'flex', gap:12 }}>
      {scores.map((s,i) => (
        <div key={i} style={{ textAlign:'right' }}>
          <Mono size={8} color={P.dim} style={{ display:'block' }}>{s.score}</Mono>
          {s.pct == null
            ? <Mono size={8} color={P.dim}>--</Mono>
            : <Num color={pColor(s.pct ?? 0)} style={{ fontSize:8 }}>{Math.round(s.pct ?? 0)}%</Num>
          }
        </div>
      ))}
    </div>
  </div>
);

const SplitBar = ({ label, win, loss: _loss, count, labelSize=10 }: { label:string; win:number; loss:number; count?:number; labelSize?:number }) => (
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
    <Mono size={labelSize} color={P.body}>{label}</Mono>
    <div style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0 }}>
      {count != null && <Mono size={9} color={P.cyan}>({count})</Mono>}
      <Num color={pColor(win)} style={{ fontSize:10 }}>{win}%</Num>
    </div>
  </div>
);

const Scroll = ({ children }: { children:React.ReactNode }) => (
  <div style={{ maxHeight:400, overflowY:'auto', paddingRight:2 }} className="mp-scroll">{children}</div>
);

/* ─────────────────────────────────────────────────────────────────────
   SCORE ROWS FROM scoreImpacts — maps each score bucket array to display
───────────────────────────────────────────────────────────────────── */
function scoreRowFromImpact(arr: any[]): { score:string; pct:number|null }[] {
  if (!Array.isArray(arr) || arr.length === 0)
    return [{ score:'4.5', pct:null },{ score:'4.0', pct:null },{ score:'3.5', pct:null },{ score:'3.0', pct:null }];
  return arr.map((b:any) => ({ score:String(b.score), pct:b.winRate ?? null }));
}

/* ─────────────────────────────────────────────────────────────────────
   EQUITY CHART
───────────────────────────────────────────────────────────────────── */
const EquityChart = ({ equityCurve, equityGrowth }: { equityCurve:any[]; equityGrowth?:any }) => {
  const [view, setView] = useState<'DAILY'|'WEEKLY'|'MONTHLY'>('WEEKLY');
  const H=160; const W=600;

  const groupedPoints = (() => {
    if (!equityCurve || equityCurve.length === 0) return [];
    if (view === 'DAILY') return equityCurve.map((e:any) => {
      const d = e.date ? new Date(e.date) : null;
      const label = (d && !isNaN(d.getTime()))
        ? d.toLocaleString('default', { month: 'short', day: 'numeric' })
        : `#${e.tradeNumber}`;
      return { ...e, _label: label };
    });
    const buckets = new Map<string, any>();
    for (const e of equityCurve) {
      const d = e.date ? new Date(e.date) : null;
      let key: string;
      let label: string;
      if (!d || isNaN(d.getTime())) {
        key = `t${e.tradeNumber}`;
        label = `#${e.tradeNumber}`;
      } else if (view === 'WEEKLY') {
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
        key = `${d.getFullYear()}-W${week}`;
        label = `W${week}`;
      } else {
        key = `${d.getFullYear()}-${d.getMonth()}`;
        label = d.toLocaleString('default', { month: 'short' });
      }
      buckets.set(key, { ...e, _label: label });
    }
    return Array.from(buckets.values());
  })();

  const buildPts = (): [number,number][] => {
    if (groupedPoints.length === 0) return [[0,H/2],[W,H/2]];
    const vals=groupedPoints.map((e:any)=>e.cumulativePL);
    const minV=Math.min(...vals); const maxV=Math.max(...vals); const range=maxV-minV||1;
    return groupedPoints.map((e:any,i:number) => {
      const x=groupedPoints.length>1?(i/(groupedPoints.length-1))*W:W/2;
      const y=H-((e.cumulativePL-minV)/range)*H*0.85-H*0.075;
      return [x, Math.max(0,Math.min(H,y))];
    });
  };
  const pts=buildPts();
  const path=pts.reduce((a:string,[x,y]:[number,number],i:number)=>{ if(i===0)return `M${x},${y}`; const[px,py]=pts[i-1];const cx=px+(x-px)/2; return `${a} C${cx},${py} ${cx},${y} ${x},${y}`; },'');
  const fill=`${path} L${pts[pts.length-1][0]},${H} L0,${H} Z`;
  const last=pts[pts.length-1];
  const labs=(()=>{
    if (groupedPoints.length === 0) return ['--'];
    const step=Math.max(1,Math.floor(groupedPoints.length/5));
    return groupedPoints
      .filter((_:any,i:number)=>i%step===0||i===groupedPoints.length-1)
      .map((e:any)=>e._label ?? `#${e.tradeNumber}`);
  })();
  const yLabels=(()=>{ if(groupedPoints.length===0)return['--','--','--','--']; const vals=groupedPoints.map((e:any)=>e.cumulativePL); const maxV=Math.max(...vals);const minV=Math.min(...vals);const range=maxV-minV||1; return[maxV,maxV-range*0.33,maxV-range*0.66,minV].map(v=>v>=1000||v<=-1000?`${(v/1000).toFixed(1)}k`:`${Math.round(v)}`); })();
  const balance=equityGrowth?.currentBalance??0; const startBal=equityGrowth?.startingBalance??0; const retPct=equityGrowth?.totalReturnPct??0; const totalPL=equityGrowth?.totalPL??0; const isPos=totalPL>=0;
  const fmtBal=(v:number)=>v?`$${v.toLocaleString(undefined,{maximumFractionDigits:0})}`:'--';

  return (
    <div style={{ background:P.bg2, border:`1px solid ${P.line2}`, position:'relative' }}>
      <Corner pos="tl" color={P.cyan}/><Corner pos="tr" color={P.cyan}/>
      <Corner pos="bl" color={P.line2}/><Corner pos="br" color={P.line2}/>
      <div style={{ borderBottom:`1px solid ${P.line2}`, padding:'7px 12px', background:P.bg3, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:2, height:12, background:P.cyan }} />
          <Cond size={11} color={P.bright} weight={700}>Equity Curve</Cond>
        </div>
        <div style={{ display:'flex', gap:1 }}>
          {(['DAILY','WEEKLY','MONTHLY'] as const).map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, letterSpacing:'0.12em', textTransform:'uppercase', padding:'3px 9px', border:`1px solid ${view===v?P.cyan:P.line2}`, background:view===v?`${P.cyan}18`:'transparent', color:view===v?P.cyan:P.muted, cursor:'pointer', outline:'none' }}>{v}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:18 }}>
          {([['BALANCE',fmtBal(balance),isPos?P.green:P.red],['RETURN',retPct?`${retPct>=0?'+':''}${retPct.toFixed(2)}%`:'--',isPos?P.green:P.red],['START',fmtBal(startBal),P.body]] as [string,string,string][]).map(([l,v,c],i)=>(
            <div key={i} style={{ textAlign:'right' }}>
              <Mono size={7} color={P.dim} style={{ display:'block' }}>{l}</Mono>
              <Num color={c}>{v}</Num>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding:'12px 14px 10px' }}>
        <div style={{ display:'flex', gap:8 }}>
          <div style={{ display:'flex', flexDirection:'column', justifyContent:'space-between', paddingRight:6, paddingBottom:18 }}>
            {yLabels.map((l,i)=><Mono key={i} size={7} color={P.dim}>{l}</Mono>)}
          </div>
          <div style={{ flex:1 }}>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="mp-eq-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={P.cyan} stopOpacity="0.18"/>
                  <stop offset="100%" stopColor={P.cyan} stopOpacity="0.01"/>
                </linearGradient>
              </defs>
              {[0,0.33,0.66,1].map((p,i)=><line key={i} x1="0" y1={p*H} x2={W} y2={p*H} stroke={P.line} strokeWidth="1"/>)}
              <path d={fill} fill="url(#mp-eq-grad)"/>
              <path d={path} fill="none" stroke={P.cyan} strokeWidth="1.5"/>
              <circle cx={last[0]} cy={last[1]} r="4" fill={P.bg2} stroke={P.cyan} strokeWidth="1.5"/>
              <circle cx={last[0]} cy={last[1]} r="1.5" fill={P.cyan}/>
            </svg>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
              {labs.map((l:string,i:number)=><Mono key={i} size={7} color={P.dim}>{l}</Mono>)}
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
export default function MetricsPanel({ sessionId }: { sessionId?:string|null }) {
  const [strat, setStrat] = useState('ALL STRATEGIES');

  const queryUrl = sessionId
    ? `/api/metrics/compute?sessionId=${sessionId}`
    : '/api/metrics/compute';

  // Avoid spawning an expensive metrics request when the session is empty.
  const { tradeCount, isLoading: balLoading } = useSessionBalance(sessionId);
  const hasTrades = tradeCount > 0;

  const { data:metricsData, isLoading, isFetching, isError } = useQuery<{ success:boolean; metrics:any }>({
    queryKey:['/api/metrics/compute', sessionId],
    queryFn: async () => {
      const r = await authFetch(queryUrl);
      if (!r.ok) throw new Error(`${r.status}: ${r.statusText}`);
      return r.json();
    },
    enabled: !!sessionId && hasTrades,
    staleTime: 2 * 60 * 1000,
    gcTime:   30 * 60 * 1000,
  });

  /* ── CSS ── */
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&display=swap');
    .mp-root,.mp-root *,.mp-root *::before,.mp-root *::after{box-sizing:border-box;margin:0;padding:0;}
    .mp-root{font-family:'Barlow',sans-serif;background:${P.bg};color:${P.body};}
    .mp-root::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:9999;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.025) 2px,rgba(0,0,0,0.025) 4px);}
    .mp-kpi{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;padding:8px 20px;background:${P.bg};border-bottom:1px solid ${P.line2};}
    .mp-kpi-cell{background:${P.bg2};border:1px solid ${P.line2};padding:10px 14px 12px;position:relative;overflow:hidden;}
    .mp-kpi-cell::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;}
    .mp-kpi-pos::before{background:linear-gradient(to right,${P.green},transparent);}
    .mp-kpi-neg::before{background:linear-gradient(to right,${P.red},transparent);}
    .mp-kpi-neu::before{background:linear-gradient(to right,${P.line2},transparent);}
    .mp-page{padding:14px 20px;display:flex;flex-direction:column;gap:12px;}
    .mp-g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
    .mp-g3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
    .mp-g2{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
    .mp-scroll{max-height:420px;overflow-y:auto;}
    .mp-scroll::-webkit-scrollbar{width:2px;}
    .mp-scroll::-webkit-scrollbar-thumb{background:${P.line2};}
    .mp-dtable{width:100%;border-collapse:collapse;}
    .mp-dtable th{font-family:'DM Mono',monospace;font-size:9px;color:${P.dim};text-transform:uppercase;letter-spacing:0.16em;padding:7px 11px;text-align:left;border-bottom:1px solid ${P.line2};font-weight:400;}
    .mp-dtable td{font-family:'DM Mono',monospace;font-size:10px;padding:8px 11px;border-bottom:1px solid ${P.line};color:${P.bright};}
    .mp-dtable tr:last-child td{border-bottom:none;}
    .mp-dn{font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.05em;}
    .mp-select{font-family:'DM Mono',monospace;font-size:9px;background:${P.bg3};color:${P.muted};border:1px solid ${P.line2};padding:2px 6px;outline:none;cursor:pointer;}
    .mp-panel-body,.mp-panel-body *{font-family:'DM Mono',monospace !important;}
    .mp-strat-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;}
    .mp-eq-grid{display:grid;grid-template-columns:2fr 1fr;gap:12px;}
    @media(max-width:1024px){.mp-page{padding:10px 14px;gap:10px;}.mp-g4{grid-template-columns:repeat(2,1fr);}.mp-g3{grid-template-columns:1fr;}.mp-kpi{grid-template-columns:repeat(4,1fr);}.mp-eq-grid{grid-template-columns:1fr;}.mp-strat-grid{grid-template-columns:1fr;}}
    @media(max-width:640px){.mp-page{padding:8px 10px;gap:8px;}.mp-g4,.mp-g3,.mp-g2{grid-template-columns:1fr;}.mp-kpi{grid-template-columns:repeat(2,1fr);padding:8px 10px;}.mp-kpi-cell:last-child{grid-column:1/-1;}.mp-eq-grid{grid-template-columns:1fr;}.mp-strat-grid{grid-template-columns:1fr;}}
  `;

  /* ── GUARDS ── */
  if (!sessionId) return (
    <div className="mp-root" style={{ minHeight:300, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <style>{css}</style>
      <Mono size={11} color={P.dim} data-testid="text-metrics-no-session">No session selected — pick a session to view metrics.</Mono>
    </div>
  );
  if (isLoading || (balLoading && !metricsData)) return (
    <div className="mp-root" style={{ padding:'18px 20px', display:'flex', alignItems:'center', gap:10 }}>
      <style>{css}</style>
      <style>{`@keyframes mp-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      <Loader2 style={{ color:P.cyan, animation:'mp-spin 1s linear infinite', width:14, height:14 }}/>
      <Mono size={10} color={P.dim} data-testid="text-metrics-loading">Loading metrics…</Mono>
    </div>
  );
  if (isError||(metricsData&&!metricsData.success)) return (
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
  const dayOfWeekBreakdown  = m.dayOfWeekBreakdown        || {};
  const timeframeBreakdown  = m.timeframeBreakdown        || {};
  const psychology          = m.psychology                || {};
  const marketRegime        = m.marketRegime              || {};
  const setupTags           = m.setupTags                 || {};
  const candlePatterns          = m.candlePatterns              || {};
  const candleIndicatorTFMatrix = m.candleIndicatorTFMatrix     || {};
  const durationBreakdown   = m.durationBreakdown         || {};
  const sessionPhase           = m.sessionPhase              || {};
  const sessionPhaseBySession  = m.sessionPhaseBySession     || {};
  const instrSessMatrix           = m.instrumentSessionMatrix          || {};
  const instrPhaseMomMatrix       = m.instrumentPhaseMomentumMatrix    || {};
  const stratMarketMatrix         = m.strategyMarketMatrix             || {};
  const orderTypeBreakdown  = m.orderTypeBreakdown        || {};
  const riskHeatBreakdown   = m.riskHeatBreakdown         || {};
  const newsImpactBreakdown = m.newsImpactBreakdown       || {};
  const maeMfe              = m.maeMfe                    || {};
  const rrAnalysis          = m.rrAnalysis                || {};
  const setupFreqAnnualised = m.setupFrequencyAnnualised  || {};

  const boolImpacts  = psychology.booleanImpacts  || {};
  const catBreakdown = psychology.categoricals    || {};
  const scoreImpacts = psychology.scoreImpacts    || {};
  const tfEntry      = timeframeBreakdown.entry   || {};
  const tfAnalysis   = timeframeBreakdown.analysis || {};
  const tfContext    = timeframeBreakdown.context  || {};
  const regimeData   = marketRegime.regime        || {};
  const volatilityData = marketRegime.volatility  || {};
  const durationBuckets = durationBreakdown.buckets || {};
  const timingCtxData   = durationBreakdown.timingContext || {};

  /* ── DERIVED ── */
  const totalPL      = core.totalPL      || 0;
  const winRate      = core.winRate      || 0;
  const expectancy   = core.expectancy   || 0;
  const totalTrades  = core.totalTrades  || 0;
  const profitFactor    = core.profitFactor || 0;
  const pfDisplay       = profitFactor >= 999 ? '∞' : profitFactor.toFixed(2);
  const avgRR           = core.avgRR        || 0;
  const wins         = core.wins         || 0;
  const losses       = core.losses       || 0;
  const avgWin       = core.avgWin       || 0;
  const avgLoss      = core.avgLoss      || 0;
  const netGrowthPct = equityGrowth?.totalReturnPct ?? null;
  const maxDD        = streaks.maxDrawdown        || 0;
  const currentDD    = streaks.currentDrawdown    || 0;
  const isPos        = totalPL >= 0;
  const winLossRatio = avgLoss > 0 ? (avgWin/avgLoss).toFixed(1) : '0';

  const longData  = directionBias.long  || {};
  const shortData = directionBias.short || {};
  const longWR    = longData.winRate    || 0;
  const shortWR   = shortData.winRate   || 0;
  const longTrades  = longData.trades   || 0;
  const shortTrades = shortData.trades  || 0;

  const stratEntries = Object.entries(strategyPerformance).map(([name,d]: [string,any]) => ({
    name, wr: d.winRate ?? null, trades: d.trades||0, pl: d.pl||0,
  }));
  const strategies = ['ALL STRATEGIES', ...Object.keys(strategyPerformance).filter(k=>k!=='Unclassified')];

  const instrEntries = Object.entries(instrumentBreakdown).map(([pair,d]: [string,any]) => ({
    pair, wr: Math.round(d.winRate||0), loss: 100-Math.round(d.winRate||0),
  }));
  const dayEntries  = Object.entries(dayOfWeekBreakdown).map(([day,d]: [string,any]) => ({ day, wr: Math.round((d as any).winRate||0) }));
  const tfEntries   = Object.entries(tfEntry).map(([tf,d]: [string,any])              => ({ tf,  wr: Math.round((d as any).winRate||0), count: (d as any).count||0 }));
  const sessEntries = Object.entries(sessionBreakdown).map(([name,d]: [string,any])   => ({ name, wr: Math.round((d as any).winRate||0), count: (d as any).count||0 }));
  const exitEntries = Object.entries(exitAnalysis).map(([reason,d]: [string,any])     => ({ reason, pct: Math.round((d as any).winRate||0), ct: (d as any).count||0 }));
  const candleEntries = Object.entries(candlePatterns).map(([pat,d]: [string,any])    => ({ pat, wr: Math.round((d as any).winRate||0), ct: (d as any).count||0 }));
  const orderEntries  = Object.entries(orderTypeBreakdown).map(([ot,d]: [string,any]) => ({ ot, wr: Math.round((d as any).winRate||0), ct: (d as any).count||0 }));
  const sessionPhaseEntries   = Object.entries(sessionPhaseBySession).map(([k,d]: [string,any])   => ({ k, wr: (d as any).winRate ?? null, count: (d as any).count||0 }));
  const instrSessEntries      = Object.entries(instrSessMatrix).map(([k,d]: [string,any])         => ({ k, win: Math.round((d as any).winRate||0), loss: 100-Math.round((d as any).winRate||0), count: (d as any).count||0 }));
  const instrPhaseMomEntries  = Object.entries(instrPhaseMomMatrix).map(([k,d]: [string,any])     => ({ k, win: Math.round((d as any).winRate||0), loss: 100-Math.round((d as any).winRate||0), count: (d as any).count||0 }));
  const newsEntries = Object.entries(newsImpactBreakdown).map(([k,d]: [string,any])   => ({ k, wr: Math.round((d as any).winRate||0), r: (d as any).avgRR?.toFixed(2)||'--' }));

  const riskOfRuin = (()=>{
    if (winRate<=0||profitFactor<=0) return 100;
    const wr2=winRate/100; const lr=1-wr2;
    if (lr===0) return 0;
    return Math.max(0,Math.min(100,Math.round(Math.pow(lr/wr2,10)*100)));
  })();
  const rorStatus = riskOfRuin<5?'✓ SAFE':riskOfRuin<20?'~ MODERATE':riskOfRuin<50?'⚠ ELEVATED':'✕ CRITICAL';
  const rorColor  = riskOfRuin<5?P.green:riskOfRuin<20?P.amber:P.red;

  const topStrat = stratEntries.length>0 ? stratEntries.reduce((a,b)=>a.pl>b.pl?a:b) : null;

  const ddPct        = equityGrowth?.startingBalance && maxDD > 0
    ? ((maxDD     / equityGrowth.startingBalance) * 100).toFixed(2)
    : '0.00';
  const currentDDPct = equityGrowth?.startingBalance && currentDD > 0
    ? ((currentDD / equityGrowth.startingBalance) * 100).toFixed(2)
    : '0.00';

  /* ── helpers for psychology categoricals ── */
  const catWR = (field: string, label: string): number|null => catBreakdown[field]?.[label]?.winRate ?? null;

  /* ── mgmt type options ── */
  const mgmtOpts = ['Rule-based','Discretionary','Hybrid'].map(l => ({
    label: l==='Discretionary'?'Discret.': l==='Rule-based'?'Rule-Based':l,
    pct: catWR('managementType', l),
  }));

  /* ── order type bars (execution metrics) ── */
  const entryMethodOpts = [
    { l:'Market Entry', wr: catBreakdown.orderType?.['Market']?.winRate ?? null },
    { l:'Limit Entry',  wr: catBreakdown.orderType?.['Limit']?.winRate  ?? null },
    { l:'Stop Entry',   wr: catBreakdown.orderType?.['Stop']?.winRate   ?? null },
  ];

  /* ── setup freq annualised ── */
  const fmtFreq = (v: number|undefined): string => {
    if (v == null || isNaN(v)) return '--';
    if (v === 0) return '0';
    if (v >= 10)  return v.toFixed(1);
    if (v >= 1)   return v.toFixed(2);
    if (v >= 0.1) return v.toFixed(2);
    if (v > 0)    return v.toFixed(3);
    return '0';
  };
  const setupFreqRows = Object.entries(setupFreqAnnualised).map(([name,d]: [string,any]) => ({
    n: name,
    d: fmtFreq(d.perDay),
    w: fmtFreq(d.perWeek),
    mo: fmtFreq(d.perMonth),
    y: (d.perYear == null || isNaN(d.perYear)) ? '--' : fmtFreq(d.perYear),
    wr: `${Math.round(setupTags[name]?.winRate||0)}%`,
    pc: (setupTags[name]?.winRate||0)>=60?P.green:P.amber,
    best: '--',
  }));

  /* ─────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────── */
  return (
    <div className="mp-root">
      <style>{css}</style>

      {/* ── SYNC INDICATOR ── */}
      {isFetching && !isLoading && (
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 20px', background:P.bg, borderBottom:`1px solid ${P.line}` }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:P.cyan, animation:'mp-spin 1s linear infinite', flexShrink:0 }}/>
          <Mono size={8} color={P.dim} style={{ letterSpacing:'0.14em', fontFamily:"'Share Tech Mono',monospace" }}>SYNCING LATEST DATA…</Mono>
        </div>
      )}

      {/* ── KPI STRIP ── */}
      <div className="mp-kpi">
        {[
          { l:'Total P&L',       v:fmtPL(totalPL),         s:isPos?'profit':'loss',   cls:isPos?'mp-kpi-pos':'mp-kpi-neg' },
          { l:'Win Rate',        v:fmtPct(winRate),         s:`${wins}W · ${losses}L`, cls:winRate>=50?'mp-kpi-pos':'mp-kpi-neg' },
          { l:'R Expectancy',    v:expectancy.toFixed(2),   s:'per trade',             cls:expectancy>0?'mp-kpi-pos':'mp-kpi-neg' },
          { l:'Trades',          v:`${totalTrades}`,        s:'this period',           cls:'mp-kpi-neu' },
          { l:'Profit Factor',   v:pfDisplay,               s:'gross ratio',           cls:profitFactor>=1?'mp-kpi-pos':'mp-kpi-neg' },
          { l:'Avg R:R',         v:`1:${avgRR.toFixed(1)}`, s:'achieved',              cls:'mp-kpi-neu' },
          { l:'Net Growth',       v:netGrowthPct!=null?`${netGrowthPct>=0?'+':''}${netGrowthPct.toFixed(1)}%`:'--', s:'account growth', cls:netGrowthPct==null?'mp-kpi-neu':netGrowthPct>=0?'mp-kpi-pos':'mp-kpi-neg' },
        ].map((k,i)=>(
          <div key={i} className={`mp-kpi-cell ${k.cls}`} data-testid={`metric-kpi-${i}`}>
            <Mono size={8} color={P.muted} style={{ display:'block', marginBottom:6, letterSpacing:'0.16em', fontFamily:"'Share Tech Mono',monospace" }}>{k.l}</Mono>
            <Num color={k.cls==='mp-kpi-pos'?P.green:k.cls==='mp-kpi-neg'?P.red:P.bright} style={{ display:'block', lineHeight:1, marginBottom:5, fontStyle:'normal', fontFamily:"'Share Tech Mono',monospace" }}>{k.v}</Num>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:16, height:1, background:k.cls==='mp-kpi-pos'?P.greenDim:k.cls==='mp-kpi-neg'?P.redDim:P.line2 }}/>
              <Mono size={8} color={P.dim} style={{ fontFamily:"'Share Tech Mono',monospace" }}>{k.s}</Mono>
            </div>
          </div>
        ))}
      </div>

      <div className="mp-page">

        {/* ─── CORE QUALITY METRICS ─── */}
        <Divider label="Core Quality Metrics"/>
        <div className="mp-g4">

          {/* Market Regime */}
          <Panel title="Market Regime" accent={P.cyan} tag="REGIME · VOLATILITY">
            <Bar label="Bullish"  pct={wr(regimeData['Bullish']  ?? regimeData['Trending'])} count={ct(regimeData['Bullish'] ?? regimeData['Trending'])}/>
            <Bar label="Bearish"  pct={wr(regimeData['Bearish']  ?? regimeData['Bear'])}     count={ct(regimeData['Bearish'] ?? regimeData['Bear'])}/>
            <Bar label="Ranging"  pct={wr(regimeData['Ranging']  ?? regimeData['Range'])}    count={ct(regimeData['Ranging'] ?? regimeData['Range'])}/>
            <SubLabel>Volatility State</SubLabel>
            <Bar label="Low"    pct={wr(volatilityData['Low'])}    count={ct(volatilityData['Low'])}/>
            <Bar label="Normal" pct={wr(volatilityData['Normal'])} count={ct(volatilityData['Normal'])}/>
            <Bar label="High"   pct={wr(volatilityData['High'])}   count={ct(volatilityData['High'])}/>
          </Panel>

          {/* Execution Precision */}
          <Panel title="Execution Precision" accent={P.amber} tag="SCORE → WIN%">
            <Scroll>
              <ScoreRow label="Entry Precision"   scores={scoreRowFromImpact(scoreImpacts.entryPrecisionScore)}/>
              <ScoreRow label="Timing Quality"    scores={scoreRowFromImpact(scoreImpacts.timingQualityScore)}/>
              <ScoreRow label="Market Alignment"  scores={scoreRowFromImpact(scoreImpacts.marketAlignmentScore)}/>
              <ScoreRow label="Setup Clarity"     scores={scoreRowFromImpact(scoreImpacts.setupClarityScore)}/>
              <ScoreRow label="Confluence Score"  scores={scoreRowFromImpact(scoreImpacts.confluenceScore)}/>
              <ScoreRow label="Signal Validation" scores={scoreRowFromImpact(scoreImpacts.signalValidationScore)}/>
              <SubLabel>Planned vs Actual (Avg Pips)</SubLabel>
              <DR label="Entry Deviation" value={riskMetrics.avgEntryDeviation!=null?`${riskMetrics.avgEntryDeviation.toFixed(2)} pips`:'--'} vc={P.green}/>
              <DR label="SL Deviation"    value={riskMetrics.avgSLDeviation!=null?`${riskMetrics.avgSLDeviation.toFixed(2)} pips`:'--'}    vc={P.amber}/>
              <DR label="TP Deviation"    value={riskMetrics.avgTPDeviation!=null?`${riskMetrics.avgTPDeviation.toFixed(2)} pips`:'--'}    vc={P.green}/>
              <SubLabel>Breakeven Applied</SubLabel>
              <div style={{ marginBottom:6 }}>
                <Mono size={8} color={P.dim} style={{ display:'block', marginBottom:4 }}>Breakeven Effect</Mono>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:P.line }}>
                  {[['YES', boolImpacts.breakevenApplied?.yes?.winRate, P.green],['NO', boolImpacts.breakevenApplied?.no?.winRate, P.red]] .map(([l,v,c]:any,i)=>(
                    <div key={i} style={{ background:P.bg2, padding:'5px 4px', textAlign:'center' }}>
                      <Mono size={7} color={P.dim} style={{ display:'block' }}>{l}</Mono>
                      {v==null?<Mono size={7} color={P.dim}>--</Mono>:<Num color={c} style={{ fontSize:7 }}>{Math.round(v)}%</Num>}
                    </div>
                  ))}
                </div>
              </div>
              <Multi label="Management Type" options={mgmtOpts}/>
            </Scroll>
          </Panel>

          {/* Clarity & Confluence */}
          <Panel title="Clarity & Confluence" accent={P.green} tag="CONFLUENCE">
            <Scroll>
              {/* Setup clarity high vs low from scoreImpacts */}
              <Multi label="Clarity Level" options={[
                { label:'High', pct: (() => { const arr = scoreImpacts.setupClarityScore; if(!arr) return null; const hi = arr.find((b:any)=>b.score==='4.5'); return hi?.winRate??null; })() },
                { label:'Low',  pct: (() => { const arr = scoreImpacts.setupClarityScore; if(!arr) return null; const lo = arr.find((b:any)=>b.score==='3.0'); return lo?.winRate??null; })() },
              ]}/>
              <DR label="Setup Clarity Avg"
                value={catBreakdown.setupClarityScore?`${Math.round(Object.values(catBreakdown.setupClarityScore||{}).reduce((a:any,b:any)=>a+(b.winRate||0),0)/(Object.keys(catBreakdown.setupClarityScore||{}).length||1))}%`:'--'}
                vc={P.green}/>
              <SubLabel>Yes / No</SubLabel>
              <BoolYN label="MTF Alignment"         data={boolImpacts.mtfAlignment}/>
              <BoolYN label="Trend Alignment"       data={boolImpacts.trendAlignment}/>
              <BoolYN label="HTF Key Level Present" data={boolImpacts.htfKeyLevelPresent}/>
              <BoolYN label="Key Level Respect"     data={boolImpacts.keyLevelRespected}/>
              <SubLabel>Key Level Type</SubLabel>
              {Object.keys(catBreakdown.keyLevelType||{}).length > 0
                ? Object.entries(catBreakdown.keyLevelType||{}).map(([label, d]: [string,any], i) => (
                    <Bar key={i} label={label} pct={d?.winRate ?? null} count={d?.count || 0}/>
                  ))
                : <Mono size={9} color={P.dim}>No key level data yet</Mono>
              }
              <Multi label="Momentum" options={['Strong','Moderate','Weak'].map(l=>({ label:l, pct: catBreakdown.momentumValidity?.[l]?.winRate ?? null }))}/>
              <BoolYN label="Target Logic" data={boolImpacts.targetLogic}/>
              <Multi label="Timing Context" options={Object.keys(timingCtxData).map(l=>({ label:l, pct: timingCtxData[l]?.winRate ?? null }))}/>
              <Multi label="Order Type" options={['Limit','Market','Stop'].map(l=>({ label:l, pct: catBreakdown.orderType?.[l]?.winRate ?? null }))}/>
            </Scroll>
          </Panel>

          {/* Psychology & Discipline */}
          <Panel title="Psychology & Discipline" accent={P.red} tag="PSYCHOLOGY">
            <Scroll>
              <Multi label="Rules Followed" options={['High','Medium','Low'].map(l=>({ label:l, pct: catBreakdown.rulesFollowed?.[l]?.winRate ?? null }))}/>
              <Multi label="Confidence"     options={['High','Medium','Low'].map(l=>({ label:l, pct: catBreakdown.confidenceLevel?.[l]?.winRate ?? null }))}/>
              <Multi label="Energy Level"   options={['High','Medium','Low'].map(l=>({ label:l, pct: catBreakdown.energyLevel?.[l]?.winRate ?? null }))}/>
              <Multi label="Focus Level"    options={['High','Medium','Low'].map(l=>({ label:l, pct: catBreakdown.focusLevel?.[l]?.winRate ?? null }))}/>
              <Multi label="Confidence at Entry"            options={['High','Medium','Low'].map(l=>({ label:l, pct: catBreakdown.confidenceAtEntry?.[l]?.winRate ?? null }))}/>
              <Multi label="Emotional State" options={['Calm','Neutral','Emotional'].map(l=>({ label:l, pct: catBreakdown.emotionalState?.[l]?.winRate ?? null }))}/>
              <SubLabel>Yes / No</SubLabel>
              <BoolYN label="External Distraction" data={boolImpacts.externalDistraction}/>
              <BoolYN label="Setup Fully Valid"     data={boolImpacts.setupFullyValid}/>
              <BoolYN label="Any Rule Broken"       data={boolImpacts.ruleBroken}/>
              <BoolYN label="FOMO Trades"           data={boolImpacts.fomoTrade}/>
              <BoolYN label="Revenge Trades"        data={boolImpacts.revengeTrade}/>
              <BoolYN label="Boredom Trades"        data={boolImpacts.boredomTrade}/>
              <BoolYN label="Emotional Trades"      data={boolImpacts.emotionalTrade}/>
              <SubLabel>Discipline &amp; Consistency</SubLabel>
              <DR label="Discipline Index"  value={psychology.discipline  !=null?`${psychology.discipline}%`:'--'}  vc={pColor(psychology.discipline)}/>
              <DR label="Patience Index"    value={psychology.patience    !=null?`${psychology.patience}%`:'--'}    vc={pColor(psychology.patience)}/>
              <DR label="Consistency Index" value={psychology.consistency !=null?`${psychology.consistency}%`:'--'} vc={pColor(psychology.consistency)}/>
            </Scroll>
          </Panel>
        </div>

        {/* ─── DIRECTION · SETUP · EXIT · GOVERNANCE ─── */}
        <Divider label="Direction · Setup · Exit · Governance"/>
        <div className="mp-g4">

          {/* Direction & Bias */}
          <Panel title="Direction & Bias" accent={P.amber} tag="DIRECTION">
            <Scroll>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Direction</SubLabel>
              <Bar label="Long"  pct={Math.round(longWR)||0}  count={longTrades}/>
              <Bar label="Short" pct={Math.round(shortWR)||0} count={shortTrades}/>
              <SubLabel>HTF Bias</SubLabel>
              <Bar label="Bull"  pct={catBreakdown.htfBias?.['Bull']?.winRate  ?? null} count={ct(catBreakdown.htfBias?.['Bull'])}/>
              <Bar label="Bear"  pct={catBreakdown.htfBias?.['Bear']?.winRate  ?? null} count={ct(catBreakdown.htfBias?.['Bear'])}/>
              <Bar label="Range" pct={catBreakdown.htfBias?.['Range']?.winRate ?? null} count={ct(catBreakdown.htfBias?.['Range'])}/>
              <SubLabel>Directional Bias</SubLabel>
              <Bar label="Long Bias"  pct={catBreakdown.directionalBias?.['Long Bias']?.winRate  ?? null}/>
              <Bar label="Short Bias" pct={catBreakdown.directionalBias?.['Short Bias']?.winRate ?? null}/>
            </Scroll>
          </Panel>

          {/* Setup Tags & Trade Grade */}
          <Panel title="Setup Tags & Trade Grade" accent={P.amber} tag="SETUP · GRADE">
            <Scroll>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Setup Tag</SubLabel>
              {Object.entries(setupTags).map(([name,d]: [string,any],i)=>(
                <Bar key={i} label={name} pct={d.winRate??null} count={d.count||0}/>
              ))}
              {Object.keys(setupTags).length===0 && <Mono size={9} color={P.dim}>No setup data yet</Mono>}
              <SubLabel>Trade Grade</SubLabel>
              {(['A','B','C','D','F'] as const).map(g=>(
                <Bar key={g} label={g} pct={tradeGrades[g]?.winRate ?? null} count={tradeGrades[g]?.count||0}/>
              ))}
            </Scroll>
          </Panel>

          {/* Exit Causation */}
          <Panel title="Exit Causation" accent={P.red} tag="EXIT ANALYSIS">
            <Scroll>
              {(exitEntries.length>0 ? exitEntries : []).map((x,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
                  <Mono size={9} color={P.muted}>{x.reason} <span style={{ color:P.cyan }}>({x.ct})</span></Mono>
                  <Num color={pColor(x.pct)} style={{ fontSize:10 }}>{x.pct}<span style={{ fontSize:8, opacity:0.7 }}>%</span></Num>
                </div>
              ))}
              {exitEntries.length===0 && <Mono size={9} color={P.dim}>No exit data yet</Mono>}
              <SubLabel>Planned vs Achieved R:R</SubLabel>
              <DR label="Avg Planned R:R"  value={rrAnalysis.avgPlannedRR !=null?`1:${rrAnalysis.avgPlannedRR.toFixed(1)}`:'--'}/>
              <DR label="Avg Achieved R:R" value={rrAnalysis.avgAchievedRR!=null?`1:${rrAnalysis.avgAchievedRR.toFixed(1)}`:'--'} vc={P.green}/>
              <DR label="R:R Slippage"     value={rrAnalysis.avgRRSlippage!=null?`${rrAnalysis.avgRRSlippage.toFixed(2)}R`:'--'} vc={P.amber}/>
            </Scroll>
          </Panel>

          {/* Rule Governance */}
          <Panel title="Rule Governance" accent={P.cyan} tag="COMPLIANCE">
            <Scroll>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Compliance</SubLabel>
              <BoolYN label="Setup Fully Valid" data={boolImpacts.setupFullyValid}/>
              <BoolYN label="Any Rule Broken"   data={boolImpacts.ruleBroken}/>
              <BoolYN label="Worth Repeating"   data={boolImpacts.worthRepeating}/>
              <SubLabel>Impulse Control</SubLabel>
              <BoolYN label="FOMO Trades"      data={boolImpacts.fomoTrade}/>
              <BoolYN label="Revenge Trades"   data={boolImpacts.revengeTrade}/>
              <BoolYN label="Boredom Trades"   data={boolImpacts.boredomTrade}/>
              <BoolYN label="Emotional Trades" data={boolImpacts.emotionalTrade}/>
              <SubLabel>Risk State</SubLabel>
              <DR label="Avg Risk %" value={riskMetrics.avgRiskPercent!=null?`${riskMetrics.avgRiskPercent.toFixed(2)}%`:'--'}/>
              <DR label="Avg Spread" value={riskMetrics.avgSpreadAtEntry!=null?`${riskMetrics.avgSpreadAtEntry.toFixed(2)} pips`:'--'}/>
            </Scroll>
          </Panel>
        </div>

        {/* ─── ADVANCED ANALYTICS ─── */}
        <Divider label="Advanced Analytics"/>
        <div className="mp-g3">

          {/* News & Catalyst */}
          <Panel title="News & Catalyst" accent={P.amber} tag="FUNDAMENTAL">
            {newsEntries.length>0
              ? newsEntries.map((x,i)=><Bar key={i} label={x.k} pct={x.wr||null} sub={`${x.r}R`}/>)
              : (['High Impact','Medium Impact','Low Impact','None / Clean']).map((k,i)=>(
                  <Bar key={i} label={k} pct={null}/>
                ))
            }
          </Panel>

          {/* ATF + Session + Instrument */}
          <Panel title="ATF + Session + Instrument" accent={P.green} tag="ASSET · TF · SESSION">
            {instrSessEntries.length>0
              ? instrSessEntries.slice(0,8).map((x,i)=><SplitBar key={i} label={x.k} win={x.win} loss={x.loss} count={x.count}/>)
              : <Mono size={9} color={P.dim}>No combined data yet — ensure Analysis TF, Session, and Instrument are all filled</Mono>
            }
            {instrSessEntries.length>8 && (
              <div style={{ borderTop:`1px solid ${P.line}`, paddingTop:8, textAlign:'center' }}>
                <Mono size={8} color={P.dim}>+ {instrSessEntries.length-8} more combinations</Mono>
              </div>
            )}
          </Panel>

          {/* Session */}
          <Panel title="Session" accent={P.cyan} tag="SESSION · PHASE">
            <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>By Session Name</SubLabel>
            {sessEntries.length>0
              ? sessEntries.map((x,i)=><Bar key={i} label={x.name} pct={x.wr||null} count={x.count}/>)
              : <Mono size={9} color={P.dim}>No session data yet</Mono>
            }
            <SubLabel>By Session Phase</SubLabel>
            {(() => {
              const DEFAULT_PHASES = [
                'LONDON Open','LONDON Mid','LONDON Close',
                'NEW YORK Open','NEW YORK Mid','NEW YORK Close',
                'TOKYO Open','TOKYO Mid','TOKYO Close',
              ];
              // Build a case-insensitive map from actual data
              const phaseMapCI: Record<string, { wr: number|null; count: number }> = {};
              sessionPhaseEntries.forEach(x => {
                phaseMapCI[x.k.toUpperCase()] = { wr: x.wr ?? null, count: x.count };
              });
              const merged = DEFAULT_PHASES.map(phase => {
                const found = phaseMapCI[phase.toUpperCase()];
                return { k: phase, wr: found?.wr ?? null, count: found?.count ?? 0 };
              });
              // Also append any extra phases in data not covered by defaults
              const defaultKeys = new Set(DEFAULT_PHASES.map(p => p.toUpperCase()));
              const extras = sessionPhaseEntries.filter(x => !defaultKeys.has(x.k.toUpperCase()));
              const all = [...merged, ...extras.map(x => ({ k: x.k, wr: x.wr ?? null, count: x.count }))];
              return all.map((x,i) => <Bar key={i} label={x.k} pct={x.wr} count={x.count}/>);
            })()}
          </Panel>
        </div>

        {/* ─── DAY · DURATION · RISK SIZING ─── */}
        <Divider label="Day · Duration · Risk Sizing"/>
        <div className="mp-g3">

          {/* Day of Week */}
          <Panel title="Day of Week" accent={P.amber} tag="WIN% · R EXPECTANCY">
            {dayEntries.length>0
              ? dayEntries.map((x,i)=><Bar key={i} label={x.day} pct={x.wr||null}/>)
              : (['Monday','Tuesday','Wednesday','Thursday','Friday']).map((d,i)=><Bar key={i} label={d} pct={null}/>)
            }
          </Panel>

          {/* Duration & Timing */}
          <Panel title="Duration & Timing" accent={P.cyan} tag="HOLD TIME">
            <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Duration Bucket</SubLabel>
            <Bar label="0–30 min"   pct={durationBuckets['0-30 min']?.winRate   ?? null} count={durationBuckets['0-30 min']?.count||0}/>
            <Bar label="30–120 min" pct={durationBuckets['30-120 min']?.winRate ?? null} count={durationBuckets['30-120 min']?.count||0}/>
            <Bar label="2–8 hrs"    pct={durationBuckets['2-8 hrs']?.winRate    ?? null} count={durationBuckets['2-8 hrs']?.count||0}/>
            <Bar label="8+ hrs"     pct={durationBuckets['8+ hrs']?.winRate     ?? null} count={durationBuckets['8+ hrs']?.count||0}/>
            <SubLabel>Timing Context</SubLabel>
            {Object.keys(timingCtxData).length > 0
              ? Object.keys(timingCtxData).map(l => (
                  <Bar key={l} label={l} pct={timingCtxData[l]?.winRate ?? null} count={ct(timingCtxData[l])}/>
                ))
              : <Bar label="No data" pct={null}/>
            }
          </Panel>

          {/* Risk & Position Sizing */}
          <Panel title="Risk & Position Sizing" accent={P.amber} tag="HEAT ANALYSIS">
            <DR label="Avg Risk %"      value={riskMetrics.avgRiskPercent!=null?`${riskMetrics.avgRiskPercent.toFixed(2)}%`:'--'}/>
            <DR label="Max Risk %"      value={riskMetrics.maxRiskPercent!=null?`${riskMetrics.maxRiskPercent.toFixed(2)}%`:'--'}/>
            <DR label="Min Risk %"      value={riskMetrics.minRiskPercent!=null?`${riskMetrics.minRiskPercent.toFixed(2)}%`:'--'}/>
            <DR label="Avg Spread"      value={riskMetrics.avgSpreadAtEntry!=null?`${riskMetrics.avgSpreadAtEntry.toFixed(2)} pips`:'--'}/>
            <SubLabel>Risk Heat</SubLabel>
            <Bar label="Low Heat"    pct={riskHeatBreakdown['Low']?.winRate    ?? null} count={ct(riskHeatBreakdown['Low'])}/>
            <Bar label="Medium Heat" pct={riskHeatBreakdown['Medium']?.winRate ?? null} count={ct(riskHeatBreakdown['Medium'])}/>
            <Bar label="High Heat"   pct={riskHeatBreakdown['High']?.winRate   ?? null} count={ct(riskHeatBreakdown['High'])}/>
          </Panel>
        </div>

        {/* ─── MAE / MFE · CANDLE PATTERNS · EXECUTION ─── */}
        <Divider label="MAE / MFE · Candle Patterns · Execution"/>
        <div className="mp-g3">

          {/* MAE / MFE */}
          <Panel title="MAE / MFE Analysis" accent={P.cyan} tag="ENTRY QUALITY">
            <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>MAE — Adverse Excursion</SubLabel>
            <DR label="Avg MAE"   value={maeMfe.avgMAE  !=null?`${maeMfe.avgMAE.toFixed(2)} pips`:'--'}   vc={P.red}/>
            <DR label="Worst MAE" value={maeMfe.worstMAE!=null?`${maeMfe.worstMAE.toFixed(2)} pips`:'--'} vc={P.red}/>
            <DR label="MAE > SL"  value={maeMfe.maeGtSLCount!=null?`${maeMfe.maeGtSLCount} trades`:'--'} vc={maeMfe.maeGtSLCount===0?P.green:P.red}/>
            {maeMfe.avgMAE!=null && (
              <DR label="MAE / MFE ratio" value={maeMfe.avgMAEMFERatio!=null?`${(maeMfe.avgMAEMFERatio*100).toFixed(0)}%`:'--'} vc={P.red}/>
            )}
            <SubLabel>MFE — Favourable Excursion</SubLabel>
            <DR label="Avg MFE"  value={maeMfe.avgMFE !=null?`+${maeMfe.avgMFE.toFixed(2)} pips`:'--'}  vc={P.green}/>
            <DR label="Best MFE" value={maeMfe.bestMFE!=null?`+${maeMfe.bestMFE.toFixed(2)} pips`:'--'} vc={P.green}/>
            <DR label="Avg Capture Rate" value={maeMfe.avgMFECapture!=null?`${maeMfe.avgMFECapture.toFixed(1)}% of MFE`:'--'} vc={P.cyan}/>
            {maeMfe.avgMFECapture!=null && (
              <DR label="Avg MFE captured" value={`${maeMfe.avgMFECapture.toFixed(1)}%`} vc={P.cyan}/>
            )}
            <SubLabel>Entry Quality</SubLabel>
            <DR label="MAE / MFE Ratio" value={maeMfe.avgMAEMFERatio!=null?`${maeMfe.avgMAEMFERatio.toFixed(3)}${maeMfe.avgMAEMFERatio<0.35?' · Good':maeMfe.avgMAEMFERatio<0.6?' · Fair':' · Poor'}`:'--'} vc={maeMfe.avgMAEMFERatio!=null?(maeMfe.avgMAEMFERatio<0.35?P.green:maeMfe.avgMAEMFERatio<0.6?P.amber:P.red):P.dim}/>
          </Panel>

          {/* Candle Pattern × Indicator × Timeframe */}
          <Panel title="Candle Pattern × Timeframe" accent={P.green} tag="PATTERNS · INDICATORS">
            <Scroll>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Pattern · Indicator · TF → Performance</SubLabel>
              {Object.entries(candleIndicatorTFMatrix).length > 0
                ? Object.entries(candleIndicatorTFMatrix).map(([key, d]: [string, any], i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:`1px solid ${P.line}` }}>
                      <Mono size={9} color={P.muted} style={{ flex:1, paddingRight:8 }}>{key}</Mono>
                      <div style={{ display:'flex', gap:4, alignItems:'center', flexShrink:0 }}>
                        <Cond size={10} color={pColor(d.winRate??null)} weight={600}>{d.winRate!=null ? `${Math.round(d.winRate)}%` : '--'}</Cond>
                        {d.winRate!=null && <Mono size={9} color={P.cyan}>({d.count})</Mono>}
                      </div>
                    </div>
                  ))
                : (
                  <div>
                    <Mono size={9} color={P.dim}>No combined data yet — fill Candle Pattern, Indicator State, and Entry TF on journal entries</Mono>
                    {candleEntries.length > 0 && (
                      <div style={{ marginTop:12 }}>
                        <SubLabel>Candle Patterns (standalone)</SubLabel>
                        {candleEntries.map((x,i)=>(
                          <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
                            <Mono size={9} color={P.muted}>{x.pat} <span style={{ color:P.cyan }}>({x.ct})</span></Mono>
                            {x.wr==null ? <Mono size={9} color={P.dim}>--</Mono> : <Num color={pColor(x.wr)}>{x.wr}%</Num>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              }
            </Scroll>
          </Panel>

          {/* Execution Metrics */}
          <Panel title="Execution Metrics" accent={P.amber} tag="ENTRY TIMING · SLIPPAGE">
            <DR label="Avg Spread at Entry" value={riskMetrics.avgSpreadAtEntry!=null?`${riskMetrics.avgSpreadAtEntry.toFixed(2)} pips`:'--'} vc={P.green}/>
            <DR label="Avg R:R Achieved"    value={avgRR?`1:${avgRR.toFixed(1)}`:'--'} vc={P.cyan}/>
            <SubLabel>Order Type</SubLabel>
            {orderEntries.length>0
              ? orderEntries.map((x,i)=>(
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
                    <Mono size={9} color={P.muted}>{x.ot} <span style={{ color:P.cyan }}>({x.ct})</span></Mono>
                    {x.wr==null ? <Mono size={9} color={P.dim}>--</Mono> : <Num color={pColor(x.wr)}>{x.wr}%</Num>}
                  </div>
                ))
              : <Mono size={9} color={P.dim}>No order type data</Mono>
            }
            <SubLabel>Entry Method</SubLabel>
            {entryMethodOpts.map((x,i)=><Bar key={i} label={x.l} pct={x.wr}/>)}
          </Panel>
        </div>

        {/* ─── INSTRUMENT MATRIX · TIMEFRAME PERFORMANCE ─── */}
        <Divider label="Instrument Matrix · Timeframe Performance"/>
        <div className="mp-g3">

          {/* Instrument × Session */}
          <Panel title="Instrument · Session Phase · Momentum" accent={P.cyan} tag="WIN / LOSS" style={{ height:480 }}>
            <Scroll>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Instrument × Phase × Momentum</SubLabel>
              {instrPhaseMomEntries.length>0
                ? instrPhaseMomEntries.map((x,i)=>(
                    <SplitBar key={i} label={x.k} win={x.win} loss={x.loss} count={x.count}/>
                  ))
                : <Mono size={9} color={P.dim}>No combined data yet — ensure Instrument, Session Phase, and Momentum Validity are all filled</Mono>
              }
            </Scroll>
          </Panel>

          {/* Strategy × Market Matrix */}
          <Panel title="Strategy × Market Regime" accent={P.green} tag="FULL MATRIX" style={{ height:480 }}>
            <Scroll>
              {Object.entries(stratMarketMatrix).length > 0
                ? Object.entries(stratMarketMatrix).map(([stratName, regimes]: [string, any]) => {
                    const regimeColor: Record<string, string> = {
                      Bullish: P.green, Bearish: P.red, Ranging: P.amber,
                      Unknown: P.dim, Bear: P.red, Bull: P.green, Range: P.amber,
                    };
                    const totalTrades = Object.values(regimes).reduce((s: number, d: any) => s + (d.count || 0), 0);
                    return (
                      <div key={stratName}>
                        <SubLabel style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span>{stratName}</span>
                          <span style={{ color: P.dim, fontWeight: 400 }}>{totalTrades} trade{totalTrades !== 1 ? 's' : ''}</span>
                        </SubLabel>
                        {Object.entries(regimes).map(([regime, d]: [string, any]) => {
                          const col = regimeColor[regime] || P.muted;
                          const winR = Math.round(d.winRate || 0);
                          return (
                            <div key={regime} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
                              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                                <div style={{ width:5, height:5, borderRadius:'50%', background:col, flexShrink:0 }} />
                                <Mono size={10} color={P.body}>{regime}</Mono>
                              </div>
                              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                                <Mono size={9} color={P.cyan}>({d.count})</Mono>
                                <Num color={pColor(winR)} style={{ fontSize:10 }}>{winR}<span style={{ fontSize:8, opacity:0.7 }}>%</span></Num>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                : <Mono size={9} color={P.dim}>No strategy/regime data yet</Mono>
              }
            </Scroll>
          </Panel>

          {/* Timeframe Breakdown */}
          <Panel title="Timeframe" accent={P.amber} tag="ENTRY · ANALYSIS · CONTEXT" style={{ height:480 }}>
            <Scroll>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Entry TF</SubLabel>
              {tfEntries.length>0
                ? tfEntries.map((x,i)=>(
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
                      <Mono size={9} color={P.muted}>{x.tf}</Mono>
                      <div style={{ display:'flex', gap:4, alignItems:'center', flexShrink:0 }}>
                        <Cond size={10} color={pColor(x.wr||null)} weight={600}>{x.wr?`${x.wr}%`:'--'}</Cond>
                        {x.wr && <Mono size={9} color={P.cyan}>({x.count})</Mono>}
                      </div>
                    </div>
                  ))
                : <Mono size={9} color={P.dim}>No entry TF data</Mono>
              }
              <SubLabel>Analysis TF</SubLabel>
              {Object.entries(tfAnalysis).map(([tf,d]: [string,any],i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
                  <Mono size={9} color={P.muted}>{tf}</Mono>
                  <div style={{ display:'flex', gap:4, alignItems:'center', flexShrink:0 }}>
                    <Cond size={10} color={pColor(d.winRate||null)} weight={600}>{d.winRate!=null?`${Math.round(d.winRate)}%`:'--'}</Cond>
                    {d.winRate!=null && <Mono size={9} color={P.cyan}>({d.count||0})</Mono>}
                  </div>
                </div>
              ))}
              {Object.keys(tfAnalysis).length===0 && <Mono size={9} color={P.dim}>No analysis TF data</Mono>}
              <SubLabel>Context TF</SubLabel>
              {Object.entries(tfContext).map(([tf,d]: [string,any],i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:`1px solid ${P.line}` }}>
                  <Mono size={9} color={P.muted}>{tf}</Mono>
                  <div style={{ display:'flex', gap:4, alignItems:'center', flexShrink:0 }}>
                    <Cond size={10} color={pColor(d.winRate||null)} weight={600}>{d.winRate!=null?`${Math.round(d.winRate)}%`:'--'}</Cond>
                    {d.winRate!=null && <Mono size={9} color={P.cyan}>({d.count||0})</Mono>}
                  </div>
                </div>
              ))}
              {Object.keys(tfContext).length===0 && <Mono size={9} color={P.dim}>No context TF data</Mono>}
            </Scroll>
          </Panel>
        </div>

        {/* ─── STRATEGY DRILL-DOWN ─── */}
        <Divider label="Strategy Drill-Down"/>
        <div style={{ background:P.bg2, border:`1px solid ${P.line2}`, position:'relative' }}>
          <Corner pos="tl" color={P.green}/><Corner pos="tr" color={P.green}/>
          <Corner pos="bl" color={P.line2}/><Corner pos="br" color={P.line2}/>
          <div style={{ borderBottom:`1px solid ${P.line2}`, padding:'7px 12px', background:P.bg3, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:2, height:12, background:P.green }}/>
              <Cond size={11} color={P.bright} weight={700}>Strategy Drill-Down</Cond>
            </div>
            <select value={strat} onChange={e=>setStrat(e.target.value)} className="mp-select" data-testid="select-strategy-drill">
              {strategies.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="mp-strat-grid">
            <div style={{ borderRight:`1px solid ${P.line2}`, padding:'10px 14px' }}>
              <SubLabel style={{ borderTop:'none', paddingTop:0, marginTop:0 }}>Bias</SubLabel>
              {[
                { bias:'Bullish', ct:`${longTrades} trade${longTrades!==1?'s':''}`,   wr:`${Math.round(longWR)}%`,  c:P.green },
                { bias:'Bearish', ct:`${shortTrades} trade${shortTrades!==1?'s':''}`, wr:`${Math.round(shortWR)}%`, c:P.red },
              ].map((x,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:`1px solid ${P.line}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:3, height:3, borderRadius:'50%', background:x.c }}/>
                    <div>
                      <Mono size={9} color={x.c} style={{ display:'block' }}>{x.bias}</Mono>
                      <Mono size={7} color={P.dim}>{x.ct}</Mono>
                    </div>
                  </div>
                  <Num color={x.c}>{x.wr}</Num>
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
                  <DR label="Win Rate" value={`${Math.round(topStrat.wr)}%`} vc={P.green}/>
                  <DR label="Trades"   value={`${topStrat.trades}`}/>
                  <DR label="Net P/L"  value={fmtPL(topStrat.pl)} vc={topStrat.pl>=0?P.green:P.red}/>
                </>
              ) : <Mono size={9} color={P.dim}>No strategy data yet</Mono>}
            </div>
          </div>
        </div>

        {/* ─── RISK PERFORMANCE ─── */}
        <Divider label="Risk Performance"/>
        <div className="mp-g4">

          <Panel title="Drawdown" accent={P.red} tag="CURRENT PERIOD">
            <DR label="Max DD"     value={maxDD > 0 ? `-$${maxDD.toLocaleString()} (${ddPct}%)` : '$0 (0.00%)'} vc={P.red}/>
            <DR label="Current DD" value={currentDD > 0 ? `-$${currentDD.toLocaleString()} (${currentDDPct}%)` : '$0 (0.00%)'} vc={currentDD > 0 ? P.amber : P.green}/>
            <DR label="Balance"    value={equityGrowth?.currentBalance?`$${equityGrowth.currentBalance.toLocaleString(undefined,{maximumFractionDigits:0})}`:'--'} vc={P.green}/>
            <DR label="Period"     value="THIS SESSION" vc={P.dim}/>
            {maxDD > 0 && (
              <DR label="DD Used" value={`${currentDDPct}%`} vc={currentDD > 0 ? P.red : P.green}/>
            )}
          </Panel>

          <Panel title="Avg Win / Loss" accent={P.green} tag="P&L STATS">
            <DR label="Avg Win"          value={`$${Math.round(avgWin).toLocaleString()}`}  vc={P.green}/>
            <DR label="Avg Loss"         value={`$${Math.round(avgLoss).toLocaleString()}`} vc={P.red}/>
            <DR label="Win / Loss Ratio" value={winLossRatio}                               vc={P.cyan}/>
            <DR label="Total Wins"       value={`${wins}`}                                  vc={P.green}/>
            <DR label="Total Losses"     value={`${losses}`}                                vc={P.red}/>
          </Panel>

          <Panel title="Streaks" accent={P.cyan} tag="WIN / LOSS">
            <DR label="Longest Win Streak"  value={`${streaks.maxWinStreak||0}`}  vc={P.green}/>
            <DR label="Longest Loss Streak" value={`${streaks.maxLossStreak||0}`} vc={P.red}/>
            <DR label="Current Streak"
              value={`${(streaks.currentStreakType||'--').toUpperCase()} × ${streaks.currentStreakCount||0}`}
              vc={streaks.currentStreakType==='win'?P.green:P.red}/>
            <DR label="Recovery Sequences" value={`${streaks.recoverySequences||0}`}/>
          </Panel>

          <Panel title="Risk of Ruin" accent={P.amber} tag="ACCOUNT SAFETY">
            <DR label="Ruin Probability" value={`${riskOfRuin}%`}         vc={rorColor}/>
            <DR label="Win Rate"         value={fmtPct(winRate)}           vc={winRate>=50?P.green:P.red}/>
            <DR label="Risk per Trade"   value={riskMetrics.avgRiskPercent!=null?`${riskMetrics.avgRiskPercent.toFixed(2)}%`:'--'} vc={P.cyan}/>
            <DR label="Profit Factor"    value={pfDisplay}   vc={profitFactor>=1?P.green:P.red}/>
            <DR label="Risk Status"      value={rorStatus}                 vc={rorColor}/>
          </Panel>
        </div>

        {/* ─── EQUITY CURVE ─── */}
        <Divider label="Equity Curve · Risk of Ruin"/>
        <div className="mp-eq-grid">
          <EquityChart equityCurve={equityCurve} equityGrowth={equityGrowth}/>
          <Panel title="Period Summary" accent={P.cyan} tag="PERFORMANCE">
            <DR label="Total P/L"     value={fmtPL(totalPL)}             vc={isPos?P.green:P.red}/>
            <DR label="Win Rate"      value={fmtPct(winRate)}             vc={winRate>=50?P.green:P.red}/>
            <DR label="Profit Factor" value={pfDisplay}     vc={profitFactor>=1?P.green:P.red}/>
            <DR label="Expectancy"    value={`${expectancy.toFixed(2)}R`} vc={expectancy>0?P.green:P.red}/>
            <DR label="Total Trades"  value={`${totalTrades}`}/>
            <DR label="Avg R:R"       value={`1:${avgRR.toFixed(1)}`}/>
            {equityGrowth?.totalReturnPct!=null && (
              <DR label="Return %"
                value={`${equityGrowth.totalReturnPct>=0?'+':''}${equityGrowth.totalReturnPct.toFixed(2)}%`}
                vc={equityGrowth.totalReturnPct>=0?P.green:P.red}/>
            )}
          </Panel>
        </div>

        {/* ─── STRATEGY PERFORMANCE TABLE ─── */}
        <Divider label="Strategy Performance — Market Conditions"/>
        <div style={{ background:P.bg2, border:`1px solid ${P.line2}`, position:'relative' }}>
          <Corner pos="tl" color={P.cyan}/><Corner pos="tr" color={P.cyan}/>
          <Corner pos="bl" color={P.line2}/><Corner pos="br" color={P.line2}/>
          <div style={{ borderBottom:`1px solid ${P.line2}`, padding:'7px 12px', background:P.bg3, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:2, height:12, background:P.cyan }}/>
            <Cond size={11} color={P.bright} weight={700}>Strategy Performance in Bullish, Bearish and Ranging Markets</Cond>
          </div>
          <div style={{ padding:12, overflowX:'auto' }}>
            <table className="mp-dtable">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th style={{ color:P.green }}>Bullish</th>
                  <th style={{ color:P.red }}>Bearish</th>
                  <th style={{ color:P.amber }}>Ranging</th>
                  <th style={{ color:P.cyan }}>Trades</th>
                  <th style={{ color:P.cyan }}>Win Rate</th>
                  <th style={{ textAlign:'right' }}>Net P/L</th>
                </tr>
              </thead>
              <tbody>
                {stratEntries.length>0
                  ? stratEntries.map((s,i)=>{
                      const matrix = stratMarketMatrix[s.name] || {};
                      const bullWR = matrix['Bullish']?.winRate  ?? matrix['Bull']?.winRate    ?? matrix['Trending']?.winRate ?? null;
                      const bearWR = matrix['Bearish']?.winRate  ?? matrix['Bear']?.winRate    ?? null;
                      const rangWR = matrix['Ranging']?.winRate  ?? matrix['Range']?.winRate   ?? null;
                      return (
                        <tr key={i}>
                          <td className="mp-dn">{s.name}</td>
                          <td style={{ color:P.green }}>{bullWR!=null?`${Math.round(bullWR)}%`:'--'}</td>
                          <td style={{ color:P.red }}>{bearWR!=null?`${Math.round(bearWR)}%`:'--'}</td>
                          <td style={{ color:P.amber }}>{rangWR!=null?`${Math.round(rangWR)}%`:'--'}</td>
                          <td style={{ color:P.muted }}>{s.trades}</td>
                          <td style={{ color:pColor(s.wr) }}>{s.wr!=null?`${Math.round(s.wr)}%`:'--'}</td>
                          <td style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:11, fontWeight:700, color:s.pl>=0?P.green:P.red, textAlign:'right' }}>{fmtPL(s.pl)}</td>
                        </tr>
                      );
                    })
                  : <tr><td colSpan={7} style={{ textAlign:'center', color:P.dim }}>No strategy data yet</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── SETUP OCCURRENCE FREQUENCY ─── */}
        <Divider label="Setup Occurrence Frequency"/>
        <div style={{ background:P.bg2, border:`1px solid ${P.line2}`, position:'relative', marginBottom:8 }}>
          <Corner pos="tl" color={P.amber}/><Corner pos="tr" color={P.amber}/>
          <Corner pos="bl" color={P.line2}/><Corner pos="br" color={P.line2}/>
          <div style={{ borderBottom:`1px solid ${P.line2}`, padding:'7px 12px', background:P.bg3, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:2, height:12, background:P.amber }}/>
            <Cond size={11} color={P.bright} weight={700}>Setup Occurrence Frequency — Per Day / Week / Month / Year</Cond>
          </div>
          <div style={{ padding:12, overflowX:'auto' }}>
            <table className="mp-dtable">
              <thead>
                <tr>
                  <th>Setup</th>
                  <th style={{ color:P.cyan }}>Per Day</th>
                  <th style={{ color:P.cyan }}>Per Week</th>
                  <th style={{ color:P.cyan }}>Per Month</th>
                  <th style={{ color:P.cyan }}>Per Year</th>
                  <th style={{ color:P.amber }}>Win Rate</th>
                  <th style={{ textAlign:'right' }}>Trades</th>
                </tr>
              </thead>
              <tbody>
                {setupFreqRows.length>0
                  ? setupFreqRows.map((r,i)=>(
                      <tr key={i}>
                        <td className="mp-dn">{r.n}</td>
                        <td>{r.d}</td><td>{r.w}</td><td>{r.mo}</td><td>{r.y}</td>
                        <td style={{ color:r.pc, fontWeight:600 }}>{r.wr}</td>
                        <td style={{ color:P.amber, textAlign:'right' }}>{setupTags[r.n]?.count||0}</td>
                      </tr>
                    ))
                  : <tr><td colSpan={7} style={{ textAlign:'center', color:P.dim }}>No setup data yet</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
