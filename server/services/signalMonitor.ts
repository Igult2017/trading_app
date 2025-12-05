import { storage } from "../storage";
import { getCachedPrice } from "../lib/priceService";
import type { TradingSignal, InsertTrade } from "@shared/schema";

export interface SignalOutcome {
  signalId: string;
  symbol: string;
  outcome: 'hit_sl' | 'hit_tp' | 'expired' | 'active';
  currentPrice: number;
  entryPrice: number;
  exitPrice?: number;
  pnlPercent?: number;
}

export class SignalMonitorService {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  async start(intervalMs: number = 30000) {
    if (this.isRunning) {
      console.log('[SignalMonitor] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[SignalMonitor] Starting signal monitoring...');
    
    await this.checkAllSignals();
    
    this.monitoringInterval = setInterval(async () => {
      await this.checkAllSignals();
    }, intervalMs);
  }

  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    console.log('[SignalMonitor] Stopped');
  }

  async checkAllSignals(): Promise<SignalOutcome[]> {
    try {
      const activeSignals = await storage.getTradingSignals();
      const outcomes: SignalOutcome[] = [];

      for (const signal of activeSignals) {
        if (signal.status !== 'active') continue;

        const outcome = await this.checkSignal(signal);
        outcomes.push(outcome);

        if (outcome.outcome === 'hit_sl' || outcome.outcome === 'hit_tp') {
          await this.archiveSignalToTrades(signal, outcome);
        } else if (outcome.outcome === 'expired') {
          await this.expireSignal(signal);
        }
      }

      return outcomes;
    } catch (error) {
      console.error('[SignalMonitor] Error checking signals:', error);
      return [];
    }
  }

  async checkSignal(signal: TradingSignal): Promise<SignalOutcome> {
    const entryPrice = parseFloat(signal.entryPrice?.toString() || '0');
    const stopLoss = parseFloat(signal.stopLoss?.toString() || '0');
    const takeProfit = parseFloat(signal.takeProfit?.toString() || '0');

    const assetClass = this.mapAssetClass(signal.assetClass);
    const priceResult = await getCachedPrice(signal.symbol, assetClass);
    
    if (!priceResult || priceResult.error) {
      return {
        signalId: signal.id,
        symbol: signal.symbol,
        outcome: 'active',
        currentPrice: 0,
        entryPrice,
      };
    }

    const currentPrice = priceResult.price ?? 0;
    const isBuy = signal.type.toLowerCase() === 'buy';

    let outcome: SignalOutcome['outcome'] = 'active';
    let exitPrice: number | undefined;
    let pnlPercent: number | undefined;

    if (currentPrice > 0) {
      if (isBuy) {
        if (currentPrice <= stopLoss) {
          outcome = 'hit_sl';
          exitPrice = stopLoss;
          pnlPercent = ((stopLoss - entryPrice) / entryPrice) * 100;
        } else if (currentPrice >= takeProfit) {
          outcome = 'hit_tp';
          exitPrice = takeProfit;
          pnlPercent = ((takeProfit - entryPrice) / entryPrice) * 100;
        }
      } else {
        if (currentPrice >= stopLoss) {
          outcome = 'hit_sl';
          exitPrice = stopLoss;
          pnlPercent = ((entryPrice - stopLoss) / entryPrice) * 100;
        } else if (currentPrice <= takeProfit) {
          outcome = 'hit_tp';
          exitPrice = takeProfit;
          pnlPercent = ((entryPrice - takeProfit) / entryPrice) * 100;
        }
      }
    }

    if (signal.expiresAt && new Date() > new Date(signal.expiresAt)) {
      outcome = 'expired';
    }

    return {
      signalId: signal.id,
      symbol: signal.symbol,
      outcome,
      currentPrice,
      entryPrice,
      exitPrice,
      pnlPercent,
    };
  }

  private mapAssetClass(assetClass: string): 'stock' | 'forex' | 'crypto' | 'commodity' {
    const normalized = assetClass.toLowerCase();
    if (normalized.includes('forex') || normalized.includes('fx')) return 'forex';
    if (normalized.includes('crypto')) return 'crypto';
    if (normalized.includes('commodity') || normalized.includes('commodities')) return 'commodity';
    return 'stock';
  }

