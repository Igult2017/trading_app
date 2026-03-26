import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type Time,
} from "lightweight-charts";

// ── Asset-class map ───────────────────────────────────────────────────────────
const ASSET_CLASS_MAP: Record<string, "stock" | "forex" | "commodity" | "crypto"> = {
  // Crypto
  "BTC/USDT": "crypto",  "BTC/USD": "crypto",
  "ETH/USDT": "crypto",  "ETH/USD": "crypto",
  "SOL/USDT": "crypto",  "SOL/USD": "crypto",
  "XRP/USDT": "crypto",  "XRP/USD": "crypto",
  "BNB/USDT": "crypto",  "ADA/USDT": "crypto",
  "DOGE/USDT": "crypto", "AVAX/USDT": "crypto",
  "MATIC/USDT": "crypto","LTC/USDT": "crypto",
  "LINK/USDT": "crypto", "DOT/USDT": "crypto",
  "UNI/USDT": "crypto",  "ATOM/USDT": "crypto",
  // Major Forex
  "EUR/USD": "forex",   "GBP/USD": "forex",
  "USD/JPY": "forex",   "USD/CHF": "forex",
  "AUD/USD": "forex",   "NZD/USD": "forex",
  "USD/CAD": "forex",
  // Cross Forex
  "EUR/GBP": "forex",   "EUR/JPY": "forex",
  "GBP/JPY": "forex",   "EUR/AUD": "forex",
  "EUR/CAD": "forex",   "GBP/AUD": "forex",
  "GBP/CAD": "forex",   "AUD/JPY": "forex",
  "EUR/CHF": "forex",   "GBP/CHF": "forex",
  "AUD/CAD": "forex",   "AUD/CHF": "forex",
  "NZD/JPY": "forex",
  // Commodities
  "XAU/USD": "commodity","XAG/USD": "commodity",
  "WTI":      "commodity","BRENT":   "commodity",
  // Indices & Stocks — treated as "stock" for yfinance ticker lookup
  "US100": "stock",     "US500": "stock",
  "US30":  "stock",     "RUSSELL2000": "stock",
  "VIX":   "stock",
  "AAPL":  "stock",     "MSFT": "stock",
  "GOOGL": "stock",     "AMZN": "stock",
  "TSLA":  "stock",     "NVDA": "stock",
  "META":  "stock",     "NFLX": "stock",
  "JPM":   "stock",     "BAC":  "stock",
  "GS":    "stock",     "AMD":  "stock",
  "INTC":  "stock",     "DIS":  "stock",
  "BABA":  "stock",
};
function getAssetClass(sym: string): "stock" | "forex" | "commodity" | "crypto" {
  return ASSET_CLASS_MAP[sym] ?? "stock";
}

// ── CandleBar type ────────────────────────────────────────────────────────────
export interface CandleBar {
  time: number; open: number; high: number; low: number; close: number; volume: number;
  // Trend overlays
  ema9?: number; ema21?: number; ema50?: number; ema100?: number; ema200?: number;
  sma9?: number; sma20?: number; sma50?: number; sma100?: number; sma200?: number;
  wma20?: number; hma20?: number; dema20?: number; tema20?: number;
  bb_upper?: number; bb_lower?: number; bb_mid?: number; bb_width?: number; bb_pct?: number;
  kc_upper?: number; kc_lower?: number; kc_mid?: number;
  dc_upper?: number; dc_lower?: number; dc_mid?: number;
  vwap?: number; supertrend?: number; psar?: number;
  // Momentum
  rsi?: number; cci?: number; roc?: number; mom?: number; cmo?: number;
  willr?: number; dpo?: number; tsi?: number; uo?: number; ao?: number; ppo?: number;
  macd?: number; macd_hist?: number; macd_signal?: number;
  stoch_k?: number; stoch_d?: number; stochrsi_k?: number; stochrsi_d?: number;
  // Volume
  obv?: number; cmf?: number; mfi?: number; ad?: number; pvt?: number; vwma20?: number; efi?: number;
  // Volatility / Strength
  atr?: number; tr?: number; ui?: number;
  adx?: number; dip?: number; dim?: number;
  aroon_dn?: number; aroon_up?: number; aroon_osc?: number; trix?: number;
}

