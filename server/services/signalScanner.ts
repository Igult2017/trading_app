import { storage } from "../storage";
import { signalDetectionService } from "./signalDetection";
import { getInterestRateData, getInflationData, parseCurrencyPair, generateMockTimeframeData } from "./marketData";
import { notificationService } from "./notificationService";
import { telegramNotificationService } from "./telegramNotification";

const TRADEABLE_INSTRUMENTS = [
  // Major Forex Pairs (7)
  { symbol: 'EUR/USD', assetClass: 'forex', currentPrice: 1.0850 },
  { symbol: 'GBP/USD', assetClass: 'forex', currentPrice: 1.2650 },
  { symbol: 'USD/JPY', assetClass: 'forex', currentPrice: 149.50 },
  { symbol: 'USD/CHF', assetClass: 'forex', currentPrice: 0.8750 },
  { symbol: 'AUD/USD', assetClass: 'forex', currentPrice: 0.6580 },
  { symbol: 'USD/CAD', assetClass: 'forex', currentPrice: 1.3550 },
  { symbol: 'NZD/USD', assetClass: 'forex', currentPrice: 0.6150 },
  
  // EUR Crosses (6)
  { symbol: 'EUR/GBP', assetClass: 'forex', currentPrice: 0.8580 },
  { symbol: 'EUR/JPY', assetClass: 'forex', currentPrice: 162.00 },
  { symbol: 'EUR/CHF', assetClass: 'forex', currentPrice: 0.9500 },
  { symbol: 'EUR/AUD', assetClass: 'forex', currentPrice: 1.6500 },
  { symbol: 'EUR/CAD', assetClass: 'forex', currentPrice: 1.4700 },
  { symbol: 'EUR/NZD', assetClass: 'forex', currentPrice: 1.7650 },
  
  // GBP Crosses (5)
  { symbol: 'GBP/JPY', assetClass: 'forex', currentPrice: 185.50 },
  { symbol: 'GBP/CHF', assetClass: 'forex', currentPrice: 1.1050 },
  { symbol: 'GBP/AUD', assetClass: 'forex', currentPrice: 1.9250 },
  { symbol: 'GBP/CAD', assetClass: 'forex', currentPrice: 1.7150 },
  { symbol: 'GBP/NZD', assetClass: 'forex', currentPrice: 2.0550 },
  
  // JPY Crosses (4)
  { symbol: 'AUD/JPY', assetClass: 'forex', currentPrice: 98.50 },
  { symbol: 'CAD/JPY', assetClass: 'forex', currentPrice: 110.50 },
  { symbol: 'CHF/JPY', assetClass: 'forex', currentPrice: 170.75 },
  { symbol: 'NZD/JPY', assetClass: 'forex', currentPrice: 92.00 },
  
  // Other Crosses (6)
  { symbol: 'AUD/CAD', assetClass: 'forex', currentPrice: 0.8920 },
  { symbol: 'AUD/CHF', assetClass: 'forex', currentPrice: 0.5750 },
  { symbol: 'AUD/NZD', assetClass: 'forex', currentPrice: 1.0700 },
  { symbol: 'CAD/CHF', assetClass: 'forex', currentPrice: 0.6450 },
  { symbol: 'NZD/CAD', assetClass: 'forex', currentPrice: 0.8340 },
  { symbol: 'NZD/CHF', assetClass: 'forex', currentPrice: 0.5380 },
  
  // Major US Indices (5)
  { symbol: 'US100', assetClass: 'stock', currentPrice: 21200.00 },
  { symbol: 'US500', assetClass: 'stock', currentPrice: 5950.00 },
  { symbol: 'US30', assetClass: 'stock', currentPrice: 43800.00 },
  { symbol: 'RUSSELL2000', assetClass: 'stock', currentPrice: 2350.00 },
  { symbol: 'VIX', assetClass: 'stock', currentPrice: 14.50 },
  
  // Major US Stocks - Tech (10)
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
  
  // Major US Stocks - Finance & Others (10)
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
  
  // Commodities (4)
  { symbol: 'XAU/USD', assetClass: 'commodity', currentPrice: 2035.00 },
  { symbol: 'XAG/USD', assetClass: 'commodity', currentPrice: 24.50 },
  { symbol: 'WTI', assetClass: 'commodity', currentPrice: 82.50 },
  { symbol: 'BRENT', assetClass: 'commodity', currentPrice: 86.75 },
  
  // Crypto (4)
  { symbol: 'BTC/USD', assetClass: 'crypto', currentPrice: 43200 },
  { symbol: 'ETH/USD', assetClass: 'crypto', currentPrice: 2280 },
  { symbol: 'BNB/USD', assetClass: 'crypto', currentPrice: 315.50 },
  { symbol: 'SOL/USD', assetClass: 'crypto', currentPrice: 98.75 },
];

