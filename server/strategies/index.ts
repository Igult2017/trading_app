import { strategyRegistry } from './core/strategyRegistry';
import { smcStrategy } from './smc';

export function initializeStrategies(): void {
  console.log('[Strategies] Initializing trading strategies...');

  strategyRegistry.register(smcStrategy);

  const stats = strategyRegistry.getStats();
  console.log(`[Strategies] Registered ${stats.totalStrategies} strategies (${stats.enabledStrategies} enabled)`);
}

export { strategyRegistry } from './core/strategyRegistry';
export { BaseStrategy } from './core/baseStrategy';
export * from './core/types';

export { smcStrategy } from './smc';
