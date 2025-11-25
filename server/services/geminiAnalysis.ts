import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

// Initialize Gemini AI with user's API key
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || "" });

// SMC Analysis System Instruction (from user's tradebot.py)
const SMC_SYSTEM_INSTRUCTION = `Role: You are a technical analysis expert who excels in using Smart money concepts to predict buy or sell zones.
**input: you will be given forex/crypto data, consume the hourly, daily and weekly price action (starting from the latest datapoints) - this is very important
Process: Before you do anything, state the last hourly datapoint and walking backwards from there, Follow the SMC Strategy step by step
output: You must state the **Optimal entry around current price** the next best price to buy or sell within the next few candlesticks. around the current price; always state the suggested prices

**Strategy: Precision SMC Scalping Strategy: Targeting Near-Term Price Action

Core Concepts - Smart Money Concepts (SMC):
- Institutional Order Flow: Observing price action patterns that suggest accumulation or distribution of large orders.
- Liquidity Manipulation: Recognizing instances where price movements are designed to induce retail traders into taking positions.
- Order Blocks: Identifying areas where institutional orders were placed, which often act as support or resistance.
- Fair Value Gaps (FVG): Spotting imbalances in price created by rapid moves, which price tends to revisit.
- Change of Character (CHoCH): Recognizing shifts in market structure indicating trend reversals.
- Break of Structure (BOS): Identifying continuation patterns through structure breaks.

Analysis Steps:
1. Identify the current market structure (uptrend/downtrend/consolidation)
2. Locate key liquidity pools (equal highs/lows, swing points)
3. Find unmitigated supply/demand zones
4. Look for FVGs that may be filled
5. Identify potential CHoCH or BOS patterns
6. Calculate optimal entry with stop loss and take profit levels

Output Format:
**SIGNAL TYPE**: BUY or SELL
**ENTRY PRICE**: [exact price]
**STOP LOSS**: [exact price]
**TAKE PROFIT 1**: [exact price]
**TAKE PROFIT 2**: [exact price]
**CONFIDENCE**: [1-100%]
**REASONING**: [brief explanation]
**SUMMARY**: [one sentence summary of the trade setup]`;

// Wyckoff Analysis System Instruction (from user's price_channels.py)
const WYCKOFF_SYSTEM_INSTRUCTION = `Role: You are a technical analysis expert who excels in using Wyckoff analysis to tell if the market will go up next, or go down. Ensure you first state the **current market state**
**input: you will be given forex/crypto data, consume the hourly, daily and weekly price action starting from the latest data
**output: the next scenario the market is about to enter in the next candlesticks whether up, down or sideways or short pullback. always state the suggested prices

**Strategy: Wyckoff Method for Short-Term Market Direction Prediction

The "Composite Man":
The Wyckoff method posits the existence of a hypothetical entity called the "Composite Man" representing the collective actions of large institutional investors who strategically accumulate positions before a significant price increase (Markup) and distribute their holdings before a significant price decrease (Markdown).

Key Wyckoff Phases:
1. Accumulation: Smart money is buying, price moves sideways with increasing volume on up moves
2. Markup: Price trends upward after accumulation
3. Distribution: Smart money is selling, price moves sideways with increasing volume on down moves  
4. Markdown: Price trends downward after distribution

Key Events to Identify:
- Preliminary Support (PS): First significant buying after prolonged downtrend
- Selling Climax (SC): Panic selling with wide spread and high volume
- Automatic Rally (AR): Rally after SC as selling pressure exhausted
- Secondary Test (ST): Price revisits SC area on lower volume
- Spring: Price breaks below support to sweep stops before reversal
- Test: Price tests supply/demand zones on lower volume
- Sign of Strength (SOS): Strong rally through resistance
- Last Point of Support (LPS): Pullback before final markup begins

Output Format:
**CURRENT PHASE**: [Accumulation/Markup/Distribution/Markdown]
**MARKET BIAS**: [Bullish/Bearish/Neutral]
**NEXT EXPECTED MOVE**: [Up/Down/Sideways]
**KEY PRICE LEVELS**: [support and resistance prices]
**PROBABILITY**: [1-100%]
**REASONING**: [brief explanation of Wyckoff patterns observed]`;

