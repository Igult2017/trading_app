import { storage } from "../storage";
import { notificationService } from "./notificationService";
import { telegramNotificationService } from "./telegramNotification";
import { strategyRegistry, initializeStrategies, StrategySignal, InstrumentData } from "../strategies";
import { fetchMultiTimeframeData } from "../strategies/shared/multiTimeframe";
import { Candle } from "../strategies/core/types";
import { getPrice } from "../lib/priceService";
import { filterTradeableInstruments, getActiveSession } from "../lib/marketHours";
import { validateSignalWithGemini, SignalToValidate, PriceData } from "./geminiAnalysis";
import { generateSignalChart, ChartCandle, ZoneInfo } from "./chartGenerator";
import * as path from "path";
import * as fs from "fs";

interface MultiTimeframeData {
  d1: Candle[];
  h4: Candle[];
  h2: Candle[];
  h1: Candle[];
  m30: Candle[];
  m15: Candle[];
  m5: Candle[];
  m3: Candle[];
  m1: Candle[];
}

const TRADEABLE_INSTRUMENTS = [
  { symbol: 'EUR/USD', assetClass: 'forex', currentPrice: 1.0850 },
  { symbol: 'GBP/USD', assetClass: 'forex', currentPrice: 1.2650 },
  { symbol: 'USD/JPY', assetClass: 'forex', currentPrice: 149.50 },
  { symbol: 'USD/CHF', assetClass: 'forex', currentPrice: 0.8750 },
  { symbol: 'AUD/USD', assetClass: 'forex', currentPrice: 0.6580 },
  { symbol: 'USD/CAD', assetClass: 'forex', currentPrice: 1.3550 },
  { symbol: 'NZD/USD', assetClass: 'forex', currentPrice: 0.6150 },
  
  { symbol: 'EUR/GBP', assetClass: 'forex', currentPrice: 0.8580 },
  { symbol: 'EUR/JPY', assetClass: 'forex', currentPrice: 162.00 },
  { symbol: 'EUR/CHF', assetClass: 'forex', currentPrice: 0.9500 },
  { symbol: 'EUR/AUD', assetClass: 'forex', currentPrice: 1.6500 },
  { symbol: 'EUR/CAD', assetClass: 'forex', currentPrice: 1.4700 },
  { symbol: 'EUR/NZD', assetClass: 'forex', currentPrice: 1.7650 },
  
  { symbol: 'GBP/JPY', assetClass: 'forex', currentPrice: 185.50 },
  { symbol: 'GBP/CHF', assetClass: 'forex', currentPrice: 1.1050 },
  { symbol: 'GBP/AUD', assetClass: 'forex', currentPrice: 1.9250 },
  { symbol: 'GBP/CAD', assetClass: 'forex', currentPrice: 1.7150 },
  { symbol: 'GBP/NZD', assetClass: 'forex', currentPrice: 2.0550 },
  
  { symbol: 'AUD/JPY', assetClass: 'forex', currentPrice: 98.50 },
  { symbol: 'CAD/JPY', assetClass: 'forex', currentPrice: 110.50 },
  { symbol: 'CHF/JPY', assetClass: 'forex', currentPrice: 170.75 },
  { symbol: 'NZD/JPY', assetClass: 'forex', currentPrice: 92.00 },
  
  { symbol: 'AUD/CAD', assetClass: 'forex', currentPrice: 0.8920 },
  { symbol: 'AUD/CHF', assetClass: 'forex', currentPrice: 0.5750 },
  { symbol: 'AUD/NZD', assetClass: 'forex', currentPrice: 1.0700 },
  { symbol: 'CAD/CHF', assetClass: 'forex', currentPrice: 0.6450 },
  { symbol: 'NZD/CAD', assetClass: 'forex', currentPrice: 0.8340 },
  { symbol: 'NZD/CHF', assetClass: 'forex', currentPrice: 0.5380 },
  
  { symbol: 'US100', assetClass: 'index', currentPrice: 21200.00 },
  { symbol: 'US500', assetClass: 'index', currentPrice: 5950.00 },
  { symbol: 'US30', assetClass: 'index', currentPrice: 43800.00 },
  { symbol: 'RUSSELL2000', assetClass: 'index', currentPrice: 2350.00 },
  { symbol: 'VIX', assetClass: 'index', currentPrice: 14.50 },
  
  { symbol: 'AAPL', assetClass: 'stock', currentPrice: 175.50 },
  { symbol: 'MSFT', assetClass: 'stock', currentPrice: 378.25 },
  { symbol: 'GOOGL', assetClass: 'stock', currentPrice: 140.85 },
  { symbol: 'AMZN', assetClass: 'stock', currentPrice: 152.30 },
  { symbol: 'NVDA', assetClass: 'stock', currentPrice: 495.75 },
  { symbol: 'TSLA', assetClass: 'stock', currentPrice: 245.60 },
  { symbol: 'META', assetClass: 'stock', currentPrice: 485.20 },
  { symbol: 'NFLX', assetClass: 'stock', currentPrice: 475.80 },
  { symbol: 'AMD', assetClass: 'stock', currentPrice: 155.40 },
  { symbol: 'ORCL', assetClass: 'stock', currentPrice: 115.25 },
  
  { symbol: 'JPM', assetClass: 'stock', currentPrice: 165.70 },
  { symbol: 'BAC', assetClass: 'stock', currentPrice: 32.85 },
  { symbol: 'GS', assetClass: 'stock', currentPrice: 385.40 },
  { symbol: 'V', assetClass: 'stock', currentPrice: 265.30 },
  { symbol: 'MA', assetClass: 'stock', currentPrice: 425.60 },
  { symbol: 'JNJ', assetClass: 'stock', currentPrice: 158.90 },
  { symbol: 'UNH', assetClass: 'stock', currentPrice: 512.75 },
  { symbol: 'WMT', assetClass: 'stock', currentPrice: 165.40 },
  { symbol: 'PG', assetClass: 'stock', currentPrice: 152.30 },
  { symbol: 'DIS', assetClass: 'stock', currentPrice: 95.85 },
  
  { symbol: 'XAU/USD', assetClass: 'commodity', currentPrice: 2035.00 },
  { symbol: 'XAG/USD', assetClass: 'commodity', currentPrice: 24.50 },
  { symbol: 'WTI', assetClass: 'commodity', currentPrice: 82.50 },
  { symbol: 'BRENT', assetClass: 'commodity', currentPrice: 86.75 },
  
  { symbol: 'BTC/USD', assetClass: 'crypto', currentPrice: 43200 },
  { symbol: 'ETH/USD', assetClass: 'crypto', currentPrice: 2280 },
  { symbol: 'BNB/USD', assetClass: 'crypto', currentPrice: 315.50 },
];

