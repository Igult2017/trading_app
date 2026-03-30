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

// Cache for price data to reduce API calls
const priceCache = new Map<string, { data: PriceResult; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds — daily bars change slowly; prevents thundering herd

// In-flight deduplication: if a fetch for a symbols key is already running, reuse the promise
const inflightFetches = new Map<string, Promise<PriceResult[]>>();


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

/** Cached single-symbol price lookup — wrapper around getCachedMultiplePrices. */
export async function getCachedPrice(
  symbol:     string,
  assetClass: string = 'stock'
): Promise<PriceResult> {
  const results = await getCachedMultiplePrices([{ symbol, assetClass }]);
  return results[0] ?? { symbol, assetClass, error: 'no result' };
}

export async function getCachedMultiplePrices(symbols: Array<{ symbol: string; assetClass: string }>): Promise<PriceResult[]> {
  const now = Date.now();
  const results: PriceResult[] = [];
  const symbolsToFetch: Array<{ symbol: string; assetClass: string; index: number }> = [];

  // Check cache for each symbol
  symbols.forEach((s, index) => {
    const cacheKey = `${s.symbol}-${s.assetClass}`;
    const cached = priceCache.get(cacheKey);

    if (cached && now - cached.timestamp < CACHE_TTL) {
      results[index] = cached.data;
    } else {
      symbolsToFetch.push({ ...s, index });
    }
  });

  // Fetch uncached symbols
  if (symbolsToFetch.length > 0) {
    // Build a stable key for this exact set of uncached symbols
    const fetchKey = symbolsToFetch.map(s => `${s.symbol}:${s.assetClass}`).sort().join('|');

    // Reuse an in-flight request for the same set rather than spawning a second Python process
    let fetchPromise = inflightFetches.get(fetchKey);
    if (!fetchPromise) {
      fetchPromise = getMultiplePrices(
        symbolsToFetch.map(s => ({ symbol: s.symbol, assetClass: s.assetClass }))
      ).finally(() => inflightFetches.delete(fetchKey));
      inflightFetches.set(fetchKey, fetchPromise);
    }

    const fetchedResults = await fetchPromise;

    fetchedResults.forEach((result, i) => {
      const originalIndex = symbolsToFetch[i].index;
      results[originalIndex] = result;

      if (!result.error) {
        const cacheKey = `${result.symbol}-${symbolsToFetch[i].assetClass}`;
        priceCache.set(cacheKey, {
          data: result,
          timestamp: now
        });
      }
    });
  }

  return results;
}

// ── 2. CANDLE SUBPROCESS ──────────────────────────────────────────────────────

interface CandleRequest {
  action:     string;
  symbol:     string;
  assetClass: string;
  interval:   string;
  period:     string;
}

/**
 * Spawns price_service.py to fetch OHLCV candle data.
 *
 * Key behaviour: stdout is parsed first regardless of exit code.
 * Python prints a valid JSON payload (possibly with an `error` field) before
 * calling sys.exit(1) on partial failures — so we must attempt JSON.parse
 * before treating the exit code as a hard failure.
 */
export function callCandleSubprocess(req: CandleRequest): Promise<CandleResult> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'server', 'python', 'price_service.py');
    const args       = [scriptPath, JSON.stringify(req)];
    const proc       = spawn(PYTHON_BIN, args);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', (err: Error) => reject(err));

    proc.on('close', (code: number | null) => {
      // Always attempt to parse stdout first — Python emits valid JSON even
      // when it calls sys.exit(1) (e.g. partial data with an error field).
      if (stdout.trim()) {
        try {
          return resolve(JSON.parse(stdout));
        } catch {
          // stdout wasn't valid JSON — fall through to the error path
        }
      }
      reject(new Error(
        `price_service.py exited ${code ?? 'null'}` +
        (stderr ? `: ${stderr.slice(0, 400)}` : '')
      ));
    });
  });
}