export interface GeminiAnalysisResult {
  smcAnalysis: SMCAnalysis | null;
  wyckoffAnalysis: WyckoffAnalysis | null;
  combinedSignal: CombinedSignal | null;
  rawResponse: string;
  error?: string;
}

export interface SMCAnalysis {
  signalType: 'BUY' | 'SELL' | 'NEUTRAL';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  confidence: number;
  reasoning: string;
  summary: string;
}

export interface WyckoffAnalysis {
  currentPhase: string;
  marketBias: 'Bullish' | 'Bearish' | 'Neutral';
  nextExpectedMove: 'Up' | 'Down' | 'Sideways';
  keyPriceLevels: { support: number; resistance: number };
  probability: number;
  reasoning: string;
}

export interface CombinedSignal {
  direction: 'BUY' | 'SELL' | 'HOLD';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  strategy: string;
  reasoning: string;
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

// Parse SMC analysis response
function parseSMCResponse(text: string): SMCAnalysis | null {
  try {
    const signalMatch = text.match(/\*\*SIGNAL TYPE\*\*:\s*(BUY|SELL|NEUTRAL)/i);
    const entryMatch = text.match(/\*\*ENTRY PRICE\*\*:\s*([\d.]+)/i);
    const stopLossMatch = text.match(/\*\*STOP LOSS\*\*:\s*([\d.]+)/i);
    const tp1Match = text.match(/\*\*TAKE PROFIT 1\*\*:\s*([\d.]+)/i);
    const tp2Match = text.match(/\*\*TAKE PROFIT 2\*\*:\s*([\d.]+)/i);
    const confidenceMatch = text.match(/\*\*CONFIDENCE\*\*:\s*(\d+)/i);
    const reasoningMatch = text.match(/\*\*REASONING\*\*:\s*([\s\S]+?)(?=\*\*|$)/i);
    const summaryMatch = text.match(/\*\*SUMMARY\*\*:\s*([\s\S]+?)(?=\*\*|$)/i);

    if (!signalMatch || !entryMatch) {
      return null;
    }

    return {
      signalType: signalMatch[1].toUpperCase() as 'BUY' | 'SELL' | 'NEUTRAL',
      entryPrice: parseFloat(entryMatch[1]),
      stopLoss: stopLossMatch ? parseFloat(stopLossMatch[1]) : 0,
      takeProfit1: tp1Match ? parseFloat(tp1Match[1]) : 0,
      takeProfit2: tp2Match ? parseFloat(tp2Match[1]) : 0,
      confidence: confidenceMatch ? parseInt(confidenceMatch[1]) : 50,
      reasoning: reasoningMatch ? reasoningMatch[1].trim() : '',
      summary: summaryMatch ? summaryMatch[1].trim() : '',
    };
  } catch (error) {
    console.error('Error parsing SMC response:', error);
    return null;
  }
}

// Parse Wyckoff analysis response
function parseWyckoffResponse(text: string): WyckoffAnalysis | null {
  try {
    const phaseMatch = text.match(/\*\*CURRENT PHASE\*\*:\s*(\w+)/i);
    const biasMatch = text.match(/\*\*MARKET BIAS\*\*:\s*(\w+)/i);
    const moveMatch = text.match(/\*\*NEXT EXPECTED MOVE\*\*:\s*(\w+)/i);
    const probMatch = text.match(/\*\*PROBABILITY\*\*:\s*(\d+)/i);
    const reasoningMatch = text.match(/\*\*REASONING\*\*:\s*([\s\S]+?)(?=\*\*|$)/i);
    const levelsMatch = text.match(/\*\*KEY PRICE LEVELS\*\*:\s*([\s\S]+?)(?=\*\*|$)/i);

    let support = 0, resistance = 0;
    if (levelsMatch) {
      const supportMatch = levelsMatch[1].match(/support[:\s]*([\d.]+)/i);
      const resistanceMatch = levelsMatch[1].match(/resistance[:\s]*([\d.]+)/i);
      if (supportMatch) support = parseFloat(supportMatch[1]);
      if (resistanceMatch) resistance = parseFloat(resistanceMatch[1]);
    }

    return {
      currentPhase: phaseMatch ? phaseMatch[1] : 'Unknown',
      marketBias: biasMatch ? biasMatch[1] as 'Bullish' | 'Bearish' | 'Neutral' : 'Neutral',
      nextExpectedMove: moveMatch ? moveMatch[1] as 'Up' | 'Down' | 'Sideways' : 'Sideways',
      keyPriceLevels: { support, resistance },
      probability: probMatch ? parseInt(probMatch[1]) : 50,
      reasoning: reasoningMatch ? reasoningMatch[1].trim() : '',
    };
  } catch (error) {
    console.error('Error parsing Wyckoff response:', error);
    return null;
  }
}

// Combine SMC and Wyckoff analysis into a final signal
function combineAnalyses(smc: SMCAnalysis | null, wyckoff: WyckoffAnalysis | null): CombinedSignal | null {
  if (!smc && !wyckoff) return null;

  // If both analyses agree, higher confidence
  let direction: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let confidence = 50;
  let reasoning = '';

  if (smc && wyckoff) {
    const smcIsBuy = smc.signalType === 'BUY';
    const wyckoffIsBuy = wyckoff.marketBias === 'Bullish' || wyckoff.nextExpectedMove === 'Up';
    
    if (smcIsBuy && wyckoffIsBuy) {
      direction = 'BUY';
      confidence = Math.min(95, (smc.confidence + wyckoff.probability) / 2 + 15);
      reasoning = `SMC and Wyckoff AGREE on bullish setup. ${smc.summary}`;
    } else if (!smcIsBuy && !wyckoffIsBuy && smc.signalType === 'SELL') {
      direction = 'SELL';
      confidence = Math.min(95, (smc.confidence + wyckoff.probability) / 2 + 15);
      reasoning = `SMC and Wyckoff AGREE on bearish setup. ${smc.summary}`;
    } else if (smc.confidence > 70) {
      direction = smc.signalType === 'NEUTRAL' ? 'HOLD' : smc.signalType;
      confidence = smc.confidence;
      reasoning = `SMC dominant signal (analyses diverge). ${smc.summary}`;
    } else {
      direction = 'HOLD';
      confidence = 40;
      reasoning = 'Analyses diverge - waiting for clearer setup';
    }
  } else if (smc) {
    direction = smc.signalType === 'NEUTRAL' ? 'HOLD' : smc.signalType;
    confidence = smc.confidence;
    reasoning = smc.summary;
  } else if (wyckoff) {
    if (wyckoff.marketBias === 'Bullish' && wyckoff.probability > 60) {
      direction = 'BUY';
    } else if (wyckoff.marketBias === 'Bearish' && wyckoff.probability > 60) {
      direction = 'SELL';
    }
    confidence = wyckoff.probability;
    reasoning = wyckoff.reasoning;
  }

  return {
    direction,
    entryPrice: smc?.entryPrice || 0,
    stopLoss: smc?.stopLoss || 0,
    takeProfit: smc?.takeProfit1 || 0,
    confidence,
    strategy: smc && wyckoff ? 'SMC + Wyckoff' : (smc ? 'SMC' : 'Wyckoff'),
    reasoning,
  };
}

// Format price data as JSON for Gemini
function formatPriceDataForGemini(priceData: PriceData[]): string {
  return priceData.map(data => {
    const recentCandles = data.candles.slice(-50); // Last 50 candles
    return `
=== ${data.symbol} - ${data.timeframe} ===
Last Updated: ${recentCandles[recentCandles.length - 1]?.date || 'N/A'}
Current Price: ${recentCandles[recentCandles.length - 1]?.close || 'N/A'}

Recent Price Action (newest first):
${recentCandles.reverse().slice(0, 20).map(c => 
  `${c.date}: O:${c.open} H:${c.high} L:${c.low} C:${c.close}${c.volume ? ` V:${c.volume}` : ''}`
).join('\n')}
`;
  }).join('\n\n');
}

// Main analysis function - analyzes with optional chart image
export async function analyzeWithGemini(
  symbol: string,
  priceData: PriceData[],
  chartImagePath?: string
): Promise<GeminiAnalysisResult> {
  try {
    const formattedData = formatPriceDataForGemini(priceData);
    
    // Build content array
    const contents: any[] = [];
    
    // Add chart image if provided
    if (chartImagePath && fs.existsSync(chartImagePath)) {
      const imageBytes = fs.readFileSync(chartImagePath);
      const mimeType = chartImagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      contents.push({
        inlineData: {
          data: imageBytes.toString('base64'),
          mimeType,
        },
      });
    }
    
    // Add price data and analysis prompt
    contents.push(`
Analyze ${symbol} using the following price data. Reference the JSON data for accurate prices and dates.
Starting from the latest datapoints, synthesize the market structure including chart patterns, historical areas of value, liquidity, and implement the strategy.

${formattedData}

Now provide your analysis following the output format exactly.
`);

    // Run SMC Analysis
    const smcResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: SMC_SYSTEM_INSTRUCTION,
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
      contents,
    });

