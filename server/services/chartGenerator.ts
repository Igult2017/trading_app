import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface ChartCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface SignalInfo {
  direction: 'BUY' | 'SELL';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
}

export interface ZoneInfo {
  top: number;
  bottom: number;
}

export interface ChartGeneratorInput {
  symbol: string;
  timeframe: string;
  candles: ChartCandle[];
  signal?: SignalInfo;
  supply_zones?: ZoneInfo[];
  demand_zones?: ZoneInfo[];
  output_path: string;
}

export interface ChartGeneratorResult {
  success: boolean;
  path?: string;
  error?: string;
}

// Generate chart using Python script
export async function generateSignalChart(input: ChartGeneratorInput): Promise<ChartGeneratorResult> {
  return new Promise((resolve) => {
    // Use absolute path to ensure script is found regardless of working directory
    const pythonScript = path.resolve(process.cwd(), 'server/python/chart_generator.py');
    
    // Check if Python script exists
    if (!fs.existsSync(pythonScript)) {
      resolve({ success: false, error: 'Chart generator script not found' });
      return;
    }
    
    const python = spawn('python3', [pythonScript]);
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        console.error('Chart generation stderr:', stderr);
        resolve({ success: false, error: stderr || `Process exited with code ${code}` });
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        resolve({ success: false, error: `Failed to parse result: ${stdout}` });
      }
    });
    
    python.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
    
    // Send input data as JSON
    python.stdin.write(JSON.stringify(input));
    python.stdin.end();
  });
}

// Generate a trading signal chart (simplified interface)
export async function generateTradingSignalChart(
  symbol: string,
  timeframe: string,
  candles: ChartCandle[],
  signal: {
    direction: 'BUY' | 'SELL';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    confidence: number;
  },
  supplyZones: ZoneInfo[] = [],
  demandZones: ZoneInfo[] = []
): Promise<ChartGeneratorResult> {
  // Generate unique filename
  const timestamp = Date.now();
  const safeSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `signal_${safeSymbol}_${timeframe}_${timestamp}.png`;
  const outputPath = path.join('/tmp/charts', filename);
  
  // Ensure directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const input: ChartGeneratorInput = {
    symbol,
    timeframe,
    candles,
    signal: {
      direction: signal.direction,
      entry: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      confidence: signal.confidence,
    },
    supply_zones: supplyZones,
    demand_zones: demandZones,
    output_path: outputPath,
  };
  
  return generateSignalChart(input);
}

// Check if chart generation is available
export async function isChartGeneratorAvailable(): Promise<boolean> {
  try {
    const testInput: ChartGeneratorInput = {
      symbol: 'TEST',
      timeframe: '1H',
      candles: [
        { date: '2024-01-01T00:00:00Z', open: 1.0, high: 1.1, low: 0.9, close: 1.05 },
        { date: '2024-01-01T01:00:00Z', open: 1.05, high: 1.15, low: 1.0, close: 1.10 },
        { date: '2024-01-01T02:00:00Z', open: 1.10, high: 1.12, low: 1.05, close: 1.08 },
        { date: '2024-01-01T03:00:00Z', open: 1.08, high: 1.15, low: 1.06, close: 1.12 },
        { date: '2024-01-01T04:00:00Z', open: 1.12, high: 1.18, low: 1.10, close: 1.15 },
      ],
      output_path: '/tmp/test_chart.png',
    };
    
    const result = await generateSignalChart(testInput);
    
    // Clean up test file
    if (result.success && result.path && fs.existsSync(result.path)) {
      fs.unlinkSync(result.path);
    }
    
    return result.success;
  } catch {
    return false;
  }
}

// Read chart as buffer for sending via Telegram
export function readChartAsBuffer(chartPath: string): Buffer | null {
  try {
    if (fs.existsSync(chartPath)) {
      return fs.readFileSync(chartPath);
    }
    return null;
  } catch {
    return null;
  }
}

// Clean up old chart files
export function cleanupOldCharts(maxAgeMs: number = 3600000): void {
  const chartsDir = '/tmp/charts';
  
  if (!fs.existsSync(chartsDir)) {
    return;
  }
  
  const now = Date.now();
  const files = fs.readdirSync(chartsDir);
  
  for (const file of files) {
    const filePath = path.join(chartsDir, file);
    try {
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore errors
    }
  }
}
