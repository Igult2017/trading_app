import { useState, useEffect, useMemo, useRef } from "react";
import {
  Zap, LayoutDashboard, Activity, BarChart3, Wallet, Settings,
  X, Search, Sun, Moon, Menu, ChevronRight, CircleDashed,
  Target, Layers, SearchCode,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Candle { open: number; close: number; high: number; low: number; }

interface Signal {
  pair: string; type: string; price: number; time: string;
  strength: number; tp: string; sl: string; rr: string;
}

// ── Live Candlestick Chart ───────────────────────────────────────────────────

function TradingChart({ pair, currentPrice, tp, sl, entry, darkMode }: {
  pair: string; currentPrice: number; tp: string; sl: string;
  entry: string; darkMode: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [candles, setCandles] = useState<Candle[]>([]);

  useEffect(() => {
    const base = parseFloat(entry.replace(/,/g, ""));
    let last = base;
    const initial: Candle[] = [];
    for (let i = 0; i < 40; i++) {
      const open = last;
      const close = open + (Math.random() - 0.5) * open * 0.015;
      const high = Math.max(open, close) + Math.random() * open * 0.003;
      const low = Math.min(open, close) - Math.random() * open * 0.003;
      initial.push({ open, close, high, low });
      last = close;
    }
    setCandles(initial);
  }, [pair, entry]);

  useEffect(() => {
    if (!candles.length) return;
    setCandles(prev => {
      const next = [...prev];
      const i = next.length - 1;
      next[i] = {
        ...next[i],
        close: currentPrice,
        high: Math.max(next[i].high, currentPrice),
        low: Math.min(next[i].low, currentPrice),
      };
      return next;
    });
  }, [currentPrice]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const tpV = parseFloat(tp.replace(/,/g, ""));
    const slV = parseFloat(sl.replace(/,/g, ""));
    const enV = parseFloat(entry.replace(/,/g, ""));
    const prices = candles.flatMap(c => [c.high, c.low]).concat([tpV, slV, enV]);
    const minP = Math.min(...prices) * 0.999;
    const maxP = Math.max(...prices) * 1.001;
    const range = maxP - minP;
    const getY = (p: number) => h - ((p - minP) / range) * h;

    ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";
    for (let i = 1; i < 6; i++) {
      const y = (h / 6) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const drawLvl = (p: number, col: string, txt: string) => {
      const y = getY(p);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w - 50, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col;
      ctx.font = "bold 8px Montserrat";
      ctx.fillText(txt, w - 45, y + 3);
    };
    drawLvl(tpV, "#10b981", "TP");
    drawLvl(slV, "#f43f5e", "SL");
    drawLvl(enV, "#6366f1", "ENTRY");

    const cW = (w - 60) / candles.length;
    const gap = cW * 0.3;
    candles.forEach((c, i) => {
      const x = i * cW + gap;
      const bull = c.close >= c.open;
      const col = bull ? "#10b981" : "#f43f5e";
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x + (cW - gap) / 2, getY(c.high));
      ctx.lineTo(x + (cW - gap) / 2, getY(c.low));
      ctx.stroke();
      ctx.fillRect(x, Math.min(getY(c.open), getY(c.close)), cW - gap, Math.max(Math.abs(getY(c.close) - getY(c.open)), 1));
    });
  }, [candles, darkMode, tp, sl, entry]);

  return (
    <div className={`border p-4 h-[300px] relative ${darkMode ? "bg-black/40 border-white/5" : "bg-white border-slate-200"}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[9px] font-black tracking-widest text-indigo-500 uppercase">Live Visualizer</span>
        <div className="flex gap-3 text-[8px] font-bold">
          <span className="text-emerald-500">BULLISH</span>
          <span className="text-rose-500">BEARISH</span>
        </div>
      </div>
      <canvas ref={canvasRef} className="w-full h-[240px]" />
    </div>
  );
}

// ── Sidebar Icon ─────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  zap: Zap, "layout-dashboard": LayoutDashboard, activity: Activity,
  "bar-chart-3": BarChart3, wallet: Wallet, settings: Settings,
};

function SidebarIcon({ iconName, active = false, label, mobile = false, darkMode }: {
  iconName: string; active?: boolean; label: string; mobile?: boolean; darkMode: boolean;
}) {
  const Icon = ICON_MAP[iconName] || Zap;
  return (
    <div
      title={label}
      className={`p-4 cursor-pointer flex items-center justify-center group relative transition-all duration-150
        ${active
          ? "bg-indigo-600 text-white"
          : darkMode
            ? "text-slate-500 hover:text-white hover:bg-white/5"
            : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"}`}
    >
      <Icon size={mobile ? 22 : 20} />
      {!mobile && !active && (
        <span className={`absolute left-full ml-0 px-3 py-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 font-bold tracking-widest uppercase
          ${darkMode ? "bg-slate-900 text-white" : "bg-white text-slate-800 border border-slate-200 shadow-xl"}`}>
          {label}
        </span>
      )}
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function SetupValue({ label, value, color, darkMode }: {
  label: string; value: string; color: string; darkMode: boolean;
}) {
  return (
    <div className={`border p-4 md:p-6 transition-colors ${darkMode ? "bg-white/[0.01] border-white/5" : "bg-white border-slate-200"}`}>
      <p className={`text-[9px] font-black tracking-[0.2em] uppercase mb-2 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>{label}</p>
      <p className={`text-xl md:text-2xl font-black tracking-tight ${color}`}>{value}</p>
    </div>
  );
}

// ── Analysis Section ─────────────────────────────────────────────────────────

function AnalysisSection({ title, children, darkMode }: {
  title: string; children: React.ReactNode; darkMode: boolean;
}) {
  return (
    <div className={`border p-5 md:p-6 ${darkMode ? "bg-black/20 border-white/5" : "bg-white border-slate-200"}`}>
      <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.25em] mb-6 flex items-center gap-3">
        <span className="w-1.5 h-1.5 bg-indigo-500 inline-block" />
        {title}
      </h4>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// ── Check Item ───────────────────────────────────────────────────────────────

function CheckItem({ label, value, status = "success", darkMode }: {
  label: string; value: string; status?: string; darkMode: boolean;
}) {
  return (
    <div className="flex items-center justify-between group border-b border-white/5 pb-2 last:border-0">
      <div className="flex items-center gap-3">
        {status === "success"
          ? <ChevronRight size={12} className="text-emerald-500" />
          : <CircleDashed size={12} className="text-amber-500" />}
        <span className={`text-[11px] font-bold uppercase tracking-wide transition-colors
          ${darkMode ? "text-slate-400 group-hover:text-slate-200" : "text-slate-600 group-hover:text-slate-900"}`}>
          {label}
        </span>
      </div>
      <span className={`text-[10px] font-black uppercase tracking-widest ${status === "success" ? "text-emerald-400" : "text-amber-400"}`}>
        {value}
      </span>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

const SIGNALS: Signal[] = [
  { pair: "BTC/USDT", type: "BUY",  price: 64120.50, time: "2m",  strength: 94, tp: "65,500", sl: "63,200", rr: "1:2.4" },
  { pair: "ETH/USDT", type: "SELL", price: 3450.20,  time: "15m", strength: 82, tp: "3,200",  sl: "3,550",  rr: "1:3.1" },
  { pair: "SOL/USDT", type: "BUY",  price: 145.10,   time: "1h",  strength: 45, tp: "160",    sl: "138",    rr: "1:1.8" },
  { pair: "XRP/USDT", type: "SELL", price: 0.621,    time: "3h",  strength: 92, tp: "0.5500", sl: "0.6500", rr: "1:4.2" },
  { pair: "ADA/USDT", type: "BUY",  price: 0.452,    time: "4h",  strength: 71, tp: "0.5100", sl: "0.4200", rr: "1:2.0" },
  { pair: "DOT/USDT", type: "SELL", price: 7.12,     time: "6h",  strength: 38, tp: "6.50",   sl: "7.45",   rr: "1:1.5" },
  { pair: "LINK/USDT",type: "BUY",  price: 18.45,    time: "8h",  strength: 88, tp: "21.00",  sl: "17.20",  rr: "1:2.8" },
  { pair: "AVAX/USDT",type: "SELL", price: 34.20,    time: "12h", strength: 55, tp: "30.00",  sl: "36.50",  rr: "1:1.9" },
];

export default function AssetsPage() {
  const [activeSignal, setActiveSignal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  useEffect(() => {
    const id = setInterval(() => {
      setLivePrices(prev => {
        const next = { ...prev };
        SIGNALS.forEach(s => {
          const cur = prev[s.pair] ?? s.price;
          next[s.pair] = cur + (Math.random() - 0.5) * cur * 0.001;
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(
    () => SIGNALS.filter(s => s.pair.toLowerCase().includes(searchQuery.toLowerCase())),
    [searchQuery]
  );

  const active = SIGNALS[activeSignal];
  const livePrice = livePrices[active.pair] ?? active.price;

  const dm = darkMode;

  return (
    <div className={`flex flex-col md:flex-row h-screen w-full antialiased overflow-hidden fixed inset-0 transition-colors duration-300
      ${dm ? "bg-[#050608] text-slate-400" : "bg-slate-100 text-slate-700"}`}>

      {/* ── Desktop Sidebar ── */}
      <aside className={`hidden md:flex w-16 min-w-[64px] border-r flex-col items-center py-0 z-50
        ${dm ? "bg-[#050608] border-white/5" : "bg-white border-slate-200"}`}>
        <div className="w-16 h-16 bg-indigo-600 flex items-center justify-center mb-0">
          <Zap size={24} className="text-white" />
        </div>
        <nav className="flex flex-col w-full flex-grow">
          <SidebarIcon iconName="layout-dashboard" active label="Terminal" darkMode={dm} />
          <SidebarIcon iconName="activity" label="Signals" darkMode={dm} />
          <SidebarIcon iconName="bar-chart-3" label="Analytics" darkMode={dm} />
          <SidebarIcon iconName="wallet" label="Assets" darkMode={dm} />
        </nav>
        <SidebarIcon iconName="settings" label="Config" darkMode={dm} />
      </aside>

      {/* ── Signal Feed Panel ── */}
      <section className={`
        fixed inset-0 z-40 md:relative md:flex md:w-80 md:min-w-[320px] md:border-r transition-transform duration-300
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        ${dm ? "bg-[#08090C] border-white/5" : "bg-white border-slate-200"}
      `}>
        <div className="flex flex-col h-full w-full">
          <div className={`p-6 border-b flex flex-col gap-6 ${dm ? "border-white/5" : "border-slate-200"}`}>
            <div className="flex items-center justify-between">
              <h2 className={`text-xs font-black uppercase tracking-[0.3em] ${dm ? "text-white" : "text-slate-800"}`}>
                Market Feed
              </h2>
              <button onClick={() => setSidebarOpen(false)} className="md:hidden text-slate-500">
                <X size={20} />
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                type="text"
                placeholder="SEARCH PAIR..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={`w-full border py-3 pl-11 pr-4 text-[10px] focus:outline-none focus:border-indigo-500 font-black tracking-widest
                  ${dm ? "bg-white/5 border-white/5 text-white placeholder-slate-700" : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"}`}
              />
            </div>
          </div>

          <div className="flex-grow overflow-y-auto custom-scrollbar">
            {filtered.map((s, idx) => {
              const sigIdx = SIGNALS.indexOf(s);
              const isActive = activeSignal === sigIdx;
              return (
                <div
                  key={idx}
                  onClick={() => { setActiveSignal(sigIdx); setSidebarOpen(false); }}
                  className={`px-6 py-6 border-b cursor-pointer transition-all relative
                    ${dm ? "border-white/5" : "border-slate-100"}
                    ${isActive
                      ? (dm ? "bg-white/[0.03]" : "bg-indigo-50")
                      : (dm ? "hover:bg-white/[0.01]" : "hover:bg-slate-50")}`}
                >
                  {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 active-indicator" />}
                  <div className="flex justify-between items-center mb-2">
                    <h3 className={`font-black text-[12px] tracking-tight
                      ${isActive ? (dm ? "text-indigo-400" : "text-indigo-600") : (dm ? "text-slate-300" : "text-slate-600")}`}>
                      {s.pair}
                    </h3>
                    <span className="text-[9px] text-slate-500 font-black tracking-widest uppercase">{s.time}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-[9px] font-black tracking-tighter px-2 py-0.5
                        ${s.type === "BUY" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                        {s.type}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-slate-500">
                        ${(livePrices[s.pair] ?? s.price).toFixed(2)}
                      </span>
                    </div>
                    <span className="text-[10px] font-black text-indigo-500/60 uppercase tracking-widest">{s.strength}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Main Content ── */}
      <main className="flex-grow flex flex-col overflow-y-auto relative terminal-grid mobile-content-height">
        {/* Header */}
        <header className={`h-16 border-b flex items-center justify-between px-6 shrink-0 sticky top-0 z-40
          ${dm ? "bg-[#050608]/90 border-white/5" : "bg-white/90 border-slate-200"}`}>
          <div className="flex items-center gap-6">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden text-indigo-500">
              <Menu size={20} />
            </button>
            <div className="flex flex-col">
              <span className={`font-black text-sm tracking-tighter ${dm ? "text-white" : "text-slate-900"}`}>
                {active.pair}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-1.5 h-1.5 bg-emerald-500 animate-pulse" />
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">LIVE</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setDarkMode(!dm)}
              className={`p-2 border transition-all
                ${dm ? "border-white/10 text-slate-400 hover:text-white hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {dm ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 text-[10px] font-black tracking-[0.1em] shadow-xl shadow-indigo-600/10 active:scale-[0.98] transition-all">
              FSDZONES
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="p-6 md:p-10 w-full max-w-6xl mx-auto space-y-6 md:space-y-10">
          {/* Stats */}
          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-0 border ${dm ? "border-white/5" : "border-slate-200"}`}>
            <SetupValue label="ENTRY"         value={livePrice.toFixed(2)} color={dm ? "text-white" : "text-slate-900"} darkMode={dm} />
            <SetupValue label="TARGET (TP)"   value={active.tp}            color="text-emerald-500"                      darkMode={dm} />
            <SetupValue label="PROTECT (SL)"  value={active.sl}            color="text-rose-500"                         darkMode={dm} />
            <SetupValue label="RISK : REWARD" value={active.rr}            color="text-indigo-500"                       darkMode={dm} />
          </div>

          {/* Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <AnalysisSection title="CONTEXT ALIGNMENT" darkMode={dm}>
              <CheckItem label="1D Trend"      value="Bullish" darkMode={dm} />
              <CheckItem label="4H Structure"  value="Bullish" darkMode={dm} />
              <CheckItem label="1H Momentum"   value="Neutral" status="pending" darkMode={dm} />
              <CheckItem label="15M Liquidity" value="Taken"   darkMode={dm} />
              <CheckItem label="SMC Profile"   value="Discount" darkMode={dm} />
            </AnalysisSection>

            <AnalysisSection title="TECHNICAL CONFLUENCE" darkMode={dm}>
              <CheckItem label="ADX Power"      value="High (> 32)"  darkMode={dm} />
              <CheckItem label="RSI Divergence" value="Confirmed"    darkMode={dm} />
              <CheckItem label="EMA Ribbon"     value="Bullish"      darkMode={dm} />
              <CheckItem label="Vol Profile"    value="Wait POC" status="pending" darkMode={dm} />
            </AnalysisSection>

            <AnalysisSection title="PRICE ACTION" darkMode={dm}>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <Target size={14} className="text-indigo-500 mt-1 shrink-0" />
                  <p className={`text-[11px] font-bold leading-relaxed uppercase tracking-tight ${dm ? "text-slate-300" : "text-slate-600"}`}>
                    Major break of structure (<span className="text-white">BOS</span>) confirmed on higher timeframe.
                  </p>
                </div>
                <div className="flex items-start gap-4">
                  <Layers size={14} className="text-indigo-500 mt-1 shrink-0" />
                  <p className={`text-[11px] font-bold leading-relaxed uppercase tracking-tight ${dm ? "text-slate-300" : "text-slate-600"}`}>
                    Mitigation of <span className="text-white">4H Order Block</span> in progress.
                  </p>
                </div>
                <div className="flex items-start gap-4">
                  <SearchCode size={14} className="text-amber-500 mt-1 shrink-0" />
                  <p className={`text-[11px] font-bold leading-relaxed uppercase tracking-tight ${dm ? "text-slate-300" : "text-slate-600"}`}>
                    Awaiting <span className="text-amber-500">Lower Timeframe</span> CHoCH for entry trigger.
                  </p>
                </div>
              </div>
            </AnalysisSection>
          </div>

          {/* Signal Grade */}
          <div className={`border p-6 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8
            ${dm ? "bg-indigo-600/5 border-indigo-500/20" : "bg-indigo-50 border-indigo-200"}`}>
            <div className="flex items-center gap-8 w-full md:w-auto">
              <div className={`w-20 h-20 border-8 flex items-center justify-center relative shrink-0 ${dm ? "border-white/5" : "border-white"}`}>
                <div
                  className="absolute inset-0 border-t-8 border-indigo-500"
                  style={{ transform: `rotate(${active.strength * 3.6}deg)` }}
                />
                <span className={`text-lg font-black ${dm ? "text-white" : "text-indigo-900"}`}>{active.strength}%</span>
              </div>
              <div>
                <h5 className={`text-base font-black uppercase tracking-[0.2em] mb-1 ${dm ? "text-white" : "text-slate-900"}`}>
                  SIGNAL GRADE: {active.strength}%
                </h5>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  OPTIMAL RISK: <span className={dm ? "text-indigo-400" : "text-indigo-600"}>1.5% – 2.0% CAPITAL</span>
                </p>
              </div>
            </div>
            <div className="flex gap-4 w-full md:w-auto">
              <button className={`flex-1 md:flex-none px-8 py-3 border text-[10px] font-black uppercase tracking-widest transition-all
                ${dm ? "bg-transparent hover:bg-white/5 border-white/20 text-white" : "bg-white hover:bg-slate-50 border-slate-300 text-slate-800"}`}>
                Set Alert
              </button>
              <button className="flex-1 md:flex-none px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest transition-all">
                Share
              </button>
            </div>
          </div>

          {/* Live Chart */}
          <TradingChart
            pair={active.pair}
            currentPrice={livePrice}
            tp={active.tp}
            sl={active.sl}
            entry={active.price.toString()}
            darkMode={dm}
          />
        </div>
      </main>

      {/* ── Mobile Bottom Nav ── */}
      <nav className={`md:hidden h-16 border-t flex items-center justify-around px-4 shrink-0 sticky bottom-0 z-50
        ${dm ? "bg-[#050608] border-white/5" : "bg-white border-slate-200"}`}>
        <SidebarIcon iconName="layout-dashboard" active mobile label="Home"    darkMode={dm} />
        <SidebarIcon iconName="activity"                mobile label="Signals"  darkMode={dm} />
        <SidebarIcon iconName="bar-chart-3"             mobile label="Stats"    darkMode={dm} />
        <SidebarIcon iconName="settings"                mobile label="Config"   darkMode={dm} />
      </nav>
    </div>
  );
}