// ── Indicator definitions ─────────────────────────────────────────────────────
// renderType: "overlay" = on main price scale | "osc" = oscillator pane | "vol" = volume pane | "str" = strength pane
type RenderType = "overlay" | "osc" | "vol" | "str";

interface SeriesDef {
  field: keyof CandleBar;
  color: string;
  lineStyle?: number;
  lineWidth?: 1 | 2;
  isHistogram?: boolean;
}

export interface IndicatorDef {
  id: string;
  label: string;
  category: "Trend" | "Momentum" | "Volume" | "Volatility";
  color: string;       // primary colour (used in legend + dropdown swatch)
  renderType: RenderType;
  series: SeriesDef[]; // one entry per line/histogram this indicator draws
}

export const INDICATOR_DEFS: IndicatorDef[] = [
  // ── TREND ──────────────────────────────────────────────────────────────────
  { id:"EMA_9",   label:"EMA 9",         category:"Trend",    color:"#f59e0b", renderType:"overlay", series:[{field:"ema9",  color:"#f59e0b"}] },
  { id:"EMA_21",  label:"EMA 21",        category:"Trend",    color:"#818cf8", renderType:"overlay", series:[{field:"ema21", color:"#818cf8"}] },
  { id:"EMA_50",  label:"EMA 50",        category:"Trend",    color:"#38bdf8", renderType:"overlay", series:[{field:"ema50", color:"#38bdf8"}] },
  { id:"EMA_100", label:"EMA 100",       category:"Trend",    color:"#fb923c", renderType:"overlay", series:[{field:"ema100",color:"#fb923c"}] },
  { id:"EMA_200", label:"EMA 200",       category:"Trend",    color:"#a78bfa", renderType:"overlay", series:[{field:"ema200",color:"#a78bfa"}] },
  { id:"SMA_9",   label:"SMA 9",         category:"Trend",    color:"#fde68a", renderType:"overlay", series:[{field:"sma9",  color:"#fde68a",lineStyle:LineStyle.Dashed}] },
  { id:"SMA_20",  label:"SMA 20",        category:"Trend",    color:"#c4b5fd", renderType:"overlay", series:[{field:"sma20", color:"#c4b5fd",lineStyle:LineStyle.Dashed}] },
  { id:"SMA_50",  label:"SMA 50",        category:"Trend",    color:"#7dd3fc", renderType:"overlay", series:[{field:"sma50", color:"#7dd3fc",lineStyle:LineStyle.Dashed}] },
  { id:"SMA_100", label:"SMA 100",       category:"Trend",    color:"#fdba74", renderType:"overlay", series:[{field:"sma100",color:"#fdba74",lineStyle:LineStyle.Dashed}] },
  { id:"SMA_200", label:"SMA 200",       category:"Trend",    color:"#d8b4fe", renderType:"overlay", series:[{field:"sma200",color:"#d8b4fe",lineStyle:LineStyle.Dashed}] },
  { id:"WMA_20",  label:"WMA 20",        category:"Trend",    color:"#34d399", renderType:"overlay", series:[{field:"wma20", color:"#34d399"}] },
  { id:"HMA_20",  label:"HMA 20",        category:"Trend",    color:"#f472b6", renderType:"overlay", series:[{field:"hma20", color:"#f472b6"}] },
  { id:"DEMA_20", label:"DEMA 20",       category:"Trend",    color:"#67e8f9", renderType:"overlay", series:[{field:"dema20",color:"#67e8f9"}] },
  { id:"TEMA_20", label:"TEMA 20",       category:"Trend",    color:"#fca5a5", renderType:"overlay", series:[{field:"tema20",color:"#fca5a5"}] },
  { id:"VWAP",    label:"VWAP",          category:"Trend",    color:"#22d3a5", renderType:"overlay", series:[{field:"vwap",  color:"#22d3a5",lineWidth:2}] },
  { id:"VWMA_20", label:"VWMA 20",       category:"Trend",    color:"#2dd4bf", renderType:"overlay", series:[{field:"vwma20",color:"#2dd4bf"}] },
  { id:"BB",      label:"Bollinger Bands",category:"Trend",   color:"#64748b", renderType:"overlay",
    series:[{field:"bb_upper",color:"#64748b",lineStyle:LineStyle.Dashed},{field:"bb_lower",color:"#64748b",lineStyle:LineStyle.Dashed},{field:"bb_mid",color:"#475569",lineStyle:LineStyle.Dotted}] },
  { id:"KC",      label:"Keltner Channel",category:"Trend",   color:"#78716c", renderType:"overlay",
    series:[{field:"kc_upper",color:"#78716c",lineStyle:LineStyle.Dashed},{field:"kc_lower",color:"#78716c",lineStyle:LineStyle.Dashed},{field:"kc_mid",color:"#57534e",lineStyle:LineStyle.Dotted}] },
  { id:"DC",      label:"Donchian Channel",category:"Trend",  color:"#6b7280", renderType:"overlay",
    series:[{field:"dc_upper",color:"#6b7280",lineStyle:LineStyle.Dashed},{field:"dc_lower",color:"#6b7280",lineStyle:LineStyle.Dashed},{field:"dc_mid",color:"#4b5563",lineStyle:LineStyle.Dotted}] },
  { id:"SUPERTREND",label:"Supertrend",  category:"Trend",    color:"#10b981", renderType:"overlay", series:[{field:"supertrend",color:"#10b981",lineWidth:2}] },
  { id:"PSAR",    label:"Parabolic SAR", category:"Trend",    color:"#f43f5e", renderType:"overlay", series:[{field:"psar",  color:"#f43f5e"}] },
  { id:"TRIX",    label:"TRIX 18",       category:"Trend",    color:"#e879f9", renderType:"osc",     series:[{field:"trix",  color:"#e879f9"}] },

  // ── MOMENTUM ───────────────────────────────────────────────────────────────
  { id:"RSI",     label:"RSI 14",        category:"Momentum", color:"#f59e0b", renderType:"osc",    series:[{field:"rsi",  color:"#f59e0b"}] },
  { id:"MACD",    label:"MACD",          category:"Momentum", color:"#22d3a5", renderType:"osc",
    series:[{field:"macd",color:"#22d3a5"},{field:"macd_signal",color:"#f59e0b"},{field:"macd_hist",color:"#4a6580",isHistogram:true}] },
  { id:"STOCH",   label:"Stochastic",    category:"Momentum", color:"#60a5fa", renderType:"osc",    series:[{field:"stoch_k",color:"#60a5fa"},{field:"stoch_d",color:"#f472b6"}] },
  { id:"STOCHRSI",label:"Stoch RSI",     category:"Momentum", color:"#34d399", renderType:"osc",    series:[{field:"stochrsi_k",color:"#34d399"},{field:"stochrsi_d",color:"#fb923c"}] },
  { id:"CCI",     label:"CCI 20",        category:"Momentum", color:"#c084fc", renderType:"osc",    series:[{field:"cci",   color:"#c084fc"}] },
  { id:"WILLR",   label:"Williams %R",   category:"Momentum", color:"#e11d48", renderType:"osc",    series:[{field:"willr", color:"#e11d48"}] },
  { id:"ROC",     label:"ROC 10",        category:"Momentum", color:"#10b981", renderType:"osc",    series:[{field:"roc",   color:"#10b981"}] },
  { id:"MOM",     label:"Momentum 10",   category:"Momentum", color:"#0ea5e9", renderType:"osc",    series:[{field:"mom",   color:"#0ea5e9"}] },
  { id:"CMO",     label:"CMO 14",        category:"Momentum", color:"#fbbf24", renderType:"osc",    series:[{field:"cmo",   color:"#fbbf24"}] },
  { id:"TSI",     label:"TSI",           category:"Momentum", color:"#a3e635", renderType:"osc",    series:[{field:"tsi",   color:"#a3e635"}] },
  { id:"UO",      label:"Ultimate Osc",  category:"Momentum", color:"#38bdf8", renderType:"osc",    series:[{field:"uo",    color:"#38bdf8"}] },
  { id:"AO",      label:"Awesome Osc",   category:"Momentum", color:"#4ade80", renderType:"osc",    series:[{field:"ao",    color:"#4ade80",isHistogram:true}] },
  { id:"DPO",     label:"DPO 20",        category:"Momentum", color:"#facc15", renderType:"osc",    series:[{field:"dpo",   color:"#facc15"}] },
  { id:"PPO",     label:"PPO",           category:"Momentum", color:"#fb7185", renderType:"osc",    series:[{field:"ppo",   color:"#fb7185"}] },

  // ── VOLUME ─────────────────────────────────────────────────────────────────
  { id:"VOL",     label:"Volume",        category:"Volume",   color:"#4a6580", renderType:"vol",    series:[{field:"volume",color:"#4a6580",isHistogram:true}] },
  { id:"OBV",     label:"OBV",           category:"Volume",   color:"#22d3a5", renderType:"vol",    series:[{field:"obv",   color:"#22d3a5"}] },
  { id:"CMF",     label:"CMF 20",        category:"Volume",   color:"#34d399", renderType:"vol",    series:[{field:"cmf",   color:"#34d399"}] },
  { id:"MFI",     label:"MFI 14",        category:"Volume",   color:"#38bdf8", renderType:"vol",    series:[{field:"mfi",   color:"#38bdf8"}] },
  { id:"AD",      label:"A/D Line",      category:"Volume",   color:"#a78bfa", renderType:"vol",    series:[{field:"ad",    color:"#a78bfa"}] },
  { id:"PVT",     label:"PVT",           category:"Volume",   color:"#f472b6", renderType:"vol",    series:[{field:"pvt",   color:"#f472b6"}] },
  { id:"EFI",     label:"Elder Force",   category:"Volume",   color:"#fb923c", renderType:"vol",    series:[{field:"efi",   color:"#fb923c",isHistogram:true}] },

  // ── VOLATILITY / STRENGTH ─────────────────────────────────────────────────
  { id:"ATR",      label:"ATR 14",       category:"Volatility",color:"#f87171",renderType:"str",    series:[{field:"atr",      color:"#f87171"}] },
  { id:"TR",       label:"True Range",   category:"Volatility",color:"#fca5a5",renderType:"str",    series:[{field:"tr",       color:"#fca5a5",isHistogram:true}] },
  { id:"UI",       label:"Ulcer Index",  category:"Volatility",color:"#fb923c",renderType:"str",    series:[{field:"ui",       color:"#fb923c"}] },
  { id:"BB_WIDTH", label:"BB Width",     category:"Volatility",color:"#94a3b8",renderType:"str",    series:[{field:"bb_width", color:"#94a3b8"}] },
  { id:"BB_PCT",   label:"BB %B",        category:"Volatility",color:"#cbd5e1",renderType:"str",    series:[{field:"bb_pct",   color:"#cbd5e1"}] },
  { id:"ADX",      label:"ADX 14",       category:"Volatility",color:"#e2e8f0",renderType:"str",    series:[{field:"adx",color:"#e2e8f0"},{field:"dip",color:"#22d3a5"},{field:"dim",color:"#f4617f"}] },
  { id:"AROON",    label:"Aroon 14",     category:"Volatility",color:"#7dd3fc",renderType:"str",    series:[{field:"aroon_up",color:"#22d3a5"},{field:"aroon_dn",color:"#f4617f"},{field:"aroon_osc",color:"#7dd3fc",lineStyle:LineStyle.Dashed}] },
];

