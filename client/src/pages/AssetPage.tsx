import { useState, useEffect, useRef } from "react";
import { Search, Sun, Bell, Share2, ChevronRight, Loader2, ZoomIn } from "lucide-react";
import JournalHeader from "@/components/JournalHeader";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Instrument {
  symbol: string;
  timeframe: string;
  price: string;
  probability: number;
  direction: "up" | "down";
  age: string;
  signal: string;
}

interface ContextItem { label: string; value: string; color: string; loading?: boolean }
interface TechItem    { label: string; value: string; color: string }
interface PriceActionItem { icon: "layers" | "layers2" | "zoom"; text: JSX.Element }

// ─── Mock data ────────────────────────────────────────────────────────────────
const INSTRUMENTS: Instrument[] = [
  { symbol: "BTC/USDT", timeframe: "2M",  price: "$63997.28", probability: 94, direction: "up",   age: "1 MINUTE AGO",   signal: "CONFIRMED/CHOCH" },
  { symbol: "ETH/USDT", timeframe: "15M", price: "$3452.57",  probability: 82, direction: "down", age: "5 MINUTES AGO",  signal: "CONFIRMED/LIQUIDITY GRAB" },
  { symbol: "SOL/USDT", timeframe: "1H",  price: "$144.81",   probability: 45, direction: "up",   age: "15 MINUTES AGO", signal: "CONFIRMED/BOS" },
  { symbol: "XRP/USDT", timeframe: "3H",  price: "$0.62",     probability: 92, direction: "down", age: "20 MINUTES AGO", signal: "CONFIRMED/LIQUIDITY GRAB" },
];

