import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type HistogramData,
  type Time,
} from "lightweight-charts";

export type ChartType = "candle" | "ha" | "bar" | "line" | "area";

// ── Asset-class map ───────────────────────────────────────────────────────────
const ASSET_CLASS_MAP: Record<string, "stock" | "forex" | "commodity" | "crypto"> = {
  "BTC/USDT": "crypto",  "BTC/USD": "crypto",
  "ETH/USDT": "crypto",  "ETH/USD": "crypto",
  "SOL/USDT": "crypto",  "SOL/USD": "crypto",
  "XRP/USDT": "crypto",  "XRP/USD": "crypto",
  "BNB/USDT": "crypto",  "ADA/USDT": "crypto",
  "DOGE/USDT": "crypto", "AVAX/USDT": "crypto",
  "MATIC/USDT": "crypto","LTC/USDT": "crypto",
  "LINK/USDT": "crypto", "DOT/USDT": "crypto",
  "UNI/USDT": "crypto",  "ATOM/USDT": "crypto",
  "EUR/USD": "forex",    "GBP/USD": "forex",
  "USD/JPY": "forex",    "USD/CHF": "forex",
  "AUD/USD": "forex",    "NZD/USD": "forex",
  "USD/CAD": "forex",    "EUR/GBP": "forex",
  "EUR/JPY": "forex",    "GBP/JPY": "forex",
  "EUR/AUD": "forex",    "EUR/CAD": "forex",
  "GBP/AUD": "forex",    "GBP/CAD": "forex",
  "AUD/JPY": "forex",    "EUR/CHF": "forex",
  "GBP/CHF": "forex",    "AUD/CAD": "forex",
  "AUD/CHF": "forex",    "NZD/JPY": "forex",
  "XAU/USD": "commodity","XAG/USD": "commodity",
  "WTI":      "commodity","BRENT":   "commodity",
  "US100": "stock",  "US500": "stock",  "US30": "stock",
  "RUSSELL2000": "stock", "VIX": "stock",
  "AAPL": "stock",   "MSFT": "stock",   "GOOGL": "stock",
  "AMZN": "stock",   "TSLA": "stock",   "NVDA": "stock",
  "META": "stock",   "NFLX": "stock",   "JPM": "stock",
  "BAC": "stock",    "GS": "stock",     "AMD": "stock",
  "INTC": "stock",   "DIS": "stock",    "BABA": "stock",
};
function getAssetClass(sym: string): "stock" | "forex" | "commodity" | "crypto" {
  return ASSET_CLASS_MAP[sym] ?? "stock";
}

// ── CandleBar type ────────────────────────────────────────────────────────────
export interface CandleBar {
  time: number; open: number; high: number; low: number; close: number; volume: number;
  ema9?: number; ema21?: number; ema50?: number; ema100?: number; ema200?: number;
  sma9?: number; sma20?: number; sma50?: number; sma100?: number; sma200?: number;
  wma20?: number; hma20?: number; dema20?: number; tema20?: number;
  bb_upper?: number; bb_lower?: number; bb_mid?: number; bb_width?: number; bb_pct?: number;
  kc_upper?: number; kc_lower?: number; kc_mid?: number;
  dc_upper?: number; dc_lower?: number; dc_mid?: number;
  vwap?: number; supertrend?: number; psar?: number;
  rsi?: number; cci?: number; roc?: number; mom?: number; cmo?: number;
  willr?: number; dpo?: number; tsi?: number; uo?: number; ao?: number; ppo?: number;
  macd?: number; macd_hist?: number; macd_signal?: number;
  stoch_k?: number; stoch_d?: number; stochrsi_k?: number; stochrsi_d?: number;
  obv?: number; cmf?: number; mfi?: number; ad?: number; pvt?: number; vwma20?: number; efi?: number;
  atr?: number; tr?: number; ui?: number;
  adx?: number; dip?: number; dim?: number;
  aroon_dn?: number; aroon_up?: number; aroon_osc?: number; trix?: number;
}

// ── Scale layout ──────────────────────────────────────────────────────────────
// Chart is split into three vertical zones:
//   MAIN  (top ~65%): candles + overlays         right price scale
//   SUB1  (mid ~15%): volume histogram            "vol" scale
//   SUB2  (bot ~18%): oscillators / strength      "osc" / "str" scale
//
// scaleMargins: { top, bottom } where values are fractions of total height.
// The price scale occupies from `top` to `(1 − bottom)`.

const SM = {
  main: { top: 0.02, bottom: 0.38 },   // 2%  → 62%
  vol:  { top: 0.64, bottom: 0.20 },   // 64% → 80%
  osc:  { top: 0.82, bottom: 0.02 },   // 82% → 98%
  str:  { top: 0.82, bottom: 0.02 },   // same zone as osc (user enables one at a time)
};

type RenderType = "overlay" | "osc" | "vol" | "str" | "vp";

interface SeriesDef {
  field: keyof CandleBar;
  color: string;
  label?: string;          // shown in legend for multi-series indicators
  lineStyle?: number;
  lineWidth?: 1 | 2;
  isHistogram?: boolean;
}