export type IndicatorId = string;

// ── Props ─────────────────────────────────────────────────────────────────────
export interface Props {
  symbol: string;
  interval?: string;
  period?: string;
  height?: number;
  activeIndicators: Set<IndicatorId>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function lineData(candles: CandleBar[], field: keyof CandleBar): LineData<Time>[] {
  return candles
    .filter(c => c[field] != null)
    .map(c => ({ time: c.time as Time, value: c[field] as number }));
}

function histData(candles: CandleBar[], field: keyof CandleBar): HistogramData<Time>[] {
  return candles
    .filter(c => c[field] != null)
    .map(c => {
      const v = c[field] as number;
      return { time: c.time as Time, value: v, color: v >= 0 ? "rgba(34,211,165,0.6)" : "rgba(244,97,127,0.6)" };
    });
}

// Price scale margins per render type
const SCALE_MARGINS: Record<RenderType, { top: number; bottom: number }> = {
  overlay: { top: 0.06, bottom: 0.26 },
  osc:     { top: 0.76, bottom: 0.02 },
  vol:     { top: 0.82, bottom: 0.00 },
  str:     { top: 0.80, bottom: 0.01 },
};
const SCALE_ID: Record<RenderType, string> = {
  overlay: "right",
  osc:     "osc",
  vol:     "",
  str:     "str",
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function TradingChart({ symbol, interval = "5m", period = "1d", height = 320, activeIndicators }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const candleRef    = useRef<ISeriesApi<"Candlestick"> | null>(null);
  // Map<indicatorId, array of created series>
  const seriesMap    = useRef<Map<string, ISeriesApi<any>[]>>(new Map());
  const candlesRef   = useRef<CandleBar[]>([]);

  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [lastClose, setLastClose] = useState<number | null>(null);

  // ── Build chart once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: height - 28,
      layout: {
        background: { type: ColorType.Solid, color: "#080c10" },
        textColor:  "#4a6580",
        fontFamily: "'Poppins', sans-serif",
        fontSize:   10,
      },
      grid: { vertLines: { color: "#0f1923" }, horzLines: { color: "#0f1923" } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#2d4a63", labelBackgroundColor: "#0c1219" },
        horzLine: { color: "#2d4a63", labelBackgroundColor: "#0c1219" },
      },
      rightPriceScale: {
        borderColor:  "#0f1923",
        textColor:    "#4a6580",
        scaleMargins: SCALE_MARGINS.overlay,
      },
      timeScale: { borderColor: "#0f1923", timeVisible: true, secondsVisible: false },
    });

    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a", downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a", wickDownColor: "#ef5350",
    });

    chartRef.current = chart;

    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) chart.applyOptions({ width: w });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      candleRef.current = null;
      seriesMap.current.clear();
    };
  }, [height]);

  // ── Fetch data ──────────────────────────────────────────────────────────────
  const fetchAndDraw = useCallback(async () => {
    const ac = getAssetClass(symbol);
    try {
      const res = await fetch(
        `/api/prices/${encodeURIComponent(symbol)}/candles?assetClass=${ac}&interval=${interval}&period=${period}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { candles: CandleBar[]; error?: string } = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.candles?.length) throw new Error("No candle data");

      const cs = data.candles;
      candlesRef.current = cs;

      // Update candle series
      const candleData: CandlestickData<Time>[] = cs.map(c => ({
        time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      candleRef.current?.setData(candleData);

      // Update all active indicator series
      seriesMap.current.forEach((seriesList, id) => {
        const def = INDICATOR_DEFS.find(d => d.id === id);
        if (!def) return;
        def.series.forEach((sd, i) => {
          const s = seriesList[i];
          if (!s) return;
          if (sd.isHistogram) s.setData(histData(cs, sd.field));
          else                s.setData(lineData(cs, sd.field));
        });
      });

      setLastClose(cs[cs.length - 1].close);
      setError(null);
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chart");
      setLoading(false);
    }
  }, [symbol, interval, period]);

  useEffect(() => {
    setLoading(true);
    fetchAndDraw();
    const id = setInterval(fetchAndDraw, 30000);
    return () => clearInterval(id);
  }, [fetchAndDraw]);

  // ── Add / remove indicator series when activeIndicators changes ─────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const cs = candlesRef.current;

    // Remove deactivated
    seriesMap.current.forEach((seriesList, id) => {
      if (!activeIndicators.has(id)) {
        seriesList.forEach(s => chart.removeSeries(s));
        seriesMap.current.delete(id);
      }
    });

    // Add newly activated
    activeIndicators.forEach(id => {
      if (seriesMap.current.has(id)) return; // already exists
      const def = INDICATOR_DEFS.find(d => d.id === id);
      if (!def) return;

      const scaleId   = SCALE_ID[def.renderType];
      const isOverlay = def.renderType === "overlay";

      const created: ISeriesApi<any>[] = def.series.map(sd => {
        let s: ISeriesApi<any>;
        if (sd.isHistogram) {
          s = chart.addSeries(HistogramSeries, {
            color: sd.color,
            priceScaleId: scaleId,
            priceFormat: { type: "volume" },
          });
        } else {
          s = chart.addSeries(LineSeries, {
            color:            sd.color,
            lineWidth:        sd.lineWidth ?? 1,
            lineStyle:        sd.lineStyle ?? LineStyle.Solid,
            priceScaleId:     isOverlay ? "right" : scaleId,
            priceLineVisible: false,
            lastValueVisible: false,
          });
        }

        // Set scale margins for non-overlay series
        if (!isOverlay) {
          s.priceScale().applyOptions({ scaleMargins: SCALE_MARGINS[def.renderType] });
        }

        // Populate with current data
        if (cs.length > 0) {
          if (sd.isHistogram) s.setData(histData(cs, sd.field));
          else                s.setData(lineData(cs, sd.field));
        }

        return s;
      });

      seriesMap.current.set(id, created);
    });
  }, [activeIndicators]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const activeDefs = INDICATOR_DEFS.filter(d => activeIndicators.has(d.id));

  return (
    <div style={{ position: "relative", width: "100%", height, background: "#080c10" }}>
      {/* Legend */}
      <div style={{
        position: "absolute", top: 8, left: 12, zIndex: 10, display: "flex",
        gap: 8, alignItems: "center", flexWrap: "wrap",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", pointerEvents: "none",
      }}>
        {activeDefs.map(d => (
          <span key={d.id} style={{ color: d.color, display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ display: "inline-block", width: 10, height: 2, background: d.color, borderRadius: 1 }} />
            {d.label}
          </span>
        ))}
        {lastClose !== null && (
          <span style={{ color: "#22d3a5", marginLeft: 4 }}>
            {lastClose.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
          </span>
        )}
      </div>

      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", background: "rgba(8,12,16,0.85)",
          fontSize: 11, color: "#4a6580", letterSpacing: "0.1em",
        }}>LOADING CHART…</div>
      )}
      {!loading && error && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", background: "rgba(8,12,16,0.85)",
          fontSize: 11, color: "#ef5350", letterSpacing: "0.1em",
          flexDirection: "column", gap: 8,
        }}>
          <span>CHART UNAVAILABLE</span>
          <span style={{ fontSize: 9, color: "#4a6580" }}>{error}</span>
        </div>
      )}
    </div>
  );
}
