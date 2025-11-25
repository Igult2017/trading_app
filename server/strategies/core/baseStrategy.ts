import {
  StrategyConfig,
  StrategyResult,
  StrategySignal,
  InstrumentData,
  EntrySetup,
  MultiTimeframeData,
} from './types';

export abstract class BaseStrategy {
  protected config: StrategyConfig;
  protected lastScanTime: number = 0;

  constructor(config: StrategyConfig) {
    this.config = config;
  }

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  get minConfidence(): number {
    return this.config.minConfidence;
  }

  abstract analyze(instrument: InstrumentData): Promise<StrategyResult>;

  abstract validateSetup(setup: EntrySetup, data: MultiTimeframeData): boolean;

  enable(): void {
    this.config.enabled = true;
  }

  disable(): void {
    this.config.enabled = false;
  }

  updateConfig(updates: Partial<StrategyConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  shouldScan(): boolean {
    const now = Date.now();
    if (now - this.lastScanTime >= this.config.scanIntervalMs) {
      this.lastScanTime = now;
      return true;
    }
    return false;
  }

  protected createSignalId(): string {
    return `${this.config.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected calculateExpiryTime(): number {
    return Date.now() + this.config.expiryMinutes * 60 * 1000;
  }

  protected logAnalysis(message: string): void {
    console.log(`[${this.config.name}] ${message}`);
  }

  protected logError(message: string, error?: Error): void {
    console.error(`[${this.config.name}] ERROR: ${message}`, error?.message || '');
  }
}
