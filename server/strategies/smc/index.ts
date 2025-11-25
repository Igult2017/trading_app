import { BaseStrategy } from '../core/baseStrategy';
import {
  StrategyResult,
  StrategySignal,
  InstrumentData,
  EntrySetup,
  MultiTimeframeData,
  SignalDirection,
} from '../core/types';
import { SMC_STRATEGY_CONFIG, SMC_ENTRY_CONFIG } from './config';
import { analyzeH4Context, buildMarketContext, H4AnalysisResult } from './h4Context';
import { analyzeM15Zones, M15ZoneResult, findNearestUnmitigatedZone } from './m15Zones';
import { refineZoneToLowerTimeframe, RefinementResult } from './zoneRefinement';
import { detectEntry, EntryDetectionResult } from './entryDetection';

export class SMCStrategy extends BaseStrategy {
  constructor() {
    super(SMC_STRATEGY_CONFIG);
  }

  async analyze(instrument: InstrumentData): Promise<StrategyResult> {
    const startTime = Date.now();
    const signals: StrategySignal[] = [];
    const pendingSetups: EntrySetup[] = [];
    const errors: string[] = [];

    try {
      this.logAnalysis(`Analyzing ${instrument.symbol}...`);

      const { data, currentPrice, symbol, assetClass } = instrument;

      const h4Result = analyzeH4Context(data.h4, currentPrice);
      this.logAnalysis(`H4 Control: ${h4Result.control}, Trend: ${h4Result.trend}`);

      const m15Result = analyzeM15Zones(data.m15, h4Result.control, currentPrice);
      this.logAnalysis(`M15: ${m15Result.tradableZones.length} tradable zones`);

      if (m15Result.tradableZones.length === 0) {
        this.logAnalysis('No tradable zones found, skipping...');
        return {
          strategyId: this.id,
          signals: [],
          pendingSetups: [],
          errors: [],
          analysisTimeMs: Date.now() - startTime,
        };
      }

      for (const tradableZone of m15Result.tradableZones.slice(0, 3)) {
        const refinementResult = refineZoneToLowerTimeframe(
          tradableZone,
          data.m5,
          data.m1
        );

        const zoneToUse = refinementResult.refinedZone || tradableZone;
        this.logAnalysis(`Using ${refinementResult.refinementLevel} zone for entry detection`);

        const direction: SignalDirection = tradableZone.type === 'demand' ? 'buy' : 'sell';

        const nearestTarget = direction === 'buy'
          ? findNearestUnmitigatedZone(m15Result.unmitigatedSupply, currentPrice, 'above')
            || h4Result.nearestSupplyTarget
          : findNearestUnmitigatedZone(m15Result.unmitigatedDemand, currentPrice, 'below')
            || h4Result.nearestDemandTarget;

        const entryResult = detectEntry(
          data.m1,
          zoneToUse,
          direction,
          nearestTarget,
          [...m15Result.allZones]
        );

        if (entryResult.hasValidEntry && entryResult.setup) {
          const confidence = entryResult.setup.confidence;

          if (confidence >= this.minConfidence) {
            const signal = this.buildSignal(
              instrument,
              entryResult,
              h4Result,
              m15Result,
              refinementResult,
              data
            );
            signals.push(signal);
            this.logAnalysis(`Signal generated: ${signal.direction} @ ${signal.entryPrice.toFixed(5)} (${confidence}% confidence)`);
          } else if (confidence >= 50) {
            pendingSetups.push(entryResult.setup);
            this.logAnalysis(`Pending setup: ${direction} (${confidence}% confidence, needs ${this.minConfidence}%)`);
          }
        }
      }

    } catch (error) {
      const err = error as Error;
      errors.push(err.message);
      this.logError('Analysis failed', err);
    }

    return {
      strategyId: this.id,
      signals,
      pendingSetups,
      errors,
      analysisTimeMs: Date.now() - startTime,
    };
  }

  validateSetup(setup: EntrySetup, data: MultiTimeframeData): boolean {
    if (setup.riskRewardRatio < SMC_ENTRY_CONFIG.minimumRiskReward) {
      return false;
    }

    if (setup.confidence < this.minConfidence) {
      return false;
    }

    const latestM1 = data.m1[data.m1.length - 1];
    if (!latestM1) return false;

    const currentPrice = latestM1.close;
    const entryZone = setup.entryZone;

    const isStillValid = currentPrice >= entryZone.bottomPrice * 0.995 &&
                         currentPrice <= entryZone.topPrice * 1.005;

    return isStillValid;
  }

  private buildSignal(
    instrument: InstrumentData,
    entryResult: EntryDetectionResult,
    h4Result: H4AnalysisResult,
    m15Result: M15ZoneResult,
    refinementResult: RefinementResult,
    data: MultiTimeframeData
  ): StrategySignal {
    const setup = entryResult.setup!;
    const marketContext = buildMarketContext(h4Result, h4Result.swingPoints);

    const allReasoning = [
      ...h4Result.reasoning,
      ...m15Result.reasoning,
      ...refinementResult.reasoning,
      ...entryResult.reasoning,
    ];

    return {
      id: this.createSignalId(),
      strategyId: this.id,
      strategyName: this.name,
      symbol: instrument.symbol,
      assetClass: instrument.assetClass,
      direction: setup.direction,
      entryType: setup.entryType,
      entryPrice: setup.entryPrice,
      stopLoss: setup.stopLoss,
      takeProfit: setup.takeProfit,
      riskRewardRatio: setup.riskRewardRatio,
      confidence: setup.confidence,
      timeframe: refinementResult.refinementLevel as any,
      marketContext,
      entrySetup: setup,
      zones: {
        h4: [...h4Result.unmitigatedSupply, ...h4Result.unmitigatedDemand],
        m15: m15Result.allZones,
        m5: [],
        m1: [],
      },
      reasoning: allReasoning,
      createdAt: Date.now(),
      expiresAt: this.calculateExpiryTime(),
    };
  }
}

export const smcStrategy = new SMCStrategy();
