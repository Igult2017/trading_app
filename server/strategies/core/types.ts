export type Timeframe = '1M' | '3M' | '5M' | '15M' | '30M' | '1H' | '2H' | '4H' | '1D' | '1W';

export type ZoneType = 'supply' | 'demand';

export type ZoneStatus = 'unmitigated' | 'mitigated';

export type ZoneStrength = 'strong' | 'moderate' | 'weak';

export type TrendDirection = 'bullish' | 'bearish' | 'sideways';

export type MarketControl = 'supply' | 'demand' | 'neutral';

export type SwingPointType = 'HH' | 'HL' | 'LH' | 'LL';

export type EntryType = 'choch' | 'ds_sd_flip' | 'continuation' | 'liquidity_sweep';

export type SignalDirection = 'buy' | 'sell';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe: Timeframe;
}

export interface SupplyDemandZone {
  id: string;
  type: ZoneType;
  status: ZoneStatus;
  strength: ZoneStrength;
  topPrice: number;
  bottomPrice: number;
  formationTime: number;
  formationIndex: number;
  timeframe: Timeframe;
  mitigatedAt?: number;
  refinedFrom?: string;
  pipSize: number;
}

export interface SwingPoint {
  type: SwingPointType;
  price: number;
  index: number;
  timestamp: number;
}

export interface MarketContext {
  h4Control: MarketControl;
  h4TrendDirection: TrendDirection;
  h4SupplyZones: SupplyDemandZone[];
  h4DemandZones: SupplyDemandZone[];
  nearestH4Target: SupplyDemandZone | null;
  swingPoints: SwingPoint[];
}

export interface EntrySetup {
  entryType: EntryType;
  direction: SignalDirection;
  entryZone: SupplyDemandZone;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  confidence: number;
  confirmations: string[];
  reasoning: string[];
}

export interface StrategySignal {
  id: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  assetClass: string;
  direction: SignalDirection;
  entryType: EntryType;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  confidence: number;
  timeframe: Timeframe;
  marketContext: MarketContext;
  entrySetup: EntrySetup;
  zones: {
    h4: SupplyDemandZone[];
    m15: SupplyDemandZone[];
    m5: SupplyDemandZone[];
    m1: SupplyDemandZone[];
  };
  reasoning: string[];
  createdAt: number;
  expiresAt: number;
}

export interface MultiTimeframeData {
  h4: Candle[];
  h2: Candle[];
  m30: Candle[];
  m15: Candle[];
  m5: Candle[];
  m3: Candle[];
  m1: Candle[];
  daily?: Candle[];
}

export interface StrategyConfig {
  id: string;
  name: string;
  enabled: boolean;
  minConfidence: number;
  scanIntervalMs: number;
  expiryMinutes: number;
}

export interface StrategyResult {
  strategyId: string;
  signals: StrategySignal[];
  pendingSetups: EntrySetup[];
  errors: string[];
  analysisTimeMs: number;
}

export interface InstrumentData {
  symbol: string;
  assetClass: string;
  currentPrice: number;
  data: MultiTimeframeData;
}
