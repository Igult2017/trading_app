import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";

// ── Lazy client factory ───────────────────────────────────────────────────────
// The client is created fresh on every call so GOOGLE_API_KEY is always read
// from the current environment. No import-time initialisation needed.

function getAIClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not set. Add it to your environment variables to enable AI features.",
    );
  }
  return new GoogleGenAI({ apiKey });
}

// ── Model fallback chain ──────────────────────────────────────────────────────
// Ordered by preference — flash first (fast/cheap), then pro.
// Auto-discovery runs after all these are exhausted.
const MODEL_FALLBACK_CHAIN = [
  "gemini-2.0-flash",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-flash",
  "gemini-2.5-pro-preview-05-06",
  "gemini-2.5-pro",
  "gemini-1.5-pro",
];

function isModelError(msg: string): boolean {
  return (
    msg.includes("not found") ||
    msg.includes("deprecated") ||
    msg.includes("not supported") ||
    msg.includes("404")
  );
}

async function discoverModels(ai: GoogleGenAI): Promise<string[]> {
  try {
    const discovered: string[] = [];
    const result = await ai.models.list();
    for await (const m of result as any) {
      const id: string = (m.name ?? "").replace("models/", "");
      if (!id.startsWith("gemini")) continue;
      if (["embedding", "aqa", "tts"].some(s => id.includes(s))) continue;
      discovered.push(id);
    }
    const flash = discovered.filter(m => m.includes("flash"));
    const pro   = discovered.filter(m => m.includes("pro") && !m.includes("flash"));
    return [...flash, ...pro];
  } catch {
    return [];
  }
}

type GenerateParams = {
  preferredModel?: string;
  config?: Record<string, any>;
  contents: any;
};

async function generateWithFallback(params: GenerateParams): Promise<string> {
  const ai = getAIClient();

  // Build deduplicated candidate list
  const seed = params.preferredModel
    ? [params.preferredModel, ...MODEL_FALLBACK_CHAIN]
    : [...MODEL_FALLBACK_CHAIN];
  const seen = new Set<string>();
  let models = seed.filter(m => { if (seen.has(m)) return false; seen.add(m); return true; });

  let lastError: Error | null = null;
  let triedDiscovery = false;

  while (true) {
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          config: params.config,
          contents: params.contents,
        });
        return response.text ?? "";
      } catch (err: any) {
        lastError = err;
        const msg: string = err?.message ?? "";
        if (!isModelError(msg)) throw err; // auth / quota — don't retry
        console.warn(`[Gemini] Model "${model}" unavailable (${msg.slice(0, 100)}), trying next…`);
      }
    }

    // All candidates exhausted — try auto-discovery once
    if (triedDiscovery) break;
    triedDiscovery = true;
    const discovered = await discoverModels(ai);
    models = discovered.filter(m => !seen.has(m));
    if (models.length === 0) break;
    console.warn(`[Gemini] Trying ${models.length} auto-discovered model(s)…`);
    models.forEach(m => seen.add(m));
  }
  throw lastError ?? new Error("All Gemini models failed");
}

// ─────────────────────────────────────────────────────────────────────────────

const SIGNAL_VALIDATION_INSTRUCTION = `Role: You are an expert Smart Money Concepts (SMC) analyst validating trading signals. You will receive:
1. A chart image showing price action with marked zones
2. Our analysis explaining what we observed
3. The signal we generated

YOUR TASK: Verify our observations on the chart and confirm if our analysis is accurate.

VERIFICATION CHECKLIST - Confirm each item exists on the chart:
1. TREND DIRECTION: Is the trend we identified (bullish/bearish/sideways) visible on the chart?
2. SUPPLY/DEMAND ZONES: Are the zones we marked actually visible as consolidation areas before strong moves?
3. PRICE LOCATION: Is current price actually at or near the zone we identified?
4. STRUCTURE: Can you see the higher highs/higher lows (uptrend) or lower highs/lower lows (downtrend)?
5. ENTRY CONDITIONS: Are the confirmations we listed (CHoCH, BOS, zone test) actually visible?

CRITICAL VALIDATION RULES:
1. TREND ALIGNMENT: Signal direction MUST align with the higher timeframe trend
   - Bullish trend = Only validate BUY signals
   - Bearish trend = Only validate SELL signals
   - EXCEPTION: Counter-trend ONLY if clear CHoCH is visible on chart

2. ZONE QUALITY: The zone must be:
   - Clearly visible as a consolidation area
   - Followed by a strong impulsive move away
   - Currently unmitigated (price hasn't returned to it yet, or just returned)

3. REJECT IF:
   - The chart looks choppy/ranging with no clear direction
   - Our identified zone doesn't exist or looks weak
   - Price is nowhere near the zone
   - Structure is messy/unclear
   - Our stated confirmations are NOT visible on the chart

BE STRICT: Only validate if you can VISUALLY CONFIRM our observations on the chart.

Output Format (JSON only):
{
  "validated": true/false,
  "chartObservations": {
    "trendVisible": true/false,
    "zoneExists": true/false,
    "priceAtZone": true/false,
    "structureClear": true/false,
    "confirmationsVisible": true/false
  },
  "confidenceAdjustment": number (-20 to +20),
  "concerns": ["list of any concerns or observations that don't match"],
  "strengths": ["list of verified observations"],
  "recommendation": "proceed" | "caution" | "skip",
  "reasoning": "explain what you see on the chart and whether it matches our analysis"
}`;

