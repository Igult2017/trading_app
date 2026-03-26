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

// ── Asset-class map (symbol → assetClass for the price API) ──────────────────
const ASSET_CLASS_MAP: Record<string, "stock" | "forex" | "commodity" | "crypto"> = {
  "BTC/USDT": "crypto",  "BTC/USD": "crypto",
  "ETH/USDT": "crypto",  "ETH/USD": "crypto",
  "SOL/USDT": "crypto",  "SOL/USD": "crypto",
  "XRP/USDT": "crypto",  "XRP/USD": "crypto",
  "BNB/USDT": "crypto",  "ADA/USDT": "crypto",
  "DOGE/USDT": "crypto", "AVAX/USDT": "crypto",
  "EUR/USD": "forex",    "GBP/USD": "forex",
  "USD/JPY": "forex",    "AUD/USD": "forex",
  "XAU/USD": "commodity","XAG/USD": "commodity",
  "WTI": "commodity",    "BRENT": "commodity",
};

function getAssetClass(symbol: string): "stock" | "forex" | "commodity" | "crypto" {
  return ASSET_CLASS_MAP[symbol] ?? "stock";
}

// ── EMA calculation ──────────────────────────────────────────────────────────
function calcEMA(closes: number[], period: number): (number | null)[] {
  if (closes.length < period) return closes.map(() => null);
  const k = 2 / (period + 1);
  const result: (number | null)[] = new Array(period - 1).fill(null);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

// ── Types ────────────────────────────────────────────────────────────────────
interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Props {
  symbol: string;
  interval?: string;
  period?: string;
  height?: number;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function TradingChart({ symbol, interval = "5m", period = "1d", height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const candleRef    = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema9Ref      = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref     = useRef<ISeriesApi<"Line"> | null>(null);
  const volRef       = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);
  const [lastClose, setLastClose] = useState<number | null>(null);

  const fetchAndDraw = useCallback(async () => {
    const assetClass = getAssetClass(symbol);
    const encoded    = encodeURIComponent(symbol);
    try {
      const res  = await fetch(
        `/api/prices/${encoded}/candles?assetClass=${assetClass}&interval=${interval}&period=${period}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { candles: CandleBar[]; error?: string } = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.candles || data.candles.length === 0) throw new Error("No candle data");

      const candles = data.candles;

      const candleData: CandlestickData<Time>[] = candles.map(c => ({
        time:  c.time as Time,
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
      }));

      const closes = candles.map(c => c.close);
      const ema9vals  = calcEMA(closes, 9);
      const ema21vals = calcEMA(closes, 21);

      const ema9Data: LineData<Time>[] = candles
        .map((c, i) => ema9vals[i] !== null ? { time: c.time as Time, value: ema9vals[i]! } : null)
        .filter(Boolean) as LineData<Time>[];

      const ema21Data: LineData<Time>[] = candles
        .map((c, i) => ema21vals[i] !== null ? { time: c.time as Time, value: ema21vals[i]! } : null)
        .filter(Boolean) as LineData<Time>[];

      const volMax = Math.max(...candles.map(c => c.volume));
      const volData: HistogramData<Time>[] = candles.map(c => ({
        time:  c.time as Time,
        value: volMax > 0 ? (c.volume / volMax) * 20 : 0,
        color: c.close >= c.open ? "rgba(38,166,154,0.35)" : "rgba(239,83,80,0.35)",
      }));

      candleRef.current?.setData(candleData);
      ema9Ref.current?.setData(ema9Data);
      ema21Ref.current?.setData(ema21Data);
      volRef.current?.setData(volData);

      setLastClose(candles[candles.length - 1].close);
      setError(null);
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chart");
      setLoading(false);
    }
  }, [symbol, interval, period]);

  // Build chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: height - 28,         // leave room for the bottom bar
      layout: {
        background:  { type: ColorType.Solid, color: "#080c10" },
        textColor:   "#4a6580",
        fontFamily:  "'Poppins', sans-serif",
        fontSize:    10,
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
        borderColor:    "#0f1923",
        textColor:      "#4a6580",
        scaleMargins:   { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor:    "#0f1923",
        timeVisible:    true,
        secondsVisible: false,
      },
    });

    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor:       "#26a69a",
      downColor:     "#ef5350",
      borderVisible: false,
      wickUpColor:   "#26a69a",
      wickDownColor: "#ef5350",
    });

    ema9Ref.current = chart.addSeries(LineSeries, {
      color:       "#f59e0b",
      lineWidth:   1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    ema21Ref.current = chart.addSeries(LineSeries, {
      color:       "#818cf8",
      lineWidth:   1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    volRef.current = chart.addSeries(HistogramSeries, {
      color:         "rgba(38,166,154,0.3)",
      priceFormat:   { type: "volume" },
      priceScaleId:  "",
    });
    volRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chart;

    // Resize observer
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
      ema9Ref.current   = null;
      ema21Ref.current  = null;
      volRef.current    = null;
    };
  }, [height]);

  // Fetch data whenever symbol/interval/period changes, then poll every 30 s
  useEffect(() => {
    setLoading(true);
    fetchAndDraw();
    const id = setInterval(fetchAndDraw, 30000);
    return () => clearInterval(id);
  }, [fetchAndDraw]);

  return (
    <div style={{ position: "relative", width: "100%", height, background: "#080c10" }}>
      {/* Indicator legend */}
      <div style={{
        position: "absolute", top: 8, left: 12, zIndex: 10,
        display: "flex", gap: 12, alignItems: "center",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
        pointerEvents: "none",
      }}>
        <span style={{ color: "#f59e0b" }}>▬ EMA 9</span>
        <span style={{ color: "#818cf8" }}>▬ EMA 21</span>
        <span style={{ color: "#4a6580" }}>▪ VOL</span>
        {lastClose !== null && (
          <span style={{ color: "#22d3a5", marginLeft: 8 }}>
            {lastClose.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
          </span>
        )}
      </div>

      {/* Chart canvas */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", background: "rgba(8,12,16,0.85)",
          fontSize: 11, color: "#4a6580", letterSpacing: "0.1em",
        }}>
          LOADING CHART…
        </div>
      )}

      {/* Error overlay */}
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
