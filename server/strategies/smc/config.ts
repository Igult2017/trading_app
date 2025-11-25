import { StrategyConfig, Timeframe } from '../core/types';

export const SMC_STRATEGY_CONFIG: StrategyConfig = {
  id: 'smc-v1',
  name: 'Smart Money Concepts',
  enabled: true,
  minConfidence: 70,
  scanIntervalMs: 60000,
  expiryMinutes: 240,
};

export const SMC_ZONE_CONFIG = {
  d1LookbackCandles: 60,
  h4LookbackCandles: 100,
  h2LookbackCandles: 100,
  h1LookbackCandles: 100,
  m30LookbackCandles: 100,
  m15LookbackCandles: 100,
  m5LookbackCandles: 100,
  m3LookbackCandles: 80,
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

export const SMC_CLARITY_CONFIG = {
  minClarityScore: 60,
  minZonesRequired: 1,
  maxZonesForClarity: 5,
  minSwingPointsRequired: 4,
  minTrendConsistency: 0.6,
};

export interface TimeframePair {
  context: Timeframe;
  zone: Timeframe;
}

export const HTF_TIMEFRAMES: Timeframe[] = ['1D', '4H', '2H', '1H'];

export const LTF_TIMEFRAMES: Timeframe[] = ['30M', '15M'];

export const ENTRY_TIMEFRAMES: Timeframe[] = ['5M', '3M', '1M'];

export const PRIMARY_TIMEFRAMES: TimeframePair = {
  context: '4H',
  zone: '15M',
};

export const ALTERNATIVE_TIMEFRAMES: TimeframePair = {
  context: '2H',
  zone: '30M',
};

export const SMC_TIMEFRAME_PRIORITY = ['1D', '4H', '2H', '1H', '30M', '15M', '5M', '3M', '1M'] as const;
