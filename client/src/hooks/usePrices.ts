import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface PriceData {
  symbol: string;
  assetClass?: string;
  price?: number;
  change?: number;
  changePercent?: number;
  high?: number;
  low?: number;
  open?: number;
  previousClose?: number;
  volume?: number;
  marketCap?: number;
  timestamp?: string;
  source?: string;
  error?: string;
}

interface PriceServiceStatus {
  status: "online" | "offline";
  message: string;
}

export function usePriceServiceStatus() {
  return useQuery<PriceServiceStatus>({
    queryKey: ["/api/prices/status"],
    refetchInterval: 60000, // Check every minute
    staleTime: 30000,
  });
}

export function usePrice(symbol: string, assetClass: "stock" | "forex" | "commodity" | "crypto" = "stock") {
  return useQuery<PriceData>({
    queryKey: ["/api/prices", symbol, assetClass],
    queryFn: async () => {
      const response = await fetch(`/api/prices/${encodeURIComponent(symbol)}?assetClass=${assetClass}`);
      if (!response.ok) {
        throw new Error("Failed to fetch price");
      }
      return response.json();
    },
    enabled: !!symbol,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000,
  });
}

export function useBatchPrices() {
  return useMutation({
    mutationFn: async (symbols: Array<{ symbol: string; assetClass: string }>) => {
      const response = await apiRequest("POST", "/api/prices/batch", { symbols });
      return response.json() as Promise<PriceData[]>;
    },
  });
}

export function useWatchlistPrices(watchlist: Array<{ symbol: string; assetClass: string }>) {
  return useQuery<PriceData[]>({
    queryKey: ["/api/prices/batch", watchlist.map(w => `${w.symbol}-${w.assetClass}`).join(",")],
    queryFn: async () => {
      if (watchlist.length === 0) return [];
      const response = await apiRequest("POST", "/api/prices/batch", { symbols: watchlist });
      return response.json();
    },
    enabled: watchlist.length > 0,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000,
  });
}

export function formatPrice(price: number | undefined, decimals: number = 2): string {
  if (price === undefined || price === null) return "---";
  
  if (price >= 1000) {
    return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (price >= 1) {
    return price.toFixed(decimals);
  } else {
    // For small prices like forex pairs
    return price.toFixed(Math.max(decimals, 4));
  }
}

export function formatChange(change: number | undefined, changePercent: number | undefined): { text: string; isPositive: boolean } {
  if (change === undefined && changePercent === undefined) {
    return { text: "---", isPositive: true };
  }
  
  const percent = changePercent ?? 0;
  const isPositive = percent >= 0;
  const sign = isPositive ? "+" : "";
  
  return {
    text: `${sign}${percent.toFixed(2)}%`,
    isPositive,
  };
}
