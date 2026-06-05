import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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

// ─── Signal → display data transformer ────────────────────────────────────────

function trendColor(dir?: string | null): string {
  if (!dir) return "#4a6580";
  const d = dir.toLowerCase();
  if (d === "bullish") return "#22d3a5";
  if (d === "bearish") return "#f4617f";
  return "#f59e0b";
}

function valueColor(val?: string | null): string {
  if (!val) return "#4a6580";
  const v = val.toUpperCase();
  if (["BULLISH","CONFIRMED","HIGH","TAKEN","DISCOUNT","AVAILABLE"].some(k => v.includes(k))) return "#22d3a5";
  if (["BEARISH","REJECTED","LOW","PREMIUM"].some(k => v.includes(k))) return "#f4617f";
  if (["NEUTRAL","PENDING","MODERATE"].some(k => v.includes(k))) return "#f59e0b";
  return "#c8d8e8";
}

function parseReason(reasons: string[] | null | undefined, keyword: string): string {
  if (!reasons?.length) return "—";
  const match = reasons.find(r => r.toLowerCase().includes(keyword.toLowerCase()));
  if (!match) return "—";
  const parts = match.split(/:\s*/);
  return parts.length > 1 ? parts.slice(1).join(": ").trim().toUpperCase() : match.trim().toUpperCase();
}

function deriveOptimalRisk(confidence?: number | null): string {
  if (!confidence) return "—";
  if (confidence >= 85) return "1.5% - 2.0% CAPITAL";
  if (confidence >= 70) return "1.0% - 1.5% CAPITAL";
  return "0.5% - 1.0% CAPITAL";
}

function buildPriceAction(sig: any): { icon: "layers" | "layers2" | "zoom"; text: string; bold?: string }[] {
  const items: { icon: "layers" | "layers2" | "zoom"; text: string; bold?: string }[] = [];

  if (sig.bocChochDetected) {
    items.push({ icon: "layers", text: `${sig.bocChochDetected.toUpperCase()} CONFIRMED.`, bold: sig.bocChochDetected.toUpperCase() });
  } else if (sig.smcFactors?.length) {
    items.push({ icon: "layers", text: sig.smcFactors[0].toUpperCase(), bold: undefined });
  }

  if (sig.orderBlockType) {
    items.push({ icon: "layers2", text: `${sig.orderBlockType.toUpperCase()} ORDER BLOCK IN PLAY.`, bold: "ORDER BLOCK" });
  } else if (sig.smcFactors?.length > 1) {
    items.push({ icon: "layers2", text: sig.smcFactors[1].toUpperCase(), bold: undefined });
  }

  if (sig.fvgDetected) {
    items.push({ icon: "zoom", text: "FAIR VALUE GAP IDENTIFIED — AWAITING MITIGATION.", bold: "FAIR VALUE GAP" });
  } else if (sig.liquiditySweep) {
    items.push({ icon: "zoom", text: "LIQUIDITY SWEEP DETECTED — ENTRY TRIGGER PENDING.", bold: "LIQUIDITY SWEEP" });
  } else if (sig.marketContext) {
    items.push({ icon: "zoom", text: sig.marketContext.toUpperCase(), bold: undefined });
  }

  // Fill to 3 items with placeholders if short
  while (items.length < 3) {
    items.push({ icon: "zoom", text: "AWAITING FURTHER CONFIRMATION.", bold: undefined });
  }

  return items.slice(0, 3);
}