export class SignalScannerService {
  private isScanning: boolean = false;

  async scanMarkets(): Promise<void> {
    if (this.isScanning) {
      console.log('Signal scan already in progress, skipping...');
      return;
    }

    try {
      this.isScanning = true;
      console.log('Starting market scan for trading signals...');

      const newSignals: any[] = [];

      for (const instrument of TRADEABLE_INSTRUMENTS) {
        try {
          const signal = await this.analyzeInstrument(instrument);
          if (signal) {
            newSignals.push(signal);
          }
        } catch (error) {
          console.error(`Error analyzing ${instrument.symbol}:`, error);
        }
      }

      if (newSignals.length > 0) {
        console.log(`Generated ${newSignals.length} new trading signals`);
        
        for (const signal of newSignals) {
          await notificationService.createNotification({
            type: 'trading_signal',
            title: `${signal.type === 'buy' ? '🟢' : '🔴'} ${signal.symbol} - ${signal.type.toUpperCase()}`,
            message: `Confidence: ${signal.overallConfidence}% | Entry: ${signal.entryPrice} | R:R: 1:${signal.riskRewardRatio}`,
            metadata: JSON.stringify(signal),
          });
          
          await telegramNotificationService.sendTradingSignalNotification(signal);
        }
      } else {
        console.log('No high-confidence signals found in this scan');
      }

    } catch (error) {
      console.error('Error during market scan:', error);
    } finally {
      this.isScanning = false;
    }
  }

  private async analyzeInstrument(instrument: { symbol: string; assetClass: string; currentPrice: number }): Promise<any | null> {
    const { symbol, assetClass, currentPrice } = instrument;

    let interestRateData = undefined;
    let inflationData = undefined;

    if (assetClass === 'forex') {
      const pair = parseCurrencyPair(symbol);
      if (pair) {
        const baseIR = getInterestRateData(pair.base);
        const quoteIR = getInterestRateData(pair.quote);
        const baseInf = getInflationData(pair.base);
        const quoteInf = getInflationData(pair.quote);

        if (baseIR && quoteIR) {
          interestRateData = { base: baseIR, quote: quoteIR };
        }
        if (baseInf && quoteInf) {
          inflationData = { base: baseInf, quote: quoteInf };
        }
      }
    }

    const trendBias = this.determineTrendBias(symbol);
    
    const dailyData = generateMockTimeframeData(currentPrice, trendBias, 30);
    const h4Data = generateMockTimeframeData(currentPrice, trendBias, 25);
    const h1Data = generateMockTimeframeData(currentPrice, trendBias, 20);
    const m15Data = generateMockTimeframeData(currentPrice, trendBias, 18);
    const m5Data = generateMockTimeframeData(currentPrice, trendBias, 15);
    const m1Data = generateMockTimeframeData(currentPrice, trendBias, 12);

    const existingPendingSetups = await storage.getPendingSetups({
      symbol,
      invalidated: false
    });

    if (existingPendingSetups.length > 0) {
      const pendingSetup = existingPendingSetups[0];
      
      const signal = signalDetectionService.generateTradingSignal({
        symbol,
        assetClass,
        interestRateData,
        inflationData,
        dailyData,
        h4Data,
        h1Data,
        m15Data,
      });

      if (!signal) {
        await storage.updatePendingSetup(pendingSetup.id, {
          invalidated: true,
          invalidationReason: 'Setup conditions no longer met',
          lastCheckedPrice: currentPrice.toString()
        });
        return null;
      }

      const isReady = signal.overallConfidence >= 70;

      if (isReady && !pendingSetup.readyForSignal) {
        await storage.updatePendingSetup(pendingSetup.id, {
          readyForSignal: true,
          lastCheckedPrice: currentPrice.toString()
        });

        const existingActiveSignals = await storage.getTradingSignals({ 
          symbol, 
          status: 'active' 
        });

        if (existingActiveSignals.length === 0) {
          const now = new Date();
          const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);
          const activeSignal = await storage.createTradingSignal({
            ...signal,
            expiresAt
          });
          await storage.deletePendingSetup(pendingSetup.id);
          return activeSignal;
        }
      } else {
        await storage.updatePendingSetup(pendingSetup.id, {
          lastCheckedPrice: currentPrice.toString()
        });
      }

      return null;
    }