export interface IndicatorDef {
  id: string;
  label: string;
  category: "Trend" | "Momentum" | "Volume" | "Volatility";
  color: string;
  renderType: RenderType;
  series: SeriesDef[];
}

export const INDICATOR_DEFS: IndicatorDef[] = [
  // ── TREND ──────────────────────────────────────────────────────────────────
  { id:"EMA_9",    label:"EMA 9",          category:"Trend",     color:"#f59e0b", renderType:"overlay",
    series:[{field:"ema9",  color:"#f59e0b",lineWidth:1}] },
  { id:"EMA_21",   label:"EMA 21",         category:"Trend",     color:"#818cf8", renderType:"overlay",
    series:[{field:"ema21", color:"#818cf8",lineWidth:1}] },
  { id:"EMA_50",   label:"EMA 50",         category:"Trend",     color:"#38bdf8", renderType:"overlay",
    series:[{field:"ema50", color:"#38bdf8",lineWidth:1}] },
  { id:"EMA_100",  label:"EMA 100",        category:"Trend",     color:"#fb923c", renderType:"overlay",
    series:[{field:"ema100",color:"#fb923c",lineWidth:1}] },
  { id:"EMA_200",  label:"EMA 200",        category:"Trend",     color:"#a78bfa", renderType:"overlay",
    series:[{field:"ema200",color:"#a78bfa",lineWidth:2}] },
  { id:"SMA_9",    label:"SMA 9",          category:"Trend",     color:"#fde68a", renderType:"overlay",
    series:[{field:"sma9",  color:"#fde68a",lineStyle:LineStyle.Dashed}] },
  { id:"SMA_20",   label:"SMA 20",         category:"Trend",     color:"#c4b5fd", renderType:"overlay",
    series:[{field:"sma20", color:"#c4b5fd",lineStyle:LineStyle.Dashed}] },
  { id:"SMA_50",   label:"SMA 50",         category:"Trend",     color:"#7dd3fc", renderType:"overlay",
    series:[{field:"sma50", color:"#7dd3fc",lineStyle:LineStyle.Dashed}] },
  { id:"SMA_100",  label:"SMA 100",        category:"Trend",     color:"#fdba74", renderType:"overlay",
    series:[{field:"sma100",color:"#fdba74",lineStyle:LineStyle.Dashed}] },
  { id:"SMA_200",  label:"SMA 200",        category:"Trend",     color:"#d8b4fe", renderType:"overlay",
    series:[{field:"sma200",color:"#d8b4fe",lineStyle:LineStyle.Dashed}] },
  { id:"WMA_20",   label:"WMA 20",         category:"Trend",     color:"#34d399", renderType:"overlay",
    series:[{field:"wma20", color:"#34d399"}] },
  { id:"HMA_20",   label:"HMA 20",         category:"Trend",     color:"#f472b6", renderType:"overlay",
    series:[{field:"hma20", color:"#f472b6"}] },
  { id:"DEMA_20",  label:"DEMA 20",        category:"Trend",     color:"#67e8f9", renderType:"overlay",
    series:[{field:"dema20",color:"#67e8f9"}] },
  { id:"TEMA_20",  label:"TEMA 20",        category:"Trend",     color:"#fca5a5", renderType:"overlay",
    series:[{field:"tema20",color:"#fca5a5"}] },
  { id:"VWAP",     label:"VWAP",           category:"Trend",     color:"#22d3a5", renderType:"overlay",
    series:[{field:"vwap",  color:"#22d3a5",lineWidth:2}] },
  { id:"VWMA_20",  label:"VWMA 20",        category:"Trend",     color:"#2dd4bf", renderType:"overlay",
    series:[{field:"vwma20",color:"#2dd4bf"}] },
  { id:"BB",       label:"Bollinger Bands",category:"Trend",     color:"#64748b", renderType:"overlay",
    series:[
      {field:"bb_upper",color:"#64748b",lineStyle:LineStyle.Dashed},
      {field:"bb_lower",color:"#64748b",lineStyle:LineStyle.Dashed},
      {field:"bb_mid",  color:"#475569",lineStyle:LineStyle.Dotted},
    ]},
  { id:"KC",       label:"Keltner Channel",category:"Trend",     color:"#78716c", renderType:"overlay",
    series:[
      {field:"kc_upper",color:"#78716c",lineStyle:LineStyle.Dashed},
      {field:"kc_lower",color:"#78716c",lineStyle:LineStyle.Dashed},
      {field:"kc_mid",  color:"#57534e",lineStyle:LineStyle.Dotted},
    ]},
  { id:"DC",       label:"Donchian Channel",category:"Trend",    color:"#6b7280", renderType:"overlay",
    series:[
      {field:"dc_upper",color:"#6b7280",lineStyle:LineStyle.Dashed},
      {field:"dc_lower",color:"#6b7280",lineStyle:LineStyle.Dashed},
      {field:"dc_mid",  color:"#4b5563",lineStyle:LineStyle.Dotted},
    ]},
  { id:"SUPERTREND",label:"Supertrend",    category:"Trend",     color:"#10b981", renderType:"overlay",
    series:[{field:"supertrend",color:"#10b981",lineWidth:2}] },
  { id:"PSAR",     label:"Parabolic SAR",  category:"Trend",     color:"#f43f5e", renderType:"overlay",
    series:[{field:"psar",  color:"#f43f5e"}] },
  { id:"TRIX",     label:"TRIX 18",        category:"Trend",     color:"#e879f9", renderType:"osc",
    series:[{field:"trix",  color:"#e879f9"}] },

  // ── MOMENTUM ───────────────────────────────────────────────────────────────
  { id:"RSI",      label:"RSI 14",         category:"Momentum",  color:"#f59e0b", renderType:"osc",
    series:[{field:"rsi",   color:"#f59e0b",lineWidth:2}] },
  { id:"MACD",     label:"MACD",           category:"Momentum",  color:"#22d3a5", renderType:"osc",
    series:[
      {field:"macd",       color:"#22d3a5",lineWidth:1, label:"MACD"},
      {field:"macd_signal",color:"#f59e0b",lineWidth:1, label:"Signal"},
      {field:"macd_hist",  color:"#4a6580",isHistogram:true, label:"Hist"},
    ]},
  { id:"STOCH",    label:"Stochastic",     category:"Momentum",  color:"#60a5fa", renderType:"osc",
    series:[
      {field:"stoch_k",color:"#60a5fa", label:"%K"},
      {field:"stoch_d",color:"#f472b6", label:"%D"},
    ]},
  { id:"STOCHRSI", label:"Stoch RSI",      category:"Momentum",  color:"#34d399", renderType:"osc",
    series:[
      {field:"stochrsi_k",color:"#34d399", label:"K"},
      {field:"stochrsi_d",color:"#fb923c", label:"D"},
    ]},
  { id:"CCI",      label:"CCI 20",         category:"Momentum",  color:"#c084fc", renderType:"osc",
    series:[{field:"cci",   color:"#c084fc"}] },
  { id:"WILLR",    label:"Williams %R",    category:"Momentum",  color:"#e11d48", renderType:"osc",
    series:[{field:"willr", color:"#e11d48"}] },
  { id:"ROC",      label:"ROC 10",         category:"Momentum",  color:"#10b981", renderType:"osc",
    series:[{field:"roc",   color:"#10b981"}] },
  { id:"MOM",      label:"Momentum 10",    category:"Momentum",  color:"#0ea5e9", renderType:"osc",
    series:[{field:"mom",   color:"#0ea5e9"}] },
  { id:"CMO",      label:"CMO 14",         category:"Momentum",  color:"#fbbf24", renderType:"osc",
    series:[{field:"cmo",   color:"#fbbf24"}] },
  { id:"TSI",      label:"TSI",            category:"Momentum",  color:"#a3e635", renderType:"osc",
    series:[{field:"tsi",   color:"#a3e635"}] },
  { id:"UO",       label:"Ultimate Osc",   category:"Momentum",  color:"#38bdf8", renderType:"osc",
    series:[{field:"uo",    color:"#38bdf8"}] },
  { id:"AO",       label:"Awesome Osc",    category:"Momentum",  color:"#4ade80", renderType:"osc",
    series:[{field:"ao",    color:"#4ade80",isHistogram:true}] },
  { id:"DPO",      label:"DPO 20",         category:"Momentum",  color:"#facc15", renderType:"osc",
    series:[{field:"dpo",   color:"#facc15"}] },
  { id:"PPO",      label:"PPO",            category:"Momentum",  color:"#fb7185", renderType:"osc",
    series:[{field:"ppo",   color:"#fb7185"}] },

  // ── VOLUME ─────────────────────────────────────────────────────────────────
  { id:"VOL",      label:"Volume",         category:"Volume",    color:"#3a5470", renderType:"vol",
    series:[{field:"volume",color:"#3a5470",isHistogram:true}] },
  { id:"OBV",      label:"OBV",            category:"Volume",    color:"#22d3a5", renderType:"vol",
    series:[{field:"obv",   color:"#22d3a5"}] },
  { id:"CMF",      label:"CMF 20",         category:"Volume",    color:"#34d399", renderType:"vol",
    series:[{field:"cmf",   color:"#34d399"}] },
  { id:"MFI",      label:"MFI 14",         category:"Volume",    color:"#38bdf8", renderType:"vol",
    series:[{field:"mfi",   color:"#38bdf8"}] },
  { id:"AD",       label:"A/D Line",       category:"Volume",    color:"#a78bfa", renderType:"vol",
    series:[{field:"ad",    color:"#a78bfa"}] },
  { id:"PVT",      label:"PVT",            category:"Volume",    color:"#f472b6", renderType:"vol",
    series:[{field:"pvt",   color:"#f472b6"}] },
  { id:"EFI",      label:"Elder Force",    category:"Volume",    color:"#fb923c", renderType:"vol",
    series:[{field:"efi",   color:"#fb923c",isHistogram:true}] },
  // Volume Profile — rendered by canvas overlay, no LW Charts series
  { id:"VP",       label:"Vol Profile",    category:"Volume",    color:"#7c3aed", renderType:"vp",
    series:[] },

  // ── VOLATILITY / STRENGTH ─────────────────────────────────────────────────
  { id:"ATR",      label:"ATR 14",         category:"Volatility",color:"#f87171", renderType:"str",
    series:[{field:"atr",      color:"#f87171",lineWidth:1}] },
  { id:"TR",       label:"True Range",     category:"Volatility",color:"#fca5a5", renderType:"str",
    series:[{field:"tr",       color:"#fca5a5",isHistogram:true}] },
  { id:"UI",       label:"Ulcer Index",    category:"Volatility",color:"#fb923c", renderType:"str",
    series:[{field:"ui",       color:"#fb923c"}] },
  { id:"BB_WIDTH", label:"BB Width",       category:"Volatility",color:"#94a3b8", renderType:"str",
    series:[{field:"bb_width", color:"#94a3b8"}] },
  { id:"BB_PCT",   label:"BB %B",          category:"Volatility",color:"#cbd5e1", renderType:"str",
    series:[{field:"bb_pct",   color:"#cbd5e1"}] },
  { id:"ADX",      label:"ADX 14",         category:"Volatility",color:"#e2e8f0", renderType:"str",
    series:[
      {field:"adx",color:"#e2e8f0",lineWidth:2, label:"ADX"},
      {field:"dip",color:"#22d3a5",lineWidth:1, label:"DI+"},
      {field:"dim",color:"#f4617f",lineWidth:1, label:"DI−"},
    ]},
  { id:"AROON",    label:"Aroon 14",       category:"Volatility",color:"#7dd3fc", renderType:"str",
    series:[
      {field:"aroon_up", color:"#22d3a5", label:"Up"},
      {field:"aroon_dn", color:"#f4617f", label:"Dn"},
      {field:"aroon_osc",color:"#7dd3fc", label:"Osc", lineStyle:LineStyle.Dashed},
    ]},
];

