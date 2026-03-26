import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg:      '#06080f',
  surface: '#0a0d16',
  panel:   '#0d1020',
  panelB:  '#0f1420',
  border:  'rgba(100,160,255,0.07)',
  sep:     'rgba(100,160,255,0.13)',
  htf:     '#b48ef8',
  atf:     '#4fc3f7',
  etf:     '#2dd4bf',
  ind:     '#f97316',
  ctx:     '#94a3b8',
  perf:    '#fcd34d',
  win:     '#22d3a0',
  loss:    '#f43f5e',
  warn:    '#f59e0b',
  muted:   '#49637a',
  sub:     '#304055',
  text:    '#7a9ab5',
  strong:  '#c2d9ef',
  bright:  '#e8f3ff',
  accent:  '#6366f1',
};

const wrC  = (w: number) => w >= 80 ? C.win  : w >= 62 ? C.warn : C.loss;

const MONO    = "'JetBrains Mono', 'Fira Code', monospace";
const SANS    = "'Inter', 'Plus Jakarta Sans', sans-serif";
const DISPLAY = "'Montserrat', sans-serif";

// ─── DATA ─────────────────────────────────────────────────────────────────────
const ROWS = [
  {id:1,htf:'W1',atf:'H4',etf:'M5',tf1:{candle:'Bullish Engulfing',pa:'Close above major resistance. Macro HH/HL structure intact. Institutional buying visible.'},tf2:{candle:'Pin Bar — Order Block Respected',pa:'H4 pulled back into OB. Rejection wick confirms OB holding. Bullish structure preserved.'},tf3:{candle:'Bullish Engulfing + BOS',pa:'M5 breaks structure after OB tap. FVG left behind. Entry on M5 candle close.'},indicators:'RSI < 35 ATF (oversold)\nMACD Bullish Cross H4\nVolume 2×+ surge at entry\nEMA slope up H4',session:'London Open · 08:00–10:00 GMT',condition:'Strong Uptrend',bias:'🟢 Bullish',news:'✅ News-Free',momentum:'ATR Expanding · Continuation',wr:96,avgR:5.2,trades:8,netPL:1480},
  {id:2,htf:'W1',atf:'H4',etf:'M5',tf1:{candle:'Bearish Pin Bar',pa:'W1 rejecting macro resistance. Large upper wick = institutional selling. LL/LH structure forming.'},tf2:{candle:'Bearish Engulfing — Breaker Block',pa:'H4 rally failed at breaker block. Bearish engulfing closes below it. Short bias confirmed.'},tf3:{candle:'Rejection Candle — Liquidity Grab',pa:'M5 sweeps HOD liquidity then rejects hard. BOS to downside. Short entry on M5 close.'},indicators:'RSI > 68 ATF (overbought)\nMACD Bearish Cross H4\nVolume spike at rejection\nEMA slope down H4',session:'NY Open · 13:00–15:00 GMT',condition:'Strong Downtrend',bias:'🔴 Bearish',news:'✅ News-Free',momentum:'ATR Expanding · Strong sell-off',wr:91,avgR:4.7,trades:10,netPL:1260},
  {id:3,htf:'D1',atf:'H4',etf:'M5',tf1:{candle:'Bullish Engulfing',pa:'D1 closed above key S/R level. HH/HL trend intact. OB just below acts as new support.'},tf2:{candle:'Inside Bar Breakout + FVG',pa:'H4 compression at FVG. Inside bar broke upward with momentum. FVG created on breakout candle.'},tf3:{candle:'Bullish Engulfing + CHoCH',pa:'M5 change of character after OB tap. Break of M5 structure confirms long. Entry on close.'},indicators:'RSI 45→55 bullish crossover\nMACD Cross up M5\nVolume surge at M5 entry\nEMA 20 cross up M5',session:'London Open · 08:00–10:00 GMT',condition:'Strong Uptrend',bias:'🟢 Bullish',news:'✅ News-Free',momentum:'ATR Expanding · Trend continuation',wr:92,avgR:4.6,trades:14,netPL:1820},
  {id:4,htf:'D1',atf:'H4',etf:'M5',tf1:{candle:'Doji — At Resistance',pa:'D1 indecision at major resistance. No clear close bias yet. Waiting for confirmation.'},tf2:{candle:'Bearish Engulfing — OB Zone',pa:'H4 bearish engulfing at resistance OB confirms short. H4 fills the D1 indecision gap.'},tf3:{candle:'Pin Bar Rejection',pa:'M5 forms lower high at H4 OB projection. Pin bar. Short entry on M5 candle close.'},indicators:'RSI Bearish Divergence ATF\nMACD Bearish Histogram H4\nVolume > 2× at rejection\nEMA cross down H4',session:'NY Open · 13:00–15:00 GMT',condition:'Ranging → Reversal',bias:'🔴 Bearish',news:'✅ News-Free',momentum:'Divergence · Price HH, momentum LH',wr:87,avgR:4.2,trades:16,netPL:1560},
  {id:5,htf:'D1',atf:'H4',etf:'M5',tf1:{candle:'Inside Bar — At Support',pa:'D1 compression at support. Inside bar = pending directional move. Support level holding.'},tf2:{candle:'Double Bottom — Institution Candle',pa:'H4 double bottom at liquidity pool. Large bullish institution candle on second touch.'},tf3:{candle:'FVG Fill + Rejection Candle',pa:'M5 fills FVG below price then rejects with strong bullish close. Entry confirmed.'},indicators:'RSI < 32 ATF oversold\nMACD Bullish Divergence ATF\nVolume spike (institutional)\nStoch Oversold + key level',session:'London Open · 08:00–10:00 GMT',condition:'Ranging → Breakout',bias:'🟢 Bullish',news:'✅ News-Free',momentum:'Low → Expanding · BB Squeeze',wr:84,avgR:4.0,trades:12,netPL:1080},
  {id:6,htf:'D1',atf:'H4',etf:'M15',tf1:{candle:'Bullish Pin Bar — Fib 0.618',pa:'D1 tapped 0.618 Fibonacci at OB zone. Bullish pin bar rejection = premium buy zone confirmed.'},tf2:{candle:'Pin Bar — FVG + OB Overlap',pa:'H4 confirms: FVG and OB confluence at 0.618. Pin bar rejects cleanly. Pull-back complete.'},tf3:{candle:'FVG Fill + Rejection Candle',pa:'M15 fills FVG gap, rejection candle closes above it. Precise entry with tight stop.'},indicators:'Stoch Oversold ATF\nRSI Bullish Divergence M15\nVolume at FVG touch\nATR expansion at trigger',session:'London Open · 08:00–10:00 GMT',condition:'Strong Uptrend',bias:'🟢 Bullish',news:'✅ News-Free',momentum:'Contracting → Expand · Low ATR spring',wr:85,avgR:4.0,trades:12,netPL:1020},
  {id:7,htf:'D1',atf:'H1',etf:'M5',tf1:{candle:'Strong Bullish Trend Candle',pa:'D1 strong close. S/R below flipped to support. HH/HL structure unbroken. Long only bias.'},tf2:{candle:'Engulfing — Institution Candle (H1)',pa:'H1 large body institution candle at flipped S/R level. Minimal wick. Continuation confirmed.'},tf3:{candle:'Pin Bar — Micro OB',pa:'M5 pin bar at micro order block. BOS confirmed below it. Entry on M5 candle close.'},indicators:'RSI > 50 trending H1\nMACD Bullish H1 confirmed\nVolume surge at breakout\nEMA 20/50 aligned up H1',session:'NY Open · 13:00–15:00 GMT',condition:'Strong Uptrend',bias:'🟢 Bullish',news:'✅ News-Free',momentum:'ATR Expanding · All TFs aligned',wr:82,avgR:3.8,trades:14,netPL:900},
  {id:8,htf:'D1',atf:'H1',etf:'M5',tf1:{candle:'Bearish Pin Bar — D1 Resistance',pa:'D1 extended move up. Major historical resistance. Pin bar = D1 reversal zone. Short bias.'},tf2:{candle:'Double Top — Bearish Engulfing (H1)',pa:'H1 double top at D1 resistance. Bearish engulfing on second top. Institutional selling.'},tf3:{candle:'FVG Fill + Rejection (Short)',pa:'M5 fills FVG above HOD (liquidity grab) then reverses. Rejection candle. Short on close.'},indicators:'RSI Bearish Divergence H1\nMACD Cross Down H1\nVolume spike on reversal\nEMA flatten + cross down H1',session:'London Close · 15:00–17:00 GMT',condition:'Ranging → Reversal',bias:'🔴 Bearish',news:'✅ News-Free',momentum:'Divergence · Price HH, momentum LH',wr:80,avgR:3.6,trades:12,netPL:780},
  {id:9,htf:'D1',atf:'H1',etf:'M15',tf1:{candle:'Bullish Close — OB at Fib 0.5',pa:'D1 retraced to OB at 50% Fibonacci. Bullish close = premium buy area confirmed.'},tf2:{candle:'Liquidity Sweep + Reversal (H1)',pa:'H1 sweeps lows below range (stop hunt). Strong recovery candle closes back above structure.'},tf3:{candle:'Bullish Engulfing Post-Sweep',pa:'M15 change of character after H1 liquidity sweep. Engulfing candle confirms long. Entry on close.'},indicators:'RSI oversold H1 then recovery\nMACD Bullish Cross M15\nStoch oversold + bounce\nBB Squeeze expanding up',session:'London Open · 08:00–10:00 GMT',condition:'Uptrend Pull-back',bias:'🟢 Bullish',news:'✅ News-Free',momentum:'Contracting → Expand · Sweep reload',wr:78,avgR:3.4,trades:10,netPL:680},
  {id:10,htf:'H4',atf:'H1',etf:'M5',tf1:{candle:'Bullish Engulfing — OB (H4)',pa:'H4 OB formed below. Trend direction up on H4 only. No macro context beyond intraday. Weaker HTF.'},tf2:{candle:'Pin Bar — H4 OB Projection',pa:'H1 pin bar at H4 OB level projection. Setup signal present. Acceptable but limited structure.'},tf3:{candle:'Bullish Engulfing + BOS',pa:'M5 BOS after H1 pin. Entry trigger aligned. Note: H4 HTF limits context depth.'},indicators:'RSI trending H4\nMACD Cross H1\nVolume average (not surge)\nEMA aligned H4+H1',session:'NY Open · 13:00–15:00 GMT',condition:'Trending (Intraday only)',bias:'🟢 Bullish',news:'✅ News-Free',momentum:'Moderate · No macro confirmation',wr:68,avgR:2.6,trades:10,netPL:420},
  {id:11,htf:'D1',atf:'H4',etf:'M5',tf1:{candle:'D1 Trend Candle (valid)',pa:'D1 trend intact. Context clean. However post-news spike has distorted H4 — must wait to trade.'},tf2:{candle:'H4 FVG — Created by News Spike',pa:'News created large H4 FVG. H4 candle wicked through levels. Wait for structure to reform.'},tf3:{candle:'M5 FVG Fill + Rejection (Post)',pa:'After 20–30 min: M5 fills the news-spike FVG at H4 level. Rejection candle = entry.'},indicators:'RSI extreme post-news\nMACD: wait to settle\nVolume spike then normalize\nATR spiked — widen stop',session:'NY Open · 13:00–15:00 GMT',condition:'Post-News Spike',bias:'🟢 Bullish',news:'📰 Post-News (20–30m wait)',momentum:'Spike → Normalize · Trade after only',wr:74,avgR:3.1,trades:10,netPL:560},
  {id:12,htf:'D1',atf:'30M',etf:'M5',tf1:{candle:'D1 Bullish Trend (valid)',pa:'D1 context clean. Trend intact. However 30M as ATF severely degrades setup quality.'},tf2:{candle:'30M Mixed / Noisy Patterns',pa:'30M structure ambiguous. False pin bars. S/R levels broken frequently. ATF clarity is gone.'},tf3:{candle:'M5 Entry Conflicted',pa:'ETF entries distorted by poor ATF. False BOS signals. Stop hunts from 30M noise bleed through.'},indicators:'RSI erratic 30M noise\nMACD false crosses 30M\nVolume unreliable 30M\nEMA flat / mixed 30M',session:'London/NY Overlap · 15:00–17:00 GMT',condition:'Ranging',bias:'🟡 Mixed',news:'✅ News-Free',momentum:'Weak · 30M ATF degrades signal',wr:50,avgR:1.4,trades:8,netPL:120},
  {id:13,htf:'D1',atf:'H4',etf:'M5',tf1:{candle:'D1 Trend — Distorted by News',pa:'D1 structure technically valid. BUT: during active news all TF structure is invalidated. Do not trade.'},tf2:{candle:'H4 Massive News Wick',pa:'H4 candle shows extreme spike wick. Levels breached and recovered. Structure unreadable.'},tf3:{candle:'M5 Chaotic — No Pattern',pa:'M5 is stop-running noise during news. No candle pattern is meaningful. Spread widens 5–10×.'},indicators:'All indicators: meaningless\nMACD: whipsaw during news\nVolume: extreme, no edge\nRSI: ignore entirely',session:'NY Open · During News Release',condition:'During Active News',bias:'🟡 Unknown',news:'🚫 ACTIVE NEWS — DO NOT TRADE',momentum:'Unpredictable · Zero edge',wr:28,avgR:-0.6,trades:4,netPL:-280},
  {id:14,htf:'D1',atf:'H4',etf:'M15',tf1:{candle:'D1 At Range Boundary (No Trend)',pa:'D1 in range. No trend bias. Price at HTF support boundary. Range fade setup only.'},tf2:{candle:'H4 OB — Range Edge Compression',pa:'H4 confirms OB at range boundary. Compression / inside bar. Range boundary holding.'},tf3:{candle:'M15 Pin Bar — Range Extreme',pa:'M15 pin bar at range low. Rejection candle. Range fade entry. Target: opposite boundary.'},indicators:'Stoch oversold at range low\nBB at extreme (range)\nRSI extreme at boundary\nEMA flat (ranging)',session:'Asian Session · 00:00–07:00 GMT',condition:'Ranging',bias:'🟡 Neutral',news:'✅ News-Free',momentum:'Low ATR · Range trade only',wr:68,avgR:2.4,trades:10,netPL:420},
  {id:15,htf:'H4',atf:'30M',etf:'M1',tf1:{candle:'H4 Engulfing (Weak HTF)',pa:'H4 as HTF = no macro context. Bias shifts intraday. No institutional backing at this level.'},tf2:{candle:'30M False Patterns — No Edge',pa:'30M patterns: 42–50% WR alone. Coin-flip ATF. No reliable structure. Avoid.'},tf3:{candle:'M1 Noise Candles — No Pattern',pa:'M1 dominated by spread noise. No institutional footprint. Every candle is effectively random.'},indicators:'RSI: false signals M1\nMACD: whipsaw M1\nVolume: unreliable M1\nEMA: lagging, useless M1',session:'Asian / Dead Zone · 20:00–23:00 GMT',condition:'Choppy / Volatile',bias:'🔴 Bearish',news:'📰 Near News',momentum:'Erratic · No predictability',wr:33,avgR:0.4,trades:6,netPL:-160},
];