let strategiesInitialized = false;

export class SignalScannerService {
  private isScanning: boolean = false;

  constructor() {
    if (!strategiesInitialized) {
      initializeStrategies();
      strategiesInitialized = true;
    }
  }

  async scanMarkets(): Promise<void> {
    if (this.isScanning) {
      console.log('Signal scan already in progress, skipping...');
      return;
    }

    try {
      this.isScanning = true;
      console.log('[SignalScanner] Starting modular market scan...');

      const stats = strategyRegistry.getStats();
      console.log(`[SignalScanner] Running ${stats.enabledStrategies} enabled strategies`);

      const { tradeable, skipped } = filterTradeableInstruments(TRADEABLE_INSTRUMENTS);
      
      if (skipped.length > 0) {
        const skippedByClass: Record<string, number> = {};
        for (const { instrument } of skipped) {
          skippedByClass[instrument.assetClass] = (skippedByClass[instrument.assetClass] || 0) + 1;
        }
        const skippedSummary = Object.entries(skippedByClass)
          .map(([cls, count]) => `${count} ${cls}`)
          .join(', ');
        console.log(`[SignalScanner] Skipping closed markets: ${skippedSummary}`);
      }
      
      console.log(`[SignalScanner] Analyzing ${tradeable.length} instruments in open markets`);

      const newSignals: StrategySignal[] = [];
      const allPendingSetups: any[] = [];

      for (const instrument of tradeable) {
        try {
          const session = getActiveSession(instrument.assetClass);
          const result = await this.analyzeWithStrategies(instrument);
          newSignals.push(...result.signals);
          allPendingSetups.push(...result.pendingSetups);
        } catch (error) {
          console.error(`Error analyzing ${instrument.symbol}:`, error);
        }
      }

      if (newSignals.length > 0) {
        console.log(`[SignalScanner] Generated ${newSignals.length} new trading signals`);
        
        for (const signal of newSignals) {
          await this.saveAndNotifySignal(signal);
        }
      } else {
        console.log('[SignalScanner] No high-confidence signals found in this scan');
      }

      if (allPendingSetups.length > 0) {
        console.log(`[SignalScanner] Found ${allPendingSetups.length} pending setups for watchlist`);
        for (const setup of allPendingSetups) {
          await this.saveWatchlistSignal(setup);
        }
      }

    } catch (error) {
      console.error('[SignalScanner] Error during market scan:', error);
    } finally {
      this.isScanning = false;
    }
  }