const MARKET_SCAN_INSTRUCTION = `Role: You are a quick market scanner for Smart Money Concepts.
Analyze the price data and identify if there are potential SMC setups forming.
Look for: supply/demand zones, liquidity pools, potential CHoCH, FVGs.

CRITICAL RULES:
1. Only identify setups that ALIGN with the trend direction
2. Counter-trend setups require CONFIRMED CHoCH (Change of Character)
3. If the market is unclear/choppy/ranging, set hasSetup to false
4. Do not identify setups in messy or conflicting market structures

Output Format (JSON only):
{
  "hasSetup": true/false,
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "setupType": "zone_entry" | "choch" | "liquidity_sweep" | "none",
  "keyLevel": number or null,
  "trendDirection": "bullish" | "bearish" | "unclear",
  "marketClarity": "clear" | "moderate" | "unclear",
  "reasoning": "brief explanation"
}`;

export interface SignalValidationResult {
  validated: boolean;
  confidenceAdjustment: number;
  concerns: string[];
  strengths: string[];
  recommendation: 'proceed' | 'caution' | 'skip';
  reasoning: string;
  error?: string;
  isFallback?: boolean;
}

export interface MarketScanResult {
  hasSetup: boolean;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  setupType: 'zone_entry' | 'choch' | 'liquidity_sweep' | 'none';
  keyLevel: number | null;
  trendDirection: 'bullish' | 'bearish' | 'unclear';
  marketClarity: 'clear' | 'moderate' | 'unclear';
  reasoning: string;
  error?: string;
}

export interface PriceData {
  symbol: string;
  timeframe: string;
  candles: CandleData[];
}

export interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface SignalToValidate {
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  strategy: string;
  entryType: string;
  reasoning: string;
  zones?: { type: string; top: number; bottom: number }[];
}

function formatPriceDataForGemini(priceData: PriceData[]): string {
  return priceData.map(data => {
    const recentCandles = data.candles.slice(-30);
    const lastCandle = recentCandles[recentCandles.length - 1];
    return `
=== ${data.symbol} - ${data.timeframe} ===
Current Price: ${lastCandle?.close || 'N/A'}
Last Update: ${lastCandle?.date || 'N/A'}

Recent Candles (newest first):
${recentCandles.reverse().slice(0, 15).map(c =>
  `${c.date}: O:${c.open.toFixed(5)} H:${c.high.toFixed(5)} L:${c.low.toFixed(5)} C:${c.close.toFixed(5)}`
).join('\n')}
`;
  }).join('\n\n');
}

function formatSignalForValidation(signal: SignalToValidate): string {
  let zonesText = '';
  if (signal.zones && signal.zones.length > 0) {
    zonesText = `\nIdentified Zones:\n${signal.zones.map(z =>
      `- ${z.type}: ${z.bottom.toFixed(5)} - ${z.top.toFixed(5)}`
    ).join('\n')}`;
  }
  return `
=== SIGNAL TO VALIDATE ===
Symbol: ${signal.symbol}
Direction: ${signal.direction}
Entry: ${signal.entryPrice.toFixed(5)}
Stop Loss: ${signal.stopLoss.toFixed(5)}
Take Profit: ${signal.takeProfit.toFixed(5)}
Current Confidence: ${signal.confidence}%
Strategy: ${signal.strategy}
Entry Type: ${signal.entryType}
Reasoning: ${signal.reasoning}
${zonesText}
`;
}

