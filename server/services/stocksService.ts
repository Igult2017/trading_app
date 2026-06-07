import { spawn } from "child_process";
import * as path from "path";
import { PYTHON_BIN } from "../lib/pythonBin";
import { cacheGet, cacheSet } from "../lib/cache";

export interface StockQuote {
  symbol:    string;
  name:      string;
  price:     string;
  change:    string;
  pctChange: string;
  exchange:  string;
  type:      "stock";
}

export interface IndexQuote {
  name:      string;
  price:     string;
  change:    string;
  pctChange: string;
  volume:    string;
  type:      "index";
}

export interface StocksData {
  indices: IndexQuote[];
  stocks:  StockQuote[];
}

const INDICES_KEY = "homepage:stocks:indices";
const STOCKS_KEY  = "homepage:stocks:stocks";
const TTL         = 5 * 60;              // 5 min — markets move fast
const RETRY_MS    = 4 * 60 * 1000;      // minimum interval between scraper runs
const SCRIPT      = path.join(process.cwd(), "server", "python", "stocks_scraper.py");

let _lastAttemptAt = 0;
let _inFlight: Promise<StocksData> | null = null;
let _lastError: string | null = null;

function runScraper(mode: "indices" | "stocks" | "all"): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = "", err = "", done = false;
    const child = spawn(PYTHON_BIN, [SCRIPT, mode], { cwd: process.cwd(), env: process.env });
    const t = setTimeout(() => {
      if (!done) { done = true; child.kill(); reject(new Error("Python timeout (90s)")); }
    }, 90_000);
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { err += d; });
    child.on("error", e => { if (!done) { done = true; clearTimeout(t); reject(e); } });
    child.on("close", code => {
      if (done) return;
      done = true; clearTimeout(t);
      if (err) console.log("[stocksService]", err.trim());
      if (code !== 0) return reject(new Error(`Python exited ${code}`));
      resolve(out);
    });
  });
}

async function _refresh(): Promise<StocksData> {
  _lastAttemptAt = Date.now();
  try {
    const raw = await runScraper("all");
    const data: StocksData = JSON.parse(raw);
    if (data.indices.length > 0 || data.stocks.length > 0) {
      await cacheSet(INDICES_KEY, data.indices, TTL);
      await cacheSet(STOCKS_KEY,  data.stocks,  TTL);
      _lastError = null;
      console.log(`[stocksService] scraped ${data.indices.length} indices, ${data.stocks.length} stocks`);
    } else {
      _lastError = "0 results returned — serving cache";
      console.warn("[stocksService]", _lastError);
    }
  } catch (e: any) {
    _lastError = e.message;
    console.error("[stocksService] scrape failed:", e.message);
  }
  const indices = (await cacheGet<IndexQuote[]>(INDICES_KEY)) ?? [];
  const stocks  = (await cacheGet<StockQuote[]>(STOCKS_KEY))  ?? [];
  return { indices, stocks };
}

export async function getStocksData(): Promise<StocksData> {
  const due = Date.now() - _lastAttemptAt >= RETRY_MS;
  if (due && !_inFlight) {
    _inFlight = _refresh().finally(() => { _inFlight = null; });
  }
  const indices = await cacheGet<IndexQuote[]>(INDICES_KEY);
  const stocks  = await cacheGet<StockQuote[]>(STOCKS_KEY);
  if (indices && stocks) return { indices, stocks };
  if (_inFlight) return _inFlight;
  return { indices: [], stocks: [] };
}

export function getStocksServiceStatus() {
  return {
    lastAttemptAt: _lastAttemptAt || null,
    inFlight:      _inFlight !== null,
    lastError:     _lastError,
  };
}

// ── Startup: warm cache in background ────────────────────────────────────────
(async function warmup() {
  getStocksData()
    .then(d => console.log(`[stocksService] ready: ${d.indices.length} indices, ${d.stocks.length} stocks`))
    .catch(() => {});
})();