export type IndicatorId = string;

// ── Live WebSocket helpers ────────────────────────────────────────────────────
// Converts "ETH/USDT" → "ethusdt" for Binance stream names.
// Returns null for non-Binance-listable pairs (forex, stocks, etc.).
function toBinanceSymbol(sym: string): string | null {
  const s = sym.replace("/", "").toLowerCase();
  if (
    s.endsWith("usdt") || s.endsWith("usdc") ||
    s.endsWith("btc")  || s.endsWith("eth")  ||
    s.endsWith("bnb")
  ) return s;
  return null;
}

// Kraken OHLC interval in minutes
const KRAKEN_INTERVALS: Record<string, number> = {
  "1m": 1, "5m": 5, "15m": 15, "30m": 30,
  "1h": 60, "4h": 240, "1d": 1440, "1w": 10080,
};
function toKrakenInterval(iv: string): number { return KRAKEN_INTERVALS[iv] ?? 5; }

// ── Scale ID mapping ──────────────────────────────────────────────────────────
// "vp" has no LW Charts series — handled by canvas
const SCALE_ID: Record<Exclude<RenderType,"vp">, string> = {
  overlay: "right",
  osc:     "osc",
  vol:     "vol",   // ← was "" which broke histogram creation
  str:     "str",
};

// ── Props ─────────────────────────────────────────────────────────────────────
export interface Props {
  symbol: string;
  interval?: string;
  period?: string;
  height?: number;
  activeIndicators: Set<IndicatorId>;
  chartType?: ChartType;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function lineData(candles: CandleBar[], field: keyof CandleBar): LineData<Time>[] {
  return candles
    .filter(c => c[field] != null && !isNaN(c[field] as number))
    .map(c => ({ time: c.time as Time, value: c[field] as number }));
}

function histData(candles: CandleBar[], field: keyof CandleBar): HistogramData<Time>[] {
  return candles
    .filter(c => c[field] != null && !isNaN(c[field] as number))
    .map(c => {
      const v = c[field] as number;
      return {
        time:  c.time as Time,
        value: v,
        color: v >= 0 ? "rgba(34,211,165,0.55)" : "rgba(244,97,127,0.55)",
      };
    });
}

// Volume bars use open/close to determine bull/bear colour
function volHistData(candles: CandleBar[]): HistogramData<Time>[] {
  return candles.map(c => ({
    time:  c.time as Time,
    value: c.volume,
    color: c.close >= c.open ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)",
  }));
}

