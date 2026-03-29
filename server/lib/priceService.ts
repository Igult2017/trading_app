/**
 * priceService.ts
 * ───────────────
 * Two separate concerns:
 *
 * 1. LIVE PRICES  →  read from price_daemon.py cache over HTTP (127.0.0.1:8765)
 *    The daemon runs persistently alongside Node and writes to its cache via:
 *      • Binance WebSocket (crypto, ms latency)
 *      • yfinance rotating scheduler (forex/stocks/indices/commodities, 6 s/req)
 *    The API layer NEVER triggers an external fetch — it only reads from cache.
 *
 * 2. CANDLE / OHLCV DATA  →  on-demand Python subprocess (price_service.py)
 *    Candle requests are infrequent and require historical aggregation, so they
 *    stay as separate subprocess calls with a 2-minute server-side cache.
 */

import { spawn } from 'child_process';
import path      from 'path';
import { PYTHON_BIN } from './pythonBin';

// ── Shared types ───────────────────────────────────────────────────────────────

export interface CandleBar {
  time:   number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface CandleResult {
  symbol:    string;
  interval?: string;
  period?:   string;
  candles:   CandleBar[];
  error?:    string;
}

export interface PriceResult {
  symbol:        string;
  assetClass?:   string;
  price?:        number;
  change?:       number;
  changePercent?: number;
  high?:         number;
  low?:          number;
  open?:         number;
  previousClose?: number;
  volume?:       number;
  marketCap?:    number;
  timestamp?:    string;
  source?:       string;
  error?:        string;
}

// ── 1. DAEMON CLIENT (live prices) ────────────────────────────────────────────

const DAEMON_PORT = process.env.PRICE_DAEMON_PORT ?? '8765';
const DAEMON_URL  = `http://127.0.0.1:${DAEMON_PORT}`;

/** Read one symbol from the daemon cache. */
export async function getPrice(
  symbol:     string,
  assetClass: string = 'stock'
): Promise<PriceResult> {
  const results = await getMultiplePrices([{ symbol, assetClass }]);
  return results[0] ?? { symbol, assetClass, error: 'no result' };
}

/** Read a batch of symbols from the daemon cache (instant — no external call). */
export async function getMultiplePrices(
  symbols: Array<{ symbol: string; assetClass: string }>
): Promise<PriceResult[]> {
  try {
    const res = await fetch(DAEMON_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ symbols }),
      // Node 18+ fetch — short timeout since this is localhost
      signal:  AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`Daemon HTTP ${res.status}`);

    const raw: Record<string, any> = await res.json();

    return symbols.map(s => {
      const d = raw[s.symbol];
      if (!d) return { symbol: s.symbol, assetClass: s.assetClass, error: 'not yet in cache' };
      return {
        symbol:        s.symbol,
        assetClass:    d.assetClass   ?? s.assetClass,
        price:         d.price,
        change:        d.change,
        changePercent: d.changePercent,
        high:          d.high,
        low:           d.low,
        previousClose: d.previousClose,
        volume:        d.volume,
        timestamp:     d.timestamp,
        source:        d.source,
      } satisfies PriceResult;
    });
  } catch (err) {
    console.error('[priceService] Daemon read failed:', err);
    return symbols.map(s => ({
      symbol:     s.symbol,
      assetClass: s.assetClass,
      error:      err instanceof Error ? err.message : String(err),
    }));
  }
}

/** Ping — true if the daemon HTTP server is reachable. */
export async function pingPriceService(): Promise<boolean> {
  try {
    const res = await fetch(DAEMON_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// getCachedPrice / getCachedMultiplePrices are now trivial — the daemon cache
// *is* the cache.  These wrappers keep the call-site API identical.

export const getCachedPrice        = getPrice;
export const getCachedMultiplePrices = getMultiplePrices;

// ── 2. CANDLE SUBPROCESS (on-demand OHLCV) ────────────────────────────────────

const PYTHON_SCRIPT_PATH = path.join(
  process.cwd(), 'server', 'python', 'price_service.py'
);

interface CandleRequest {
  action:     'get_candles';
  symbol:     string;
  assetClass: string;
  interval:   string;
  period:     string;
}

function callCandleSubprocess(req: CandleRequest): Promise<CandleResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [PYTHON_SCRIPT_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`price_service.py exited ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Failed to parse candle output: ${stdout.slice(0, 200)}`));
      }
    });

    proc.on('error', err => reject(new Error(`Subprocess error: ${err.message}`)));

    proc.stdin.write(JSON.stringify(req));
    proc.stdin.end();
  });
}

export async function getCandleData(
  symbol:     string,
  assetClass: 'stock' | 'forex' | 'commodity' | 'crypto' = 'stock',
  interval:   string = '5m',
  period:     string = '1d'
): Promise<CandleResult> {
  try {
    return await callCandleSubprocess({
      action: 'get_candles', symbol, assetClass, interval, period,
    });
  } catch (err) {
    return {
      symbol, candles: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// 2-minute cache — candle data doesn't change faster than this
const candleCache = new Map<string, { data: CandleResult; ts: number }>();
const CANDLE_TTL  = 120_000;

export async function getCachedCandleData(
  symbol:     string,
  assetClass: 'stock' | 'forex' | 'commodity' | 'crypto' = 'stock',
  interval:   string = '5m',
  period:     string = '1d'
): Promise<CandleResult> {
  const key    = `${symbol}-${assetClass}-${interval}-${period}`;
  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.ts < CANDLE_TTL) return cached.data;

  const result = await getCandleData(symbol, assetClass, interval, period);
  if (!result.error) candleCache.set(key, { data: result, ts: Date.now() });
  return result;
}
