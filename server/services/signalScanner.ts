import { storage } from "../storage";
import { notificationService } from "./notificationService";
import { telegramNotificationService } from "./telegramNotification";
import { strategyRegistry, initializeStrategies, StrategySignal, InstrumentData } from "../strategies";
import { fetchMultiTimeframeData } from "../strategies/shared/multiTimeframe";
import { getPrice } from "../lib/priceService";

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
  { symbol: 'SOL/USD', assetClass: 'crypto', currentPrice: 98.75 },
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

      const newSignals: StrategySignal[] = [];
      const allPendingSetups: any[] = [];

      for (const instrument of TRADEABLE_INSTRUMENTS) {
        try {
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

    if (existingActiveSignals.length > 0) {
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

      const legacySignal = {
        symbol: signal.symbol,
        type: signal.direction,
        strategy: signal.strategyName,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        riskRewardRatio: signal.riskRewardRatio,
        overallConfidence: signal.confidence,
        technicalReasons: signal.reasoning,
      };

      await telegramNotificationService.sendTradingSignalNotification(legacySignal);

      console.log(`[SignalScanner] Signal saved and notifications sent: ${signal.symbol} ${signal.direction}`);

    } catch (error) {
      console.error(`[SignalScanner] Error saving signal for ${signal.symbol}:`, error);
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