type TFRow = TFRow;

const roleColor: Record<string, string> = { W1:C.htf, D1:C.htf, H4:C.atf, H1:C.atf, '30M':C.warn, M5:C.etf, M15:C.etf, M1:C.loss };
const roleName  = (i: number) => ['HTF','ATF','ETF'][i];
const biasCol   = (v: string) => v.includes('🟢') ? C.win : v.includes('🔴') ? C.loss : C.warn;
const newsCol   = (v: string) => v.includes('🚫') ? C.loss : v.includes('📰') ? C.warn : C.win;
const condCol   = (v: string) => (v.includes('Uptrend')||v.includes('Breakout')) ? C.win
  : (v.includes('Downtrend')||v.includes('News')||v.includes('Chop')) ? C.loss : C.warn;

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
const Pill = ({ children, color }: { children: React.ReactNode; color: string }) => (
  <span style={{
    display:'inline-flex', alignItems:'center',
    fontFamily:MONO, fontSize:9, fontWeight:500,
    letterSpacing:'0.09em', textTransform:'uppercase',
    color, background:`${color}18`, border:`1px solid ${color}35`,
    padding:'2px 8px', borderRadius:3, whiteSpace:'nowrap',
  }}>{children}</span>
);

const WRBar = ({ wr, height=2, width='100%' }: { wr: number; height?: number; width?: string | number }) => (
  <div style={{ width, height, borderRadius:99, background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
    <div style={{
      width:`${wr}%`, height:'100%', borderRadius:99,
      background:`linear-gradient(90deg, ${wrC(wr)}99, ${wrC(wr)})`,
    }}/>
  </div>
);

const Card = ({ children, color, style = {} }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) => (
  <div style={{
    height:'100%',
    position:'relative',
    background: color
      ? `linear-gradient(145deg, ${color}12 0%, ${C.surface} 55%)`
      : C.surface,
    border:`1px solid ${color ? color+'2a' : C.border}`,
    borderTop:`2px solid ${color ? color+'95' : C.sep}`,
    borderRadius:6,
    padding:'10px 12px',
    overflow:'hidden',
    ...style,
  }}>
    {color && (
      <div style={{
        position:'absolute', top:-20, left:-20,
        width:110, height:110,
        background:`radial-gradient(circle, ${color}1c 0%, transparent 68%)`,
        pointerEvents:'none',
      }}/>
    )}
    {children}
  </div>
);

const cellTd = (width: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
  padding:'7px 6px',
  verticalAlign:'top',
  borderRight:`1px solid ${C.border}`,
  borderBottom:`1px solid ${C.border}`,
  width, minWidth:width,
  ...extra,
});

// ─── TF CELL ─────────────────────────────────────────────────────────────────
const TFCell = ({ data, color, tfLabel }: { data: { candle: string; pa: string }; color: string; tfLabel: string }) => (
  <td style={cellTd(205)}>
    <Card color={color}>
      <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:9 }}>
        <div style={{ width:2, height:10, borderRadius:1, background:color, opacity:0.65, flexShrink:0 }}/>
        <span style={{ fontFamily:MONO, fontSize:7.5, fontWeight:500, color, letterSpacing:'0.18em', textTransform:'uppercase', opacity:0.65 }}>{tfLabel}</span>
      </div>
      <div style={{
        fontFamily:MONO, fontSize:10.5, fontWeight:500,
        color, lineHeight:1.4,
        marginBottom:8, paddingBottom:8,
        borderBottom:`1px solid ${color}1e`,
        letterSpacing:'0.025em',
        textShadow:`0 0 16px ${color}55`,
      }}>{data.candle}</div>
      <div style={{ fontFamily:SANS, fontSize:10.5, color:C.text, lineHeight:1.8 }}>{data.pa}</div>
    </Card>
  </td>
);