  private async analyzeWithStrategies(instrument: { symbol: string; assetClass: string; currentPrice: number }): Promise<{ signals: StrategySignal[]; pendingSetups: any[] }> {
    const { symbol, assetClass, currentPrice } = instrument;

    let livePrice = currentPrice;
    try {
      const validAssetClass = assetClass as 'forex' | 'stock' | 'commodity' | 'crypto';
      const priceResult = await getPrice(symbol, validAssetClass);
      if (priceResult && priceResult.price) {
        livePrice = priceResult.price;
      }
    } catch (error) {
    }

    const data = await fetchMultiTimeframeData(symbol, assetClass, livePrice);

    const instrumentData: InstrumentData = {
      symbol,
      assetClass,
      currentPrice: livePrice,
      data,
    };

    const existingActiveSignals = await storage.getTradingSignals({ 
      symbol, 
      status: 'active' 
    });

    const SIGNAL_COOLDOWN_MS = 2 * 60 * 60 * 1000;
    const now = Date.now();
    
    const recentActiveSignals = existingActiveSignals.filter(signal => {
      const createdAt = signal.createdAt ? new Date(signal.createdAt).getTime() : 0;
      return (now - createdAt) < SIGNAL_COOLDOWN_MS;
    });

    if (recentActiveSignals.length > 0) {
      return { signals: [], pendingSetups: [] };
    }

    const result = await strategyRegistry.runAllStrategiesWithPending(instrumentData);

    return result;
  }

  private async saveWatchlistSignal(setup: any): Promise<void> {
    try {
      const existingWatchlist = await storage.getTradingSignals({
        symbol: setup.symbol,
        status: 'watchlist'
      });

      if (existingWatchlist.length > 0) {
        return;
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);

      await storage.createTradingSignal({
        symbol: setup.symbol,
        assetClass: setup.assetClass || 'forex',
        type: setup.direction || 'buy',
        strategy: 'Smart Money Concepts',
        primaryTimeframe: setup.timeframe || '15M',
        confirmationTimeframe: '1M',
        entryPrice: setup.entryZone?.midPrice?.toString() || '0',
        stopLoss: setup.stopLoss?.toString() || '0',
        takeProfit: setup.takeProfit?.toString() || '0',
        riskRewardRatio: setup.riskRewardRatio?.toString() || '2',
        overallConfidence: setup.confidence || 50,
        trendDirection: setup.trendDirection || 'sideways',
        trendScore: (setup.confidence || 50).toString(),
        smcScore: (setup.confidence || 50).toString(),
        smcFactors: setup.confirmations || [],
        orderBlockType: setup.entryZone?.type || 'demand',
        orderBlockLevel: setup.entryZone?.topPrice?.toString() || '0',
        fvgDetected: false,
        fvgLevel: null,
        liquiditySweep: false,
        bocChochDetected: null,
        technicalReasons: setup.confirmations || ['Pending LTF confirmation'],
        marketContext: `Watchlist: ${setup.symbol} - awaiting entry confirmation`,
        strength: setup.confidence >= 60 ? 'moderate' : 'weak',
        status: 'watchlist',
        expiresAt,
      });

      console.log(`[SignalScanner] Added to watchlist: ${setup.symbol} (${setup.confidence}% confidence)`);
    } catch (error) {
      console.error(`[SignalScanner] Error saving watchlist signal:`, error);
    }
  }