function signalToDisplayData(sig: any | null) {
  if (!sig) return null;

  const context: ContextItem[] = [
    { label: "1D TREND",      value: sig.trendDirection?.toUpperCase() || "—",        color: trendColor(sig.trendDirection) },
    { label: "4H STRUCTURE",  value: parseReason(sig.technicalReasons, "4H"),         color: valueColor(parseReason(sig.technicalReasons, "4H")) },
    { label: "1H MOMENTUM",   value: parseReason(sig.technicalReasons, "1H"),         color: valueColor(parseReason(sig.technicalReasons, "1H")) },
    { label: "15M LIQUIDITY", value: sig.liquiditySweep ? "TAKEN" : "AVAILABLE",     color: sig.liquiditySweep ? "#f59e0b" : "#22d3a5" },
    { label: (sig.strategy?.toUpperCase() || "STRATEGY"), value: sig.orderBlockType?.toUpperCase() || "—", color: "#22d3a5" },
  ];

  const tech: TechItem[] = [
    { label: "ADX POWER",       value: parseReason(sig.technicalReasons, "ADX"),     color: valueColor(parseReason(sig.technicalReasons, "ADX")) },
    { label: "MACD",            value: parseReason(sig.technicalReasons, "MACD"),    color: valueColor(parseReason(sig.technicalReasons, "MACD")) },
    { label: "EMA 200",         value: parseReason(sig.technicalReasons, "EMA 200"), color: valueColor(parseReason(sig.technicalReasons, "EMA 200")) },
    { label: "EMA (5,9,13,21)", value: parseReason(sig.technicalReasons, "EMA"),     color: valueColor(parseReason(sig.technicalReasons, "EMA")) },
    { label: "VOLUME",          value: parseReason(sig.technicalReasons, "Volume"),  color: valueColor(parseReason(sig.technicalReasons, "Volume")) },
  ];

  return {
    entry: sig.entryPrice ? String(sig.entryPrice) : null,
    tp:    sig.takeProfit ? String(sig.takeProfit) : "—",
    sl:    sig.stopLoss   ? String(sig.stopLoss)   : "—",
    rr:    sig.riskRewardRatio ? `1:${sig.riskRewardRatio}` : "—",
    direction: (sig.type === "buy" ? "up" : "down") as "up" | "down",
    probability: sig.overallConfidence ?? 0,
    optimalRisk: deriveOptimalRisk(sig.overallConfidence),
    context,
    tech,
    priceAction: buildPriceAction(sig),
  };
}

function assetClassToCategory(ac: string): Instrument["category"] {
  if (ac === "crypto")    return "Crypto";
  if (ac === "forex")     return "Forex";
  if (ac === "commodity") return "Commodity";
  if (ac === "index")     return "Index";
  return "Stock";
}

// ASSET_DATA removed — data now fetched live from /api/trading-signals