// ─── INDICATORS CELL ─────────────────────────────────────────────────────────
const IndCell = ({ value }: { value: string }) => {
  const lines = value.split('\n');
  return (
    <td style={{ ...cellTd(180), borderLeft:`1px solid ${C.sep}` }}>
      <Card color={C.ind}>
        <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
          {lines.map((line, i) => (
            <div key={i} style={{ display:'flex', gap:7, alignItems:'flex-start' }}>
              <div style={{
                width: i===0 ? 5 : 3, height: i===0 ? 5 : 3,
                borderRadius:'50%', flexShrink:0,
                marginTop: i===0 ? 3.5 : 4.5,
                background: i===0 ? C.ind : C.sub,
                boxShadow: i===0 ? `0 0 7px ${C.ind}90` : 'none',
              }}/>
              <span style={{
                fontFamily: i===0 ? MONO : SANS,
                fontSize:10.5,
                fontWeight: i===0 ? 500 : 400,
                color: i===0 ? C.strong : C.text,
                lineHeight:1.55,
                letterSpacing: i===0 ? '0.03em' : 0,
              }}>{line}</span>
            </div>
          ))}
        </div>
      </Card>
    </td>
  );
};

// ─── CONTEXT CELL ────────────────────────────────────────────────────────────
const CtxCell = ({ value, type, width }: { value: string; type: string; width: number }) => {
  const [main, sub] = (value || '—').split(' · ');
  let col = C.strong; let isTag = false;
  if (type==='bias') { col=biasCol(main); isTag=true; }
  if (type==='news') { col=newsCol(main); isTag=true; }
  if (type==='cond') { col=condCol(main); isTag=true; }
  return (
    <td style={{ ...cellTd(width), verticalAlign:'middle', maxWidth:width }}>
      <Card color={isTag ? col : undefined} style={{ display:'flex', alignItems:'center', minHeight:52 }}>
        {isTag ? (
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <div style={{
              width:6, height:6, borderRadius:'50%', flexShrink:0,
              background:col, boxShadow:`0 0 7px ${col}, 0 0 14px ${col}55`,
            }}/>
            <div style={{ fontFamily:MONO, fontSize:9.5, fontWeight:500, color:col, letterSpacing:'0.08em' }}>{main}</div>
          </div>
        ) : (
          <div>
            <div style={{ fontFamily:MONO, fontSize:10, fontWeight:500, color:C.strong, lineHeight:1.5, marginBottom:sub?3:0, letterSpacing:'0.04em' }}>{main}</div>
            {sub && <div style={{ fontFamily:SANS, fontSize:9.5, color:C.muted, lineHeight:1.5, marginTop:2 }}>{sub}</div>}
          </div>
        )}
      </Card>
    </td>
  );
};

