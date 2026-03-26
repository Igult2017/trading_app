import { useState, useEffect, useRef } from "react";

export interface FastPriceData {
  price: number | null;
  prevPrice: number | null;
  direction: "up" | "down" | "flat";
  changePercent: number | null;
  loading: boolean;
}

const ASSET_CLASS_MAP: Record<string, string> = {
  "BTC/USDT": "crypto", "ETH/USDT": "crypto",
  "SOL/USDT": "crypto", "XRP/USDT": "crypto",
  "BNB/USDT": "crypto", "ADA/USDT": "crypto",
  "DOGE/USDT": "crypto","AVAX/USDT": "crypto",
  "EUR/USD": "forex",   "GBP/USD": "forex",
  "USD/JPY": "forex",   "AUD/USD": "forex",
  "XAU/USD": "commodity","XAG/USD": "commodity",
};
function assetClass(symbol: string) {
  return ASSET_CLASS_MAP[symbol] ?? "stock";
}

/** Polls a single price every `intervalMs` (default 5 s). */
export function useFastPrice(symbol: string, intervalMs = 5000): FastPriceData {
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

  const direction: "up" | "down" | "flat" =
    price === null || prevPrice === null ? "flat"
    : price > prevPrice ? "up"
    : price < prevPrice ? "down"
    : "flat";

  return { price, prevPrice, direction, changePercent: changePct, loading };
}

/** Polls prices for multiple symbols every `intervalMs`. */
export function useFastBatchPrices(
  symbols: string[],
  intervalMs = 5000
): Record<string, FastPriceData> {
  const [data, setData] = useState<Record<string, FastPriceData>>({});
  const prevRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;

    async function fetch_() {
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
            const dir: "up" | "down" | "flat" =
              prevP === null ? "flat"
              : r.price > prevP ? "up"
              : r.price < prevP ? "down"
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
        // keep last values
      }
    }

    fetch_();
    const id = setInterval(fetch_, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [symbols.join(","), intervalMs]);

  return data;
}
