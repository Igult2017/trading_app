import { BaseStrategy } from './baseStrategy';
import { StrategyResult, InstrumentData, StrategySignal } from './types';

interface RegistryEntry {
  strategy: BaseStrategy;
  lastResult: StrategyResult | null;
  lastError: Error | null;
  lastRunTime: number;
}

export class StrategyRegistry {
  private strategies: Map<string, RegistryEntry> = new Map();
  private static instance: StrategyRegistry | null = null;

  private constructor() {}

  static getInstance(): StrategyRegistry {
    if (!StrategyRegistry.instance) {
      StrategyRegistry.instance = new StrategyRegistry();
    }
    return StrategyRegistry.instance;
  }

  register(strategy: BaseStrategy): void {
    if (this.strategies.has(strategy.id)) {
      console.warn(`Strategy ${strategy.id} already registered. Updating...`);
    }

    this.strategies.set(strategy.id, {
      strategy,
      lastResult: null,
      lastError: null,
      lastRunTime: 0,
    });

    console.log(`[StrategyRegistry] Registered strategy: ${strategy.name} (${strategy.id})`);
  }

  unregister(strategyId: string): boolean {
    const removed = this.strategies.delete(strategyId);
    if (removed) {
      console.log(`[StrategyRegistry] Unregistered strategy: ${strategyId}`);
    }
    return removed;
  }

  getStrategy(strategyId: string): BaseStrategy | undefined {
    return this.strategies.get(strategyId)?.strategy;
  }

  getAllStrategies(): BaseStrategy[] {
    return Array.from(this.strategies.values()).map(entry => entry.strategy);
  }

  getEnabledStrategies(): BaseStrategy[] {
    return this.getAllStrategies().filter(s => s.isEnabled);
  }

  async runStrategy(strategyId: string, instrument: InstrumentData): Promise<StrategyResult | null> {
    const entry = this.strategies.get(strategyId);
    if (!entry) {
      console.error(`[StrategyRegistry] Strategy not found: ${strategyId}`);
      return null;
    }

    if (!entry.strategy.isEnabled) {
      return null;
    }

    const startTime = Date.now();

    try {
      const result = await entry.strategy.analyze(instrument);
      entry.lastResult = result;
      entry.lastError = null;
      entry.lastRunTime = Date.now() - startTime;

      return result;
    } catch (error) {
      entry.lastError = error as Error;
      entry.lastResult = {
        strategyId,
        signals: [],
        pendingSetups: [],
        errors: [(error as Error).message],
        analysisTimeMs: Date.now() - startTime,
      };

      console.error(`[StrategyRegistry] Error running ${strategyId}:`, (error as Error).message);
      return entry.lastResult;
    }
  }

  async runAllStrategies(instrument: InstrumentData): Promise<StrategySignal[]> {
    const result = await this.runAllStrategiesWithPending(instrument);
    return result.signals;
  }

  async runAllStrategiesWithPending(instrument: InstrumentData): Promise<{ signals: StrategySignal[]; pendingSetups: any[] }> {
    const enabledStrategies = this.getEnabledStrategies();
    const allSignals: StrategySignal[] = [];
    const allPendingSetups: any[] = [];

    const results = await Promise.allSettled(
      enabledStrategies.map(strategy => this.runStrategy(strategy.id, instrument))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        allSignals.push(...result.value.signals);
        if (result.value.pendingSetups && result.value.pendingSetups.length > 0) {
          allPendingSetups.push(...result.value.pendingSetups.map(setup => ({
            ...setup,
            symbol: instrument.symbol,
            assetClass: instrument.assetClass,
          })));
        }
      }
    }

    return { signals: allSignals, pendingSetups: allPendingSetups };
  }

  async runAllStrategiesForMultipleInstruments(
    instruments: InstrumentData[]
  ): Promise<Map<string, StrategySignal[]>> {
    const signalsBySymbol = new Map<string, StrategySignal[]>();

    for (const instrument of instruments) {
      try {
        const signals = await this.runAllStrategies(instrument);
        signalsBySymbol.set(instrument.symbol, signals);
      } catch (error) {
        console.error(`[StrategyRegistry] Error analyzing ${instrument.symbol}:`, (error as Error).message);
        signalsBySymbol.set(instrument.symbol, []);
      }
    }

    return signalsBySymbol;
  }

  getLastResult(strategyId: string): StrategyResult | null {
    return this.strategies.get(strategyId)?.lastResult || null;
  }

  getLastError(strategyId: string): Error | null {
    return this.strategies.get(strategyId)?.lastError || null;
  }

  getStats(): {
    totalStrategies: number;
    enabledStrategies: number;
    strategiesWithErrors: number;
  } {
    const entries = Array.from(this.strategies.values());
    return {
      totalStrategies: entries.length,
      enabledStrategies: entries.filter(e => e.strategy.isEnabled).length,
      strategiesWithErrors: entries.filter(e => e.lastError !== null).length,
    };
  }

  enableStrategy(strategyId: string): boolean {
    const entry = this.strategies.get(strategyId);
    if (entry) {
      entry.strategy.enable();
      return true;
    }
    return false;
  }

  disableStrategy(strategyId: string): boolean {
    const entry = this.strategies.get(strategyId);
    if (entry) {
      entry.strategy.disable();
      return true;
    }
    return false;
  }
}

export const strategyRegistry = StrategyRegistry.getInstance();
