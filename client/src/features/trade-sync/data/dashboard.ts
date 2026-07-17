import type { CopyAccount, FeedRow, Kpi, Source } from "../types";

export const KPIS: Kpi[] = [
  { label: "TOTAL EQUITY", value: "$248,392.14", delta: "+4.82%", positive: true },
  { label: "TODAY'S PROFIT AND LOSS", value: "+$3,146.20", delta: "+1.27%", positive: true },
  { label: "ACTIVE COPIES", value: "12", sub: "3 masters" },
  { label: "TRADES TODAY", value: "48", delta: "+12", positive: true },
];

export const SOURCES: Source[] = [
  {
    id: "provider",
    icon: "person_search",
    title: "Provider",
    desc: "Follow a verified signal provider from the marketplace",
    options: ["cTrader", "MT5"],
  },
  {
    id: "self-copy",
    icon: "content_copy",
    title: "Self-copy",
    desc: "Mirror trades across your own linked accounts",
    options: ["cTrader", "MT5"],
  },
  {
    id: "telegram",
    telegram: true,
    title: "Telegram",
    desc: "Parse and execute specific channel signals",
    options: ["Channel", "Bot", "Group"],
  },
];

export const SESSIONS = ["London", "New York", "Tokyo", "Sydney"];
export const INSTRUMENTS = ["Forex", "Metals", "Indices", "Crypto"];

export const INITIAL_ACCOUNTS: CopyAccount[] = [
  { id: 1, name: "Kingsman Signals", handle: "@kingsman_fx", tag: "1.0x lot", pnl: -96.3, status: "paused" },
  { id: 2, name: "Titan Scalper Pro", handle: "cTrader", tag: "$8K Allocated", pnl: 1204.6, status: "live" },
  { id: 3, name: "Main MT4 → FTMO", handle: "Self-copy", tag: "0.5x lot", pnl: 459.1, status: "live" },
];

export const INITIAL_FEED: FeedRow[] = [
  { id: 1, side: "BUY", symbol: "XAU/USD", lot: "0.50", price: "2418.20", ms: 38, pnl: 142.0, time: "12s ago" },
  { id: 2, side: "SELL", symbol: "EUR/USD", lot: "1.20", price: "1.0842", ms: 44, pnl: 78.4, time: "1m ago" },
];

export const FEED_SYMBOLS = ["XAU/USD", "EUR/USD", "GBP/USD", "USD/JPY", "US30", "BTC/USD"];
