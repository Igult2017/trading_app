import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

const C = {
  bg:      '#010409',
  surface: '#040c15',
  panel:   '#050e19',
  border:  'rgba(148,200,255,0.06)',
  sep:     'rgba(148,200,255,0.10)',
  htf:     '#c084fc',
  atf:     '#38bdf8',
  etf:     '#34d399',
  ind:     '#fb923c',
  ctx:     '#94a3b8',
  perf:    '#fbbf24',
  win:     '#10b981',
  loss:    '#f43f5e',
  warn:    '#f59e0b',
  dim:     '#1e3650',
  sub:     '#475569',
  muted:   '#64748b',
  text:    '#8fa8c0',
  strong:  '#cce0f5',
  bright:  '#eaf4ff',
};

const wrC  = (w: number) => w >= 80 ? C.win  : w >= 62 ? C.warn : C.loss;
const wrBg = (w: number) => w >= 80 ? 'rgba(16,185,129,0.05)' : w >= 62 ? 'rgba(245,158,11,0.04)' : 'rgba(244,63,94,0.05)';

const MONO    = "'DM Mono', 'Fira Code', monospace";
const SANS    = "'Syne', 'Space Grotesk', sans-serif";

interface TFData { candle: string; pa: string; }
interface Row {
  id: number; htf: string; atf: string; etf: string;
  tf1: TFData; tf2: TFData; tf3: TFData;
  indicators: string; session: string; condition: string;
  bias: string; news: string; momentum: string;
  wr: number; avgR: number; trades: number; netPL: number;
}