// ── Volume Profile computation ────────────────────────────────────────────────
interface VPBucket { priceTop: number; priceBot: number; vol: number }

function computeVolumeProfile(candles: CandleBar[], buckets = 40): VPBucket[] {
  if (!candles.length) return [];
  const minP = Math.min(...candles.map(c => c.low));
  const maxP = Math.max(...candles.map(c => c.high));
  if (maxP === minP) return [];

  const step = (maxP - minP) / buckets;
  const vols = new Array<number>(buckets).fill(0);

  for (const c of candles) {
    const lo = Math.max(0, Math.floor((c.low  - minP) / step));
    const hi = Math.min(buckets - 1, Math.floor((c.high - minP) / step));
    const span = hi - lo + 1;
    for (let b = lo; b <= hi; b++) vols[b] += c.volume / span;
  }

  return vols.map((vol, b) => ({
    priceBot: minP + b * step,
    priceTop: minP + (b + 1) * step,
    vol,
  }));
}

// ── Heikin-Ashi transform ─────────────────────────────────────────────────────
function computeHA(candles: CandleBar[]): CandleBar[] {
  const ha: CandleBar[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen  = i === 0
      ? (c.open + c.close) / 2
      : (ha[i - 1].open + ha[i - 1].close) / 2;
    ha.push({
      ...c,
      open:  haOpen,
      high:  Math.max(c.high, haOpen, haClose),
      low:   Math.min(c.low,  haOpen, haClose),
      close: haClose,
    });
  }
  return ha;
}

