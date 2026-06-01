import { useState } from 'react';

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function seededRand(seed: number) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 4294967296;
  };
}

interface DayData { trades: number; pnl: number; winPct: number; }

function getTradeData(year: number, month: number): Record<number, DayData> {
  const seed = year * 100 + month;
  const rand = seededRand(seed);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const data: Record<number, DayData> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow === 0 || dow === 6) continue;
    if (rand() > 0.55) continue;
    const trades = Math.floor(rand() * 8) + 1;
    const isWin = rand() > 0.3;
    const pnl = isWin ? (rand() * 1800 + 150) : -(rand() * 600 + 50);
    const winPct = isWin ? Math.floor(rand() * 35) + 60 : Math.floor(rand() * 40) + 10;
    data[d] = { trades, pnl: Math.round(pnl * 100) / 100, winPct };
  }
  return data;
}

function fmtPnl(n: number) {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n >= 0 ? '+$' : '-$') + abs;
}

export function TradingCalendar({ dm }: { dm: boolean }) {
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [jumpVal, setJumpVal] = useState('');

  const data = getTradeData(currentYear, currentMonth);
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const isCurrentMonth = now.getFullYear() === currentYear && now.getMonth() === currentMonth;

  let totalPnl = 0, winDays = 0, lossDays = 0, totalTrades = 0, activeDays = 0;
  let totalWin = 0, winCount = 0, totalLoss = 0, lossCount = 0;
  Object.values(data).forEach(v => {
    totalPnl += v.pnl; totalTrades += v.trades; activeDays++;
    if (v.pnl >= 0) { winDays++; totalWin += v.pnl; winCount++; }
    else { lossDays++; totalLoss += Math.abs(v.pnl); lossCount++; }
  });
  const wr = activeDays > 0 ? Math.round(winDays / activeDays * 100) : null;
  const ratio = winCount > 0 && lossCount > 0 ? (totalWin / winCount / (totalLoss / lossCount)).toFixed(2) : '—';

  function prev() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  }
  function next() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  }
  function handleJump(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const parts = jumpVal.trim().match(/([A-Za-z]+)\s*(\d{4})/);
    if (!parts) return;
    const mIdx = MONTHS_SHORT.findIndex(m => m.toLowerCase() === parts[1].toLowerCase().slice(0, 3));
    if (mIdx < 0) return;
    setCurrentMonth(mIdx);
    setCurrentYear(parseInt(parts[2]));
    setJumpVal('');
  }

  const calCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calCells.push(d);

  const tc = dm ? {
    bg: '#0d1117', border: '#1e2a38', headerBg: '#0d1117',
    titleLabel: '#3a5a7a', titleText: '#c8d8e8',
    btnBg: '#131b26', btnBorder: '#1e2a38', btnColor: '#6a8aaa',
    btnHoverBg: '#1e2a38', btnHoverColor: '#c8d8e8',
    selBg: '#131b26', selColor: '#c8d8e8',
    searchBg: '#131b26', searchColor: '#6a8aaa', searchPlaceholder: '#2a3a4a',
    badgeBg: '#131b26', badgeBorder: '#1a5276', badgeColor: '#3b82f6',
    statLabelColor: '#3a5a7a', statSubColor: '#3a5a7a', dayHdrColor: '#3a5a7a',
    cellDateColor: '#3a5a7a', cellMetaColor: '#3a5a7a',
    winCellBg: 'rgba(22,163,74,0.07)', winCellHover: 'rgba(22,163,74,0.14)',
    lossCellBg: 'rgba(220,38,38,0.07)', lossCellHover: 'rgba(220,38,38,0.14)',
    todayOutline: '#1a5276', winPnlColor: '#22d3a5', lossPnlColor: '#f4617f',
    winBarColor: '#22d3a5', lossBarColor: '#f4617f',
    winStatColor: '#22d3a5', tradeStatColor: '#3b82f6', ratioStatColor: '#4a6580',
  } : {
    bg: '#ffffff', border: '#e2e8f0', headerBg: '#f8fafc',
    titleLabel: '#94a3b8', titleText: '#0f172a',
    btnBg: '#f1f5f9', btnBorder: '#e2e8f0', btnColor: '#475569',
    btnHoverBg: '#e2e8f0', btnHoverColor: '#0f172a',
    selBg: '#f1f5f9', selColor: '#0f172a',
    searchBg: '#f1f5f9', searchColor: '#475569', searchPlaceholder: '#cbd5e1',
    badgeBg: '#eff6ff', badgeBorder: '#93c5fd', badgeColor: '#2563eb',
    statLabelColor: '#94a3b8', statSubColor: '#94a3b8', dayHdrColor: '#94a3b8',
    cellDateColor: '#94a3b8', cellMetaColor: '#94a3b8',
    winCellBg: 'rgba(22,163,74,0.06)', winCellHover: 'rgba(22,163,74,0.12)',
    lossCellBg: 'rgba(220,38,38,0.05)', lossCellHover: 'rgba(220,38,38,0.1)',
    todayOutline: '#93c5fd', winPnlColor: '#16a34a', lossPnlColor: '#dc2626',
    winBarColor: '#16a34a', lossBarColor: '#dc2626',
    winStatColor: '#16a34a', tradeStatColor: '#2563eb', ratioStatColor: '#64748b',
  };

  return (
    <div style={{ background: tc.bg, borderRadius: 12, overflow: 'hidden', fontFamily: "'Courier New', monospace", color: tc.titleText, border: `1px solid ${tc.border}` }}>
      <style>{`
        .tc-btn{background:${tc.btnBg};border:1px solid ${tc.btnBorder};border-radius:4px;color:${tc.btnColor};cursor:pointer;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;transition:background 0.15s;flex-shrink:0}
        .tc-btn:hover{background:${tc.btnHoverBg};color:${tc.btnHoverColor}}
        .tc-sel{background:${tc.selBg};border:1px solid ${tc.border};border-radius:4px;color:${tc.selColor};font-size:11px;padding:4px 8px;font-family:inherit;cursor:pointer;height:28px;letter-spacing:0.06em}
        .tc-search{background:${tc.searchBg};border:1px solid ${tc.border};border-radius:4px;color:${tc.searchColor};font-size:10px;padding:4px 10px;font-family:inherit;height:28px;width:90px;letter-spacing:0.04em;outline:none}
        .tc-search::placeholder{color:${tc.searchPlaceholder}}
        .tc-cell-base{min-height:80px;border-right:1px solid ${tc.border};border-bottom:1px solid ${tc.border};padding:6px 8px;position:relative;box-sizing:border-box;transition:background 0.12s}
        .tc-cell-win{background:${tc.winCellBg};cursor:pointer}.tc-cell-win:hover{background:${tc.winCellHover}}
        .tc-cell-loss{background:${tc.lossCellBg};cursor:pointer}.tc-cell-loss:hover{background:${tc.lossCellHover}}
        .tc-cell-empty{background:transparent}
        .tc-today{outline:1px solid ${tc.todayOutline};outline-offset:-1px}
        @media(max-width:640px){
          .tc-cell-base{min-height:52px;padding:4px}
          .tc-controls-wrap{flex-direction:column;align-items:flex-start !important}
          .tc-jump-badge{display:none !important}
          .tc-stats-grid{grid-template-columns:1fr 1fr !important}
          .tc-stat-item:nth-child(2){border-right:none !important}
          .tc-stat-item:nth-child(3){border-top:1px solid ${tc.border}}
          .tc-stat-item:nth-child(4){border-top:1px solid ${tc.border};border-right:none !important}
        }
        @media(max-width:400px){
          .tc-sel-year{display:none}
          .tc-cell-pnl-text{font-size:11px !important}
          .tc-cell-meta-text{display:none}
        }
      `}</style>

      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${tc.border}`, background: tc.headerBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.18em', color: tc.titleLabel, textTransform: 'uppercase', marginBottom: 2 }}>Performance Overview</div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.08em', color: tc.titleText, textTransform: 'uppercase' }}>Trading_Calendar</div>
        </div>
        <div className="tc-controls-wrap" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button className="tc-btn" onClick={prev}>&#8592;</button>
          <select className="tc-sel" value={currentMonth} onChange={e => setCurrentMonth(parseInt(e.target.value))}>
            {MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select className="tc-sel tc-sel-year" value={currentYear} onChange={e => setCurrentYear(parseInt(e.target.value))}>
            {Array.from({ length: 11 }, (_, i) => 2020 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="tc-btn" onClick={next}>&#8594;</button>
          <input className="tc-search" type="text" placeholder="e.g. Mar 2025" value={jumpVal} onChange={e => setJumpVal(e.target.value)} onKeyDown={handleJump} />
          <div className="tc-jump-badge" style={{ background: tc.badgeBg, border: `1px solid ${tc.badgeBorder}`, borderRadius: 4, color: tc.badgeColor, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', padding: '4px 10px', whiteSpace: 'nowrap', height: 28, display: 'flex', alignItems: 'center' }}>
            &#9632; {MONTHS_SHORT[currentMonth].toUpperCase()} {currentYear}
          </div>
        </div>
      </div>

      <div className="tc-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: `1px solid ${tc.border}` }}>
        {([
          { label: 'Net P&L', value: activeDays > 0 ? fmtPnl(Math.round(totalPnl * 100) / 100) : '—', sub: activeDays > 0 ? `${winDays}W / ${lossDays}L` : 'No trades', color: tc.winStatColor },
          { label: 'Win Rate', value: wr !== null ? `${wr}%` : '—', sub: activeDays > 0 ? `${winDays} profit day${winDays !== 1 ? 's' : ''}` : 'No data', color: tc.winStatColor },
          { label: 'Total Trades', value: activeDays > 0 ? String(totalTrades) : '—', sub: 'All active days', color: tc.tradeStatColor },
          { label: 'W/L Ratio', value: ratio, sub: 'Avg win ÷ avg loss', color: tc.ratioStatColor },
        ]).map((s, i) => (
          <div className="tc-stat-item" key={i} style={{ padding: '12px 14px', borderRight: i < 3 ? `1px solid ${tc.border}` : 'none' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.15em', color: tc.statLabelColor, textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 'clamp(14px,2.5vw,22px)', fontWeight: 700, color: s.color, letterSpacing: '0.02em' }}>{s.value}</div>
            <div style={{ fontSize: 10, color: tc.statSubColor, marginTop: 2, letterSpacing: '0.04em' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: `1px solid ${tc.border}`, background: tc.headerBg }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
          <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 10, letterSpacing: '0.1em', color: tc.dayHdrColor, textTransform: 'uppercase', borderRight: i < 6 ? `1px solid ${tc.border}` : 'none' }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {calCells.map((d, i) => {
          const td = d ? data[d] : null;
          const isToday = isCurrentMonth && d === now.getDate();
          const colClass = !d ? 'tc-cell-empty' : td ? (td.pnl >= 0 ? 'tc-cell-win' : 'tc-cell-loss') : '';
          const todayClass = isToday ? ' tc-today' : '';
          const borderRight = (i + 1) % 7 === 0 ? 'none' : `1px solid ${tc.border}`;
          return (
            <div key={i} className={`tc-cell-base ${colClass}${todayClass}`} style={{ borderRight }}>
              {d && <div style={{ fontSize: 11, color: tc.cellDateColor, letterSpacing: '0.04em' }}>{String(d).padStart(2, '0')}</div>}
              {td && <>
                <div className="tc-cell-pnl-text" style={{ fontSize: 'clamp(11px,1.3vw,15px)', fontWeight: 700, marginTop: 10, letterSpacing: '0.02em', color: td.pnl >= 0 ? tc.winPnlColor : tc.lossPnlColor }}>{fmtPnl(td.pnl)}</div>
                <div className="tc-cell-meta-text" style={{ fontSize: 9, color: tc.cellMetaColor, marginTop: 2, letterSpacing: '0.04em' }}>{td.trades}T · {td.winPct}%W</div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: td.pnl >= 0 ? tc.winBarColor : tc.lossBarColor }} />
              </>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PerformanceInsights({ dm }: { dm: boolean }) {
  const border = dm ? '#1e2a38' : '#e2e8f0';
  const bg = dm ? '#0d1117' : '#ffffff';
  const headerBg = dm ? '#0b0f14' : '#f8fafc';
  const text = dm ? '#c8d8e8' : '#0f172a';
  const muted = dm ? '#3a5a7a' : '#94a3b8';
  const labelColor = dm ? '#3a5a7a' : '#94a3b8';
  const rowHover = dm ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const colHdrBg = dm ? '#0b0f14' : '#f1f5f9';
  const badgeWinBg = dm ? 'rgba(34,211,165,0.15)' : 'rgba(22,163,74,0.1)';
  const badgeWinColor = dm ? '#22d3a5' : '#16a34a';
  const badgeLossBg = dm ? 'rgba(244,97,127,0.12)' : 'rgba(220,38,38,0.08)';
  const badgeLossColor = dm ? '#f4617f' : '#dc2626';
  const dotGreen = '#22d3a5';
  const dotRed = '#f4617f';
  const pillBg = dm ? '#131b26' : '#eff6ff';
  const pillColor = dm ? '#3b82f6' : '#2563eb';
  const pillBorder = dm ? '#1a3a5c' : '#bfdbfe';
  const rowText = dm ? '#7aa3c8' : '#334155';

  const instruments = [
    { instr: 'EURUSD', session: 'London Mid',      mom: 'Strong',   trades: 8,  pct: 100, win: true  },
    { instr: 'EURUSD', session: 'London Open',     mom: 'Moderate', trades: 1,  pct: 100, win: true  },
    { instr: 'EURUSD', session: 'London Open',     mom: 'Strong',   trades: 5,  pct: 60,  win: true  },
    { instr: 'EURUSD', session: 'New York Close',  mom: 'Strong',   trades: 6,  pct: 50,  win: false },
    { instr: 'EURUSD', session: 'New York Mid',    mom: 'Strong',   trades: 12, pct: 83,  win: true  },
    { instr: 'EURUSD', session: 'Overlap Open',    mom: 'Strong',   trades: 10, pct: 80,  win: true  },
    { instr: 'EURUSD', session: 'Sydney Open',     mom: 'Moderate', trades: 1,  pct: 100, win: true  },
    { instr: 'EURUSD', session: 'Sydney Open',     mom: 'Strong',   trades: 2,  pct: 50,  win: false },
    { instr: 'EURUSD', session: 'Tokyo Close',     mom: 'Strong',   trades: 3,  pct: 100, win: true  },
    { instr: 'EURUSD', session: 'Tokyo Mid',       mom: 'Strong',   trades: 9,  pct: 89,  win: true  },
    { instr: 'EURUSD', session: 'Tokyo Open',      mom: 'Strong',   trades: 2,  pct: 50,  win: false },
    { instr: 'Unknown', session: 'London Open',    mom: 'Strong',   trades: 1,  pct: 100, win: true  },
  ];

  const strategies = [
    { label: 'Bearish', dot: dotRed,   trades: 37, pct: 81, win: true },
    { label: 'Bullish', dot: dotGreen, trades: 22, pct: 64, win: true },
  ];

  const timeframes = {
    entry:    [{ label: '1H', trades: 1, pct: 100 }, { label: '1M', trades: 2, pct: 60 }, { label: '1m', trades: 55, pct: 81 }, { label: '5M', trades: 1, pct: 100 }],
    analysis: [{ label: '1HR', trades: 58, pct: 80 }, { label: '4HR', trades: 1, pct: 100 }],
    context:  [{ label: '1D', trades: 59, pct: 81 }],
  };

  const Badge = ({ pct, win }: { pct: number; win: boolean }) => (
    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'Courier New',monospace", padding: '2px 7px', borderRadius: 4, background: win ? badgeWinBg : badgeLossBg, color: win ? badgeWinColor : badgeLossColor, letterSpacing: '0.04em' }}>
      {pct}%
    </span>
  );

  const ColHeader = ({ label, badge, sub }: { label: string; badge?: string; sub?: string }) => (
    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${border}`, background: headerBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: labelColor, textTransform: 'uppercase', fontFamily: "'Courier New',monospace" }}>{label}</span>
      {badge && <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "'Courier New',monospace", padding: '2px 8px', borderRadius: 4, background: pillBg, color: pillColor, border: `1px solid ${pillBorder}`, letterSpacing: '0.06em' }}>{badge}</span>}
      {sub && <span style={{ fontSize: 9, color: muted, fontFamily: "'Courier New',monospace", letterSpacing: '0.06em' }}>{sub}</span>}
    </div>
  );

  const Row = ({ children }: { children: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', borderBottom: `1px solid ${border}`, fontFamily: "'Courier New',monospace", fontSize: 11, color: text, transition: 'background 0.1s' }}
      onMouseEnter={e => (e.currentTarget.style.background = rowHover)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      {children}
    </div>
  );

  return (
    <div style={{ background: bg, borderRadius: 12, overflow: 'hidden', border: `1px solid ${border}` }}>
      <style>{`
        .pi-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr}
        .pi-col{border-right:1px solid ${border}}
        .pi-col:last-child{border-right:none}
        .pi-scroll{max-height:320px;overflow-y:auto}
        .pi-scroll::-webkit-scrollbar{width:4px}
        .pi-scroll::-webkit-scrollbar-track{background:transparent}
        .pi-scroll::-webkit-scrollbar-thumb{background:${border};border-radius:2px}
        @media(max-width:768px){
          .pi-grid{grid-template-columns:1fr}
          .pi-col{border-right:none;border-bottom:1px solid ${border}}
          .pi-col:last-child{border-bottom:none}
        }
      `}</style>

      <div className="pi-grid">
        <div className="pi-col">
          <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 78px 56px', alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${border}`, background: colHdrBg, fontFamily: "'Courier New',monospace" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Instr</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Phase</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Momentum</span>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: badgeWinColor }}>Win</span>
              <span style={{ fontSize: 9, color: muted }}>/</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: badgeLossColor }}>Loss</span>
            </div>
          </div>
          <div className="pi-scroll">
            {instruments.map((r, i) => (
              <div key={i}
                style={{ display: 'grid', gridTemplateColumns: '72px 1fr 78px 56px', alignItems: 'center', padding: '7px 14px', borderBottom: `1px solid ${border}`, fontFamily: "'Courier New',monospace", fontSize: 11, transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = rowHover)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ color: rowText, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.instr}</span>
                <span style={{ color: rowText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 6 }}>{r.session}</span>
                <span style={{ color: muted, fontSize: 10, whiteSpace: 'nowrap' }}>{r.mom}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 10, color: muted }}>{r.trades}</span>
                  <Badge pct={r.pct} win={r.win} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pi-col">
          <ColHeader label="MoMo" sub={`${strategies.reduce((a, s) => a + s.trades, 0)} TRADES`} />
          <div>
            {strategies.map((s, i) => (
              <Row key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
                  <span style={{ color: rowText }}>{s.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: muted }}>{s.trades}</span>
                  <Badge pct={s.pct} win={s.win} />
                </div>
              </Row>
            ))}
          </div>
        </div>

        <div className="pi-col">
          <ColHeader label="Entry TF" />
          {timeframes.entry.map((tf, i) => (
            <Row key={i}>
              <span style={{ color: rowText }}>{tf.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: muted }}>{tf.trades}</span>
                <Badge pct={tf.pct} win={tf.pct >= 60} />
              </div>
            </Row>
          ))}
          <ColHeader label="Analysis TF" />
          {timeframes.analysis.map((tf, i) => (
            <Row key={i}>
              <span style={{ color: rowText }}>{tf.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: muted }}>{tf.trades}</span>
                <Badge pct={tf.pct} win={tf.pct >= 60} />
              </div>
            </Row>
          ))}
          <ColHeader label="Context TF" />
          {timeframes.context.map((tf, i) => (
            <Row key={i}>
              <span style={{ color: rowText }}>{tf.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: muted }}>{tf.trades}</span>
                <Badge pct={tf.pct} win={tf.pct >= 60} />
              </div>
            </Row>
          ))}
        </div>
      </div>
    </div>
  );
}