  private async saveAndNotifySignal(signal: StrategySignal): Promise<void> {
    try {
      // Fetch MTF data for Gemini chart verification
      let mtfData: MultiTimeframeData | undefined;
      try {
        const validAssetClass = (signal.assetClass || 'forex') as 'forex' | 'stock' | 'commodity' | 'crypto';
        const fetchedData = await fetchMultiTimeframeData(signal.symbol, validAssetClass, signal.entryPrice);
        mtfData = fetchedData as MultiTimeframeData;
      } catch (e) {
        console.log(`[Gemini] Could not fetch MTF data for ${signal.symbol}, proceeding without chart`);
      }
      
      // Validate signal with Gemini AI before saving (with chart image)
      const geminiValidation = await this.validateWithGemini(signal, mtfData);
      
      if (geminiValidation) {
        if (geminiValidation.recommendation === 'skip') {
          console.log(`[Gemini] REJECTED ${signal.symbol}: ${geminiValidation.reasoning}`);
          return; // Don't save signals that Gemini recommends skipping
        }
        
        // Adjust confidence based on Gemini's assessment
        const adjustedConfidence = Math.max(0, Math.min(100, 
          signal.confidence + geminiValidation.confidenceAdjustment
        ));
        signal.confidence = adjustedConfidence;
        
        // Log Gemini's validation
        console.log(`[Gemini] ${geminiValidation.recommendation.toUpperCase()} ${signal.symbol}: ` +
          `${geminiValidation.validated ? 'Validated' : 'Concerns'} ` +
          `(Confidence: ${signal.confidence}%, Adj: ${geminiValidation.confidenceAdjustment > 0 ? '+' : ''}${geminiValidation.confidenceAdjustment})`);
        
        if (geminiValidation.concerns.length > 0) {
          console.log(`[Gemini] Concerns: ${geminiValidation.concerns.join(', ')}`);
        }
        if (geminiValidation.strengths.length > 0) {
          console.log(`[Gemini] Strengths: ${geminiValidation.strengths.join(', ')}`);
        }
      }
      
      const now = new Date();
      const expiresAt = new Date(signal.expiresAt);

      const dbSignal = await storage.createTradingSignal({
        symbol: signal.symbol,
        assetClass: signal.assetClass || 'forex',
        type: signal.direction,
        strategy: signal.strategyName,
        primaryTimeframe: signal.timeframe,
        confirmationTimeframe: '1M',
        entryPrice: signal.entryPrice.toString(),
        stopLoss: signal.stopLoss.toString(),
        takeProfit: signal.takeProfit.toString(),
        riskRewardRatio: signal.riskRewardRatio.toString(),
        overallConfidence: signal.confidence,
        trendDirection: signal.marketContext.h4TrendDirection,
        trendScore: signal.confidence.toString(),
        smcScore: signal.confidence.toString(),
        smcFactors: signal.entrySetup.confirmations,
        orderBlockType: signal.entrySetup.entryZone.type,
        orderBlockLevel: signal.entrySetup.entryZone.topPrice.toString(),
        fvgDetected: false,
        fvgLevel: null,
        liquiditySweep: signal.entryType === 'liquidity_sweep',
        bocChochDetected: signal.entryType === 'choch' ? signal.direction === 'buy' ? 'bullish' : 'bearish' : null,
        technicalReasons: signal.reasoning.slice(0, 10),
        marketContext: `${signal.strategyName} - ${signal.entryType} entry at ${signal.timeframe} zone`,
        strength: signal.confidence >= 80 ? 'strong' : signal.confidence >= 60 ? 'moderate' : 'weak',
        status: 'active',
        expiresAt,
      });

      await notificationService.createNotification({
        type: 'trading_signal',
        title: `${signal.direction === 'buy' ? '🟢' : '🔴'} ${signal.symbol} - ${signal.direction.toUpperCase()}`,
        message: `Strategy: ${signal.strategyName} | Entry: ${signal.entryType} | Confidence: ${signal.confidence}% | R:R: 1:${signal.riskRewardRatio}`,
        metadata: JSON.stringify({
          ...signal,
          dbSignalId: dbSignal.id,
        }),
      });

      // Prepare signal with confirmed findings for Telegram
      const extendedContext = signal.marketContext as any;
      const telegramSignal = {
        symbol: signal.symbol,
        type: signal.direction,
        strategy: signal.strategyName,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        riskRewardRatio: signal.riskRewardRatio,
        overallConfidence: signal.confidence,
        timeframe: signal.timeframe,
        // Confirmed findings from analysis
        trend: extendedContext?.h4TrendDirection || 'unknown',
        htfTimeframe: extendedContext?.contextTimeframe || '1D',
        zoneType: signal.entrySetup?.entryZone?.type || (signal.direction === 'buy' ? 'demand' : 'supply'),
        zoneTimeframe: extendedContext?.zoneTimeframe || 'M15',
        refinedTimeframe: extendedContext?.refinedTimeframe || signal.timeframe,
        entryType: signal.entryType,
        assetClass: signal.assetClass,
        zones: signal.entrySetup?.entryZone ? {
          m15: [signal.entrySetup.entryZone]
        } : undefined,
      };

      await telegramNotificationService.sendTradingSignalNotification(telegramSignal);

      console.log(`[SignalScanner] Signal saved and notifications sent: ${signal.symbol} ${signal.direction}`);

    } catch (error) {
      console.error(`[SignalScanner] Error saving signal for ${signal.symbol}:`, error);
    }
  }

