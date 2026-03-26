import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type Time,
} from "lightweight-charts";

// ── Asset-class map ───────────────────────────────────────────────────────────
const ASSET_CLASS_MAP: Record<string, "stock" | "forex" | "commodity" | "crypto"> = {
  "BTC/USDT": "crypto",  "BTC/USD": "crypto",
  "ETH/USDT": "crypto",  "ETH/USD": "crypto",
  "SOL/USDT": "crypto",  "SOL/USD": "crypto",
  "XRP/USDT": "crypto",  "XRP/USD": "crypto",
  "BNB/USDT": "crypto",  "ADA/USDT": "crypto",
  "DOGE/USDT": "crypto", "AVAX/USDT": "crypto",
  "EUR/USD":  "forex",   "GBP/USD": "forex",
  "USD/JPY":  "forex",   "AUD/USD": "forex",
  "XAU/USD":  "commodity","XAG/USD": "commodity",
  "WTI":      "commodity","BRENT":   "commodity",
};
function getAssetClass(sym: string): "stock" | "forex" | "commodity" | "crypto" {
  return ASSET_CLASS_MAP[sym] ?? "stock";
}

// ── Indicator definitions (single source of truth) ───────────────────────────
export const INDICATOR_DEFS = [
  { id: "EMA_9",   label: "EMA 9",            color: "#f59e0b", field: "ema9"  },
  { id: "EMA_21",  label: "EMA 21",           color: "#818cf8", field: "ema21" },
  { id: "EMA_50",  label: "EMA 50",           color: "#38bdf8", field: "ema50" },
  { id: "EMA_200", label: "EMA 200",          color: "#a78bfa", field: "ema200"},
  { id: "BB",      label: "Bollinger Bands",  color: "#64748b", field: "bb_upper" },
  { id: "VWAP",    label: "VWAP",             color: "#22d3a5", field: "vwap"  },
  { id: "VOL",     label: "Volume",           color: "#4a6580", field: "volume"},
] as const;

export type IndicatorId = typeof INDICATOR_DEFS[number]["id"];

// ── Types ─────────────────────────────────────────────────────────────────────
interface CandleBar {
  time: number; open: number; high: number; low: number; close: number; volume: number;
  ema9?: number; ema21?: number; ema50?: number; ema200?: number;
  bb_upper?: number; bb_lower?: number; bb_mid?: number;
  vwap?: number; rsi?: number;
}