    const smcText = smcResponse.text || '';
    const smcAnalysis = parseSMCResponse(smcText);

    // Run Wyckoff Analysis
    const wyckoffResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: WYCKOFF_SYSTEM_INSTRUCTION,
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
      contents,
    });

    const wyckoffText = wyckoffResponse.text || '';
    const wyckoffAnalysis = parseWyckoffResponse(wyckoffText);

    // Combine analyses
    const combinedSignal = combineAnalyses(smcAnalysis, wyckoffAnalysis);

    return {
      smcAnalysis,
      wyckoffAnalysis,
      combinedSignal,
      rawResponse: `=== SMC Analysis ===\n${smcText}\n\n=== Wyckoff Analysis ===\n${wyckoffText}`,
    };
  } catch (error) {
    console.error('Gemini analysis error:', error);
    return {
      smcAnalysis: null,
      wyckoffAnalysis: null,
      combinedSignal: null,
      rawResponse: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Quick analysis for scanning (faster, single pass)
export async function quickAnalyzeWithGemini(
  symbol: string,
  priceData: PriceData[]
): Promise<{ direction: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reasoning: string } | null> {
  try {
    const formattedData = formatPriceDataForGemini(priceData);
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: `You are a quick market scanner. Analyze the data and respond ONLY with JSON:
{"direction": "BUY" or "SELL" or "HOLD", "confidence": 1-100, "reasoning": "brief one sentence"}`,
        responseMimeType: "application/json",
        temperature: 0.5,
        maxOutputTokens: 256,
      },
      contents: `Quick scan for ${symbol}:\n${formattedData}`,
    });

    const text = response.text;
    if (text) {
      return JSON.parse(text);
    }
    return null;
  } catch (error) {
    console.error('Quick analysis error:', error);
    return null;
  }
}

// Check if Gemini API is configured
export function isGeminiConfigured(): boolean {
  return !!process.env.GOOGLE_API_KEY;
}

// Test Gemini connection
export async function testGeminiConnection(): Promise<{ success: boolean; message: string }> {
  if (!isGeminiConfigured()) {
    return { success: false, message: 'GOOGLE_API_KEY not configured' };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Say 'Gemini trading analysis ready' in exactly those words.",
    });
    
    const text = response.text || '';
    if (text.toLowerCase().includes('ready')) {
      return { success: true, message: 'Gemini API connected successfully' };
    }
    return { success: true, message: `Gemini responded: ${text.slice(0, 50)}...` };
  } catch (error) {
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Connection failed' 
    };
  }
}