  private async archiveSignalToTrades(signal: TradingSignal, outcome: SignalOutcome): Promise<void> {
    try {
      const entryPrice = parseFloat(signal.entryPrice?.toString() || '0');
      const stopLoss = parseFloat(signal.stopLoss?.toString() || '0');
      const takeProfit = parseFloat(signal.takeProfit?.toString() || '0');
      const exitPrice = outcome.exitPrice || outcome.currentPrice;
      const pnlPercent = outcome.pnlPercent || 0;
      
      const isBuy = signal.type.toLowerCase() === 'buy';
      const pnl = isBuy 
        ? (exitPrice - entryPrice) * 1
        : (entryPrice - exitPrice) * 1;

      const duration = this.calculateDuration(signal.createdAt || new Date());
      
      const riskReward = this.calculateRiskReward(entryPrice, stopLoss, takeProfit, isBuy);

      const trade: InsertTrade = {
        userId: null,
        symbol: signal.symbol,
        type: signal.type,
        strategy: signal.strategy,
        entryPrice: entryPrice.toString(),
        exitPrice: exitPrice.toString(),
        stopLoss: stopLoss > 0 ? stopLoss.toString() : null,
        takeProfit: takeProfit > 0 ? takeProfit.toString() : null,
        quantity: "1",
        pnl: pnl.toFixed(2),
        pnlPercent: pnlPercent.toFixed(2),
        riskReward: riskReward || null,
        outcome: outcome.outcome === 'hit_sl' ? 'loss' : 'win',
        timeframe: signal.primaryTimeframe,
        entryReason: signal.technicalReasons?.join(', ') || signal.marketContext || 'SMC Signal',
        lesson: outcome.outcome === 'hit_sl' 
          ? 'Stop loss hit - review entry timing and zone quality' 
          : 'Take profit hit - successful trade execution',
        signalId: signal.id || null,
        entryDate: signal.createdAt || null,
        exitDate: new Date(),
        duration,
        assetClass: signal.assetClass || null,
      };

      await storage.createTrade(trade);
      
      await storage.updateTradingSignal(signal.id, {
        status: outcome.outcome === 'hit_sl' ? 'stopped_out' : 'target_hit',
        invalidatedAt: new Date(),
      });

      console.log(`[SignalMonitor] Archived ${signal.symbol} signal to journal: ${outcome.outcome}`);
    } catch (error) {
      console.error('[SignalMonitor] Error archiving signal:', error);
    }
  }

  private calculateRiskReward(entry: number, sl: number, tp: number, isBuy: boolean): string {
    if (!sl || !tp || sl === 0 || tp === 0) return 'N/A';
    
    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp - entry);
    
    if (risk === 0) return 'N/A';
    
    const rr = reward / risk;
    return `1:${rr.toFixed(1)}`;
  }

  private async expireSignal(signal: TradingSignal): Promise<void> {
    try {
      await storage.updateTradingSignal(signal.id, {
        status: 'expired',
        invalidatedAt: new Date(),
      });
      console.log(`[SignalMonitor] Expired ${signal.symbol} signal`);
    } catch (error) {
      console.error('[SignalMonitor] Error expiring signal:', error);
    }
  }

  private calculateDuration(startDate: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - startDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours < 1) {
      return `${diffMins}m`;
    } else if (diffHours < 24) {
      return `${diffHours}h ${diffMins}m`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ${diffHours % 24}h`;
    }
  }

  async getWatchlistSignals(): Promise<TradingSignal[]> {
    const allSignals = await storage.getTradingSignals();
    return allSignals.filter(s => s.status === 'watchlist' || s.status === 'pending');
  }

  async getActiveSignals(): Promise<TradingSignal[]> {
    const allSignals = await storage.getTradingSignals();
    return allSignals.filter(s => s.status === 'active');
  }

  async promoteToActive(signalId: string): Promise<TradingSignal | undefined> {
    return storage.updateTradingSignal(signalId, { status: 'active' });
  }

  async moveToWatchlist(signalId: string): Promise<TradingSignal | undefined> {
    return storage.updateTradingSignal(signalId, { status: 'watchlist' });
  }
}

export const signalMonitor = new SignalMonitorService();