    const signal = signalDetectionService.generateTradingSignal({
      symbol,
      assetClass,
      interestRateData,
      inflationData,
      dailyData,
      h4Data,
      h1Data,
      m15Data,
    });

    if (signal) {
      const isImmediatelyReady = signal.overallConfidence >= 75;

      if (isImmediatelyReady) {
        const existingActiveSignals = await storage.getTradingSignals({ 
          symbol, 
          status: 'active' 
        });

        if (existingActiveSignals.length === 0) {
          const now = new Date();
          const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);
          return await storage.createTradingSignal({
            ...signal,
            expiresAt
          });
        }
      } else {
        const biasDirection = signal.type === 'buy' ? 'bullish' : 'bearish';
        
        await storage.createPendingSetup({
          symbol,
          assetClass,
          type: signal.type,
          setupStage: 'forming',
          potentialStrategy: signal.strategy,
          currentPrice: currentPrice.toString(),
          primaryTimeframe: '4H',
          confirmationTimeframe: '15M',
          interestRateBias: interestRateData ? biasDirection : null,
          inflationBias: inflationData ? biasDirection : null,
          trendBias: signal.trendDirection || null,
          chochDetected: signal.bocChochDetected === 'bullish' || signal.bocChochDetected === 'bearish',
          chochDirection: signal.bocChochDetected || null,
          liquiditySweepDetected: signal.liquiditySweep || false,
          supplyDemandZoneTargeted: signal.orderBlockType ? true : false,
          zoneLevel: signal.orderBlockLevel ? signal.orderBlockLevel.toString() : null,
          levelsBroken: 0,
          confirmationsPending: ['higher_confidence', 'entry_confirmation'],
          setupNotes: signal.technicalReasons || [],
          marketContext: signal.marketContext || null,
          lastCheckedPrice: currentPrice.toString(),
        });
      }
    }

    return null;
  }

  private determineTrendBias(symbol: string): 'bullish' | 'bearish' | 'neutral' {
    const bullishAssets = [
      'EUR/USD', 'GBP/USD', 'AUD/USD', 'XAU/USD', 'BTC/USD', 'ETH/USD',
      'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'V', 'MA', 'UNH'
    ];
    const bearishAssets = [
      'USD/JPY', 'USD/CAD', 'WTI',
      'TSLA', 'NFLX', 'DIS', 'BAC', 'AMD'
    ];
    
    if (bullishAssets.includes(symbol)) return 'bullish';
    if (bearishAssets.includes(symbol)) return 'bearish';
    return 'neutral';
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

          console.log(`Expired signal archived to history: ${signal.symbol} - ${signal.type} (Duration: ${durationText})`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up expired signals:', error);
    }
  }
}

export const signalScannerService = new SignalScannerService();