  private async validateWithGemini(signal: StrategySignal, mtfData?: MultiTimeframeData): Promise<{
    validated: boolean;
    confidenceAdjustment: number;
    concerns: string[];
    strengths: string[];
    recommendation: 'proceed' | 'caution' | 'skip';
    reasoning: string;
  } | null> {
    try {
      // Check if Gemini is available
      if (!process.env.GOOGLE_API_KEY) {
        console.log('[Gemini] API key not configured, skipping validation');
        return null;
      }

      console.log(`[Gemini] Generating multi-timeframe charts for ${signal.symbol} validation...`);
      
      // Generate charts across ALL timeframes for Gemini to verify
      const chartPaths: string[] = [];
      const extendedCtx = signal.marketContext as any;
      
      if (mtfData) {
        try {
          // Prepare zones for all charts
          const supplyZones: ZoneInfo[] = [];
          const demandZones: ZoneInfo[] = [];
          
          if (signal.entrySetup?.entryZone) {
            const zone: ZoneInfo = {
              top: signal.entrySetup.entryZone.topPrice,
              bottom: signal.entrySetup.entryZone.bottomPrice,
              strength: 'strong',
              label: signal.entrySetup.entryZone.type === 'supply' ? 'Supply Zone' : 'Demand Zone'
            };
            if (signal.entrySetup.entryZone.type === 'supply') {
              supplyZones.push(zone);
            } else {
              demandZones.push(zone);
            }
          }

          // 1. HTF Context Chart (Daily/H4) - shows trend direction
          const htfData = mtfData.d1 || mtfData.h4;
          if (htfData && htfData.length > 0) {
            const htfCandles: ChartCandle[] = htfData.slice(-30).map((c: Candle) => ({
              date: new Date(c.timestamp).toISOString(),
              open: c.open, high: c.high, low: c.low, close: c.close,
            }));
            const htfPath = path.join('/tmp', `gemini_htf_${signal.symbol.replace('/', '_')}_${Date.now()}.png`);
            const htfResult = await generateSignalChart({
              symbol: signal.symbol,
              timeframe: mtfData.d1 ? '1D' : 'H4',
              candles: htfCandles,
              supply_zones: supplyZones,
              demand_zones: demandZones,
              confirmations: [`HTF Trend: ${extendedCtx?.h4TrendDirection || 'unknown'}`],
              trend: extendedCtx?.h4TrendDirection || 'sideways',
              output_path: htfPath,
            });
            if (htfResult.success && htfResult.path) {
              chartPaths.push(htfResult.path);
              console.log(`[Gemini] HTF chart generated: ${htfResult.path}`);
            }
          }

          // 2. Zone Identification Chart (M15/M30) - shows the zone
          const zoneData = mtfData.m15 || mtfData.m30;
          if (zoneData && zoneData.length > 0) {
            const zoneCandles: ChartCandle[] = zoneData.slice(-50).map((c: Candle) => ({
              date: new Date(c.timestamp).toISOString(),
              open: c.open, high: c.high, low: c.low, close: c.close,
            }));
            const zonePath = path.join('/tmp', `gemini_zone_${signal.symbol.replace('/', '_')}_${Date.now()}.png`);
            const zoneResult = await generateSignalChart({
              symbol: signal.symbol,
              timeframe: mtfData.m15 ? 'M15' : 'M30',
              candles: zoneCandles,
              supply_zones: supplyZones,
              demand_zones: demandZones,
              confirmations: [`Zone: ${signal.entrySetup?.entryZone?.type || 'unknown'}`],
              trend: extendedCtx?.h4TrendDirection || 'sideways',
              output_path: zonePath,
            });
            if (zoneResult.success && zoneResult.path) {
              chartPaths.push(zoneResult.path);
              console.log(`[Gemini] Zone chart generated: ${zoneResult.path}`);
            }
          }

          // 3. Entry/Refinement Chart (M5/M3/M1) - shows entry trigger
          const entryData = mtfData.m5 || mtfData.m3 || mtfData.m1;
          if (entryData && entryData.length > 0) {
            const entryCandles: ChartCandle[] = entryData.slice(-60).map((c: Candle) => ({
              date: new Date(c.timestamp).toISOString(),
              open: c.open, high: c.high, low: c.low, close: c.close,
            }));
            const entryPath = path.join('/tmp', `gemini_entry_${signal.symbol.replace('/', '_')}_${Date.now()}.png`);
            const entryResult = await generateSignalChart({
              symbol: signal.symbol,
              timeframe: signal.timeframe,
              candles: entryCandles,
              signal: {
                direction: signal.direction.toUpperCase() as 'BUY' | 'SELL',
                entry: signal.entryPrice,
                stopLoss: signal.stopLoss,
                takeProfit: signal.takeProfit,
                confidence: signal.confidence,
              },
              supply_zones: supplyZones,
              demand_zones: demandZones,
              confirmations: signal.reasoning.slice(0, 5),
              entry_type: signal.entryType,
              trend: extendedCtx?.h4TrendDirection || 'sideways',
              output_path: entryPath,
            });
            if (entryResult.success && entryResult.path) {
              chartPaths.push(entryResult.path);
              console.log(`[Gemini] Entry chart generated: ${entryResult.path}`);
            }
          }
        } catch (chartError) {
          console.log(`[Gemini] Chart generation failed, proceeding without images`);
        }
      }

      // Build detailed analysis for Gemini to verify
      const detailedAnalysis = `
=== OUR ANALYSIS - PLEASE VERIFY ON THE CHART ===

SYMBOL: ${signal.symbol}
TIMEFRAME: ${signal.timeframe}
SIGNAL: ${signal.direction.toUpperCase()}

1. TREND ANALYSIS:
   - Higher timeframe trend: ${signal.marketContext?.h4TrendDirection || 'unknown'}
   - We believe the trend is ${signal.marketContext?.h4TrendDirection || 'sideways'} based on price structure
   - Please verify: Can you see ${signal.marketContext?.h4TrendDirection === 'bullish' ? 'higher highs and higher lows' : signal.marketContext?.h4TrendDirection === 'bearish' ? 'lower highs and lower lows' : 'ranging price action'}?

2. ZONE IDENTIFICATION:
   - Zone type: ${signal.entrySetup?.entryZone?.type || 'unknown'}
   - Zone range: ${signal.entrySetup?.entryZone?.bottomPrice?.toFixed(5)} - ${signal.entrySetup?.entryZone?.topPrice?.toFixed(5)}
   - Please verify: Is this zone visible as a consolidation area before an impulsive move?
   - Is the zone still unmitigated (price hasn't fully tested it)?

3. ENTRY CONDITIONS:
   - Entry type: ${signal.entryType}
   - Entry price: ${signal.entryPrice.toFixed(5)}
   - Current price should be at or near the zone
   - Please verify: Is price actually at this zone level?

4. OUR CONFIRMATIONS (please verify each):
${signal.reasoning.map((r, i) => `   ${i + 1}. ${r}`).join('\n')}

5. RISK MANAGEMENT:
   - Stop Loss: ${signal.stopLoss.toFixed(5)}
   - Take Profit: ${signal.takeProfit.toFixed(5)}
   - Risk:Reward = 1:${signal.riskRewardRatio.toFixed(2)}

6. CURRENT CONFIDENCE: ${signal.confidence}%

QUESTION: Looking at the chart, can you confirm that:
- The trend direction we identified is correct?
- The zone we marked actually exists and is valid?
- Price is currently at or near this zone?
- Our stated confirmations are visible on the chart?
- This is a high-probability setup worth taking?
`;

      // Prepare signal data for validation
      const signalToValidate: SignalToValidate = {
        symbol: signal.symbol,
        direction: signal.direction.toUpperCase() as 'BUY' | 'SELL',
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        confidence: signal.confidence,
        strategy: signal.strategyName,
        entryType: signal.entryType,
        reasoning: detailedAnalysis,
        zones: signal.entrySetup?.entryZone ? [{
          type: signal.entrySetup.entryZone.type,
          top: signal.entrySetup.entryZone.topPrice,
          bottom: signal.entrySetup.entryZone.bottomPrice
        }] : undefined
      };

      // Prepare price data with actual candles
      const priceData: PriceData[] = [];
      if (mtfData) {
        if (mtfData.h4) {
          priceData.push({
            symbol: signal.symbol,
            timeframe: '4H',
            candles: mtfData.h4.slice(-20).map((c: Candle) => ({
              date: new Date(c.timestamp).toISOString(),
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }))
          });
        }
        if (mtfData.m15) {
          priceData.push({
            symbol: signal.symbol,
            timeframe: '15M',
            candles: mtfData.m15.slice(-30).map((c: Candle) => ({
              date: new Date(c.timestamp).toISOString(),
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }))
          });
        }
      }

      console.log(`[Gemini] Validating ${signal.symbol} ${signal.direction} with ${chartPaths.length} chart images...`);
      
      const result = await validateSignalWithGemini(signalToValidate, priceData, chartPaths);
      
      // Clean up temp chart files
      for (const chartPath of chartPaths) {
        if (fs.existsSync(chartPath)) {
          try {
            fs.unlinkSync(chartPath);
          } catch (e) {}
        }
      }
      
      return result;
    } catch (error: any) {
      console.error(`[Gemini] Validation error for ${signal.symbol}:`, error.message || error);
      return null; // Proceed without Gemini validation if it fails
    }
  }

