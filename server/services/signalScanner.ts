import { storage } from "../storage";
import { signalDetectionService } from "./signalDetection";
import { getInterestRateData, getInflationData, parseCurrencyPair, generateMockTimeframeData } from "./marketData";
import { notificationService } from "./notificationService";

const TRADEABLE_INSTRUMENTS = [
  { symbol: 'EUR/USD', assetClass: 'forex', currentPrice: 1.0850 },
  { symbol: 'GBP/USD', assetClass: 'forex', currentPrice: 1.2650 },
  { symbol: 'USD/JPY', assetClass: 'forex', currentPrice: 149.50 },
  { symbol: 'AUD/USD', assetClass: 'forex', currentPrice: 0.6580 },
  { symbol: 'USD/CAD', assetClass: 'forex', currentPrice: 1.3550 },
  { symbol: 'GBP/JPY', assetClass: 'forex', currentPrice: 185.50 },
  { symbol: 'EUR/GBP', assetClass: 'forex', currentPrice: 0.8580 },
  { symbol: 'XAU/USD', assetClass: 'commodity', currentPrice: 2035.00 },
  { symbol: 'WTI OIL', assetClass: 'commodity', currentPrice: 82.50 },
  { symbol: 'BTC/USD', assetClass: 'crypto', currentPrice: 43200 },
  { symbol: 'ETH/USD', assetClass: 'crypto', currentPrice: 2280 },
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
    const m15Data = generateMockTimeframeData(currentPrice, trendBias, 15);

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
      const existingSignals = await storage.getTradingSignals({ 
        symbol, 
        status: 'active' 
      });

      if (existingSignals.length === 0) {
        return await storage.createTradingSignal(signal);
      } else {
        console.log(`Active signal already exists for ${symbol}, skipping...`);
      }
    }

    return null;
  }

  private determineTrendBias(symbol: string): 'bullish' | 'bearish' | 'neutral' {
    const bullishPairs = ['EUR/USD', 'GBP/USD', 'AUD/USD', 'XAU/USD', 'BTC/USD'];
    const bearishPairs = ['USD/JPY', 'USD/CAD', 'WTI OIL'];
    
    if (bullishPairs.includes(symbol)) return 'bullish';
    if (bearishPairs.includes(symbol)) return 'bearish';
    return 'neutral';
  }

  async cleanupExpiredSignals(): Promise<void> {
    try {
      const allSignals = await storage.getTradingSignals({ status: 'active' });
      const now = new Date();
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

      for (const signal of allSignals) {
        if (signal.createdAt && new Date(signal.createdAt) < fourHoursAgo) {
          await storage.updateTradingSignal(signal.id, { 
            status: 'expired',
            expiresAt: now 
          });
          console.log(`Expired signal: ${signal.symbol} - ${signal.type}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up expired signals:', error);
    }
  }
}

export const signalScannerService = new SignalScannerService();