const ASSET_DATA: Record<string, {
  entry: string; tp: string; sl: string; rr: string; direction: "up" | "down";
  context: ContextItem[]; tech: TechItem[];
  priceAction: { icon: "layers" | "layers2" | "zoom"; text: string; bold?: string }[];
  probability: number; optimalRisk: string;
}> = {
  "ETH/USDT": {
    entry: "3452.57", tp: "3,200", sl: "3,550", rr: "1:3.1", direction: "down",
    context: [
      { label: "1D TREND",      value: "BULLISH",  color: "#22d3a5" },
      { label: "4H STRUCTURE",  value: "BULLISH",  color: "#22d3a5" },
      { label: "1H MOMENTUM",   value: "NEUTRAL",  color: "#f59e0b", loading: true },
      { label: "15M LIQUIDITY", value: "TAKEN",    color: "#f59e0b" },
      { label: "SMC PROFILE",   value: "DISCOUNT", color: "#22d3a5" },
    ],
    tech: [
      { label: "ADX POWER",       value: "HIGH (> 32)", color: "#4ade80" },
      { label: "MACD",            value: "CONFIRMED",   color: "#22d3a5" },
      { label: "EMA 200",         value: "BULLISH",     color: "#22d3a5" },
      { label: "EMA (5,9,13,21)", value: "CONFIRMED",   color: "#22d3a5" },
      { label: "VOLUME",          value: "CONFIRMED",   color: "#22d3a5" },
    ],
    priceAction: [
      { icon: "layers",  text: "MAJOR BREAK OF STRUCTURE (BOS) CONFIRMED ON HIGHER TIMEFRAME.", bold: "BOS" },
      { icon: "layers2", text: "MITIGATION OF 4H ORDER BLOCK IN PROGRESS.", bold: "4H ORDER BLOCK" },
      { icon: "zoom",    text: "AWAITING LOWER TIMEFRAME CHOCH FOR ENTRY TRIGGER.", bold: "LOWER TIMEFRAME" },
    ],
    probability: 82, optimalRisk: "1.5% - 2.0% CAPITAL",
  },
  "BTC/USDT": {
    entry: "63997.28", tp: "61,000", sl: "65,500", rr: "1:2.8", direction: "up",
    context: [
      { label: "1D TREND",      value: "BULLISH",  color: "#22d3a5" },
      { label: "4H STRUCTURE",  value: "BULLISH",  color: "#22d3a5" },
      { label: "1H MOMENTUM",   value: "BULLISH",  color: "#22d3a5" },
      { label: "15M LIQUIDITY", value: "TAKEN",    color: "#f59e0b" },
      { label: "SMC PROFILE",   value: "PREMIUM",  color: "#f59e0b" },
    ],
    tech: [
      { label: "ADX POWER",       value: "HIGH (> 32)", color: "#4ade80" },
      { label: "MACD",            value: "CONFIRMED",   color: "#22d3a5" },
      { label: "EMA 200",         value: "BULLISH",     color: "#22d3a5" },
      { label: "EMA (5,9,13,21)", value: "CONFIRMED",   color: "#22d3a5" },
      { label: "VOLUME",          value: "HIGH",        color: "#4ade80" },
    ],
    priceAction: [
      { icon: "layers",  text: "MAJOR BREAK OF STRUCTURE (BOS) CONFIRMED ON HIGHER TIMEFRAME.", bold: "BOS" },
      { icon: "layers2", text: "PRICE REACTING TO KEY DEMAND ZONE.", bold: "DEMAND ZONE" },
      { icon: "zoom",    text: "AWAITING LOWER TIMEFRAME CHOCH FOR ENTRY TRIGGER.", bold: "LOWER TIMEFRAME" },
    ],
    probability: 94, optimalRisk: "1.0% - 1.5% CAPITAL",
  },
  "SOL/USDT": {
    entry: "144.81", tp: "138.00", sl: "148.50", rr: "1:2.1", direction: "up",
    context: [
      { label: "1D TREND",      value: "NEUTRAL",  color: "#f59e0b" },
      { label: "4H STRUCTURE",  value: "BULLISH",  color: "#22d3a5" },
      { label: "1H MOMENTUM",   value: "NEUTRAL",  color: "#f59e0b", loading: true },
      { label: "15M LIQUIDITY", value: "AVAILABLE",color: "#22d3a5" },
      { label: "SMC PROFILE",   value: "DISCOUNT", color: "#22d3a5" },
    ],
    tech: [
      { label: "ADX POWER",       value: "MODERATE",  color: "#f59e0b" },
      { label: "MACD",            value: "PENDING",   color: "#f59e0b" },
      { label: "EMA 200",         value: "BULLISH",   color: "#22d3a5" },
      { label: "EMA (5,9,13,21)", value: "ALIGNED",   color: "#22d3a5" },
      { label: "VOLUME",          value: "MODERATE",  color: "#f59e0b" },
    ],
    priceAction: [
      { icon: "layers",  text: "STRUCTURE FORMING ON 4H TIMEFRAME.", bold: "4H TIMEFRAME" },
      { icon: "layers2", text: "ORDER BLOCK IDENTIFIED AT KEY LEVEL.", bold: "ORDER BLOCK" },
      { icon: "zoom",    text: "WAITING FOR CONFIRMATION SIGNAL.", bold: "CONFIRMATION SIGNAL" },
    ],
    probability: 45, optimalRisk: "0.5% - 1.0% CAPITAL",
  },
  "XRP/USDT": {
    entry: "0.62", tp: "0.54", sl: "0.67", rr: "1:2.4", direction: "down",
    context: [
      { label: "1D TREND",      value: "BEARISH",  color: "#f4617f" },
      { label: "4H STRUCTURE",  value: "BEARISH",  color: "#f4617f" },
      { label: "1H MOMENTUM",   value: "BEARISH",  color: "#f4617f" },
      { label: "15M LIQUIDITY", value: "TAKEN",    color: "#f59e0b" },
      { label: "SMC PROFILE",   value: "PREMIUM",  color: "#f59e0b" },
    ],
    tech: [
      { label: "ADX POWER",       value: "HIGH (> 32)", color: "#4ade80" },
      { label: "MACD",            value: "CONFIRMED",   color: "#22d3a5" },
      { label: "EMA 200",         value: "BEARISH",     color: "#f4617f" },
      { label: "EMA (5,9,13,21)", value: "CONFIRMED",   color: "#22d3a5" },
      { label: "VOLUME",          value: "CONFIRMED",   color: "#22d3a5" },
    ],
    priceAction: [
      { icon: "layers",  text: "MAJOR BREAK OF STRUCTURE (BOS) CONFIRMED BEARISH.", bold: "BOS" },
      { icon: "layers2", text: "SUPPLY ZONE HOLDING AS RESISTANCE.", bold: "SUPPLY ZONE" },
      { icon: "zoom",    text: "AWAITING LOWER TIMEFRAME CHOCH FOR SHORT ENTRY.", bold: "LOWER TIMEFRAME" },
    ],
    probability: 92, optimalRisk: "1.5% - 2.0% CAPITAL",
  },
};