const ROWS: Row[] = [
  { id:1, htf:'W1', atf:'H4', etf:'M5',
    tf1:{ candle:'Bullish Engulfing',               pa:'Close above major resistance. Macro HH/HL structure intact. Institutional buying visible.' },
    tf2:{ candle:'Pin Bar — Order Block Respected',  pa:'H4 pulled back into OB. Rejection wick confirms OB holding. Bullish structure preserved.' },
    tf3:{ candle:'Bullish Engulfing + BOS',           pa:'M5 breaks structure after OB tap. FVG left behind. Entry on M5 candle close.' },
    indicators:'RSI < 35 ATF (oversold)\nMACD Bullish Cross H4\nVolume 2×+ surge at entry\nEMA slope up H4',
    session:'London Open · 08:00–10:00 GMT', condition:'Strong Uptrend', bias:'🟢 Bullish', news:'✅ News-Free',
    momentum:'ATR Expanding · Continuation', wr:96, avgR:5.2, trades:8, netPL:1480 },
  { id:2, htf:'W1', atf:'H4', etf:'M5',
    tf1:{ candle:'Bearish Pin Bar',                   pa:'W1 rejecting macro resistance. Large upper wick = institutional selling. LL/LH structure forming.' },
    tf2:{ candle:'Bearish Engulfing — Breaker Block',  pa:'H4 rally failed at breaker block. Bearish engulfing closes below it. Short bias confirmed.' },
    tf3:{ candle:'Rejection Candle — Liquidity Grab',  pa:'M5 sweeps HOD liquidity then rejects hard. BOS to downside. Short entry on M5 close.' },
    indicators:'RSI > 68 ATF (overbought)\nMACD Bearish Cross H4\nVolume spike at rejection\nEMA slope down H4',
    session:'NY Open · 13:00–15:00 GMT', condition:'Strong Downtrend', bias:'🔴 Bearish', news:'✅ News-Free',
    momentum:'ATR Expanding · Strong sell-off', wr:91, avgR:4.7, trades:10, netPL:1260 },
  { id:3, htf:'D1', atf:'H4', etf:'M5',
    tf1:{ candle:'Bullish Engulfing',            pa:'D1 closed above key S/R level. HH/HL trend intact. OB just below acts as new support.' },
    tf2:{ candle:'Inside Bar Breakout + FVG',    pa:'H4 compression at FVG. Inside bar broke upward with momentum. FVG created on breakout candle.' },
    tf3:{ candle:'Bullish Engulfing + CHoCH',    pa:'M5 change of character after OB tap. Break of M5 structure confirms long. Entry on close.' },
    indicators:'RSI 45→55 bullish crossover\nMACD Cross up M5\nVolume surge at M5 entry\nEMA 20 cross up M5',
    session:'London Open · 08:00–10:00 GMT', condition:'Strong Uptrend', bias:'🟢 Bullish', news:'✅ News-Free',
    momentum:'ATR Expanding · Trend continuation', wr:92, avgR:4.6, trades:14, netPL:1820 },
  { id:4, htf:'D1', atf:'H4', etf:'M5',
    tf1:{ candle:'Doji — At Resistance',         pa:'D1 indecision at major resistance. No clear close bias yet. Waiting for confirmation.' },
    tf2:{ candle:'Bearish Engulfing — OB Zone',  pa:'H4 bearish engulfing at resistance OB confirms short. H4 fills the D1 indecision gap.' },
    tf3:{ candle:'Pin Bar Rejection',             pa:'M5 forms lower high at H4 OB projection. Pin bar. Short entry on M5 candle close.' },
    indicators:'RSI Bearish Divergence ATF\nMACD Bearish Histogram H4\nVolume > 2× at rejection\nEMA cross down H4',
    session:'NY Open · 13:00–15:00 GMT', condition:'Ranging → Reversal', bias:'🔴 Bearish', news:'✅ News-Free',
    momentum:'Divergence · Price HH, momentum LH', wr:87, avgR:4.2, trades:16, netPL:1560 },
  { id:5, htf:'D1', atf:'H4', etf:'M5',
    tf1:{ candle:'Inside Bar — At Support',            pa:'D1 compression at support. Inside bar = pending directional move. Support level holding.' },
    tf2:{ candle:'Double Bottom — Institution Candle',  pa:'H4 double bottom at liquidity pool. Large bullish institution candle on second touch. Accumulation signal.' },
    tf3:{ candle:'FVG Fill + Rejection Candle',         pa:'M5 fills FVG below price then rejects with strong bullish close. Entry confirmed.' },
    indicators:'RSI < 32 ATF oversold\nMACD Bullish Divergence ATF\nVolume spike (institutional)\nStoch Oversold + key level',
    session:'London Open · 08:00–10:00 GMT', condition:'Ranging → Breakout', bias:'🟢 Bullish', news:'✅ News-Free',
    momentum:'Low → Expanding · BB Squeeze', wr:84, avgR:4.0, trades:12, netPL:1080 },
  { id:6, htf:'D1', atf:'H4', etf:'M15',
    tf1:{ candle:'Bullish Pin Bar — Fib 0.618',       pa:'D1 tapped 0.618 Fibonacci at OB zone. Bullish pin bar rejection = premium buy zone confirmed.' },
    tf2:{ candle:'Pin Bar — FVG + OB Overlap',        pa:'H4 confirms: FVG and OB confluence at 0.618. Pin bar rejects cleanly. Pull-back complete.' },
    tf3:{ candle:'FVG Fill + Rejection Candle',        pa:'M15 fills FVG gap, rejection candle closes above it. Precise entry with tight stop.' },
    indicators:'Stoch Oversold ATF\nRSI Bullish Divergence M15\nVolume at FVG touch\nATR expansion at trigger',
    session:'London Open · 08:00–10:00 GMT', condition:'Strong Uptrend', bias:'🟢 Bullish', news:'✅ News-Free',
    momentum:'Contracting → Expand · Low ATR spring', wr:85, avgR:4.0, trades:12, netPL:1020 },
  { id:7, htf:'D1', atf:'H1', etf:'M5',
    tf1:{ candle:'Strong Bullish Trend Candle',           pa:'D1 strong close. S/R below flipped to support. HH/HL structure unbroken. Long only bias.' },
    tf2:{ candle:'Engulfing — Institution Candle (H1)',    pa:'H1 large body institution candle at flipped S/R level. Minimal wick. Continuation confirmed.' },
    tf3:{ candle:'Pin Bar — Micro OB',                     pa:'M5 pin bar at micro order block. BOS confirmed below it. Entry on M5 candle close.' },
    indicators:'RSI > 50 trending H1\nMACD Bullish H1 confirmed\nVolume surge at breakout\nEMA 20/50 aligned up H1',
    session:'NY Open · 13:00–15:00 GMT', condition:'Strong Uptrend', bias:'🟢 Bullish', news:'✅ News-Free',
    momentum:'ATR Expanding · All TFs aligned', wr:82, avgR:3.8, trades:14, netPL:900 },
  { id:8, htf:'D1', atf:'H1', etf:'M5',
    tf1:{ candle:'Bearish Pin Bar — D1 Resistance',     pa:'D1 extended move up. Major historical resistance. Pin bar = D1 reversal zone. Short bias.' },
    tf2:{ candle:'Double Top — Bearish Engulfing (H1)',  pa:'H1 double top at D1 resistance. Bearish engulfing on second top. Institutional selling.' },
    tf3:{ candle:'FVG Fill + Rejection (Short)',          pa:'M5 fills FVG above HOD (liquidity grab) then reverses. Rejection candle. Short on close.' },
    indicators:'RSI Bearish Divergence H1\nMACD Cross Down H1\nVolume spike on reversal\nEMA flatten + cross down H1',
    session:'London Close · 15:00–17:00 GMT', condition:'Ranging → Reversal', bias:'🔴 Bearish', news:'✅ News-Free',
    momentum:'Divergence · Price HH, momentum LH', wr:80, avgR:3.6, trades:12, netPL:780 },
  { id:9, htf:'D1', atf:'H1', etf:'M15',
    tf1:{ candle:'Bullish Close — OB at Fib 0.5',   pa:'D1 retraced to OB at 50% Fibonacci. Bullish close = premium buy area confirmed. HTF buy zone.' },
    tf2:{ candle:'Liquidity Sweep + Reversal (H1)',  pa:'H1 sweeps lows below range (stop hunt). Strong recovery candle closes back above structure.' },
    tf3:{ candle:'Bullish Engulfing Post-Sweep',     pa:'M15 change of character after H1 liquidity sweep. Engulfing candle confirms long. Entry on close.' },
    indicators:'RSI oversold H1 then recovery\nMACD Bullish Cross M15\nStoch oversold + bounce\nBB Squeeze expanding up',
    session:'London Open · 08:00–10:00 GMT', condition:'Uptrend Pull-back', bias:'🟢 Bullish', news:'✅ News-Free',
    momentum:'Contracting → Expand · Sweep reload', wr:78, avgR:3.4, trades:10, netPL:680 },
  { id:10, htf:'H4', atf:'H1', etf:'M5',
    tf1:{ candle:'Bullish Engulfing — OB (H4)',  pa:'H4 OB formed below. Trend direction up on H4 only. No macro context beyond intraday. Weaker HTF.' },
    tf2:{ candle:'Pin Bar — H4 OB Projection',   pa:'H1 pin bar at H4 OB level projection. Setup signal present. Acceptable but limited structure.' },
    tf3:{ candle:'Bullish Engulfing + BOS',       pa:'M5 BOS after H1 pin. Entry trigger aligned. Note: H4 HTF limits context depth.' },
    indicators:'RSI trending H4\nMACD Cross H1\nVolume average (not surge)\nEMA aligned H4+H1',
    session:'NY Open · 13:00–15:00 GMT', condition:'Trending (Intraday only)', bias:'🟢 Bullish', news:'✅ News-Free',
    momentum:'Moderate · No macro confirmation', wr:68, avgR:2.6, trades:10, netPL:420 },
  { id:11, htf:'D1', atf:'H4', etf:'M5',
    tf1:{ candle:'D1 Trend Candle (valid)',         pa:'D1 trend intact. Context clean. However post-news spike has distorted H4 — must wait to trade.' },
    tf2:{ candle:'H4 FVG — Created by News Spike',  pa:'News created large H4 FVG. H4 candle wicked through levels. Wait for structure to reform.' },
    tf3:{ candle:'M5 FVG Fill + Rejection (Post)',   pa:'After 20–30 min: M5 fills the news-spike FVG at H4 level. Rejection candle = entry.' },
    indicators:'RSI extreme post-news\nMACD: wait to settle\nVolume spike then normalize\nATR spiked — widen stop',
    session:'NY Open · 13:00–15:00 GMT', condition:'Post-News Spike', bias:'🟢 Bullish', news:'📰 Post-News (20–30m wait)',
    momentum:'Spike → Normalize · Trade after only', wr:74, avgR:3.1, trades:10, netPL:560 },
  { id:12, htf:'D1', atf:'30M', etf:'M5',
    tf1:{ candle:'D1 Bullish Trend (valid)',    pa:'D1 context clean. Trend intact. However 30M as ATF severely degrades setup quality.' },
    tf2:{ candle:'30M Mixed / Noisy Patterns',  pa:'30M structure ambiguous. False pin bars. S/R levels broken frequently. ATF clarity is gone.' },
    tf3:{ candle:'M5 Entry Conflicted',          pa:'ETF entries distorted by poor ATF. False BOS signals. Stop hunts from 30M noise bleed through.' },
    indicators:'RSI erratic 30M noise\nMACD false crosses 30M\nVolume unreliable 30M\nEMA flat / mixed 30M',
    session:'London/NY Overlap · 15:00–17:00 GMT', condition:'Ranging', bias:'🟡 Mixed', news:'✅ News-Free',
    momentum:'Weak · 30M ATF degrades signal', wr:50, avgR:1.4, trades:8, netPL:120 },
  { id:13, htf:'D1', atf:'H4', etf:'M5',
    tf1:{ candle:'D1 Trend — Distorted by News',  pa:'D1 structure technically valid. BUT: during active news all TF structure is invalidated. Do not trade.' },
    tf2:{ candle:'H4 Massive News Wick',           pa:'H4 candle shows extreme spike wick. Levels breached and recovered. Structure unreadable.' },
    tf3:{ candle:'M5 Chaotic — No Pattern',        pa:'M5 is stop-running noise during news. No candle pattern is meaningful. Spread widens 5–10×.' },
    indicators:'All indicators: meaningless\nMACD: whipsaw during news\nVolume: extreme, no edge\nRSI: ignore entirely',
    session:'NY Open · During News Release', condition:'During Active News', bias:'🟡 Unknown', news:'🚫 ACTIVE NEWS — DO NOT TRADE',
    momentum:'Unpredictable · Zero edge', wr:28, avgR:-0.6, trades:4, netPL:-280 },
  { id:14, htf:'D1', atf:'H4', etf:'M15',
    tf1:{ candle:'D1 At Range Boundary (No Trend)',  pa:'D1 in range. No trend bias. Price at HTF support boundary. Range fade setup only.' },
    tf2:{ candle:'H4 OB — Range Edge Compression',   pa:'H4 confirms OB at range boundary. Compression / inside bar. Range boundary holding.' },
    tf3:{ candle:'M15 Pin Bar — Range Extreme',       pa:'M15 pin bar at range low. Rejection candle. Range fade entry. Target: opposite boundary.' },
    indicators:'Stoch oversold at range low\nBB at extreme (range)\nRSI extreme at boundary\nEMA flat (ranging)',
    session:'Asian Session · 00:00–07:00 GMT', condition:'Ranging', bias:'🟡 Neutral', news:'✅ News-Free',
    momentum:'Low ATR · Range trade only', wr:68, avgR:2.4, trades:10, netPL:420 },
  { id:15, htf:'H4', atf:'30M', etf:'M1',
    tf1:{ candle:'H4 Engulfing (Weak HTF)',        pa:'H4 as HTF = no macro context. Bias shifts intraday. No institutional backing at this level.' },
    tf2:{ candle:'30M False Patterns — No Edge',   pa:'30M patterns: 42–50% WR alone. Coin-flip ATF. No reliable structure. Avoid.' },
    tf3:{ candle:'M1 Noise Candles — No Pattern',  pa:'M1 dominated by spread noise. No institutional footprint. Every candle is effectively random.' },
    indicators:'RSI: false signals M1\nMACD: whipsaw M1\nVolume: unreliable M1\nEMA: lagging, useless M1',
    session:'Asian / Dead Zone · 20:00–23:00 GMT', condition:'Choppy / Volatile', bias:'🔴 Bearish', news:'📰 Near News',
    momentum:'Erratic · No predictability', wr:33, avgR:0.4, trades:6, netPL:-160 },
];