// ── Main-series factory ───────────────────────────────────────────────────────
function buildMainSeries(chart: IChartApi, type: ChartType): ISeriesApi<any> {
  switch (type) {
    case "bar":
      return chart.addSeries(BarSeries, { upColor: "#26a69a", downColor: "#ef5350" });
    case "line":
      return chart.addSeries(LineSeries, {
        color: "#3b82f6", lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
      });
    case "area":
      return chart.addSeries(AreaSeries, {
        topColor: "rgba(59,130,246,0.28)", bottomColor: "rgba(59,130,246,0.0)",
        lineColor: "#3b82f6", lineWidth: 2, priceLineVisible: false,
      });
    default: // candle | ha — both use CandlestickSeries
      return chart.addSeries(CandlestickSeries, {
        upColor: "#26a69a", downColor: "#ef5350",
        borderVisible: false,
        wickUpColor: "#26a69a", wickDownColor: "#ef5350",
      });
  }
}

// ── Apply data to main series (handles all chart types) ───────────────────────
function applyMainData(series: ISeriesApi<any>, candles: CandleBar[], type: ChartType) {
  if (!series || !candles.length) return;
  try {
    if (type === "line" || type === "area") {
      series.setData(candles.map(c => ({ time: c.time as Time, value: c.close })));
    } else if (type === "ha") {
      series.setData(computeHA(candles).map(c => ({
        time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
      })));
    } else {
      series.setData(candles.map(c => ({
        time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
      })));
    }
  } catch {}
}

// ── Client-side candle cache (persists across symbol switches) ────────────────
const _candleCache = new Map<string, CandleBar[]>();

/**
 * Pre-warms _candleCache for a symbol in the background.
 * Call this for adjacent/popular symbols so switching is instant.
 */