// ─── Candlestick Chart ────────────────────────────────────────────────────────
function generateCandles(count: number, startPrice: number) {
  const candles = [];
  let price = startPrice;
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const open  = price + (Math.random() - 0.5) * price * 0.008;
    const close = open  + (Math.random() - 0.5) * price * 0.012;
    const high  = Math.max(open, close) + Math.random() * price * 0.006;
    const low   = Math.min(open, close) - Math.random() * price * 0.006;
    candles.push({ time: now - i * 3600000, open, high, low, close });
    price = close;
  }
  return candles;
}

const CANDLES_MAP: Record<string, ReturnType<typeof generateCandles>> = {
  "ETH/USDT": generateCandles(50, 3452),
  "BTC/USDT": generateCandles(50, 63997),
  "SOL/USDT": generateCandles(50, 144.81),
  "XRP/USDT": generateCandles(50, 0.62),
};

function CandlestickChart({ symbol }: { symbol: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const candles = CANDLES_MAP[symbol] || CANDLES_MAP["ETH/USDT"];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const PAD = { top: 20, right: 60, bottom: 36, left: 10 };

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#080c10";
    ctx.fillRect(0, 0, W, H);

    const prices = candles.flatMap(c => [c.high, c.low]);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    const chartH = H - PAD.top - PAD.bottom;
    const chartW = W - PAD.left - PAD.right;

    const toY = (p: number) => PAD.top + chartH - ((p - minP) / range) * chartH;

    // Grid lines + price labels
    const gridCount = 6;
    for (let i = 0; i <= gridCount; i++) {
      const y = PAD.top + (chartH / gridCount) * i;
      const price = maxP - (range / gridCount) * i;
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      ctx.fillStyle = "#4a6580";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(price.toFixed(2), W - PAD.right + 6, y + 3);
    }

    // Time axis labels
    const timeStep = Math.floor(candles.length / 5);
    ctx.fillStyle = "#4a6580";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    for (let i = 0; i < candles.length; i += timeStep) {
      const x = PAD.left + (i / (candles.length - 1)) * chartW;
      const d = new Date(candles[i].time);
      const label = `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
      ctx.fillText(label, x, H - 8);
    }

    // Candles
    const candleW = Math.max(2, Math.floor(chartW / candles.length) - 1);
    candles.forEach((c, i) => {
      const x = PAD.left + (i / (candles.length - 1)) * chartW;
      const isBull = c.close >= c.open;
      const color = isBull ? "#26a69a" : "#ef5350";

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.high));
      ctx.lineTo(x, toY(c.low));
      ctx.stroke();

      const bodyTop = toY(Math.max(c.open, c.close));
      const bodyH   = Math.max(1, Math.abs(toY(c.open) - toY(c.close)));
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
    });
  }, [candles]);

  return <canvas ref={canvasRef} width={900} height={340} style={{ width: "100%", height: 340, display: "block" }} />;
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────
function LayersIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}
function ZoomIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AssetPage() {
  const [selected, setSelected]   = useState("ETH/USDT");
  const [search,   setSearch]     = useState("");
  const [now,      setNow]        = useState(new Date());
  const [alertSet, setAlertSet]   = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = INSTRUMENTS.filter(i =>
    i.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const data = ASSET_DATA[selected] || ASSET_DATA["ETH/USDT"];
  const inst = INSTRUMENTS.find(i => i.symbol === selected)!;

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase() +
    " | " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).toUpperCase();

  function boldify(text: string, bold?: string) {
    if (!bold) return <span>{text}</span>;
    const parts = text.split(bold);
    return (
      <span>
        {parts[0]}<strong style={{ color: "#fff" }}>{bold}</strong>{parts[1]}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#080c10", fontFamily: "'Poppins', sans-serif", overflow: "hidden" }}>
      <JournalHeader onToggleSidebar={() => {}} />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .asset-scroll::-webkit-scrollbar { width: 4px; }
        .asset-scroll::-webkit-scrollbar-track { background: transparent; }
        .asset-scroll::-webkit-scrollbar-thumb { background: #172233; border-radius: 2px; }
        .inst-card:hover { background: #0c1219 !important; cursor: pointer; }
        .chart-btn { background: #0c1219; border: 1px solid #172233; color: #4a6580; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; padding: 5px 12px; cursor: pointer; transition: all 0.15s; }
        .chart-btn:hover { border-color: #3b82f6; color: #c8d8e8; }
        .chart-btn-alert { background: #0c1219; border: 1px solid #172233; color: #c8d8e8; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; padding: 5px 12px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
        .chart-btn-alert:hover { border-color: #f59e0b; color: #f59e0b; }
        .set-alert-btn { background: transparent; border: 1px solid #c8a84b; color: #c8a84b; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; padding: 12px 24px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 8px; }
        .set-alert-btn:hover { background: rgba(200,168,75,0.1); }
        .set-alert-btn.active { background: rgba(200,168,75,0.15); border-color: #f0c040; color: #f0c040; }
        .share-btn { background: #5b4fcf; border: none; color: #fff; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; padding: 12px 28px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 8px; }
        .share-btn:hover { background: #6c63d9; }
        .ctx-row:hover { background: rgba(255,255,255,0.02); }
        .news-btn { background: #1a0a0e; border: 1px solid #f4617f; color: #f4617f; font-size: 9px; font-weight: 800; letter-spacing: 0.12em; padding: 5px 14px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
      `}</style>

      {/* ── Left Sidebar ── */}
      <div style={{ width: 320, minWidth: 320, background: "#0a0f16", borderRight: "1px solid #0f1923", display: "flex", flexDirection: "column", height: "100vh" }}>

        {/* Search */}
        <div style={{ padding: "16px 14px 10px", borderBottom: "1px solid #0f1923" }}>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#2d4a63" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH INSTRUMENTS..."
              style={{
                width: "100%", background: "#0c1219", border: "1px solid #172233", borderRadius: 4,
                color: "#4a6580", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                padding: "8px 10px 8px 30px", outline: "none", fontFamily: "inherit"
              }}
            />
          </div>
        </div>

        {/* Instrument List */}
        <div className="asset-scroll" style={{ flex: 1, overflowY: "auto" }}>
          {filtered.map(inst => {
            const isActive = inst.symbol === selected;
            return (
              <div
                key={inst.symbol}
                className="inst-card"
                onClick={() => setSelected(inst.symbol)}
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid #0f1923",
                  background: isActive ? "#0e1620" : "transparent",
                  borderLeft: isActive ? "3px solid #7c3aed" : "3px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                {/* Row 1: Symbol + Timeframe */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? "#7c6ff7" : "#8ba8c4", letterSpacing: "0.04em" }}>
                    {inst.symbol}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#3a5470", letterSpacing: "0.06em" }}>{inst.timeframe}</span>
                </div>

                {/* Row 2: Arrow + Price + Probability */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 4,
                      background: inst.direction === "up" ? "rgba(34,211,165,0.12)" : "rgba(244,97,127,0.12)",
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill={inst.direction === "up" ? "#22d3a5" : "#f4617f"}>
                        {inst.direction === "up"
                          ? <polygon points="6,1 11,10 1,10" />
                          : <polygon points="6,11 11,2 1,2" />}
                      </svg>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#c8d8e8" }}>{inst.price}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: inst.probability >= 80 ? "#22d3a5" : inst.probability >= 50 ? "#f59e0b" : "#f4617f" }}>
                    {inst.probability}%
                  </span>
                </div>

                {/* Row 3: Age + Signal */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: "#2d4a63", letterSpacing: "0.06em" }}>{inst.age}</span>
                  <span style={{ fontSize: 9, color: "#2d4a63", letterSpacing: "0.04em" }}>{inst.signal}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="asset-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 0 32px" }}>

        {/* Top Bar */}
        <div style={{ padding: "18px 24px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #0f1923" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#ffffff", letterSpacing: "0.02em", marginBottom: 4 }}>
              {selected}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22d3a5", boxShadow: "0 0 6px #22d3a5" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#22d3a5", letterSpacing: "0.1em" }}>LIVE</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button style={{ background: "transparent", border: "1px solid #172233", borderRadius: 4, padding: "6px 8px", cursor: "pointer", color: "#4a6580", display: "flex", alignItems: "center" }}>
              <Sun size={15} />
            </button>
            <button className="news-btn">
              <span style={{ width: 8, height: 8, background: "#f4617f", borderRadius: 1, display: "inline-block" }} />
              NEWS: HI
            </button>
          </div>
        </div>

        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Entry / TP / SL / RR Panel ── */}
          <div style={{ background: "#0a0f16", border: "1px solid #0f1923", borderRadius: 4, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            {[
              {
                label: "ENTRY",
                value: (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 12 12" fill={data.direction === "down" ? "#f4617f" : "#22d3a5"}>
                      {data.direction === "down"
                        ? <polygon points="6,11 11,2 1,2" />
                        : <polygon points="6,1 11,10 1,10" />}
                    </svg>
                    <span style={{ fontSize: 18, fontWeight: 700, color: "#c8d8e8" }}>{data.entry}</span>
                  </div>
                )
              },
              { label: "TARGET (TP)", value: <span style={{ fontSize: 18, fontWeight: 700, color: "#c8d8e8" }}>{data.tp}</span> },
              { label: "PROTECT (SL)", value: <span style={{ fontSize: 18, fontWeight: 700, color: "#c8d8e8" }}>{data.sl}</span> },
              { label: "RISK : REWARD", value: <span style={{ fontSize: 18, fontWeight: 700, color: "#c8d8e8" }}>{data.rr}</span> },
            ].map((col, i) => (
              <div key={i} style={{
                padding: "20px 16px", textAlign: "center",
                borderRight: i < 3 ? "1px solid #0f1923" : undefined
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#3a5470", letterSpacing: "0.12em", marginBottom: 12 }}>{col.label}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{col.value}</div>
              </div>
            ))}
          </div>

          {/* ── Analysis Panels Row ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

            {/* Context Alignment */}
            <div style={{ background: "#0a0f16", border: "1px solid #0f1923", borderRadius: 4, padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, background: "#3b82f6" }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: "#4a6580", letterSpacing: "0.14em" }}>CONTEXT ALIGNMENT</span>
              </div>
              {data.context.map((row, i) => (
                <div key={i} className="ctx-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 4px", borderRadius: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {row.loading
                      ? <Loader2 size={10} color="#f59e0b" style={{ animation: "spin 1.5s linear infinite" }} />
                      : <ChevronRight size={10} color="#2d4a63" />}
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#4a6580", letterSpacing: "0.08em" }}>{row.label}</span>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, color: row.color, letterSpacing: "0.1em" }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Technical Confluence */}
            <div style={{ background: "#0a0f16", border: "1px solid #0f1923", borderRadius: 4, padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, background: "#22d3a5" }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: "#4a6580", letterSpacing: "0.14em" }}>TECHNICAL CONFLUENCE</span>
              </div>
              {data.tech.map((row, i) => (
                <div key={i} className="ctx-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 4px", borderRadius: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <ChevronRight size={10} color="#2d4a63" />
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#4a6580", letterSpacing: "0.08em" }}>{row.label}</span>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, color: row.color, letterSpacing: "0.1em" }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Price Action */}
            <div style={{ background: "#0a0f16", border: "1px solid #0f1923", borderRadius: 4, padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, background: "#f59e0b" }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: "#4a6580", letterSpacing: "0.14em" }}>PRICE ACTION</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {data.priceAction.map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ flexShrink: 0, marginTop: 1 }}>
                      {item.icon === "zoom"
                        ? <ZoomIcon color="#f59e0b" />
                        : <LayersIcon color={item.icon === "layers" ? "#3b82f6" : "#3b82f6"} />}
                    </div>
                    <p style={{ fontSize: 9, fontWeight: 600, color: "#4a6580", letterSpacing: "0.06em", lineHeight: 1.7, margin: 0 }}>
                      {boldify(item.text, item.bold)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Probability Panel ── */}
          <div style={{ background: "#0a0f16", border: "1px solid #0f1923", borderRadius: 4, padding: "20px 24px", display: "flex", alignItems: "center", gap: 24 }}>
            {/* Score Box */}
            <div style={{
              width: 72, height: 72, flexShrink: 0,
              border: "2px solid #3b82f6", borderRadius: 6,
              background: "#0c1a2e",
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative", overflow: "hidden"
            }}>
              <svg style={{ position: "absolute", top: 0, left: 0 }} width="72" height="72">
                <line x1="10" y1="62" x2="62" y2="10" stroke="#3b82f6" strokeWidth="2.5" opacity="0.5" />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#ffffff", position: "relative" }}>{data.probability}%</span>
            </div>

            {/* Text */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#ffffff", letterSpacing: "0.04em", marginBottom: 4 }}>
                PROBABILITY: {data.probability}%
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#4a6580", letterSpacing: "0.08em" }}>
                OPTIMAL RISK: {data.optimalRisk}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
              <button className={`set-alert-btn${alertSet ? " active" : ""}`} onClick={() => setAlertSet(!alertSet)}>
                <Bell size={14} />
                {alertSet ? "ALERT SET" : "SET ALERT"}
              </button>
              <button className="share-btn">
                <Share2 size={14} />
                SHARE
              </button>
            </div>
          </div>

          {/* ── Live Visualizer Chart ── */}
          <div style={{ background: "#0a0f16", border: "1px solid #0f1923", borderRadius: 4, overflow: "hidden" }}>
            {/* Chart Header */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #0f1923", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#22d3a5", letterSpacing: "0.1em" }}>
                  LIVE VISUALIZER - {selected}
                </div>
                <div style={{ fontSize: 9, color: "#2d4a63", letterSpacing: "0.06em", marginTop: 2 }}>
                  {formatDate(now)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="chart-btn">INSTRUMENTS</button>
                <button className="chart-btn-alert">
                  <Bell size={11} />
                  ALERT
                </button>
                <button className="chart-btn">TF</button>
                <button className="chart-btn">INDICATORS</button>
              </div>
            </div>

            {/* Chart */}
            <div style={{ background: "#080c10" }}>
              <CandlestickChart symbol={selected} />
            </div>
          </div>
        </div>
      </div>

      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