const _PLACEHOLDER_CONTEXT: ContextItem[] = [
  { label: "1D TREND",      value: "—", color: "#2d4a63" },
  { label: "4H STRUCTURE",  value: "—", color: "#2d4a63" },
  { label: "1H MOMENTUM",   value: "—", color: "#2d4a63" },
  { label: "15M LIQUIDITY", value: "—", color: "#2d4a63" },
  { label: "STRATEGY",      value: "—", color: "#2d4a63" },
];
const _PLACEHOLDER_TECH: TechItem[] = [
  { label: "ADX POWER",       value: "—", color: "#2d4a63" },
  { label: "MACD",            value: "—", color: "#2d4a63" },
  { label: "EMA 200",         value: "—", color: "#2d4a63" },
  { label: "EMA (5,9,13,21)", value: "—", color: "#2d4a63" },
  { label: "VOLUME",          value: "—", color: "#2d4a63" },
];
const _PLACEHOLDER_PRICE_ACTION = [
  { icon: "layers"  as const, text: "NO ACTIVE SIGNAL FOR THIS INSTRUMENT.", bold: undefined },
  { icon: "layers2" as const, text: "SIGNAL WILL APPEAR WHEN STRATEGY IDENTIFIES A SETUP.", bold: undefined },
  { icon: "zoom"    as const, text: "MARKET SCANNING IN PROGRESS.", bold: undefined },
];

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
export default function AssetPage({ darkMode = true }: { darkMode?: boolean }) {
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

  // Mobile responsiveness
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [mobileShowSidebar, setMobileShowSidebar] = useState(false);
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

  // Track mobile breakpoint
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobileShowSidebar(false);
    };
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // When user switches symbol, prefetch the next few in the sidebar list ───────
  useEffect(() => {
    const idx = sidebarInstruments.findIndex(i => i.symbol === selected);
    if (idx === -1) return;
    const next = sidebarInstruments.slice(idx + 1, idx + 4).map(i => i.symbol);
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

  // ── Theme palette ─────────────────────────────────────────────────────────
  const C = darkMode ? {
    bg:       '#080c10', bg2: '#0a0f16', bg3: '#0c1219',
    probBg:   '#07090f', scoreBg: '#0b1120', activeBg: '#0e1620',
    catHdr:   '#080c10',
    border:   '#0f1923', border2: '#172233', border3: '#131d2b', border4: '#1e2d45',
    text:     '#c8d8e8', textB: '#c8d8ec', heroText: '#ffffff',
    muted:    '#4a6580', muted2: '#3a5470', dim: '#2d4a63', dim2: '#1e3045',
  } : {
    bg:       '#f0f4f8', bg2: '#ffffff', bg3: '#f1f5f9',
    probBg:   '#f8fafc', scoreBg: '#eef2f7', activeBg: '#e8f0fb',
    catHdr:   '#f1f5f9',
    border:   '#e2e8f0', border2: '#cbd5e1', border3: '#dde4ed', border4: '#c8d3e0',
    text:     '#1e293b', textB: '#1e293b', heroText: '#0f172a',
    muted:    '#475569', muted2: '#64748b', dim: '#94a3b8', dim2: '#b0bec5',
  };

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

  // ── All active signals → sidebar instrument list ─────────────────────────
  const { data: allSignals = [] } = useQuery<{ symbol: string; assetClass: string }[]>({
    queryKey: ["all-active-signals"],
    queryFn: async () => {
      const res = await fetch("/api/trading-signals?status=active");
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const sidebarInstruments: Instrument[] = (() => {
    const seen = new Set<string>();
    const list: Instrument[] = [];
    for (const s of allSignals) {
      if (!seen.has(s.symbol)) {
        seen.add(s.symbol);
        list.push({ symbol: s.symbol, assetClass: s.assetClass as Instrument["assetClass"], category: assetClassToCategory(s.assetClass) });
      }
    }
    return list;
  })();

  // Live prices — sidebar batch every 35s, selected instrument every 8s
  const sidebarSymbols = sidebarInstruments.map(i => i.symbol);
  const tickerPrices   = useFastBatchPrices(sidebarSymbols, 35000);
  const entryTick      = useFastPrice(selected, 8000);

  // ── Live signal fetch — refetches every 60s, shows empty state when no signal ──
  const { data: rawSignal, isLoading: signalLoading } = useQuery({
    queryKey: ["asset-signal", selected],
    queryFn: async () => {
      const res = await fetch(`/api/trading-signals?symbol=${encodeURIComponent(selected)}&status=active`);
      if (!res.ok) return null;
      const json = await res.json();
      return Array.isArray(json) ? (json[0] ?? null) : null;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Transform DB signal into display-ready structure; null = no signal
  const data = signalToDisplayData(rawSignal ?? null);

  // Fallback display values used when data is null (no signal)
  const displayContext    = data?.context     ?? _PLACEHOLDER_CONTEXT;
  const displayTech       = data?.tech        ?? _PLACEHOLDER_TECH;
  const displayPriceAction = data?.priceAction ?? _PLACEHOLDER_PRICE_ACTION;

  const filtered = sidebarInstruments.filter(i =>
    i.symbol.toLowerCase().includes(search.toLowerCase())
  );

  function boldify(text: string, bold?: string) {
    if (!bold) return <span>{text}</span>;
    const parts = text.split(bold);
    return (
      <span>
        {parts[0]}<strong style={{ color: C.heroText }}>{bold}</strong>{parts[1]}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, fontFamily: "'Poppins', sans-serif", overflow: "hidden" }}>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; }
        .asset-scroll::-webkit-scrollbar { width: 0; height: 0; }
        .asset-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .inst-card:hover { background: ${C.bg3} !important; cursor: pointer; }
        .chart-btn { background: ${C.bg3}; border: 1px solid ${C.border2}; color: ${C.muted}; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; padding: 5px 12px; cursor: pointer; transition: all 0.15s; }
        .chart-btn:hover { border-color: #3b82f6; color: ${C.text}; }
        .chart-btn-alert { background: ${C.bg3}; border: 1px solid ${C.border2}; color: ${C.text}; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; padding: 5px 12px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 6px; }
        .chart-btn-alert:hover { border-color: #f59e0b; color: #f59e0b; }
        .set-alert-btn { background: ${darkMode ? '#100d04' : '#fffbec'}; border: 1.5px solid #c8a84b; color: #c8a84b; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; padding: 13px 28px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 8px; border-radius: 3px; }
        .set-alert-btn:hover { background: rgba(200,168,75,0.12); border-color: #f0c040; color: #f0c040; }
        .set-alert-btn.active { background: rgba(200,168,75,0.18); border-color: #f0c040; color: #f0c040; }
        .share-btn { background: #5b4fcf; border: none; color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; padding: 13px 32px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 8px; border-radius: 3px; }
        .share-btn:hover { background: #6c63d9; }
        .ctx-row:hover { background: ${darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)'}; }
        .news-btn { background: ${darkMode ? '#1a0a0e' : '#fff0f3'}; border: 1px solid #f4617f; color: #f4617f; font-size: 9px; font-weight: 800; letter-spacing: 0.12em; padding: 5px 14px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
        .mob-instruments-fab { display: none; }
        @media (max-width: 767px) {
          .entry-grid { grid-template-columns: 1fr 1fr !important; }
          .entry-grid > div:nth-child(2n) { border-right: none !important; }
          .entry-grid > div:nth-child(-n+2) { border-bottom: 1px solid ${C.border}; }
          .analysis-grid { grid-template-columns: 1fr !important; }
          .asset-main-pad { padding: 12px 12px 32px !important; }
          .asset-inner-pad { padding: 12px 12px !important; }
          .prob-panel { flex-wrap: wrap; gap: 12px !important; }
          .prob-btns { flex-direction: column; gap: 6px !important; width: 100%; }
          .set-alert-btn, .share-btn { width: 100%; justify-content: center; }
          .chart-row2 { flex-wrap: wrap; gap: 6px !important; }
          .chart-type-pills { overflow-x: auto; flex-shrink: 1 !important; min-width: 0; }
          .mob-instruments-fab { display: flex !important; position: fixed; bottom: 24px; right: 20px; z-index: 40; background: #7c3aed; border: none; border-radius: 28px; color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.1em; padding: 11px 18px; cursor: pointer; align-items: center; gap: 6px; box-shadow: 0 4px 20px rgba(124,58,237,0.5); }
        }
      `}</style>

      {/* ── Main Content ── */}
      <div className="asset-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 0 32px" }}>


        <div className="asset-inner-pad" style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Entry / TP / SL / RR Panel ── */}
          <div className="entry-grid" style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
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
                      price={entryTick.price ?? parseFloat(data?.entry ?? "0")}
                      prevPrice={entryTick.prevPrice}
                      direction={entryTick.direction}
                      fontSize={9}
                      fontWeight={700}
                    />
                  </div>
                )
              },
              { label: "TARGET (TP)", value: <span style={{ fontSize: 9, fontWeight: 700, color: C.text }}>{data?.tp ?? "—"}</span> },
              { label: "PROTECT (SL)", value: <span style={{ fontSize: 9, fontWeight: 700, color: C.text }}>{data?.sl ?? "—"}</span> },
              { label: "RISK : REWARD", value: <span style={{ fontSize: 9, fontWeight: 700, color: C.text }}>{data?.rr ?? "—"}</span> },
            ].map((col, i) => (
              <div key={i} style={{
                padding: "20px 16px", textAlign: "center",
                borderRight: i < 3 ? `1px solid ${C.border}` : undefined
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.muted2, letterSpacing: "0.12em", marginBottom: 12 }}>{col.label}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{col.value}</div>
              </div>
            ))}
          </div>

          {/* ── Analysis Panels Row ── */}
          <div className="analysis-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

            {/* Context Alignment */}
            <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, background: "#3b82f6" }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: C.muted, letterSpacing: "0.14em" }}>CONTEXT ALIGNMENT</span>
              </div>
              {displayContext.map((row, i) => (
                <div key={i} className="ctx-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 4px", borderRadius: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {row.loading
                      ? <Loader2 size={10} color="#f59e0b" style={{ animation: "spin 1.5s linear infinite" }} />
                      : <ChevronRight size={10} color={C.dim} />}
                    <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>{row.label}</span>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, color: row.color, letterSpacing: "0.1em" }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Technical Confluence */}
            <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, background: "#22d3a5" }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: C.muted, letterSpacing: "0.14em" }}>TECHNICAL CONFLUENCE</span>
              </div>
              {displayTech.map((row, i) => (
                <div key={i} className="ctx-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 4px", borderRadius: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <ChevronRight size={10} color={C.dim} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>{row.label}</span>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, color: row.color, letterSpacing: "0.1em" }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Price Action */}
            <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, background: "#f59e0b" }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: C.muted, letterSpacing: "0.14em" }}>PRICE ACTION</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {displayPriceAction.map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ flexShrink: 0, marginTop: 1 }}>
                      {item.icon === "zoom"
                        ? <ZoomIcon color="#f59e0b" />
                        : <LayersIcon color={item.icon === "layers" ? "#3b82f6" : "#3b82f6"} />}
                    </div>
                    <p style={{ fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: "0.06em", lineHeight: 1.7, margin: 0 }}>
                      {boldify(item.text, item.bold)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Probability Panel ── */}
          <div className="prob-panel" style={{
            background: C.probBg,
            border: `1px solid ${C.border3}`,
            borderRadius: 4,
            padding: "22px 28px",
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}>
            {/* Score Box */}
            <div style={{
              width: 68, height: 68, flexShrink: 0,
              border: `1.5px solid ${C.border4}`,
              borderRadius: 4,
              background: C.scoreBg,
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative", overflow: "hidden",
            }}>
              {/* Thick diagonal slash */}
              <svg style={{ position: "absolute", top: 0, left: 0 }} width="68" height="68">
                <line x1="14" y1="58" x2="54" y2="10" stroke="#5b4fcf" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
              </svg>
              <span style={{
                fontSize: 8, fontWeight: 800, color: C.heroText,
                position: "relative", letterSpacing: "0.02em",
              }}>{data?.probability ?? 0}%</span>
            </div>

            {/* Text */}
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 13, fontWeight: 800, color: C.heroText,
                letterSpacing: "0.05em", marginBottom: 5,
              }}>
                PROBABILITY: {data?.probability ?? 0}%
              </div>
              <div style={{
                fontSize: 13, fontWeight: 600,
                color: "#3d9fd3",
                letterSpacing: "0.1em",
              }}>
                OPTIMAL RISK: {data?.optimalRisk ?? "—"}
              </div>
            </div>

            {/* Buttons */}
            <div className="prob-btns" style={{ display: "flex", gap: 10, flexShrink: 0 }}>
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
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
            {/* Chart Header */}
            {/* ── Row 1: symbol + clock + alert ── */}
            <div style={{ padding: "10px 16px 8px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.06em" }}>
                <LiveClock />
              </div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", color: C.textB, fontFamily: "monospace" }}>
                {selected}
              </div>
              <button className="chart-btn-alert" style={{ flexShrink: 0 }}>
                <Bell size={11} />
                ALERT
              </button>
            </div>

            {/* ── Row 2: chart controls toolbar ── */}
            <div className="chart-row2" style={{ padding: "6px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {/* Left: chart type pills */}
              <div className="chart-type-pills" style={{ display: "flex", gap: 2, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: 2, flexShrink: 0 }}>
                {CHART_TYPES.map(ct => {
                  const active = ct.id === chartType;
                  return (
                    <button
                      key={ct.id}
                      onClick={() => setAndSaveChartType(ct.id)}
                      style={{
                        background: active ? "rgba(59,130,246,0.18)" : "transparent",
                        border: `1px solid ${active ? "#3b82f6" : "transparent"}`,
                        borderRadius: 3, color: active ? "#60a5fa" : C.dim,
                        fontSize: 9, fontWeight: 800, letterSpacing: "0.07em",
                        padding: "4px 8px", cursor: "pointer", transition: "all 0.12s",
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.color = C.muted; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.color = C.dim; }}
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
                      background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 6,
                      padding: "6px", display: "grid", gridTemplateColumns: "1fr 1fr",
                      gap: 4, minWidth: 120,
                      boxShadow: darkMode ? "0 8px 24px rgba(0,0,0,0.5)" : "0 8px 24px rgba(0,0,0,0.15)",
                    }}>
                      {TIMEFRAMES.map(tf => {
                        const isActive = tf.label === activeTF;
                        return (
                          <button
                            key={tf.label}
                            onClick={() => { setTF(tf.label); setShowTF(false); }}
                            style={{
                              background: isActive ? "rgba(34,211,165,0.15)" : "transparent",
                              border: `1px solid ${isActive ? "#22d3a5" : C.border2}`,
                              borderRadius: 4, color: isActive ? "#22d3a5" : C.muted,
                              fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
                              padding: "6px 0", cursor: "pointer",
                              transition: "all 0.1s",
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = C.dim; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = C.border2; }}
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
                      background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 6,
                      minWidth: 220, maxHeight: 440, display: "flex", flexDirection: "column",
                      boxShadow: darkMode ? "0 8px 32px rgba(0,0,0,0.6)" : "0 8px 32px rgba(0,0,0,0.15)",
                    }}>
                      {/* Header */}
                      <div style={{ padding: "8px 14px", fontSize: 9, fontWeight: 800, color: C.dim, letterSpacing: "0.12em", borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>INDICATORS ({INDICATOR_DEFS.length})</span>
                        <span style={{ color: "#7c3aed" }}>{activeIndicators.size} ON</span>
                      </div>
                      {/* Scrollable body */}
                      <div style={{ overflowY: "auto", flex: 1 }} className="asset-scroll">
                        {categories.map(cat => {
                          const catDefs = INDICATOR_DEFS.filter(d => d.category === cat);
                          return (
                            <div key={cat}>
                              <div style={{ padding: "6px 14px 4px", fontSize: 8, fontWeight: 800, color: C.dim2, letterSpacing: "0.14em", background: C.catHdr }}>
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
                                    onMouseEnter={e => (e.currentTarget.style.background = darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = on ? "rgba(124,58,237,0.08)" : "transparent")}
                                  >
                                    <span style={{ width: 10, height: 3, borderRadius: 2, background: ind.color, flexShrink: 0 }} />
                                    <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: on ? C.text : C.muted, letterSpacing: "0.05em" }}>
                                      {ind.label}
                                    </span>
                                    <span style={{
                                      width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                                      border: `2px solid ${on ? "#7c3aed" : C.dim2}`,
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

      {/* ── Mobile backdrop ── */}
      {isMobile && mobileShowSidebar && (
        <div
          onClick={() => setMobileShowSidebar(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 49 }}
        />
      )}

      {/* ── Right Sidebar ── */}
      <div style={{
        width: isMobile ? 280 : sidebarWidth,
        minWidth: isMobile ? undefined : 140,
        maxWidth: isMobile ? undefined : 520,
        background: C.bg2,
        borderLeft: `1px solid ${C.border}`,
        display: isMobile ? (mobileShowSidebar ? "flex" : "none") : "flex",
        flexDirection: "column",
        height: "100%",
        position: isMobile ? "fixed" : "relative",
        right: isMobile ? 0 : undefined,
        top: isMobile ? 0 : undefined,
        bottom: isMobile ? 0 : undefined,
        zIndex: isMobile ? 50 : undefined,
        flexShrink: 0,
      }}>
        {/* Drag handle — hidden on mobile */}
        {!isMobile && (
        <div
          onMouseDown={handleDragStart}
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, cursor: "col-resize", zIndex: 10, background: "transparent" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(59,130,246,0.25)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        />
        )}

        {/* Mobile close button */}
        {isMobile && (
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: C.muted, letterSpacing: "0.12em" }}>INSTRUMENTS</span>
            <button onClick={() => setMobileShowSidebar(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
          </div>
        )}

        {/* Search */}
        <div style={{ padding: "16px 14px 10px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH INSTRUMENTS..."
              style={{
                width: "100%", background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 4,
                color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                padding: "8px 10px 8px 30px", outline: "none", fontFamily: "inherit"
              }}
            />
          </div>
        </div>

        {/* Instrument List */}
        <div className="asset-scroll" style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "32px 16px", textAlign: "center", color: C.dim, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", lineHeight: 1.8 }}>
              {search ? "NO MATCH" : "NO ACTIVE SIGNALS"}
              {!search && <div style={{ fontSize: 9, fontWeight: 500, marginTop: 6, color: C.muted2 }}>Instruments appear here when the scanner identifies a setup</div>}
            </div>
          )}
          {filtered.map(card => {
            const isActive = card.symbol === selected;
            return (
              <div
                key={card.symbol}
                className="inst-card"
                onClick={() => setSelected(card.symbol)}
                style={{
                  padding: "14px 16px",
                  borderBottom: `1px solid ${C.border}`,
                  background: isActive ? C.activeBg : "transparent",
                  borderRight: isActive ? "3px solid #7c3aed" : "3px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                {/* Row 1: Symbol + Category badge */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? "#7c6ff7" : C.muted, letterSpacing: "0.04em" }}>
                    {card.symbol}
                  </span>
                  {sidebarWidth >= 200 && (
                    <span style={{ fontSize: 8, fontWeight: 700, color: C.dim, letterSpacing: "0.08em",
                      background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 3, padding: "2px 6px" }}>
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

      {/* ── Mobile Instruments FAB ── */}
      <button
        className="mob-instruments-fab"
        onClick={() => setMobileShowSidebar(true)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        MARKETS
      </button>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