const roleC: Record<string, string> = { W1:C.htf, D1:C.htf, H4:C.atf, H1:C.atf, '30M':C.warn, M5:C.etf, M15:C.etf, M1:C.loss };

const TFCell = ({ data, color }: { data: TFData; color: string }) => (
  <td style={{ padding:'11px 14px', verticalAlign:'top', borderRight:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, minWidth:220, width:220 }}>
    <div style={{ fontFamily:MONO, fontSize:10, fontWeight:500, color, lineHeight:1.3, marginBottom:6, letterSpacing:'0.08em', textTransform:'uppercase', opacity:0.9 }}>{data.candle}</div>
    <div style={{ fontFamily:SANS, fontSize:11, fontWeight:400, color:C.text, lineHeight:1.65 }}>{data.pa}</div>
  </td>
);

const IndCell = ({ value }: { value: string }) => (
  <td style={{ padding:'11px 14px', verticalAlign:'top', borderRight:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, minWidth:190, width:190, borderLeft:`1px solid ${C.sep}` }}>
    {value.split('\n').map((line, i) => (
      <div key={i} style={{ fontFamily: i===0 ? MONO : SANS, fontSize:11, lineHeight:1.55, marginBottom:4, color: i===0 ? C.strong : C.text, fontWeight: i===0 ? 500 : 400, letterSpacing: i===0 ? '0.06em' : '0' }}>{line}</div>
    ))}
  </td>
);