export async function prefetchCandles(
  symbol:   string,
  interval: string = "5m",
  period:   string = "5d"
): Promise<void> {
  const ac  = symbol.endsWith("USDT") || symbol.endsWith("BTC") ? "crypto" : "stock";
  const key = `${symbol}-${interval}-${period}`;
  if (_candleCache.has(key)) return;           // already warm
  try {
    const res  = await fetch(
      `/api/prices/${encodeURIComponent(symbol)}/candles` +
      `?assetClass=${ac}&interval=${interval}&period=${period}`
    );
    if (!res.ok) return;
    const data: { candles: CandleBar[] } = await res.json();
    if (data.candles?.length) _candleCache.set(key, data.candles);
  } catch { /* silently ignore — prefetch is best-effort */ }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TradingChart({
  symbol,
  interval = "5m",
  period   = "1d",
  height   = 320,
  activeIndicators,
  chartType = "candle",
}: Props) {
  const chartTypeRef = useRef<ChartType>(chartType);
  chartTypeRef.current = chartType;
  const containerRef = useRef<HTMLDivElement>(null);
  const vpCanvasRef  = useRef<HTMLCanvasElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const candleRef    = useRef<ISeriesApi<any> | null>(null);
  const seriesMap    = useRef<Map<string, ISeriesApi<any>[]>>(new Map());
  const candlesRef   = useRef<CandleBar[]>([]);

  const wsRef              = useRef<WebSocket | null>(null);
  const wsReconnectTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [lastClose, setLastClose] = useState<number | null>(null);
  const [wsStatus,  setWsStatus]  = useState<"off" | "connecting" | "live" | "error">("off");
  const [wsSource,  setWsSource]  = useState<"BINANCE" | "KRAKEN" | "">("");

  // ── Build chart once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth || 600,
      height: height - 28,
      layout: {
        background: { type: ColorType.Solid, color: "#080c10" },
        textColor:  "#4a6580",
        fontFamily: "'Poppins', sans-serif",
        fontSize:   10,
      },
      grid: {
        vertLines: { color: "#0d1621" },
        horzLines: { color: "#0d1621" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#2d4a63", labelBackgroundColor: "#0c1219" },
        horzLine: { color: "#2d4a63", labelBackgroundColor: "#0c1219" },
      },
      rightPriceScale: {
        borderColor:  "#0f1923",
        textColor:    "#4a6580",
        scaleMargins: SM.main,
      },
      timeScale: { borderColor: "#0f1923", timeVisible: true, secondsVisible: false },
    });

    const candleSeries = buildMainSeries(chart, chartTypeRef.current);

    chartRef.current  = chart;
    candleRef.current = candleSeries;

    // Resize observer keeps chart width in sync
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) chart.applyOptions({ width: w });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      try { chart.remove(); } catch {}
      chartRef.current  = null;
      candleRef.current = null;
      seriesMap.current.clear();
    };
  }, [height]);

  // ── Swap main series when chartType changes ──────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // Remove current main series
    if (candleRef.current) {
      try { chart.removeSeries(candleRef.current); } catch {}
      candleRef.current = null;
    }
    // Create a new one of the right type
    const newSeries = buildMainSeries(chart, chartType);
    candleRef.current = newSeries;
    // Re-populate if we already have candle data
    if (candlesRef.current.length > 0) {
      applyMainData(newSeries, candlesRef.current, chartType);
    }
  }, [chartType]);

  // ── Draw Volume Profile on canvas ───────────────────────────────────────────
  const drawVP = useCallback(() => {
    const canvas  = vpCanvasRef.current;
    const candles = candlesRef.current;
    const series  = candleRef.current;
    if (!canvas || !series) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!activeIndicators.has("VP") || !candles.length) return;

    const buckets = computeVolumeProfile(candles, 40);
    if (!buckets.length) return;

    const maxVol    = Math.max(...buckets.map(b => b.vol));
    const maxBarPx  = canvas.width * 0.14;   // VP bars occupy ≤14% of width
    const priceScW  = 65;                     // approx price-scale label column width

    for (const b of buckets) {
      const yTop = series.priceToCoordinate(b.priceTop);
      const yBot = series.priceToCoordinate(b.priceBot);
      if (yTop === null || yBot === null) continue;

      const barH = Math.abs(yBot - yTop);
      const barW = (b.vol / maxVol) * maxBarPx;
      const yDraw = Math.min(yTop, yBot);

      // Draw bar from right edge (before price labels), extending left
      ctx.fillStyle = "rgba(124, 58, 237, 0.35)";
      ctx.fillRect(canvas.width - priceScW - barW, yDraw, barW, Math.max(1, barH));
    }
  }, [activeIndicators]);

  // ── Helper: push candle data into all chart series ──────────────────────────
  const applyCandles = useCallback((cs: CandleBar[]) => {
    candlesRef.current = cs;
    if (candleRef.current) applyMainData(candleRef.current, cs, chartTypeRef.current);
    seriesMap.current.forEach((seriesList, id) => {
      const def = INDICATOR_DEFS.find(d => d.id === id);
      if (!def || def.renderType === "vp") return;
      def.series.forEach((sd, i) => {
        const s = seriesList[i];
        if (!s) return;
        try {
          if (sd.field === "volume") s.setData(volHistData(cs));
          else if (sd.isHistogram)   s.setData(histData(cs, sd.field));
          else                       s.setData(lineData(cs, sd.field));
        } catch {}
      });
    });
    setLastClose(cs[cs.length - 1].close);
    setError(null);
    setLoading(false);
    requestAnimationFrame(drawVP);
  }, [drawVP]);

  // ── Fetch + populate all series ─────────────────────────────────────────────
  const fetchAndDraw = useCallback(async () => {
    const ac  = getAssetClass(symbol);
    const key = `${symbol}-${interval}-${period}`;

    // Serve from client cache immediately — no spinner, no blank chart
    const cached = _candleCache.get(key);
    if (cached?.length) {
      applyCandles(cached);
    }

    try {
      const res = await fetch(
        `/api/prices/${encodeURIComponent(symbol)}/candles` +
        `?assetClass=${ac}&interval=${interval}&period=${period}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { candles: CandleBar[]; error?: string } = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.candles?.length) throw new Error("No candle data");

      const cs = data.candles;
      _candleCache.set(key, cs);   // store in client cache
      applyCandles(cs);

      // Re-draw VP after data update
      requestAnimationFrame(drawVP);
    } catch (e) {
      console.error("[TradingChart] fetch error:", e);
      setError(e instanceof Error ? e.message : "Failed to load chart");
      setLoading(false);
    }
  }, [symbol, interval, period, drawVP, applyCandles]);

  useEffect(() => {
    // Only show spinner if we have no cached data for this symbol+TF
    const key = `${symbol}-${interval}-${period}`;
    if (!_candleCache.has(key)) setLoading(true);
    fetchAndDraw();
    const id = setInterval(fetchAndDraw, 30_000);
    return () => clearInterval(id);
  }, [fetchAndDraw]);

  // ── Live WebSocket — Binance → Kraken cascade (crypto only) ─────────────────
  // Browser connects directly to the exchange (server is never in the path).
  // Tries Binance first; if rejected (e.g. origin-block on dev domain) it falls
  // back to Kraken which has no geo/origin restrictions.
  useEffect(() => {
    const ac   = getAssetClass(symbol);
    const bsym = ac === "crypto" ? toBinanceSymbol(symbol) : null;
    if (!bsym) { setWsStatus("off"); return; }

    type Source = "binance" | "kraken";
    let cancelled = false;
    let source: Source = "binance";
    let reconnectAttempts = 0;
    let openedAt = 0;

    const applyTick = (open: number, high: number, low: number, close: number,
                       ts: number, vol: number, closed: boolean) => {
      try {
        const type = chartTypeRef.current;
        if (type === "line" || type === "area") {
          candleRef.current?.update({ time: ts as Time, value: close } as any);
        } else if (type === "ha") {
          const arr = candlesRef.current;
          if (arr.length > 0) {
            const last   = arr[arr.length - 1];
            const haClose = (last.open + Math.max(last.high, high) + Math.min(last.low, low) + close) / 4;
            const haOpen  = arr.length > 1
              ? (arr[arr.length - 2].open + arr[arr.length - 2].close) / 2
              : (last.open + last.close) / 2;
            candleRef.current?.update({
              time: ts as Time, open: haOpen,
              high: Math.max(Math.max(last.high, high), haOpen, haClose),
              low:  Math.min(Math.min(last.low,  low),  haOpen, haClose),
              close: haClose,
            } as any);
          }
        } else {
          candleRef.current?.update({ time: ts as Time, open, high, low, close } as any);
        }
      } catch {}
      setLastClose(close);
      if (closed) {
        const arr = candlesRef.current;
        const bar: CandleBar = { time: ts, open, high, low, close, volume: vol };
        const idx = arr.findIndex(c => c.time === ts);
        if (idx >= 0) arr[idx] = { ...arr[idx], ...bar };
        else          arr.push(bar);
        candlesRef.current = [...arr];
      }
    };

    const handleBinanceMsg = (raw: string) => {
      try {
        const msg = JSON.parse(raw);
        const k   = msg.k;
        if (!k) return;
        applyTick(
          parseFloat(k.o), parseFloat(k.h), parseFloat(k.l), parseFloat(k.c),
          Math.floor(k.t / 1000), parseFloat(k.v), !!k.x
        );
      } catch {}
    };

    const handleKrakenMsg = (raw: string) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.channel !== "ohlc" || msg.type !== "update") return;
        const d = msg.data?.[0];
        if (!d) return;
        applyTick(
          parseFloat(d.open), parseFloat(d.high), parseFloat(d.low), parseFloat(d.close),
          Math.floor(new Date(d.timestamp).getTime() / 1000),
          parseFloat(d.volume ?? "0"),
          !!d.confirm
        );
      } catch {}
    };

    const connect = () => {
      if (cancelled) return;
      setWsStatus("connecting");

      const url = source === "binance"
        ? `wss://stream.binance.com:9443/ws/${bsym}@kline_${interval}`
        : `wss://ws.kraken.com/v2`;

      const ws = new WebSocket(url);
      wsRef.current = ws;
      openedAt = Date.now();

      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        setWsStatus("live");
        setWsSource(source === "binance" ? "BINANCE" : "KRAKEN");
        reconnectAttempts = 0;
        if (source === "kraken") {
          ws.send(JSON.stringify({
            method: "subscribe",
            params: { channel: "ohlc", symbol: [symbol], interval: toKrakenInterval(interval) },
          }));
        }
      };

      ws.onmessage = (evt) => {
        if (cancelled) return;
        if (source === "binance") handleBinanceMsg(evt.data as string);
        else                      handleKrakenMsg(evt.data as string);
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        if (cancelled) return;
        const elapsed = Date.now() - openedAt;
        // If Binance failed almost immediately, cascade to Kraken
        if (source === "binance" && elapsed < 4000) {
          source = "kraken";
          reconnectAttempts = 0;
          setTimeout(connect, 500);
          return;
        }
        setWsStatus("error");
        const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), 30_000);
        reconnectAttempts++;
        wsReconnectTimer.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (wsReconnectTimer.current) clearTimeout(wsReconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
      setWsStatus("off");
    };
  }, [symbol, interval]);

  // ── Sync canvas size with container ─────────────────────────────────────────
  useEffect(() => {
    const canvas    = vpCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const sync = () => {
      canvas.width  = container.clientWidth  || 600;
      canvas.height = container.clientHeight || height;
      requestAnimationFrame(drawVP);
    };
    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(container);
    return () => ro.disconnect();
  }, [height, drawVP]);

  // Redraw VP when activeIndicators changes
  useEffect(() => {
    requestAnimationFrame(drawVP);
  }, [activeIndicators, drawVP]);

  // ── Add / remove LW Charts indicator series when activeIndicators changes ───
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const cs = candlesRef.current;

    // Remove deactivated
    seriesMap.current.forEach((seriesList, id) => {
      if (!activeIndicators.has(id)) {
        seriesList.forEach(s => { try { chart.removeSeries(s); } catch {} });
        seriesMap.current.delete(id);
      }
    });

    // Add newly activated
    activeIndicators.forEach(id => {
      if (seriesMap.current.has(id)) return;

      const def = INDICATOR_DEFS.find(d => d.id === id);
      if (!def || def.renderType === "vp" || def.series.length === 0) return;

      const isOverlay = def.renderType === "overlay";
      const scaleId   = SCALE_ID[def.renderType as Exclude<RenderType,"vp">];

      const created: ISeriesApi<any>[] = [];

      for (const sd of def.series) {
        try {
          let s: ISeriesApi<any>;

          if (sd.isHistogram) {
            s = chart.addSeries(HistogramSeries, {
              color:        sd.color,
              priceScaleId: scaleId,
              priceFormat:  { type: "volume" },
            });
          } else {
            s = chart.addSeries(LineSeries, {
              color:            sd.color,
              lineWidth:        sd.lineWidth  ?? 1,
              lineStyle:        sd.lineStyle  ?? LineStyle.Solid,
              priceScaleId:     scaleId,
              priceLineVisible: false,
              lastValueVisible: false,
            });
          }

          // Apply scale margins for non-overlay panes
          if (!isOverlay) {
            const margins = sd.isHistogram && def.renderType === "vol" ? SM.vol
                          : def.renderType === "osc"  ? SM.osc
                          : SM.str;
            try { s.priceScale().applyOptions({ scaleMargins: margins }); } catch {}
          }

          // Populate with current data if available
          if (cs.length > 0) {
            try {
              if (sd.field === "volume") s.setData(volHistData(cs));
              else if (sd.isHistogram)   s.setData(histData(cs, sd.field));
              else                       s.setData(lineData(cs, sd.field));
            } catch (e) {
              console.warn(`[TradingChart] initial setData failed for ${id}:`, e);
            }
          }

          created.push(s);
        } catch (e) {
          // Log but don't abort — remaining indicators in this batch still get created
          console.error(`[TradingChart] addSeries failed for ${id}:`, e);
        }
      }

      if (created.length > 0) seriesMap.current.set(id, created);
    });
  }, [activeIndicators]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const activeDefs = INDICATOR_DEFS.filter(d => activeIndicators.has(d.id));

  return (
    <div style={{ position: "relative", width: "100%", height, background: "#080c10" }}>
      {/* Legend row */}
      <div style={{
        position: "absolute", top: 6, left: 10, zIndex: 10,
        display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", pointerEvents: "none",
      }}>
        {activeDefs.map(d => {
          const hasSubLabels = d.series.length > 1 && d.series.some(s => s.label);
          if (hasSubLabels) {
            return (
              <span key={d.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {d.series.map((sd, i) => (
                  <span key={i} style={{ color: sd.color, display: "flex", alignItems: "center", gap: 3 }}>
                    <span style={{
                      display: "inline-block", width: 10, height: sd.lineWidth === 2 ? 2 : 1,
                      background: sd.color, borderRadius: 1,
                    }} />
                    {i === 0 ? `${d.label} · ${sd.label}` : sd.label}
                  </span>
                ))}
              </span>
            );
          }
          return (
            <span key={d.id} style={{ color: d.color, display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{
                display: "inline-block", width: 10, height: 2,
                background: d.color, borderRadius: 1,
              }} />
              {d.label}
            </span>
          );
        })}
        {lastClose !== null && (
          <span style={{ color: "#22d3a5", marginLeft: 4 }}>
            {lastClose.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
          </span>
        )}
      </div>

      {/* Live stream badge (top-right) */}
      {wsStatus !== "off" && (
        <div style={{
          position: "absolute", top: 6, right: 8, zIndex: 10,
          display: "flex", alignItems: "center", gap: 4,
          fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
          pointerEvents: "none",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: wsStatus === "live" ? "#22d3a5"
                      : wsStatus === "connecting" ? "#f59e0b"
                      : "#ef5350",
            boxShadow: wsStatus === "live"
              ? "0 0 6px #22d3a5"
              : wsStatus === "connecting"
              ? "0 0 4px #f59e0b"
              : "none",
          }} />
          <span style={{
            color: wsStatus === "live" ? "#22d3a5"
                 : wsStatus === "connecting" ? "#f59e0b"
                 : "#ef5350",
          }}>
            {wsStatus === "live"
            ? `LIVE · ${wsSource}`
            : wsStatus === "connecting"
            ? "CONNECTING…"
            : "WS ERR"}
          </span>
        </div>
      )}

      {/* Chart container */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Volume Profile canvas overlay — sits above chart, pointer-events: none */}
      <canvas
        ref={vpCanvasRef}
        style={{
          position: "absolute", inset: 0,
          pointerEvents: "none", zIndex: 5,
        }}
      />

      {loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          background: "rgba(8,12,16,0.85)",
          fontSize: 11, color: "#4a6580", letterSpacing: "0.1em",
        }}>
          LOADING CHART…
        </div>
      )}

      {!loading && error && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          background: "rgba(8,12,16,0.85)",
          flexDirection: "column", gap: 8,
          fontSize: 11, color: "#ef5350", letterSpacing: "0.1em",
        }}>
          <span>CHART UNAVAILABLE</span>
          <span style={{ fontSize: 9, color: "#4a6580" }}>{error}</span>
        </div>
      )}
    </div>
  );
}
