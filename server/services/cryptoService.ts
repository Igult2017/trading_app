/**
 * Crypto market data service.
 * Calls crypto_data.py and caches the results to avoid CoinGecko rate limits.
 */

import { spawn } from "child_process";
import * as path from "path";
import { PYTHON_BIN } from "../lib/pythonBin";
import { cacheGet, cacheSet } from "../lib/cache";

const SCRIPT = path.join(process.cwd(), "server", "python", "crypto_data.py");

export interface CoinData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  marketCap: number;
  rank: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  change1h: number | null;
  change24h: number;
  change7d: number | null;
  circulatingSupply: number;
  maxSupply: number | null;
  ath: number;
  athChangePercent: number;
  sparkline: number[];
  lastUpdated: string;
}

export interface GlobalData {
  totalMarketCap: number;
  totalVolume24h: number;
  btcDominance: number;
  ethDominance: number;
  activeCryptocurrencies: number;
  markets: number;
  marketCapChange24h: number;
}

export interface FearGreedEntry {
  value: number;
  classification: string;
  timestamp: number;
}

export interface FearGreedData {
  current: FearGreedEntry;
  history: FearGreedEntry[];
}

export interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  rank: number;
  image: string;
  price: number | null;
  change24h: number | null;
  score: number;
}

export interface CryptoAllData {
  market: CoinData[];
  global: GlobalData;
  fearGreed: FearGreedData;
  trending: TrendingCoin[];
}

const CRYPTO_CACHE_KEY = "crypto:all";
const CRYPTO_TTL_SECS = 5 * 60;
let _fetchPromise: Promise<CryptoAllData> | null = null;

function runPython(mode: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(PYTHON_BIN, [SCRIPT, mode], {
      cwd: process.cwd(),
      env: process.env,
    });

    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    child.on("error", reject);
    child.on("close", (code) => {
      if (stderr) console.log(`[crypto/${mode}]`, stderr.trim());
      if (code !== 0) return reject(new Error(`Python exited ${code}`));
      resolve(stdout);
    });

    // Allow up to 90s — CoinGecko retry waits can add up
    setTimeout(() => {
      child.kill();
      reject(new Error("Python crypto_data timeout (90s)"));
    }, 90_000);
  });
}

async function _doFetch(): Promise<CryptoAllData> {
  const raw = await runPython("all");
  const data = JSON.parse(raw) as CryptoAllData;
  await cacheSet(CRYPTO_CACHE_KEY, data, CRYPTO_TTL_SECS);
  return data;
}

export async function getCryptoData(): Promise<CryptoAllData> {
  const cached = await cacheGet<CryptoAllData>(CRYPTO_CACHE_KEY);
  if (cached) return cached;

  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = _doFetch().finally(() => { _fetchPromise = null; });

  try {
    return await _fetchPromise;
  } catch (err) {
    console.error("[crypto] fetch failed:", err);
    const stale = await cacheGet<CryptoAllData>(CRYPTO_CACHE_KEY);
    if (stale) return stale;
    return { market: [], global: {} as GlobalData, fearGreed: {} as FearGreedData, trending: [] };
  }
}

// Warm up on startup
(function warmup() {
  console.log("[crypto] Warming up crypto data cache in background…");
  getCryptoData()
    .then(d => console.log(`[crypto] Cache ready — ${d.market.length} coins`))
    .catch(() => {});
})();