const CtxCell = ({ value, id, w }: { value: string; id: string; w: number }) => {
  const lines = (value || '—').split(' · ');
  const l0 = lines[0];
  let col = C.strong;
  if (id==='bia') col = l0.includes('🟢') ? C.win : l0.includes('🔴') ? C.loss : C.warn;
  if (id==='nws') col = l0.includes('🚫') ? C.loss : l0.includes('📰') ? C.warn : C.win;
  if (id==='cnd') col = l0.includes('Uptrend')||l0.includes('Breakout') ? C.win : l0.includes('Downtrend')||l0.includes('News')||l0.includes('Chop') ? C.loss : C.warn;
  return (
    <td style={{ padding:'11px 14px', verticalAlign:'top', borderRight:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, minWidth:w, width:w, maxWidth:w }}>
      <div style={{ fontFamily:MONO, fontSize:10, fontWeight:500, color:col, lineHeight:1.5, marginBottom:lines[1]?4:0, wordBreak:'break-word', whiteSpace:'normal', letterSpacing:'0.05em' }}>{l0}</div>
      {lines[1] && <div style={{ fontFamily:SANS, fontSize:10, fontWeight:400, color:C.sub, lineHeight:1.5, wordBreak:'break-word', whiteSpace:'normal' }}>{lines[1]}</div>}
    </td>
  );
};

const MomCell = ({ value }: { value: string }) => {
  const [main, sub] = value.split(' · ');
  return (
    <td style={{ padding:'11px 14px', verticalAlign:'top', borderRight:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, minWidth:160, width:160, maxWidth:160 }}>
      <div style={{ fontFamily:MONO, fontSize:10, fontWeight:500, color:C.strong, lineHeight:1.5, marginBottom:sub?4:0, wordBreak:'break-word', whiteSpace:'normal', letterSpacing:'0.05em' }}>{main}</div>
      {sub && <div style={{ fontFamily:SANS, fontSize:10, fontWeight:400, color:C.sub, lineHeight:1.5, wordBreak:'break-word', whiteSpace:'normal' }}>{sub}</div>}
    </td>
  );
};