// ─── MOMENTUM CELL ───────────────────────────────────────────────────────────
const MomCell = ({ value }: { value: string }) => {
  const [main, sub] = value.split(' · ');
  return (
    <td style={{ ...cellTd(155), verticalAlign:'middle' }}>
      <Card style={{ minHeight:52, display:'flex', flexDirection:'column', justifyContent:'center' }}>
        <div style={{ fontFamily:MONO, fontSize:10, fontWeight:500, color:C.strong, letterSpacing:'0.04em', lineHeight:1.5, marginBottom:sub?4:0 }}>{main}</div>
        {sub && <div style={{ fontFamily:SANS, fontSize:9.5, color:C.muted, lineHeight:1.5 }}>{sub}</div>}
      </Card>
    </td>
  );
};

// ─── SAMPLE CELL ─────────────────────────────────────────────────────────────
const SampleCell = ({ trades, wr }: { trades: number; wr: number }) => {
  const wins=Math.round(trades*wr/100), losses=trades-wins;
  return (
    <td style={{ ...cellTd(108), verticalAlign:'middle' }}>
      <Card style={{ textAlign:'center', minHeight:52, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5 }}>
        <div style={{ fontFamily:MONO, fontSize:13, fontWeight:500, color:C.strong, lineHeight:1 }}>{trades}</div>
        <div style={{ display:'flex', gap:4 }}>
          <span style={{ fontFamily:MONO, fontSize:9, color:C.win }}>{wins}W</span>
          <span style={{ fontFamily:MONO, fontSize:9, color:C.sub }}>/</span>
          <span style={{ fontFamily:MONO, fontSize:9, color:C.loss }}>{losses}L</span>
        </div>
        <WRBar wr={wr} width={68}/>
      </Card>
    </td>
  );
};

