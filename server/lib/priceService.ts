import { spawn } from 'child_process';
import path from 'path';

interface PriceRequest {
  action: 'get_price' | 'get_multiple_prices' | 'ping';
  symbol?: string;
  assetClass?: 'stock' | 'forex' | 'commodity' | 'crypto';
  symbols?: Array<{ symbol: string; assetClass: string }>;
}

interface PriceResult {
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

const PYTHON_SCRIPT_PATH = path.join(process.cwd(), 'server', 'python', 'price_service.py');

async function callPythonService(request: PriceRequest): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [PYTHON_SCRIPT_PATH], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python price service error:', stderr);
        reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${stdout}`));
      }
    });
    
    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });
    
    // Send request to Python process
    pythonProcess.stdin.write(JSON.stringify(request));
    pythonProcess.stdin.end();
  });
}

export async function getPrice(symbol: string, assetClass: 'stock' | 'forex' | 'commodity' | 'crypto' = 'stock'): Promise<PriceResult> {
  try {
    const result = await callPythonService({
      action: 'get_price',
      symbol,
      assetClass
    });
    return result;
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error);
    return {
      symbol,
      assetClass,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function getMultiplePrices(symbols: Array<{ symbol: string; assetClass: string }>): Promise<PriceResult[]> {
  try {
    const result = await callPythonService({
      action: 'get_multiple_prices',
      symbols
    });
    return result;
  } catch (error) {
    console.error('Error fetching multiple prices:', error);
    return symbols.map(s => ({
      symbol: s.symbol,
      assetClass: s.assetClass,
      error: error instanceof Error ? error.message : 'Unknown error'
    }));
  }
}

export async function pingPriceService(): Promise<boolean> {
  try {
    const result = await callPythonService({ action: 'ping' });
    return result.status === 'ok';
  } catch (error) {
    console.error('Price service ping failed:', error);
    return false;
  }
}

// Cache for price data to reduce API calls
const priceCache = new Map<string, { data: PriceResult; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

export async function getCachedPrice(symbol: string, assetClass: 'stock' | 'forex' | 'commodity' | 'crypto' = 'stock'): Promise<PriceResult> {
  const cacheKey = `${symbol}-${assetClass}`;
  const cached = priceCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const result = await getPrice(symbol, assetClass);
  
  if (!result.error) {
    priceCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
  }
  
  return result;
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
    const fetchedResults = await getMultiplePrices(
      symbolsToFetch.map(s => ({ symbol: s.symbol, assetClass: s.assetClass }))
    );
    
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