const SampleSizeCell = ({ trades, wr }: { trades: number; wr: number }) => {
  const wins = Math.round(trades * wr / 100);
  return (
    <td style={{ padding:'11px 14px', verticalAlign:'middle', borderRight:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, minWidth:120, width:120, textAlign:'center' }}>
      <div style={{ fontFamily:MONO, fontSize:11, fontWeight:500, color:C.strong, lineHeight:1, marginBottom:6, letterSpacing:'0.04em' }}>{trades}</div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, marginBottom:5 }}>
        <span style={{ fontFamily:MONO, fontSize:9, fontWeight:500, color:C.win }}>{wins}W</span>
        <span style={{ fontFamily:MONO, fontSize:9, fontWeight:400, color:C.sub }}>/</span>
        <span style={{ fontFamily:MONO, fontSize:9, fontWeight:500, color:C.loss }}>{trades - wins}L</span>
      </div>
      <div style={{ height:2, borderRadius:99, background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
        <div style={{ width:`${wr}%`, height:'100%', background:`linear-gradient(90deg, ${C.win}, ${C.win}99)`, borderRadius:99 }} />
      </div>
    </td>
  );
};

const PerfCell = ({ row }: { row: Row }) => (
  <td style={{ padding:'13px 16px', verticalAlign:'middle', borderBottom:`1px solid ${C.border}`, background:wrBg(row.wr), borderLeft:`1px solid ${wrC(row.wr)}25`, minWidth:150, width:150 }}>
    <div style={{ fontFamily:MONO, fontSize:11, fontWeight:500, color:wrC(row.wr), lineHeight:1, marginBottom:7, letterSpacing:'0.04em' }}>{row.wr}%</div>
    <div style={{ height:2, borderRadius:99, background:'rgba(255,255,255,0.05)', overflow:'hidden', marginBottom:9 }}>
      <div style={{ width:`${row.wr}%`, height:'100%', background:wrC(row.wr), borderRadius:99 }} />
    </div>
    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
      <span style={{ fontFamily:MONO, fontSize:8, fontWeight:400, color:C.dim, textTransform:'uppercase', letterSpacing:'0.14em', flexShrink:0 }}>AVG R</span>
      <span style={{ fontFamily:MONO, fontSize:11, fontWeight:500, color:row.avgR>=3?'#60a5fa':C.muted }}>{row.avgR>0?'+':''}{row.avgR}R</span>
    </div>
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ fontFamily:MONO, fontSize:8, fontWeight:400, color:C.dim, textTransform:'uppercase', letterSpacing:'0.14em', flexShrink:0 }}>P/L</span>
      <span style={{ fontFamily:MONO, fontSize:11, fontWeight:500, color:row.netPL>=0?C.win:C.loss }}>{row.netPL>=0?'+':''}${row.netPL.toLocaleString()}</span>
    </div>
  </td>
);

const MatrixRow = ({ row }: { row: Row }) => {
  const isElite = row.wr >= 85;
  const isWeak  = row.wr < 50;
  return (
    <tr style={{ transition:'background 0.12s' }}>
      <td style={{ minWidth:148, width:148, padding:'11px 13px', background: isElite ? 'rgba(192,132,252,0.03)' : isWeak ? 'rgba(244,63,94,0.03)' : C.surface, borderRight:`1px solid ${C.sep}`, borderBottom:`1px solid ${C.border}`, verticalAlign:'middle' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {[row.htf, row.atf, row.etf].map((tf, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontFamily:MONO, fontSize:11, fontWeight:500, color:roleC[tf]||C.sub, background:(roleC[tf]||C.sub)+'14', border:`1px solid ${(roleC[tf]||C.sub)}22`, padding:'2px 8px', borderRadius:2, letterSpacing:'0.1em' }}>{tf}</span>
              <span style={{ fontFamily:MONO, fontSize:7, fontWeight:400, color:C.dim, textTransform:'uppercase', letterSpacing:'0.14em' }}>{i===0?'HTF':i===1?'ATF':'ETF'}</span>
            </div>
          ))}
        </div>
        {(isElite || isWeak) && (
          <div style={{ marginTop:7, fontFamily:MONO, fontSize:7, fontWeight:400, letterSpacing:'0.16em', textTransform:'uppercase', color: isElite?C.win:C.loss, borderTop:`1px solid ${isElite?C.win+'18':C.loss+'18'}`, paddingTop:5 }}>
            {isElite ? '★ ELITE' : '✗ AVOID'}
          </div>
        )}
      </td>
      <TFCell data={row.tf1} color={C.htf} />
      <TFCell data={row.tf2} color={C.atf} />
      <TFCell data={row.tf3} color={C.etf} />
      <IndCell value={row.indicators} />
      <CtxCell value={row.session}   id="ses" w={145} />
      <CtxCell value={row.condition} id="cnd" w={170} />
      <CtxCell value={row.bias}      id="bia" w={110} />
      <CtxCell value={row.news}      id="nws" w={195} />
      <MomCell value={row.momentum} />
      <SampleSizeCell trades={row.trades} wr={row.wr} />
      <PerfCell row={row} />
    </tr>
  );
};

