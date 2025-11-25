import { StrategyConfig } from '../core/types';

export const SMC_STRATEGY_CONFIG: StrategyConfig = {
  id: 'smc-v1',
  name: 'Smart Money Concepts',
  enabled: true,
  minConfidence: 70,
  scanIntervalMs: 60000,
  expiryMinutes: 240,
};

export const SMC_ZONE_CONFIG = {
  h4LookbackCandles: 100,
  m15LookbackCandles: 100,
  m5LookbackCandles: 100,
  m1LookbackCandles: 60,
  minImpulseRatio: 0.6,
  maxRefinedZonePips: 3,
  maxRefinedZoneMultiplier: 0.5,
};

export const SMC_ENTRY_CONFIG = {
  chochConfidence: 40,
  dsSdFlipConfidence: 35,
  continuationConfidence: 30,
  liquidityConfirmationBonus: 15,
  strongZoneBonus: 10,
  multipleConfirmationsBonus: 10,
  minimumRiskReward: 2,
  defaultRiskReward: 3,
};

export const SMC_TIMEFRAME_PRIORITY = ['4H', '15M', '5M', '1M'] as const;
