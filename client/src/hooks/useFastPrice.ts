import { useState, useEffect, useRef } from "react";

export interface FastPriceData {
  price: number | null;
  prevPrice: number | null;
  direction: "up" | "down" | "flat";
  changePercent: number | null;
  loading: boolean;
}

const ASSET_CLASS_MAP: Record<string, string> = {
  // Crypto
  "BTC/USDT": "crypto",  "ETH/USDT": "crypto",
  "SOL/USDT": "crypto",  "XRP/USDT": "crypto",
  "BNB/USDT": "crypto",  "ADA/USDT": "crypto",
  "DOGE/USDT": "crypto", "AVAX/USDT": "crypto",
  "MATIC/USDT": "crypto","LTC/USDT": "crypto",
  "LINK/USDT": "crypto", "DOT/USDT": "crypto",
  "UNI/USDT": "crypto",  "ATOM/USDT": "crypto",
  // Major Forex
  "EUR/USD": "forex",    "GBP/USD": "forex",
  "USD/JPY": "forex",    "USD/CHF": "forex",
  "AUD/USD": "forex",    "NZD/USD": "forex",
  "USD/CAD": "forex",
  // Cross Forex
  "EUR/GBP": "forex",    "EUR/JPY": "forex",
  "GBP/JPY": "forex",    "EUR/AUD": "forex",
  "EUR/CAD": "forex",    "GBP/AUD": "forex",
  "GBP/CAD": "forex",    "AUD/JPY": "forex",
  "EUR/CHF": "forex",    "GBP/CHF": "forex",
  "AUD/CAD": "forex",    "AUD/CHF": "forex",
  "NZD/JPY": "forex",
  // Commodities
  "XAU/USD": "commodity","XAG/USD": "commodity",
  "WTI": "commodity",
  // Indices & Stocks
  "US100": "stock",      "US500": "stock",
  "US30": "stock",       "RUSSELL2000": "stock",
  "VIX": "stock",
  "AAPL": "stock",       "MSFT": "stock",
  "GOOGL": "stock",      "AMZN": "stock",
  "TSLA": "stock",       "NVDA": "stock",
  "META": "stock",       "NFLX": "stock",
  "JPM": "stock",        "BAC": "stock",
  "GS": "stock",         "AMD": "stock",
  "INTC": "stock",       "DIS": "stock",
  "BABA": "stock",
};
function assetClass(symbol: string) {
  return ASSET_CLASS_MAP[symbol] ?? "stock";
}

/** Polls a single price every `intervalMs` (default 2 s).
 *  The backend reads from the daemon cache — no external API call is made,
 *  so a 2 s interval is safe and gives near-live updates. */
export function useFastPrice(symbol: string, intervalMs = 2000): FastPriceData {
  const [price,     setPrice]     = useState<number | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [changePct, setChangePct] = useState<number | null>(null);
  const [loading,   setLoading]   = useState(true);
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetch_() {
      try {
        const res = await fetch(
          `/api/prices/${encodeURIComponent(symbol)}?assetClass=${assetClass(symbol)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.price == null || cancelled) return;

        setPrevPrice(prevRef.current);
        prevRef.current = data.price;
        setPrice(data.price);
        setChangePct(data.changePercent ?? null);
        setLoading(false);
      } catch {
        // silently ignore — keeps showing last good value
      }
    }

    fetch_();
    const id = setInterval(fetch_, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [symbol, intervalMs]);

  // On first load prevPrice is null — fall back to changePercent from the API
  // so the arrow shows the right colour immediately instead of staying grey.
  const direction: "up" | "down" | "flat" =
    price === null ? "flat"
    : prevPrice !== null
      ? (price > prevPrice ? "up" : price < prevPrice ? "down" : "flat")
      : changePct != null
        ? (changePct > 0 ? "up" : changePct < 0 ? "down" : "flat")
        : "flat";

  return { price, prevPrice, direction, changePercent: changePct, loading };
}

/** Polls prices for multiple symbols every `intervalMs` (default 2 s).
 *  Backend reads from daemon cache — safe to poll frequently. */
export function useFastBatchPrices(
  symbols: string[],
  intervalMs = 2000
): Record<string, FastPriceData> {
  const [data, setData] = useState<Record<string, FastPriceData>>({});
  const prevRef = useRef<Record<string, number>>({});
  const fetchingRef = useRef(false); // guard: skip if a fetch is already in flight

  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;

    async function fetch_() {
      if (fetchingRef.current) return; // don't pile up concurrent requests
      fetchingRef.current = true;
      try {
        const body = { symbols: symbols.map(s => ({ symbol: s, assetClass: assetClass(s) })) };
        const res = await fetch("/api/prices/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok || cancelled) return;
        const results: { symbol: string; price?: number; changePercent?: number }[] = await res.json();

        setData(prev => {
          const next = { ...prev };
          results.forEach(r => {
            if (r.price == null) return;
            const prevP = prevRef.current[r.symbol] ?? null;
            // Fall back to API changePercent on first load so arrows are
            // immediately coloured instead of showing flat/grey.
            const dir: "up" | "down" | "flat" =
              prevP !== null
                ? (r.price > prevP ? "up" : r.price < prevP ? "down" : "flat")
                : r.changePercent != null
                  ? (r.changePercent > 0 ? "up" : r.changePercent < 0 ? "down" : "flat")
                  : "flat";
            prevRef.current[r.symbol] = r.price;
            next[r.symbol] = {
              price: r.price,
              prevPrice: prevP,
              direction: dir,
              changePercent: r.changePercent ?? null,
              loading: false,
            };
          });
          return next;
        });
      } catch {
        // keep last values on network error
      } finally {
        fetchingRef.current = false;
      }
    }

    fetch_();
    const id = setInterval(fetch_, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [symbols.join(","), intervalMs]);

  return data;
}