const MobileCard = ({ row }: { row: Row }) => {
  const [expanded, setExpanded] = useState(false);
  const isElite = row.wr >= 85;
  const isWeak  = row.wr < 50;
  const biasL0  = (row.bias||'').split(' · ')[0];
  const newsL0  = (row.news||'').split(' · ')[0];
  const condL0  = (row.condition||'').split(' · ')[0];
  const [momMain, momSub] = row.momentum.split(' · ');
  const biasCol = biasL0.includes('🟢') ? C.win : biasL0.includes('🔴') ? C.loss : C.warn;
  const newsCol = newsL0.includes('🚫') ? C.loss : newsL0.includes('📰') ? C.warn : C.win;
  const condCol = condL0.includes('Uptrend')||condL0.includes('Breakout') ? C.win : condL0.includes('Downtrend')||condL0.includes('News')||condL0.includes('Chop') ? C.loss : C.warn;

  return (
    <div style={{ margin:'0 10px 8px', background: isElite?'rgba(192,132,252,0.03)':isWeak?'rgba(244,63,94,0.03)':C.surface, border:`1px solid ${isElite?C.win+'28':isWeak?C.loss+'28':C.border}`, borderRadius:6, overflow:'hidden' }}>
      <div onClick={() => setExpanded(e => !e)} style={{ padding:'13px', cursor:'pointer', userSelect:'none' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap', flex:1, marginRight:12 }}>
            {[{tf:row.htf,role:'HTF'},{tf:row.atf,role:'ATF'},{tf:row.etf,role:'ETF'}].map(({tf,role}) => (
              <div key={role} style={{ display:'flex', alignItems:'center', gap:3 }}>
                <span style={{ fontFamily:MONO, fontSize:12, fontWeight:500, color:roleC[tf]||C.sub, background:(roleC[tf]||C.sub)+'14', border:`1px solid ${(roleC[tf]||C.sub)}22`, padding:'2px 7px', borderRadius:2, letterSpacing:'0.1em' }}>{tf}</span>
                <span style={{ fontFamily:MONO, fontSize:7, fontWeight:400, color:C.dim, textTransform:'uppercase', letterSpacing:'0.1em' }}>{role}</span>
              </div>
            ))}
            {(isElite||isWeak) && (
              <span style={{ fontFamily:MONO, fontSize:7, fontWeight:400, letterSpacing:'0.14em', textTransform:'uppercase', color:isElite?C.win:C.loss, background:isElite?C.win+'12':C.loss+'12', border:`1px solid ${isElite?C.win:C.loss}25`, padding:'2px 7px', borderRadius:2 }}>
                {isElite?'★ ELITE':'✗ AVOID'}
              </span>
            )}
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
            <span style={{ fontFamily:MONO, fontSize:11, fontWeight:500, color:wrC(row.wr), lineHeight:1, letterSpacing:'0.02em' }}>{row.wr}%</span>
            <div style={{ width:54, height:2, borderRadius:99, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
              <div style={{ width:`${row.wr}%`, height:'100%', background:wrC(row.wr), borderRadius:99 }} />
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:20, marginBottom:10 }}>
          {[
            { label:'AVG R',   value:`${row.avgR>0?'+':''}${row.avgR}R`,                                          color: row.avgR>=3?'#60a5fa':C.muted },
            { label:'NET P/L', value:`${row.netPL>=0?'+':''}$${row.netPL.toLocaleString()}`,                      color: row.netPL>=0?C.win:C.loss },
            { label:'SAMPLE',  value:`${row.trades} · ${Math.round(row.trades*row.wr/100)}W/${row.trades-Math.round(row.trades*row.wr/100)}L`, color: C.strong },
          ].map(({label,value,color}) => (
            <div key={label}>
              <div style={{ fontFamily:MONO, fontSize:8, fontWeight:400, color:C.dim, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:2 }}>{label}</div>
              <div style={{ fontFamily:MONO, fontSize:11, fontWeight:500, color, letterSpacing:'-0.01em' }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
          {[{text:biasL0,color:biasCol},{text:condL0,color:condCol},{text:newsL0,color:newsCol}].map(({text,color}) => (
            <span key={text} style={{ fontFamily:MONO, fontSize:9, fontWeight:400, color, background:color+'12', border:`1px solid ${color}25`, padding:'3px 9px', borderRadius:2, letterSpacing:'0.06em' }}>{text}</span>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:SANS, fontSize:10, fontWeight:400, color:C.muted }}>{row.session}</span>
          <span style={{ fontFamily:MONO, fontSize:9, fontWeight:400, color:'#6366f1', letterSpacing:'0.1em' }}>{expanded?'▲ LESS':'▼ MORE'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop:`1px solid ${C.sep}` }}>
          {[{label:'HTF',tf:row.htf,color:C.htf,data:row.tf1},{label:'ATF',tf:row.atf,color:C.atf,data:row.tf2},{label:'ETF',tf:row.etf,color:C.etf,data:row.tf3}].map(({label,tf,color,data}) => (
            <div key={label} style={{ padding:'11px 14px', borderBottom:`1px solid ${C.border}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:5 }}>
                <span style={{ fontFamily:MONO, fontSize:10, fontWeight:500, color, background:color+'14', border:`1px solid ${color}22`, padding:'1px 6px', borderRadius:2, letterSpacing:'0.1em' }}>{tf}</span>
                <span style={{ fontFamily:MONO, fontSize:7, fontWeight:400, color:C.dim, textTransform:'uppercase', letterSpacing:'0.12em' }}>{label}</span>
                <span style={{ fontFamily:MONO, fontSize:10, fontWeight:500, color, letterSpacing:'0.05em', textTransform:'uppercase' }}>{data.candle}</span>
              </div>
              <p style={{ fontFamily:SANS, fontSize:12, fontWeight:400, color:C.text, lineHeight:1.65, margin:0 }}>{data.pa}</p>
            </div>
          ))}
          <div style={{ padding:'11px 14px', borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontFamily:MONO, fontSize:8, fontWeight:400, color:C.ind, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:6 }}>● INDICATORS</div>
            {row.indicators.split('\n').map((line, i) => (
              <div key={i} style={{ fontFamily: i===0?MONO:SANS, fontSize:11, fontWeight:i===0?500:400, color:i===0?C.strong:C.text, lineHeight:1.55, marginBottom:3 }}>{line}</div>
            ))}
          </div>
          <div style={{ padding:'11px 14px', borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontFamily:MONO, fontSize:8, fontWeight:400, color:C.ctx, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:5 }}>● MOMENTUM</div>
            <div style={{ fontFamily:MONO, fontSize:13, fontWeight:500, color:C.strong, letterSpacing:'0.03em' }}>{momMain}</div>
            {momSub && <div style={{ fontFamily:SANS, fontSize:11, fontWeight:400, color:C.sub, marginTop:2 }}>{momSub}</div>}
          </div>
          <div style={{ padding:'11px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 16px' }}>
            <div>
              <div style={{ fontFamily:MONO, fontSize:8, fontWeight:400, color:C.dim, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:3 }}>Session</div>
              <div style={{ fontFamily:SANS, fontSize:11, fontWeight:400, color:C.muted, lineHeight:1.55 }}>{row.session.replace(' · ', '\n')}</div>
            </div>
            <div>
              <div style={{ fontFamily:MONO, fontSize:8, fontWeight:400, color:C.dim, textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:3 }}>Condition</div>
              <div style={{ fontFamily:MONO, fontSize:11, fontWeight:500, color:condCol, lineHeight:1.55 }}>{condL0}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InsightsPanel = ({ isMobile }: { isMobile: boolean }) => (
  <div style={{ padding: isMobile ? '0 10px 28px' : '0 20px 28px', display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap:10 }}>
    {[
      { color:C.win,  title:'★ Highest Probability Pattern',
        lines:['HTF: Engulfing or Pin Bar closing at/above key S/R level','ATF: Double Bottom / OB Respected / FVG / Institution Candle','ETF: BOS or FVG Fill + Rejection Candle on M5 or M15','Indicators: Volume surge + RSI extreme confirming ATF','London or NY Open · No news · ATR Expanding'] },
      { color:C.atf,  title:'📐 TF-by-TF Alignment Rule',
        lines:['HTF: must show clear directional bias at a key level','ATF: must confirm that bias with structure (OB/FVG/double)','ETF: must show precise trigger candle in the same direction','All three TFs must tell the same story — or skip','One contradicting TF = reduce size or wait'] },
      { color:C.warn, title:'⚠ What Destroys Win Rate',
        lines:['30M as ATF: structure becomes noise, WR drops ~20%','M1 as ETF: no institutional footprint, coin-flip entries','During news: all patterns and levels completely invalidated','Dead zone session: spread destroys every edge','H4 as HTF: no macro context, bias shifts too frequently'] },
    ].map((c, i) => (
      <div key={i} style={{ background:c.color+'06', border:`1px solid ${c.color}18`, borderRadius:4, padding:'14px 16px' }}>
        <div style={{ fontFamily:MONO, fontSize:9, fontWeight:400, color:c.color, letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:11 }}>{c.title}</div>
        {c.lines.map((line, j) => (
          <div key={j} style={{ display:'flex', gap:8, marginBottom:7 }}>
            <span style={{ color:c.color, fontWeight:400, fontSize:10, flexShrink:0, marginTop:1 }}>→</span>
            <span style={{ fontFamily:SANS, fontSize:11, fontWeight:400, color:C.muted, lineHeight:1.5 }}>{line}</span>
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
  const [isMobile, setMobile] = useState(false);

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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

  return (
    <div style={{ minHeight:'100%', background:C.bg, color:C.text, margin: '-14px -16px' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Syne:wght@400;500;600;700&display=swap');
        ::-webkit-scrollbar { width:3px; height:5px; }
        ::-webkit-scrollbar-track { background:#030a14; }
        ::-webkit-scrollbar-thumb { background:#112030; border-radius:4px; }
        .tfm-fadein { animation:tfmfi .18s ease; }
        @keyframes tfmfi { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        .tfm-table tbody tr:hover td { background:rgba(148,200,255,0.015) !important; }
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
              return (
                <button key={p.n} onClick={() => setPage(p.n)} style={{ display:'flex', alignItems:'center', gap: isMobile?0:8, padding: isMobile?'0 14px':'0 18px', background:'transparent', borderBottom: active ? '1px solid rgba(148,200,255,0.5)' : '1px solid transparent', borderTop:'none', borderLeft:'none', borderRight:'none', cursor:'pointer', transition:'all .15s' }}>
                  <span style={{ fontFamily:MONO, fontSize:11, fontWeight:active?500:400, color:active?'#cbd5e1':'rgba(148,200,255,0.28)', letterSpacing:'0.1em', textTransform:'uppercase', transition:'color .15s' }}>{p.label}</span>
                  {!isMobile && <span style={{ fontFamily:MONO, fontSize:9, color:active?'rgba(148,200,255,0.35)':'rgba(148,200,255,0.14)', letterSpacing:'0.08em', transition:'color .15s' }}>{p.sub}</span>}
                </button>
              );
            })}
          </div>
          {!isMobile && (
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              {[{c:C.htf,l:'HTF'},{c:C.atf,l:'ATF'},{c:C.etf,l:'ETF'}, null as null, {c:C.win,l:'≥80%'},{c:C.warn,l:'62–79%'},{c:C.loss,l:'<62%'}].map((x, i) =>
                x === null ? <div key={i} style={{ width:1, height:14, background:'rgba(148,200,255,0.08)' }} /> : (
                  <div key={x.l} style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:5, height:5, borderRadius:1, background:x.c }} />
                    <span style={{ fontFamily:MONO, fontSize:9, color:'rgba(148,200,255,0.32)', letterSpacing:'0.08em' }}>{x.l}</span>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {isMobile && (
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'5px 16px', borderBottom:'1px solid rgba(148,200,255,0.05)', background:'rgba(2,6,14,0.6)' }}>
          {[{dot:C.htf,l:'HTF'},{dot:C.atf,l:'ATF'},{dot:C.etf,l:'ETF'},{dot:C.win,l:'≥80%'},{dot:C.warn,l:'62–79%'},{dot:C.loss,l:'<62%'}].map(x => (
            <div key={x.l} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:5, height:5, borderRadius:1, background:x.dot }} />
              <span style={{ fontFamily:MONO, fontSize:9, color:'rgba(148,200,255,0.3)', letterSpacing:'0.08em' }}>{x.l}</span>
            </div>
          ))}
        </div>
      )}

      <div className="tfm-fadein" key={`${page}-${isMobile}`} style={{ paddingBottom:28 }}>
        {isMobile ? (
          <div style={{ paddingTop:10 }}>
            {rows.map(row => <MobileCard key={row.id} row={row} />)}
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table className="tfm-table" style={{ borderCollapse:'separate', borderSpacing:0 }}>
              <thead>
                <tr>
                  <th style={{ background:C.panel, width:148, minWidth:148, padding:'12px 13px', borderRight:`1px solid ${C.sep}`, borderBottom:`1px solid ${C.sep}`, textAlign:'left', verticalAlign:'bottom' }}>
                    <span style={{ fontFamily:MONO, fontSize:8, fontWeight:400, color:C.sub, letterSpacing:'0.18em', textTransform:'uppercase' }}>MTF Combo</span>
                    <div style={{ fontFamily:MONO, fontSize:7, fontWeight:400, color:C.dim, marginTop:2, letterSpacing:'0.1em' }}>HTF → ATF → ETF</div>
                  </th>
                  {GROUPS.map((g, i) => (
                    <th key={i} style={{ padding:'12px 14px', textAlign:'left', verticalAlign:'bottom', background:g.color+'09', borderBottom:`1px solid ${C.sep}`, borderLeft: g.leftBorder ? `1px solid ${C.sep}` : undefined, borderRight:`1px solid ${C.border}`, width: i<=2?220:i===3?190:i===4?145:i===5?170:i===6?110:i===7?195:i===8?160:i===9?110:150, minWidth: i<=2?220:i===3?190:i===4?145:i===5?170:i===6?110:i===7?195:i===8?160:i===9?110:150 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                        <div style={{ width:4, height:4, borderRadius:'50%', background:g.color, flexShrink:0 }} />
                        <span style={{ fontFamily:MONO, fontSize:9, fontWeight:400, color:g.color, letterSpacing:'0.16em', textTransform:'uppercase' }}>{g.label}</span>
                      </div>
                      <div style={{ fontFamily:SANS, fontSize:9, fontWeight:400, color:C.dim, paddingLeft:10 }}>{g.sub}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => <MatrixRow key={row.id} row={row} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {page === 2 && <InsightsPanel isMobile={isMobile} />}
    </div>
  );
}
