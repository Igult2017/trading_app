import { strategyRegistry } from './core/strategyRegistry';

export function initializeStrategies(): void {
  console.log('[Strategies] Initializing trading strategies...');

  const stats = strategyRegistry.getStats();
  console.log(`[Strategies] Registered ${stats.totalStrategies} strategies (${stats.enabledStrategies} enabled)`);
}

export { strategyRegistry } from './core/strategyRegistry';
export { BaseStrategy } from './core/baseStrategy';
export * from './core/types';