export interface Props {
  symbol: string;
  interval?: string;
  period?: string;
  height?: number;
  activeIndicators: Set<IndicatorId>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toLineData(candles: CandleBar[], field: keyof CandleBar): LineData<Time>[] {
  return candles
    .filter(c => c[field] != null)
    .map(c => ({ time: c.time as Time, value: c[field] as number }));
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TradingChart({
  symbol, interval = "5m", period = "1d", height = 320, activeIndicators,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);

  // series refs
  const candleRef  = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema9Ref    = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref   = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref   = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref  = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpRef    = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowRef   = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMidRef   = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapRef    = useRef<ISeriesApi<"Line"> | null>(null);
  const volRef     = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [lastClose, setLastClose] = useState<number | null>(null);

  // ── Fetch + draw ────────────────────────────────────────────────────────────
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

      // Candles
      const candleData: CandlestickData<Time>[] = cs.map(c => ({
        time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      candleRef.current?.setData(candleData);

      // EMA lines
      ema9Ref.current?.setData(toLineData(cs, "ema9"));
      ema21Ref.current?.setData(toLineData(cs, "ema21"));
      ema50Ref.current?.setData(toLineData(cs, "ema50"));
      ema200Ref.current?.setData(toLineData(cs, "ema200"));

      // Bollinger Bands
      bbUpRef.current?.setData(toLineData(cs, "bb_upper"));
      bbLowRef.current?.setData(toLineData(cs, "bb_lower"));
      bbMidRef.current?.setData(toLineData(cs, "bb_mid"));

      // VWAP
      vwapRef.current?.setData(toLineData(cs, "vwap"));

      // Volume
      const volMax = Math.max(...cs.map(c => c.volume));
      const volData: HistogramData<Time>[] = cs.map(c => ({
        time: c.time as Time,
        value: volMax > 0 ? (c.volume / volMax) * 20 : 0,
        color: c.close >= c.open ? "rgba(38,166,154,0.35)" : "rgba(239,83,80,0.35)",
      }));
      volRef.current?.setData(volData);

      setLastClose(cs[cs.length - 1].close);
      setError(null);
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chart");
      setLoading(false);
    }
  }, [symbol, interval, period]);

  // ── Build chart once on mount ────────────────────────────────────────────────
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
      grid: {
        vertLines: { color: "#0f1923" },
        horzLines: { color: "#0f1923" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#2d4a63", labelBackgroundColor: "#0c1219" },
        horzLine: { color: "#2d4a63", labelBackgroundColor: "#0c1219" },
      },
      rightPriceScale: {
        borderColor:  "#0f1923",
        textColor:    "#4a6580",
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor:    "#0f1923",
        timeVisible:    true,
        secondsVisible: false,
      },
    });

    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a", downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a", wickDownColor: "#ef5350",
    });

    const addLine = (color: string, width: 1|2 = 1) =>
      chart.addSeries(LineSeries, {
        color, lineWidth: width,
        priceLineVisible: false, lastValueVisible: false,
      });

    ema9Ref.current   = addLine("#f59e0b");
    ema21Ref.current  = addLine("#818cf8");
    ema50Ref.current  = addLine("#38bdf8");
    ema200Ref.current = addLine("#a78bfa");

    bbUpRef.current  = chart.addSeries(LineSeries, {
      color: "#64748b", lineWidth: 1, lineStyle: 1,
      priceLineVisible: false, lastValueVisible: false,
    });
    bbLowRef.current = chart.addSeries(LineSeries, {
      color: "#64748b", lineWidth: 1, lineStyle: 1,
      priceLineVisible: false, lastValueVisible: false,
    });
    bbMidRef.current = chart.addSeries(LineSeries, {
      color: "#475569", lineWidth: 1, lineStyle: 2,
      priceLineVisible: false, lastValueVisible: false,
    });

    vwapRef.current = addLine("#22d3a5");

    volRef.current = chart.addSeries(HistogramSeries, {
      color: "rgba(38,166,154,0.3)",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chart;

    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) chart.applyOptions({ width: w });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = candleRef.current = null;
      ema9Ref.current = ema21Ref.current = ema50Ref.current = ema200Ref.current = null;
      bbUpRef.current = bbLowRef.current = bbMidRef.current = null;
      vwapRef.current = volRef.current = null;
    };
  }, [height]);

  // ── Toggle indicator visibility ──────────────────────────────────────────────
  useEffect(() => {
    const visible = (id: IndicatorId) => activeIndicators.has(id);
    ema9Ref.current?.applyOptions({   visible: visible("EMA_9")  });
    ema21Ref.current?.applyOptions({  visible: visible("EMA_21") });
    ema50Ref.current?.applyOptions({  visible: visible("EMA_50") });
    ema200Ref.current?.applyOptions({ visible: visible("EMA_200")});
    const bbOn = visible("BB");
    bbUpRef.current?.applyOptions({  visible: bbOn });
    bbLowRef.current?.applyOptions({ visible: bbOn });
    bbMidRef.current?.applyOptions({ visible: bbOn });
    vwapRef.current?.applyOptions({  visible: visible("VWAP") });
    volRef.current?.applyOptions({   visible: visible("VOL")  });
  }, [activeIndicators]);

  // ── Fetch on symbol/interval/period change, poll every 30 s ─────────────────
  useEffect(() => {
    setLoading(true);
    fetchAndDraw();
    const id = setInterval(fetchAndDraw, 30000);
    return () => clearInterval(id);
  }, [fetchAndDraw]);

  return (
    <div style={{ position: "relative", width: "100%", height, background: "#080c10" }}>
      {/* Legend */}
      <div style={{
        position: "absolute", top: 8, left: 12, zIndex: 10,
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", pointerEvents: "none",
      }}>
        {INDICATOR_DEFS.filter(d => activeIndicators.has(d.id) && d.id !== "VOL").map(d => (
          <span key={d.id} style={{ color: d.color }}>▬ {d.label}</span>
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