// ─── PERFORMANCE CELL ────────────────────────────────────────────────────────
const PerfCell = ({ row }: { row: TFRow }) => {
  const col = wrC(row.wr);
  return (
    <td style={{ ...cellTd(140, { borderLeft:`1px solid ${C.sep}` }), verticalAlign:'middle' }}>
      <div style={{
        minHeight:52, position:'relative', overflow:'hidden',
        background:`linear-gradient(135deg, ${col}1a 0%, ${C.surface} 52%)`,
        border:`1px solid ${col}38`,
        borderTop:`2px solid ${col}`,
        borderRadius:6, padding:'10px 12px',
      }}>
        <div style={{
          position:'absolute', top:-15, left:-15,
          width:100, height:100,
          background:`radial-gradient(circle, ${col}28 0%, transparent 68%)`,
          pointerEvents:'none',
        }}/>
        <div style={{ position:'relative', display:'flex', alignItems:'baseline', gap:2, marginBottom:5 }}>
          <span style={{
            fontFamily:DISPLAY, fontSize:16, fontWeight:800,
            color:col, lineHeight:1, letterSpacing:'-0.02em',
            textShadow:`0 0 20px ${col}70, 0 0 40px ${col}30`,
          }}>{row.wr}</span>
          <span style={{ fontFamily:MONO, fontSize:8, color:col, opacity:0.55 }}>%</span>
        </div>
        <WRBar wr={row.wr} height={3} width={72}/>
        <div style={{ marginTop:9, display:'flex', flexDirection:'column', gap:5 }}>
          {[
            { label:'AVG R', value:`${row.avgR>0?'+':''}${row.avgR}R`, color:row.avgR>=3?'#60a5fa':C.muted },
            { label:'P/L',   value:`${row.netPL>=0?'+':''}$${row.netPL.toLocaleString()}`, color:row.netPL>=0?C.win:C.loss },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontFamily:MONO, fontSize:7.5, color:C.sub, textTransform:'uppercase', letterSpacing:'0.12em' }}>{label}</span>
              <span style={{ fontFamily:MONO, fontSize:10, fontWeight:500, color }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </td>
  );
};

// ─── TF COMBO CELL ───────────────────────────────────────────────────────────
const ComboCell = ({ row }: { row: TFRow }) => (
  <td style={{ width:136, minWidth:136, padding:'7px 6px', borderRight:`1px solid ${C.sep}`, borderBottom:`1px solid ${C.border}`, verticalAlign:'middle' }}>
    <Card>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {[row.htf, row.atf, row.etf].map((tf, i) => {
          const c = roleColor[tf]||C.sub;
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:9 }}>
              <div style={{
                minWidth:34, height:19, borderRadius:3,
                background:`${c}1a`, border:`1px solid ${c}38`,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                boxShadow:`inset 0 0 8px ${c}15`,
              }}>
                <span style={{ fontFamily:MONO, fontSize:9.5, fontWeight:500, color:c, letterSpacing:'0.04em' }}>{tf}</span>
              </div>
              <span style={{ fontFamily:MONO, fontSize:9, color:C.muted, letterSpacing:'0.1em' }}>{roleName(i)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  </td>
);

// ─── TABLE ROW ────────────────────────────────────────────────────────────────
const MatrixRow = ({ row }: { row: TFRow }) => (
  <tr className="mrow">
    <ComboCell row={row}/>
    <TFCell data={row.tf1} color={C.htf} tfLabel={`${row.htf} · HTF`}/>
    <TFCell data={row.tf2} color={C.atf} tfLabel={`${row.atf} · ATF`}/>
    <TFCell data={row.tf3} color={C.etf} tfLabel={`${row.etf} · ETF`}/>
    <IndCell value={row.indicators}/>
    <CtxCell value={row.session}   type="ses"  width={138}/>
    <CtxCell value={row.condition} type="cond" width={160}/>
    <CtxCell value={row.bias}      type="bias" width={100}/>
    <CtxCell value={row.news}      type="news" width={185}/>
    <MomCell value={row.momentum}/>
    <SampleCell trades={row.trades} wr={row.wr}/>
    <PerfCell row={row}/>
  </tr>
);

const ColHeaders = [
  { label:'HTF',        sub:'Pattern & price action', color:C.htf,  w:205, sepLeft:false },
  { label:'ATF',        sub:'Pattern & price action', color:C.atf,  w:205, sepLeft:false },
  { label:'ETF',        sub:'Pattern & price action', color:C.etf,  w:205, sepLeft:false },
  { label:'Indicators', sub:'State at entry',         color:C.ind,  w:180, sepLeft:true  },
  { label:'Session',    sub:'Time window',            color:C.ctx,  w:138, sepLeft:false },
  { label:'Condition',  sub:'Trend / range',          color:C.ctx,  w:160, sepLeft:false },
  { label:'Bias',       sub:'Direction',              color:C.ctx,  w:100, sepLeft:false },
  { label:'News',       sub:'Event status',           color:C.ctx,  w:185, sepLeft:false },
  { label:'Momentum',   sub:'ATR / expansion',        color:C.ctx,  w:155, sepLeft:false },
  { label:'Sample',     sub:'Dataset size',           color:C.sub,  w:108, sepLeft:false },
  { label:'Performance',sub:'WR · avg R · P/L',       color:C.perf, w:140, sepLeft:true  },
];

// ─── MOBILE CARD ─────────────────────────────────────────────────────────────
const MobileCard = ({ row }: { row: TFRow }) => {
  const [open, setOpen] = useState(false);
  const col=wrC(row.wr), wins=Math.round(row.trades*row.wr/100), losses=row.trades-wins;
  const bC=biasCol((row.bias||'').split(' · ')[0]);
  const nC=newsCol((row.news||'').split(' · ')[0]);
  const cC=condCol((row.condition||'').split(' · ')[0]);
  const [momMain,momSub]=row.momentum.split(' · ');
  return (
    <div style={{
      margin:'0 10px 6px',
      background:`linear-gradient(155deg, ${col}0d 0%, ${C.surface} 50%)`,
      border:`1px solid ${col}28`, borderTop:`2px solid ${col}85`,
      borderRadius:8, overflow:'hidden',
    }}>
      <div onClick={()=>setOpen(o=>!o)} style={{ padding:'12px 14px', cursor:'pointer', userSelect:'none' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5, flex:1, marginRight:12 }}>
            {[row.htf,row.atf,row.etf].map((tf,i)=>{
              const c=roleColor[tf]||C.sub;
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:5, background:`${c}1a`, border:`1px solid ${c}38`, borderRadius:3, padding:'2px 7px' }}>
                  <span style={{ fontFamily:MONO, fontSize:10, fontWeight:500, color:c }}>{tf}</span>
                  <span style={{ fontFamily:MONO, fontSize:9, color:C.muted }}>{roleName(i)}</span>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <span style={{ fontFamily:DISPLAY, fontSize:16, fontWeight:800, color:col, lineHeight:1, display:'block', marginBottom:4, textShadow:`0 0 18px ${col}60` }}>{row.wr}%</span>
            <WRBar wr={row.wr} width={56}/>
          </div>
        </div>
        <div style={{ display:'flex', gap:20, marginBottom:9 }}>
          {[
            { label:'AVG R',   value:`${row.avgR>0?'+':''}${row.avgR}R`, color:row.avgR>=3?'#60a5fa':C.muted },
            { label:'NET P/L', value:`${row.netPL>=0?'+':''}$${row.netPL.toLocaleString()}`, color:row.netPL>=0?C.win:C.loss },
            { label:'TRADES',  value:`${row.trades} · ${wins}W/${losses}L`, color:C.strong },
          ].map(({label,value,color})=>(
            <div key={label}>
              <div style={{ fontFamily:MONO, fontSize:7, color:C.sub, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:2 }}>{label}</div>
              <div style={{ fontFamily:MONO, fontSize:10, fontWeight:500, color }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:9 }}>
          <Pill color={bC}>{(row.bias||'').split(' · ')[0]}</Pill>
          <Pill color={cC}>{(row.condition||'').split(' · ')[0]}</Pill>
          <Pill color={nC}>{(row.news||'').split(' · ')[0]}</Pill>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontFamily:SANS, fontSize:10, color:C.muted }}>{row.session}</span>
          <span style={{ fontFamily:MONO, fontSize:8, fontWeight:500, color:C.accent, background:`${C.accent}14`, border:`1px solid ${C.accent}28`, padding:'2px 8px', borderRadius:2, letterSpacing:'0.1em' }}>{open?'▲ LESS':'▼ MORE'}</span>
        </div>
      </div>
      {open && (
        <div style={{ borderTop:`1px solid ${C.sep}` }}>
          {[{role:'HTF',tf:row.htf,color:C.htf,data:row.tf1},{role:'ATF',tf:row.atf,color:C.atf,data:row.tf2},{role:'ETF',tf:row.etf,color:C.etf,data:row.tf3}].map(({role,tf,color,data})=>(
            <div key={role} style={{ padding:'11px 14px', borderBottom:`1px solid ${C.border}`, background:`linear-gradient(90deg,${color}08 0%,transparent 55%)` }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                <div style={{ width:2, height:12, borderRadius:1, background:color, opacity:0.65 }}/>
                <div style={{ background:`${color}1a`, border:`1px solid ${color}38`, borderRadius:3, padding:'1px 6px' }}>
                  <span style={{ fontFamily:MONO, fontSize:9, fontWeight:500, color }}>{tf}</span>
                </div>
                <span style={{ fontFamily:MONO, fontSize:7, color:C.sub, textTransform:'uppercase', letterSpacing:'0.12em' }}>{role}</span>
                <span style={{ fontFamily:MONO, fontSize:10, fontWeight:500, color }}>{data.candle}</span>
              </div>
              <p style={{ fontFamily:SANS, fontSize:12, color:C.text, lineHeight:1.75, margin:0 }}>{data.pa}</p>
            </div>
          ))}
          <div style={{ padding:'11px 14px', borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontFamily:MONO, fontSize:7, fontWeight:500, color:C.ind, textTransform:'uppercase', letterSpacing:'0.16em', marginBottom:7 }}>Indicators</div>
            {row.indicators.split('\n').map((line,i)=>(
              <div key={i} style={{ display:'flex', gap:6, marginBottom:5 }}>
                <div style={{ width:4, height:4, borderRadius:'50%', flexShrink:0, marginTop:4, background:i===0?C.ind:C.sub, boxShadow:i===0?`0 0 5px ${C.ind}70`:'none' }}/>
                <span style={{ fontFamily:i===0?MONO:SANS, fontSize:11, color:i===0?C.strong:C.text, fontWeight:i===0?500:400, lineHeight:1.6 }}>{line}</span>
              </div>
            ))}
          </div>
          <div style={{ padding:'11px 14px', borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontFamily:MONO, fontSize:7, color:C.ctx, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:5 }}>Momentum</div>
            <div style={{ fontFamily:MONO, fontSize:12, fontWeight:500, color:C.strong }}>{momMain}</div>
            {momSub && <div style={{ fontFamily:SANS, fontSize:11, color:C.sub, marginTop:2 }}>{momSub}</div>}
          </div>
          <div style={{ padding:'11px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 16px' }}>
            <div>
              <div style={{ fontFamily:MONO, fontSize:7, color:C.sub, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:3 }}>Session</div>
              <div style={{ fontFamily:SANS, fontSize:11, color:C.muted, lineHeight:1.6 }}>{row.session.replace(' · ','\n')}</div>
            </div>
            <div>
              <div style={{ fontFamily:MONO, fontSize:7, color:C.sub, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:3 }}>Condition</div>
              <Pill color={cC}>{(row.condition||'').split(' · ')[0]}</Pill>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── INSIGHTS ─────────────────────────────────────────────────────────────────
const InsightsPanel = ({ isMobile }: { isMobile: boolean }) => (
  <div style={{ padding:isMobile?'0 10px 32px':'0 20px 32px', display:'grid', gridTemplateColumns:isMobile?'1fr':'repeat(3,1fr)', gap:10 }}>
    {[
      { color:C.win,  icon:'★', title:'Highest probability setup',
        lines:['HTF: Engulfing or Pin Bar at/above key S/R level','ATF: Double Bottom / OB / FVG / Institution Candle','ETF: BOS or FVG Fill + Rejection on M5 or M15','Indicators: Volume surge + RSI extreme confirming ATF','London or NY Open · No news · ATR Expanding'] },
      { color:C.atf,  icon:'▸', title:'TF alignment rule',
        lines:['HTF: must show clear directional bias at a key level','ATF: must confirm bias with structure (OB/FVG/double)','ETF: must show precise trigger in the same direction','All three TFs must tell the same story — or skip','One contradicting TF = reduce size or wait'] },
      { color:C.loss, icon:'⚠', title:'Win rate killers',
        lines:['30M as ATF: structure becomes noise, WR drops ~20%','M1 as ETF: no institutional footprint, coin-flip entries','During news: all patterns and levels invalidated','Dead zone session: spread destroys every edge','H4 as HTF: no macro context, bias shifts too quickly'] },
    ].map((card,i)=>(
      <div key={i} style={{
        position:'relative', overflow:'hidden',
        background:`linear-gradient(145deg,${card.color}0f 0%,${C.surface} 55%)`,
        border:`1px solid ${card.color}22`, borderTop:`2px solid ${card.color}60`,
        borderRadius:6, padding:'16px 18px',
      }}>
        <div style={{ position:'absolute',top:-20,left:-20,width:120,height:120,background:`radial-gradient(circle,${card.color}16 0%,transparent 65%)`,pointerEvents:'none' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, position:'relative' }}>
          <span style={{ fontFamily:MONO, fontSize:11, color:card.color, textShadow:`0 0 10px ${card.color}80` }}>{card.icon}</span>
          <span style={{ fontFamily:MONO, fontSize:9, fontWeight:500, color:card.color, letterSpacing:'0.14em', textTransform:'uppercase' }}>{card.title}</span>
        </div>
        {card.lines.map((line,j)=>(
          <div key={j} style={{ display:'flex', gap:8, marginBottom:7 }}>
            <div style={{ width:2, flexShrink:0, borderRadius:1, marginTop:2, alignSelf:'stretch', background:`${card.color}50` }}/>
            <span style={{ fontFamily:SANS, fontSize:11, color:C.muted, lineHeight:1.6 }}>{line}</span>
          </div>
        ))}
      </div>
    ))}
  </div>
);

const GROUPS = [
  { label:'HTF',         sub:'Candle Pattern · Price Action', color:C.htf, leftBorder:false },
  { label:'ATF',         sub:'Candle Pattern · Price Action', color:C.atf, leftBorder:false },
  { label:'ETF',         sub:'Candle Pattern · Price Action', color:C.etf, leftBorder:false },
  { label:'Indicators',  sub:'State at entry moment',         color:C.ind, leftBorder:true  },
  { label:'Session',     sub:'Time window',                   color:C.ctx, leftBorder:false },
  { label:'Condition',   sub:'Trend · Range · Volatile',      color:C.ctx, leftBorder:false },
  { label:'Bias',        sub:'Direction',                     color:C.ctx, leftBorder:false },
  { label:'News',        sub:'Event status',                  color:C.ctx, leftBorder:false },
  { label:'Momentum',    sub:'ATR · Expansion',               color:C.ctx, leftBorder:false },
  { label:'Sample Size', sub:'Trades in dataset',             color:C.sub, leftBorder:false },
  { label:'Performance', sub:'WR · Avg R · Net P/L',          color:C.perf,leftBorder:true  },
];

export default function TFMetricsPanel({ sessionId }: { sessionId?: string | null }) {
  const [page, setPage]       = useState(1);
// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function TFMetricsPanel({ sessionId }: { sessionId?: string }) {
  const [page, setPage] = useState(1);
  const [isMobile, setMobile] = useState(false);
  useEffect(()=>{
    const check=()=>setMobile(window.innerWidth<1024);
    check(); window.addEventListener('resize',check);
    return()=>window.removeEventListener('resize',check);
  },[]);

  const { data: matrixData, isLoading } = useQuery<{ success: boolean; rows?: TFRow[] }>({
    queryKey: ['tf-metrics-matrix', sessionId],
    queryFn: async () => {
      const url = sessionId
        ? `/api/tf-metrics/matrix?sessionId=${sessionId}`
        : '/api/tf-metrics/matrix';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch TF matrix');
      return res.json();
    },
    enabled: !!sessionId,
  });

  const matrixUrl = sessionId
    ? `/api/tf-metrics/matrix?sessionId=${sessionId}`
    : null;

  const { data: matrixData, isLoading } = useQuery<{ success: boolean; rows?: Row[] }>({
    queryKey: ['/api/tf-metrics/matrix', sessionId],
    queryFn: async () => {
      const res = await fetch(matrixUrl!);
      if (!res.ok) throw new Error('Failed to fetch TF matrix');
      return res.json();
    },
    enabled: !!matrixUrl,
    staleTime: 60_000,
  });

  const liveRows: Row[] = matrixData?.success && matrixData.rows?.length ? matrixData.rows : ROWS;
  const rows = page === 1 ? liveRows : [...liveRows].filter(r => r.wr >= 78).sort((a, b) => b.wr - a.wr);
  const isLive = !!(matrixData?.success && matrixData.rows?.length);
  const allRows: TFRow[] = matrixData?.rows ?? [];
  const rows = page===2 ? [...allRows].filter(r=>r.wr>=78).sort((a,b)=>b.wr-a.wr) : allRows;
  const avgWR = allRows.length ? Math.round(allRows.reduce((s,r)=>s+r.wr,0)/allRows.length) : 0;
  const bestWR = allRows.length ? Math.max(...allRows.map(r=>r.wr)) : 0;

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=JetBrains+Mono:wght@300;400;500&family=Inter:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.bg}}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-track{background:${C.bg}}
        ::-webkit-scrollbar-thumb{background:${C.sub};border-radius:99px}
        table{border-collapse:separate;border-spacing:0}
        button{cursor:pointer;outline:none;border:none;background:none}
        .mrow{transition:background 0.12s}
        .mrow:hover{background:rgba(100,160,255,0.02)!important}
        .mrow:hover>td>div{border-color:rgba(100,160,255,0.2)!important;transition:border-color 0.12s}
        .fade{animation:fi 0.2s ease}
        @keyframes fi{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
      `}</style>

      {/* ── NAV ── */}
      <div style={{ position:'sticky', top:0, zIndex:50, background:'rgba(2,6,14,0.97)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(148,200,255,0.07)' }}>
        <div style={{ display:'flex', alignItems:'center', padding: isMobile ? '0 16px' : '0 24px', height: isMobile ? 46 : 52, gap:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, paddingRight:20, borderRight:'1px solid rgba(148,200,255,0.07)', flexShrink:0 }}>
            <span style={{ fontFamily:"'Montserrat', sans-serif", fontSize: isMobile?11:12, fontWeight:900, color:'#cbd5e1', letterSpacing:'0.18em', textTransform:'uppercase' }}>TF</span>
            <span style={{ fontFamily:"'Montserrat', sans-serif", fontSize: isMobile?11:12, fontWeight:700, color:'rgba(148,200,255,0.35)', letterSpacing:'0.18em', textTransform:'uppercase' }}>Analytics</span>
            {isLive && !isMobile && (
              <span style={{ fontFamily:"'DM Mono','Fira Code',monospace", fontSize:8, fontWeight:500, letterSpacing:'0.14em', textTransform:'uppercase', color:'#34d399', background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.25)', padding:'2px 7px', borderRadius:2 }}>LIVE</span>
            )}
          </div>
          <div style={{ display:'flex', alignItems:'stretch', height:'100%', marginRight:'auto' }}>
            {[
              { n:1, label: isMobile ? 'Matrix' : 'Full Matrix',     sub: isLoading ? 'loading…' : `${liveRows.length} scenarios` },
              { n:2, label: isMobile ? 'Best'   : 'Best Performers',  sub:'WR ≥ 78%' },
            ].map(p => {
              const active = page === p.n;
      {/* HEADER */}
      <header style={{ background:'rgba(6,8,15,0.97)',backdropFilter:'blur(24px)',borderBottom:`1px solid rgba(100,160,255,0.13)` }}>
        <div style={{ height:2, background:`linear-gradient(90deg,${C.htf}cc 0%,${C.atf}cc 40%,${C.etf}cc 72%,transparent 100%)` }}/>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:isMobile?'10px 16px':'11px 28px',borderBottom:`1px solid rgba(100,160,255,0.07)` }}>
          <div style={{ display:'flex',alignItems:'center',gap:12,flexShrink:0 }}>
            <div style={{ width:34,height:34,borderRadius:8,background:`linear-gradient(135deg,${C.htf}22,${C.atf}18)`,border:`1px solid ${C.htf}42`,display:'flex',alignItems:'center',justifyContent:'center' }}>
              <span style={{ fontFamily:DISPLAY,fontSize:13,fontWeight:800,color:C.htf,textShadow:`0 0 14px ${C.htf}80` }}>TF</span>
            </div>
            <span style={{ fontFamily:DISPLAY,fontSize:9,fontWeight:700,color:C.strong,letterSpacing:'0.22em',textTransform:'uppercase' }}>Multi-Timeframe Matrix</span>
          </div>
          {!isMobile && (
            <div style={{ display:'flex',alignItems:'center',gap:8 }}>
              {[
                {label:'Scenarios',value:allRows.length, color:C.bright, bg:'rgba(194,217,239,0.07)',border:'rgba(194,217,239,0.15)'},
                {label:'Avg WR',   value:`${avgWR}%`, color:C.perf,   bg:`${C.perf}10`,border:`${C.perf}30`},
                {label:'Best WR',  value:`${bestWR}%`,color:C.win,    bg:`${C.win}10`, border:`${C.win}30`},
              ].map(({label,value,color,bg,border})=>(
                <div key={label} style={{ display:'flex',alignItems:'center',gap:8,background:bg,border:`1px solid ${border}`,borderRadius:5,padding:'5px 12px' }}>
                  <span style={{ fontFamily:DISPLAY,fontSize:9,fontWeight:600,color:'rgba(148,200,255,0.5)',textTransform:'uppercase',letterSpacing:'0.15em' }}>{label}</span>
                  <span style={{ fontFamily:DISPLAY,fontSize:15,fontWeight:800,color,lineHeight:1,textShadow:`0 0 14px ${color}55` }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display:'flex',alignItems:'stretch',justifyContent:'space-between',padding:isMobile?'0 16px':'0 28px',height:42 }}>
          <nav style={{ display:'flex',alignItems:'stretch' }}>
            {[{n:1,label:'Full Matrix',sub:`${allRows.length} scenarios`},{n:2,label:'Best Performers',sub:'WR ≥ 78%'}].map(tab=>{
              const active=page===tab.n;
              return (
                <button key={tab.n} onClick={()=>setPage(tab.n)} style={{ display:'flex',alignItems:'center',gap:9,paddingRight:22,paddingLeft:tab.n===1?0:22,borderBottom:active?`2px solid ${C.accent}`:'2px solid transparent',borderRight:tab.n===1?`1px solid rgba(100,160,255,0.09)`:'none',transition:'all 0.15s' }}>
                  <span style={{ fontFamily:DISPLAY,fontSize:10,fontWeight:active?700:600,color:active?C.bright:'rgba(148,200,255,0.38)',letterSpacing:'0.12em',textTransform:'uppercase',transition:'color 0.15s' }}>{isMobile?(tab.n===1?'Matrix':'Best'):tab.label}</span>
                  {!isMobile&&(<span style={{ fontFamily:DISPLAY,fontSize:9,fontWeight:600,color:active?C.accent:'rgba(148,200,255,0.2)',background:active?`${C.accent}18`:'transparent',border:active?`1px solid ${C.accent}32`:'1px solid transparent',padding:'2px 7px',borderRadius:3,letterSpacing:'0.08em',transition:'all 0.15s' }}>{tab.sub}</span>)}
                </button>
              );
            })}
          </nav>
          {!isMobile&&(
            <div style={{ display:'flex',alignItems:'center',gap:0 }}>
              <div style={{ display:'flex',alignItems:'center',gap:12,paddingRight:18,marginRight:18,borderRight:`1px solid rgba(100,160,255,0.09)` }}>
                <span style={{ fontFamily:DISPLAY,fontSize:9,fontWeight:700,color:'rgba(148,200,255,0.4)',textTransform:'uppercase',letterSpacing:'0.18em' }}>TF Role</span>
                {[{c:C.htf,l:'HTF'},{c:C.atf,l:'ATF'},{c:C.etf,l:'ETF'}].map(x=>(
                  <div key={x.l} style={{ display:'flex',alignItems:'center',gap:6 }}>
                    <div style={{ width:7,height:7,borderRadius:'50%',background:x.c,boxShadow:`0 0 7px ${x.c}`,flexShrink:0 }}/>
                    <span style={{ fontFamily:DISPLAY,fontSize:10,fontWeight:600,color:x.c,letterSpacing:'0.08em' }}>{x.l}</span>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                <span style={{ fontFamily:DISPLAY,fontSize:9,fontWeight:700,color:'rgba(148,200,255,0.4)',textTransform:'uppercase',letterSpacing:'0.18em' }}>Win Rate</span>
                {[{c:C.win,l:'≥ 80%'},{c:C.warn,l:'62–79%'},{c:C.loss,l:'< 62%'}].map(x=>(
                  <div key={x.l} style={{ display:'flex',alignItems:'center',gap:6 }}>
                    <div style={{ width:7,height:7,borderRadius:'50%',background:x.c,boxShadow:`0 0 6px ${x.c}80`,flexShrink:0 }}/>
                    <span style={{ fontFamily:DISPLAY,fontSize:10,fontWeight:600,color:x.c,letterSpacing:'0.08em' }}>{x.l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      {isMobile&&(
        <div style={{ display:'flex',alignItems:'center',gap:12,padding:'5px 14px',borderBottom:`1px solid ${C.sep}`,background:'rgba(6,8,15,0.8)' }}>
          {[{c:C.htf,l:'HTF'},{c:C.atf,l:'ATF'},{c:C.etf,l:'ETF'},{c:C.win,l:'≥80%'},{c:C.warn,l:'62–79%'},{c:C.loss,l:'<62%'}].map(x=>(
            <div key={x.l} style={{ display:'flex',alignItems:'center',gap:4 }}>
              <div style={{ width:4,height:4,borderRadius:'50%',background:x.c,boxShadow:`0 0 4px ${x.c}` }}/>
              <span style={{ fontFamily:MONO,fontSize:8.5,color:'rgba(148,200,255,0.28)',letterSpacing:'0.07em' }}>{x.l}</span>
            </div>
          ))}
        </div>
      )}

      <main className="fade" key={`${page}-${isMobile}`} style={{ paddingBottom:32 }}>
        {isLoading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:320, gap:12 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:C.accent, animation:'fi 1s ease infinite alternate' }}/>
            <span style={{ fontFamily:MONO, fontSize:11, color:C.muted, letterSpacing:'0.12em' }}>COMPUTING MATRIX…</span>
          </div>
        ) : !sessionId || rows.length === 0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:320, gap:10 }}>
            <span style={{ fontFamily:MONO, fontSize:20, color:C.sep }}>◫</span>
            <span style={{ fontFamily:MONO, fontSize:11, color:C.muted, letterSpacing:'0.12em' }}>
              {!sessionId ? 'SELECT A SESSION TO VIEW THE MATRIX' : 'NO SCENARIOS FOUND FOR THIS SESSION'}
            </span>
          </div>
        ) : isMobile ? (
          <div style={{ paddingTop:8 }}>{rows.map(row=><MobileCard key={row.id} row={row}/>)}</div>
        ) : (
          <div style={{ overflowX:'auto',borderLeft:`3px solid ${C.sep}` }}>
            <table>
              <thead>
                <tr>
                  <th style={{ background:C.panel,width:148,minWidth:148,padding:'10px 14px',borderRight:`1px solid ${C.sep}`,borderBottom:`1px solid ${C.sep}`,textAlign:'left',verticalAlign:'bottom' }}>
                    <div style={{ fontFamily:MONO,fontSize:7.5,fontWeight:500,color:C.sub,letterSpacing:'0.18em',textTransform:'uppercase' }}>MTF Combo</div>
                    <div style={{ fontFamily:MONO,fontSize:7,color:C.sub,marginTop:3,letterSpacing:'0.1em',opacity:0.5 }}>HTF → ATF → ETF</div>
                  </th>
                  {ColHeaders.map((col,i)=>(
                    <th key={i} style={{ padding:'10px 16px',textAlign:'left',verticalAlign:'bottom',background:`linear-gradient(180deg,${col.color}0c 0%,transparent 100%)`,borderBottom:`1px solid ${C.sep}`,borderLeft:col.sepLeft?`1px solid ${C.sep}`:undefined,borderRight:`1px solid ${C.border}`,width:col.w,minWidth:col.w }}>
                      <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:3 }}>
                        <div style={{ width:4,height:4,borderRadius:'50%',background:col.color,boxShadow:`0 0 6px ${col.color}`,flexShrink:0 }}/>
                        <span style={{ fontFamily:MONO,fontSize:8.5,fontWeight:500,color:col.color,letterSpacing:'0.14em',textTransform:'uppercase' }}>{col.label}</span>
                      </div>
                      <div style={{ fontFamily:SANS,fontSize:10,color:C.sub,paddingLeft:10 }}>{col.sub}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{rows.map(row=><MatrixRow key={row.id} row={row}/>)}</tbody>
            </table>
          </div>
        )}
      </main>
      {page===2&&<InsightsPanel isMobile={isMobile}/>}
    </div>
  );
}