  async cleanupExpiredSignals(): Promise<void> {
    try {
      const allSignals = await storage.getTradingSignals({ status: 'active' });
      const now = new Date();

      for (const signal of allSignals) {
        if (signal.expiresAt && new Date(signal.expiresAt) <= now) {
          const timeDuration = Math.floor((now.getTime() - new Date(signal.createdAt!).getTime()) / (1000 * 60));
          const durationText = `${Math.floor(timeDuration / 60)}h ${timeDuration % 60}m`;

          await storage.createTrade({
            userId: null,
            symbol: signal.symbol,
            type: signal.type,
            strategy: signal.strategy,
            entryPrice: signal.entryPrice,
            exitPrice: signal.entryPrice,
            quantity: '1',
            pnl: '0',
            pnlPercent: '0',
            outcome: 'expired',
            timeframe: signal.primaryTimeframe,
            entryReason: signal.marketContext || `${signal.strategy} setup - ${signal.overallConfidence}% confidence`,
            exitDate: now,
            duration: durationText
          });

          await storage.deleteTradingSignal(signal.id);

          console.log(`[SignalScanner] Expired signal archived: ${signal.symbol} - ${signal.type} (Duration: ${durationText})`);
        }
      }
    } catch (error) {
      console.error('[SignalScanner] Error cleaning up expired signals:', error);
    }
  }

  getStrategyStats() {
    return strategyRegistry.getStats();
  }

  enableStrategy(strategyId: string): boolean {
    return strategyRegistry.enableStrategy(strategyId);
  }

  disableStrategy(strategyId: string): boolean {
    return strategyRegistry.disableStrategy(strategyId);
  }
}

export const signalScannerService = new SignalScannerService();