export async function validateSignalWithGemini(
  signal: SignalToValidate,
  priceData: PriceData[],
  chartImagePaths?: string[],
): Promise<SignalValidationResult> {
  try {
    const formattedData = formatPriceDataForGemini(priceData);
    const formattedSignal = formatSignalForValidation(signal);

    const contents: any[] = [];

    if (chartImagePaths && chartImagePaths.length > 0) {
      const chartLabels = ['HTF Context (1D/H4)', 'Zone Identification (M15/M30)', 'Entry Confirmation (M5/M1)'];
      for (let i = 0; i < chartImagePaths.length; i++) {
        const chartPath = chartImagePaths[i];
        if (fs.existsSync(chartPath)) {
          const imageBytes = fs.readFileSync(chartPath);
          const mimeType = chartPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
          contents.push({ inlineData: { data: imageBytes.toString('base64'), mimeType } });
          contents.push(`Chart ${i + 1}: ${chartLabels[i] || `Timeframe ${i + 1}`}`);
        }
      }
    }

    contents.push(`
Please validate this trading signal by verifying ALL the charts above:

${formattedSignal}

VERIFICATION ACROSS TIMEFRAMES:
1. HTF Chart: Verify the trend direction we identified
2. Zone Chart: Verify the supply/demand zone exists and is valid
3. Entry Chart: Verify the entry trigger and price location

Price Data Context:
${formattedData}

Provide your validation in the exact JSON format specified.
`);

    const text = await generateWithFallback({
      config: {
        systemInstruction: SIGNAL_VALIDATION_INSTRUCTION,
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
      contents,
    });

    if (text) {
      try {
        const result = JSON.parse(text);
        return {
          validated: result.validated ?? false,
          confidenceAdjustment: Math.max(-20, Math.min(20, result.confidenceAdjustment || 0)),
          concerns: result.concerns || [],
          strengths: result.strengths || [],
          recommendation: result.recommendation || 'caution',
          reasoning: result.reasoning || '',
        };
      } catch {
        return {
          validated: true,
          confidenceAdjustment: 0,
          concerns: ['Could not parse Gemini response'],
          strengths: [],
          recommendation: 'caution',
          reasoning: 'Validation response was not in expected format',
        };
      }
    }

    return {
      validated: false,
      confidenceAdjustment: 0,
      concerns: ['Empty response from Gemini'],
      strengths: [],
      recommendation: 'skip',
      reasoning: 'No validation response received',
    };
  } catch (error) {
    console.error('Gemini validation error:', error);
    return {
      validated: true,
      confidenceAdjustment: 0,
      concerns: ['Gemini validation unavailable - using strategy signal as fallback'],
      strengths: [],
      recommendation: 'proceed',
      reasoning: 'Gemini service unavailable — fallback: using strategy signal as-is',
      error: error instanceof Error ? error.message : 'Unknown error',
      isFallback: true,
    };
  }
}

export async function quickMarketScan(
  symbol: string,
  priceData: PriceData[],
): Promise<MarketScanResult> {
  try {
    const formattedData = formatPriceDataForGemini(priceData);

    const text = await generateWithFallback({
      config: {
        systemInstruction: MARKET_SCAN_INSTRUCTION,
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 512,
      },
      contents: `Quick scan for ${symbol}:\n${formattedData}`,
    });

    if (text) {
      try {
        const result = JSON.parse(text);
        return {
          hasSetup: result.hasSetup ?? false,
          direction: result.direction || 'NEUTRAL',
          setupType: result.setupType || 'none',
          keyLevel: result.keyLevel || null,
          trendDirection: result.trendDirection || 'unclear',
          marketClarity: result.marketClarity || 'unclear',
          reasoning: result.reasoning || '',
        };
      } catch {
        return {
          hasSetup: false,
          direction: 'NEUTRAL',
          setupType: 'none',
          keyLevel: null,
          trendDirection: 'unclear',
          marketClarity: 'unclear',
          reasoning: 'Could not parse scan response',
        };
      }
    }

    return {
      hasSetup: false,
      direction: 'NEUTRAL',
      setupType: 'none',
      keyLevel: null,
      trendDirection: 'unclear',
      marketClarity: 'unclear',
      reasoning: 'Empty scan response',
    };
  } catch (error) {
    console.error('Quick scan error:', error);
    return {
      hasSetup: false,
      direction: 'NEUTRAL',
      setupType: 'none',
      keyLevel: null,
      trendDirection: 'unclear',
      marketClarity: 'unclear',
      reasoning: 'Scan failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function isGeminiConfigured(): boolean {
  return !!process.env.GOOGLE_API_KEY;
}

export async function testGeminiConnection(): Promise<{ success: boolean; message: string }> {
  if (!isGeminiConfigured()) {
    return { success: false, message: 'GOOGLE_API_KEY not configured' };
  }
  try {
    const text = await generateWithFallback({
      contents: "Respond with exactly: 'SMC validation ready'",
    });
    if (text.toLowerCase().includes('ready')) {
      return { success: true, message: 'Gemini API connected successfully' };
    }
    return { success: true, message: `Gemini responded: ${text.slice(0, 50)}…` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

export async function analyzeWithGemini(
  symbol: string,
  priceData: PriceData[],
  chartImagePath?: string,
): Promise<any> {
  const dummySignal: SignalToValidate = {
    symbol,
    direction: 'BUY',
    entryPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    confidence: 50,
    strategy: 'smc',
    entryType: 'analysis_request',
    reasoning: 'Full analysis requested',
  };
  const chartPaths = chartImagePath ? [chartImagePath] : undefined;
  const validation = await validateSignalWithGemini(dummySignal, priceData, chartPaths);
  const scan = await quickMarketScan(symbol, priceData);
  return {
    validation,
    marketScan: scan,
    note: 'Use validateSignalWithGemini() to validate specific signals from our SMC strategy',
  };
}

export async function quickAnalyzeWithGemini(
  symbol: string,
  priceData: PriceData[],
): Promise<{ direction: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reasoning: string } | null> {
  const scan = await quickMarketScan(symbol, priceData);
  if (scan.error) return null;
  return {
    direction: scan.direction === 'NEUTRAL' ? 'HOLD' : scan.direction,
    confidence: scan.hasSetup ? 60 : 30,
    reasoning: scan.reasoning,
  };
}
