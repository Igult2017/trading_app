import type { Stat, TradeRow } from "../types";

export const TRADE_HISTORY: TradeRow[] = [
  { id: 1, date: "Jul 13", symbol: "XAU/USD", side: "BUY", lot: "0.50", source: "Titan Scalper Pro", pnl: 142.0 },
  { id: 2, date: "Jul 13", symbol: "EUR/USD", side: "SELL", lot: "1.20", source: "Titan Scalper Pro", pnl: 78.4 },
  { id: 3, date: "Jul 12", symbol: "GBP/USD", side: "BUY", lot: "0.80", source: "Main MT4 → FTMO", pnl: -54.2 },
  { id: 4, date: "Jul 12", symbol: "US30", side: "SELL", lot: "0.30", source: "Kingsman Signals", pnl: -96.3 },
  { id: 5, date: "Jul 11", symbol: "XAU/USD", side: "BUY", lot: "0.40", source: "Titan Scalper Pro", pnl: 211.6 },
  { id: 6, date: "Jul 11", symbol: "USD/JPY", side: "SELL", lot: "1.00", source: "Main MT4 → FTMO", pnl: 63.9 },
  { id: 7, date: "Jul 10", symbol: "BTC/USD", side: "BUY", lot: "0.10", source: "Titan Scalper Pro", pnl: -38.5 },
];

export const RISK_STATS: Stat[] = [
  { label: "WIN RATE", value: "71%", sub: "last 30 days" },
  { label: "PROFIT FACTOR", value: "1.84", sub: "last 30 days" },
  { label: "MAX DRAWDOWN", value: "-6.2%", sub: "peak to trough" },
  { label: "TOTAL TRADES", value: "312", sub: "last 30 days" },
];
