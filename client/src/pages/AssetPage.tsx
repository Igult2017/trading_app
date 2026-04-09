import { useState, useEffect, useRef } from "react";
import { Search, Bell, Share2, ChevronRight, Loader2, ZoomIn } from "lucide-react";
import TradingChart, { INDICATOR_DEFS, prefetchCandles, type IndicatorId, type ChartType } from "@/components/TradingChart";
import { useFastBatchPrices, useFastPrice } from "@/hooks/useFastPrice";
import TickingPrice from "@/components/TickingPrice";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Instrument {
  symbol: string;
  assetClass: "crypto" | "forex" | "stock" | "commodity";
  category: "Crypto" | "Forex" | "Stock" | "Index" | "Commodity";
}

interface ContextItem { label: string; value: string; color: string; loading?: boolean }
interface TechItem    { label: string; value: string; color: string }

// ─── Full instrument list ──────────────────────────────────────────────────────
const ALL_INSTRUMENTS: Instrument[] = [
  // ── Crypto ─────────────────────────────────────────────────────────────────
  { symbol: "BTC/USDT",   assetClass: "crypto", category: "Crypto" },
  { symbol: "ETH/USDT",   assetClass: "crypto", category: "Crypto" },
  { symbol: "SOL/USDT",   assetClass: "crypto", category: "Crypto" },
  { symbol: "XRP/USDT",   assetClass: "crypto", category: "Crypto" },
  { symbol: "BNB/USDT",   assetClass: "crypto", category: "Crypto" },
  { symbol: "ADA/USDT",   assetClass: "crypto", category: "Crypto" },
  { symbol: "DOGE/USDT",  assetClass: "crypto", category: "Crypto" },
  { symbol: "AVAX/USDT",  assetClass: "crypto", category: "Crypto" },
  { symbol: "MATIC/USDT", assetClass: "crypto", category: "Crypto" },
  { symbol: "LTC/USDT",   assetClass: "crypto", category: "Crypto" },
  { symbol: "LINK/USDT",  assetClass: "crypto", category: "Crypto" },
  { symbol: "DOT/USDT",   assetClass: "crypto", category: "Crypto" },
  { symbol: "UNI/USDT",   assetClass: "crypto", category: "Crypto" },
  { symbol: "ATOM/USDT",  assetClass: "crypto", category: "Crypto" },
  // ── Major Forex ────────────────────────────────────────────────────────────
  { symbol: "EUR/USD", assetClass: "forex", category: "Forex" },
  { symbol: "GBP/USD", assetClass: "forex", category: "Forex" },
  { symbol: "USD/JPY", assetClass: "forex", category: "Forex" },
  { symbol: "USD/CHF", assetClass: "forex", category: "Forex" },
  { symbol: "AUD/USD", assetClass: "forex", category: "Forex" },
  { symbol: "NZD/USD", assetClass: "forex", category: "Forex" },
  { symbol: "USD/CAD", assetClass: "forex", category: "Forex" },
  // ── Cross Forex ────────────────────────────────────────────────────────────
  { symbol: "EUR/GBP", assetClass: "forex", category: "Forex" },
  { symbol: "EUR/JPY", assetClass: "forex", category: "Forex" },
  { symbol: "GBP/JPY", assetClass: "forex", category: "Forex" },
  { symbol: "EUR/AUD", assetClass: "forex", category: "Forex" },
  { symbol: "EUR/CAD", assetClass: "forex", category: "Forex" },
  { symbol: "GBP/AUD", assetClass: "forex", category: "Forex" },
  { symbol: "GBP/CAD", assetClass: "forex", category: "Forex" },
  { symbol: "AUD/JPY", assetClass: "forex", category: "Forex" },
  { symbol: "EUR/CHF", assetClass: "forex", category: "Forex" },
  { symbol: "GBP/CHF", assetClass: "forex", category: "Forex" },
  { symbol: "AUD/CAD", assetClass: "forex", category: "Forex" },
  { symbol: "AUD/CHF", assetClass: "forex", category: "Forex" },
  { symbol: "NZD/JPY", assetClass: "forex", category: "Forex" },
  // ── Commodities ────────────────────────────────────────────────────────────
  { symbol: "XAU/USD", assetClass: "commodity", category: "Commodity" },
  { symbol: "XAG/USD", assetClass: "commodity", category: "Commodity" },
  { symbol: "WTI",     assetClass: "commodity", category: "Commodity" },
  // ── US Indices ─────────────────────────────────────────────────────────────
  { symbol: "US100",       assetClass: "stock", category: "Index" },
  { symbol: "US500",       assetClass: "stock", category: "Index" },
  { symbol: "US30",        assetClass: "stock", category: "Index" },
  { symbol: "RUSSELL2000", assetClass: "stock", category: "Index" },
  { symbol: "VIX",         assetClass: "stock", category: "Index" },
  // ── US Stocks ──────────────────────────────────────────────────────────────
  { symbol: "AAPL",  assetClass: "stock", category: "Stock" },
  { symbol: "MSFT",  assetClass: "stock", category: "Stock" },
  { symbol: "GOOGL", assetClass: "stock", category: "Stock" },
  { symbol: "AMZN",  assetClass: "stock", category: "Stock" },
  { symbol: "TSLA",  assetClass: "stock", category: "Stock" },
  { symbol: "NVDA",  assetClass: "stock", category: "Stock" },
  { symbol: "META",  assetClass: "stock", category: "Stock" },
  { symbol: "NFLX",  assetClass: "stock", category: "Stock" },
  { symbol: "JPM",   assetClass: "stock", category: "Stock" },
  { symbol: "BAC",   assetClass: "stock", category: "Stock" },
  { symbol: "GS",    assetClass: "stock", category: "Stock" },
  { symbol: "AMD",   assetClass: "stock", category: "Stock" },
  { symbol: "INTC",  assetClass: "stock", category: "Stock" },
  { symbol: "DIS",   assetClass: "stock", category: "Stock" },
  { symbol: "BABA",  assetClass: "stock", category: "Stock" },
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

// ─── Live Clock (isolated so only it re-renders every second) ─────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const formatted =
    now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase() +
    " | " +
    now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).toUpperCase();
  return <span>{formatted}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AssetPage() {
  const [selected, setSelected]   = useState("ETH/USDT");
  const [search,   setSearch]     = useState("");
  const [alertSet, setAlertSet]   = useState(false);
  const [showIndicators, setShowIndicators] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorId>>(() => {
    try {
      const saved = localStorage.getItem("asset-indicators");
      if (saved) return new Set<IndicatorId>(JSON.parse(saved));
    } catch {}
    return new Set<IndicatorId>(["EMA_9", "EMA_21", "VOL"]);
  });
  const indicatorBtnRef = useRef<HTMLDivElement>(null);

  // Timeframe state
  const [showTF, setShowTF] = useState(false);
  const [activeTF, setActiveTF] = useState(() =>
    localStorage.getItem("asset-tf") ?? "5m"
  );
  const tfBtnRef = useRef<HTMLDivElement>(null);

  const TIMEFRAMES: { label: string; interval: string; period: string }[] = [
    { label: "1m",  interval: "1m",  period: "1d"  },
    { label: "5m",  interval: "5m",  period: "5d"  },
    { label: "15m", interval: "15m", period: "5d"  },
    { label: "30m", interval: "30m", period: "1mo" },
    { label: "1H",  interval: "60m", period: "1mo" },
    { label: "4H",  interval: "4h",  period: "3mo" },
    { label: "1D",  interval: "1d",  period: "1y"  },
    { label: "1W",  interval: "1wk", period: "2y"  },
  ];
  const currentTF = TIMEFRAMES.find(t => t.label === activeTF) ?? TIMEFRAMES[1];

  // Chart type state
  const [chartType, setChartType] = useState<ChartType>(() =>
    (localStorage.getItem("asset-chart-type") as ChartType | null) ?? "candle"
  );
  const setAndSaveChartType = (t: ChartType) => {
    setChartType(t);
    localStorage.setItem("asset-chart-type", t);
  };
  const CHART_TYPES: { id: ChartType; label: string }[] = [
    { id: "candle", label: "CANDLE" },
    { id: "ha",     label: "HA" },
    { id: "bar",    label: "BAR" },
    { id: "line",   label: "LINE" },
    { id: "area",   label: "AREA" },
  ];

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (indicatorBtnRef.current && !indicatorBtnRef.current.contains(e.target as Node)) {
        setShowIndicators(false);
      }
      if (tfBtnRef.current && !tfBtnRef.current.contains(e.target as Node)) {
        setShowTF(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Background prefetch: warm server + client cache for top crypto symbols ───
  useEffect(() => {
    const TOP_CRYPTO = ["BTC/USDT","ETH/USDT","SOL/USDT","XRP/USDT","BNB/USDT","DOGE/USDT"];
    const tf = currentTF;
    // Stagger requests so we don't hammer the server simultaneously
    TOP_CRYPTO.forEach((sym, i) => {
      setTimeout(() => prefetchCandles(sym, tf.interval, tf.period), i * 800);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // When user switches symbol, prefetch the next few in the list ──────────────
  useEffect(() => {
    const allCrypto = ALL_INSTRUMENTS.filter(i => i.assetClass === "crypto").map(i => i.symbol);
    const idx = allCrypto.indexOf(selected);
    if (idx === -1) return;
    const next = allCrypto.slice(idx + 1, idx + 4);
    next.forEach((sym, i) => {
      setTimeout(() => prefetchCandles(sym, currentTF.interval, currentTF.period), i * 600);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function toggleIndicator(id: IndicatorId) {
    setActiveIndicators(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem("asset-indicators", JSON.stringify([...next]));
      return next;
    });
  }

  function setTF(label: string) {
    setActiveTF(label);
    localStorage.setItem("asset-tf", label);
  }

  // Right sidebar resize
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(320);

  function handleDragStart(e: React.MouseEvent) {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;
    e.preventDefault();

    function onMove(ev: MouseEvent) {
      if (!isDragging.current) return;
      const delta = dragStartX.current - ev.clientX;
      setSidebarWidth(Math.max(140, Math.min(520, dragStartWidth.current + delta)));
    }
    function onUp() {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Live prices — sidebar batch every 15s, selected instrument every 8s for near-real-time feel
  const sidebarSymbols = ALL_INSTRUMENTS.map(i => i.symbol);
  const tickerPrices   = useFastBatchPrices(sidebarSymbols, 35000);
  const entryTick      = useFastPrice(selected, 8000);

  const filtered = ALL_INSTRUMENTS.filter(i =>
    i.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const data = ASSET_DATA[selected] || ASSET_DATA["ETH/USDT"];

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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#080c10", fontFamily: "'Poppins', sans-serif", overflow: "hidden" }}>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; }
        .asset-scroll::-webkit-scrollbar { width: 0; height: 0; }
        .asset-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .inst-card:hover { background: #0c1219 !important; cursor: pointer; }
        .chart-btn { background: #0c1219; border: 1px solid #172233; color: #4a6580; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; padding: 5px 12px; cursor: pointer; transition: all 0.15s; }
        .chart-btn:hover { border-color: #3b82f6; color: #c8d8e8; }
        .chart-btn-alert { background: #0c1219; border: 1px solid #172233; color: #c8d8e8; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; padding: 5px 12px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
        .chart-btn-alert:hover { border-color: #f59e0b; color: #f59e0b; }
        .set-alert-btn { background: #100d04; border: 1.5px solid #c8a84b; color: #c8a84b; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; padding: 13px 28px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 8px; border-radius: 3px; }
        .set-alert-btn:hover { background: rgba(200,168,75,0.12); border-color: #f0c040; color: #f0c040; }
        .set-alert-btn.active { background: rgba(200,168,75,0.18); border-color: #f0c040; color: #f0c040; }
        .share-btn { background: #5b4fcf; border: none; color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; padding: 13px 32px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 8px; border-radius: 3px; }
        .share-btn:hover { background: #6c63d9; }
        .ctx-row:hover { background: rgba(255,255,255,0.02); }
        .news-btn { background: #1a0a0e; border: 1px solid #f4617f; color: #f4617f; font-size: 9px; font-weight: 800; letter-spacing: 0.12em; padding: 5px 14px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
      `}</style>

      {/* ── Main Content ── */}
      <div className="asset-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 0 32px" }}>


        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Entry / TP / SL / RR Panel ── */}
          <div style={{ background: "#0a0f16", border: "1px solid #0f1923", borderRadius: 4, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            {[
              {
                label: "ENTRY",
                value: (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 12 12"
                      fill={entryTick.direction === "down" ? "#f4617f" : "#22d3a5"}
                      style={{ transition: "fill 0.3s" }}>
                      {entryTick.direction === "down"
                        ? <polygon points="6,11 11,2 1,2" />
                        : <polygon points="6,1 11,10 1,10" />}
                    </svg>
                    <TickingPrice
                      price={entryTick.price ?? parseFloat(data.entry)}
                      prevPrice={entryTick.prevPrice}
                      direction={entryTick.direction}
                      fontSize={9}
                      fontWeight={700}
                    />
                  </div>
                )
              },
              { label: "TARGET (TP)", value: <span style={{ fontSize: 9, fontWeight: 700, color: "#c8d8e8" }}>{data.tp}</span> },
              { label: "PROTECT (SL)", value: <span style={{ fontSize: 9, fontWeight: 700, color: "#c8d8e8" }}>{data.sl}</span> },
              { label: "RISK : REWARD", value: <span style={{ fontSize: 9, fontWeight: 700, color: "#c8d8e8" }}>{data.rr}</span> },
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
          <div style={{
            background: "#07090f",
            border: "1px solid #131d2b",
            borderRadius: 4,
            padding: "22px 28px",
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}>
            {/* Score Box */}
            <div style={{
              width: 68, height: 68, flexShrink: 0,
              border: "1.5px solid #1e2d45",
              borderRadius: 4,
              background: "#0b1120",
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative", overflow: "hidden",
            }}>
              {/* Thick diagonal slash */}
              <svg style={{ position: "absolute", top: 0, left: 0 }} width="68" height="68">
                <line x1="14" y1="58" x2="54" y2="10" stroke="#5b4fcf" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
              </svg>
              <span style={{
                fontSize: 16, fontWeight: 800, color: "#ffffff",
                position: "relative", letterSpacing: "0.02em",
              }}>{data.probability}%</span>
            </div>

            {/* Text */}
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 20, fontWeight: 800, color: "#ffffff",
                letterSpacing: "0.05em", marginBottom: 5,
              }}>
                PROBABILITY: {data.probability}%
              </div>
              <div style={{
                fontSize: 10, fontWeight: 600,
                color: "#3d9fd3",
                letterSpacing: "0.1em",
              }}>
                OPTIMAL RISK: {data.optimalRisk}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
              <button className={`set-alert-btn${alertSet ? " active" : ""}`} onClick={() => setAlertSet(!alertSet)}>
                <Bell size={13} />
                {alertSet ? "ALERT SET" : "SET ALERT"}
              </button>
              <button className="share-btn">
                <Share2 size={13} />
                SHARE
              </button>
            </div>
          </div>

          {/* ── Live Visualizer Chart ── */}
          <div style={{ background: "#0a0f16", border: "1px solid #0f1923", borderRadius: 4, overflow: "hidden" }}>
            {/* Chart Header */}
            {/* ── Row 1: symbol + clock + alert ── */}
            <div style={{ padding: "10px 16px 8px", borderBottom: "1px solid #0a1520", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 9, color: "#2d4a63", letterSpacing: "0.06em" }}>
                <LiveClock />
              </div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", color: "#c8d8ec", fontFamily: "monospace" }}>
                {selected}
              </div>
              <button className="chart-btn-alert" style={{ flexShrink: 0 }}>
                <Bell size={11} />
                ALERT
              </button>
            </div>

            {/* ── Row 2: chart controls toolbar ── */}
            <div style={{ padding: "6px 16px", borderBottom: "1px solid #0f1923", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {/* Left: chart type pills */}
              <div style={{ display: "flex", gap: 2, background: "#080c10", border: "1px solid #0f1923", borderRadius: 4, padding: 2, flexShrink: 0 }}>
                {CHART_TYPES.map(ct => {
                  const active = ct.id === chartType;
                  return (
                    <button
                      key={ct.id}
                      onClick={() => setAndSaveChartType(ct.id)}
                      style={{
                        background: active ? "rgba(59,130,246,0.18)" : "transparent",
                        border: `1px solid ${active ? "#3b82f6" : "transparent"}`,
                        borderRadius: 3, color: active ? "#60a5fa" : "#2d4a63",
                        fontSize: 9, fontWeight: 800, letterSpacing: "0.07em",
                        padding: "4px 8px", cursor: "pointer", transition: "all 0.12s",
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.color = "#4a6580"; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.color = "#2d4a63"; }}
                    >
                      {ct.label}
                    </button>
                  );
                })}
              </div>

              {/* Right: TF + Indicators */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <div ref={tfBtnRef} style={{ position: "relative" }}>
                  <button
                    className="chart-btn"
                    style={{ borderColor: showTF ? "#22d3a5" : undefined, color: showTF ? "#22d3a5" : undefined }}
                    onClick={() => setShowTF(v => !v)}
                  >
                    {activeTF}
                  </button>
                  {showTF && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 6px)", left: "50%",
                      transform: "translateX(-50%)", zIndex: 100,
                      background: "#0c1219", border: "1px solid #172233", borderRadius: 6,
                      padding: "6px", display: "grid", gridTemplateColumns: "1fr 1fr",
                      gap: 4, minWidth: 120,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}>
                      {TIMEFRAMES.map(tf => {
                        const isActive = tf.label === activeTF;
                        return (
                          <button
                            key={tf.label}
                            onClick={() => { setTF(tf.label); setShowTF(false); }}
                            style={{
                              background: isActive ? "rgba(34,211,165,0.15)" : "transparent",
                              border: `1px solid ${isActive ? "#22d3a5" : "#172233"}`,
                              borderRadius: 4, color: isActive ? "#22d3a5" : "#4a6580",
                              fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
                              padding: "6px 0", cursor: "pointer",
                              transition: "all 0.1s",
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = "#2d4a63"; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = "#172233"; }}
                          >
                            {tf.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Indicators toggle */}
                <div ref={indicatorBtnRef} style={{ position: "relative" }}>
                  <button
                    className="chart-btn"
                    style={{ borderColor: showIndicators ? "#7c3aed" : undefined, color: showIndicators ? "#a78bfa" : undefined }}
                    onClick={() => setShowIndicators(v => !v)}
                  >
                    INDICATORS
                    {activeIndicators.size > 0 && (
                      <span style={{
                        marginLeft: 5, background: "#7c3aed", color: "#fff",
                        borderRadius: 9, fontSize: 8, fontWeight: 800,
                        padding: "1px 5px", letterSpacing: 0,
                      }}>{activeIndicators.size}</span>
                    )}
                  </button>

                  {showIndicators && (() => {
                    const categories = ["Trend", "Momentum", "Volume", "Volatility"] as const;
                    return (
                    <div style={{
                      position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
                      background: "#0c1219", border: "1px solid #172233", borderRadius: 6,
                      minWidth: 220, maxHeight: 440, display: "flex", flexDirection: "column",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                    }}>
                      {/* Header */}
                      <div style={{ padding: "8px 14px", fontSize: 9, fontWeight: 800, color: "#2d4a63", letterSpacing: "0.12em", borderBottom: "1px solid #0f1923", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>INDICATORS ({INDICATOR_DEFS.length})</span>
                        <span style={{ color: "#7c3aed" }}>{activeIndicators.size} ON</span>
                      </div>
                      {/* Scrollable body */}
                      <div style={{ overflowY: "auto", flex: 1 }} className="asset-scroll">
                        {categories.map(cat => {
                          const catDefs = INDICATOR_DEFS.filter(d => d.category === cat);
                          return (
                            <div key={cat}>
                              <div style={{ padding: "6px 14px 4px", fontSize: 8, fontWeight: 800, color: "#1e3045", letterSpacing: "0.14em", background: "#080c10" }}>
                                {cat.toUpperCase()}
                              </div>
                              {catDefs.map(ind => {
                                const on = activeIndicators.has(ind.id);
                                return (
                                  <div
                                    key={ind.id}
                                    onClick={() => toggleIndicator(ind.id)}
                                    style={{
                                      display: "flex", alignItems: "center", gap: 10,
                                      padding: "6px 14px", cursor: "pointer",
                                      background: on ? "rgba(124,58,237,0.08)" : "transparent",
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = on ? "rgba(124,58,237,0.08)" : "transparent")}
                                  >
                                    <span style={{ width: 10, height: 3, borderRadius: 2, background: ind.color, flexShrink: 0 }} />
                                    <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: on ? "#c8d8e8" : "#4a6580", letterSpacing: "0.05em" }}>
                                      {ind.label}
                                    </span>
                                    <span style={{
                                      width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                                      border: `2px solid ${on ? "#7c3aed" : "#1e3045"}`,
                                      background: on ? "#7c3aed" : "transparent",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                    }}>
                                      {on && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff" }} />}
                            </span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })()}
                </div>

              </div>
            </div>

            {/* Chart */}
            <TradingChart symbol={selected} interval={currentTF.interval} period={currentTF.period} height={360} activeIndicators={activeIndicators} chartType={chartType} />
          </div>
        </div>
      </div>

      {/* ── Right Sidebar ── */}
      <div style={{ width: sidebarWidth, minWidth: 140, maxWidth: 520, background: "#0a0f16", borderLeft: "1px solid #0f1923", display: "flex", flexDirection: "column", height: "100%", position: "relative", flexShrink: 0 }}>
        {/* Drag handle */}
        <div
          onMouseDown={handleDragStart}
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, cursor: "col-resize", zIndex: 10, background: "transparent" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(59,130,246,0.25)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        />

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
          {filtered.map(card => {
            const isActive = card.symbol === selected;
            return (
              <div
                key={card.symbol}
                className="inst-card"
                onClick={() => setSelected(card.symbol)}
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid #0f1923",
                  background: isActive ? "#0e1620" : "transparent",
                  borderRight: isActive ? "3px solid #7c3aed" : "3px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                {/* Row 1: Symbol + Category badge */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? "#7c6ff7" : "#8ba8c4", letterSpacing: "0.04em" }}>
                    {card.symbol}
                  </span>
                  {sidebarWidth >= 200 && (
                    <span style={{ fontSize: 8, fontWeight: 700, color: "#2d4a63", letterSpacing: "0.08em",
                      background: "#0c1219", border: "1px solid #172233", borderRadius: 3, padding: "2px 6px" }}>
                      {card.category.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Row 2: Arrow + Price + Change % */}
                {(() => {
                  const tp = tickerPrices[card.symbol];
                  const dir = tp?.direction ?? "flat";
                  const chg = tp?.changePercent;
                  return (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: 4,
                          background: dir === "up" ? "rgba(34,211,165,0.12)" : dir === "down" ? "rgba(244,97,127,0.12)" : "rgba(255,255,255,0.04)",
                          display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                          <svg width="12" height="12" viewBox="0 0 12 12"
                            fill={dir === "up" ? "#22d3a5" : dir === "down" ? "#f4617f" : "#2d4a63"}>
                            {dir === "down"
                              ? <polygon points="6,11 11,2 1,2" />
                              : <polygon points="6,1 11,10 1,10" />}
                          </svg>
                        </div>
                        <TickingPrice
                          price={tp?.price ?? null}
                          prevPrice={tp?.prevPrice ?? null}
                          direction={dir}
                          fontSize={11}
                        />
                      </div>
                      {chg != null && sidebarWidth >= 200 && (
                        <span style={{ fontSize: 10, fontWeight: 700,
                          color: chg >= 0 ? "#22d3a5" : "#f4617f", letterSpacing: "0.04em" }}>
                          {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
