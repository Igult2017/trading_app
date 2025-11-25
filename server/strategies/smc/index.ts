import { BaseStrategy } from '../core/baseStrategy';
import {
  StrategyResult,
  StrategySignal,
  InstrumentData,
  EntrySetup,
  MultiTimeframeData,
  SignalDirection,
  Candle,
  Timeframe,
} from '../core/types';
import { SMC_STRATEGY_CONFIG, SMC_ENTRY_CONFIG } from './config';
import { analyzeH4Context, buildMarketContext, H4AnalysisResult } from './h4Context';
import { analyzeM15Zones, M15ZoneResult, findNearestUnmitigatedZone } from './m15Zones';
import { refineZoneToLowerTimeframe, RefinementResult } from './zoneRefinement';
import { detectEntry, EntryDetectionResult } from './entryDetection';
import { 
  selectBestTimeframes, 
  isMarketClear, 
  getMarketClarityStatus,
  TimeframeSelection,
  ClarityResult,
} from './clarityAnalysis';

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

      const tfSelection = selectBestTimeframes(
        data.h4,
        data.h2,
        data.m30,
        data.m15,
        data.m5,
        data.m3,
        data.m1,
        data.d1,
        data.h1
      );

      this.logAnalysis(`Timeframe selection: ${tfSelection.contextTf}/${tfSelection.zoneTf}/${tfSelection.entryTf}/${tfSelection.refinementTf}`);
      tfSelection.reasoning.forEach(r => this.logAnalysis(`  - ${r}`));

      if (!isMarketClear(tfSelection)) {
        this.logAnalysis(`Skipping ${symbol}: ${getMarketClarityStatus(tfSelection)}`);
        return {
          strategyId: this.id,
          signals: [],
          pendingSetups: [],
          errors: [],
          analysisTimeMs: Date.now() - startTime,
        };
      }

      const contextCandles = this.getContextCandles(data, tfSelection.contextTf);
      const h4Result = analyzeH4Context(contextCandles, currentPrice);
      this.logAnalysis(`${tfSelection.contextTf} Control: ${h4Result.control}, Trend: ${h4Result.trend}`);

      const zoneCandles = this.getZoneCandles(data, tfSelection.zoneTf);
      const m15Result = analyzeM15Zones(zoneCandles, h4Result.control, currentPrice);
      this.logAnalysis(`${tfSelection.zoneTf}: ${m15Result.tradableZones.length} tradable zones`);

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
        const refinementCandles = this.getRefinementCandles(data, tfSelection);
        const refinementResult = refineZoneToLowerTimeframe(
          tradableZone,
          refinementCandles.intermediate,
          refinementCandles.entry
        );

        const zoneToUse = refinementResult.refinedZone || tradableZone;
        this.logAnalysis(`Using ${refinementResult.refinementLevel} zone for entry detection`);

        const direction: SignalDirection = tradableZone.type === 'demand' ? 'buy' : 'sell';

        const nearestTarget = direction === 'buy'
          ? findNearestUnmitigatedZone(m15Result.unmitigatedSupply, currentPrice, 'above')
            || h4Result.nearestSupplyTarget
          : findNearestUnmitigatedZone(m15Result.unmitigatedDemand, currentPrice, 'below')
            || h4Result.nearestDemandTarget;

        const entryCandles = this.getEntryCandles(data, tfSelection.entryTf);
        const entryResult = detectEntry(
          entryCandles,
          zoneToUse,
          direction,
          nearestTarget,
          [...m15Result.allZones]
        );

        if (!entryResult.hasValidEntry) {
          if (entryResult.setup && entryResult.setup.confidence >= 40) {
            const pendingSetup = {
              ...entryResult.setup,
              symbol: instrument.symbol,
              assetClass: instrument.assetClass,
              direction: direction,
              timeframe: tfSelection.zoneTf,
            };
            pendingSetups.push(pendingSetup);
            this.logAnalysis(`Zone monitoring: ${direction} (${entryResult.setup.confidence}% confidence, awaiting entry)`);
          }
          continue;
        }

        if (entryResult.hasValidEntry && entryResult.setup) {
          const refinementConfirmed = this.confirmOnRefinementTimeframe(
            data,
            tfSelection.refinementTf,
            entryResult,
            direction
          );

          if (!refinementConfirmed) {
            this.logAnalysis(`Entry not confirmed on ${tfSelection.refinementTf}, waiting...`);
            if (entryResult.setup.confidence >= 50) {
              const pendingSetup = {
                ...entryResult.setup,
                symbol: instrument.symbol,
                assetClass: instrument.assetClass,
                direction: direction,
                timeframe: tfSelection.zoneTf,
              };
              pendingSetups.push(pendingSetup);
              this.logAnalysis(`Added to watchlist: ${direction} (${entryResult.setup.confidence}%)`);
            }
            continue;
          }

          const confidence = entryResult.setup.confidence;

          if (confidence >= this.minConfidence) {
            const signal = this.buildSignal(
              instrument,
              entryResult,
              h4Result,
              m15Result,
              refinementResult,
              tfSelection,
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

  private getContextCandles(data: MultiTimeframeData, tf: Timeframe): Candle[] {
    switch (tf) {
      case '1D': return data.d1 || data.h4;
      case '4H': return data.h4;
      case '2H': return data.h2;
      case '1H': return data.h1 || data.h2;
      default: return data.h4;
    }
  }

  private getZoneCandles(data: MultiTimeframeData, tf: Timeframe): Candle[] {
    switch (tf) {
      case '4H': return data.h4;
      case '2H': return data.h2;
      case '1H': return data.h1 || data.h2;
      default: return data.h4;
    }
  }

  private getEntryCandles(data: MultiTimeframeData, tf: Timeframe): Candle[] {
    switch (tf) {
      case '30M': return data.m30;
      case '15M': return data.m15;
      default: return data.m15;
    }
  }

  private getRefinementCandlesForTf(data: MultiTimeframeData, tf: Timeframe): Candle[] {
    switch (tf) {
      case '5M': return data.m5;
      case '3M': return data.m3;
      case '1M': return data.m1;
      default: return data.m5;
    }
  }

  private getRefinementCandles(data: MultiTimeframeData, tfSelection: TimeframeSelection): { intermediate: Candle[], entry: Candle[] } {
    if (tfSelection.zoneTf === '30M') {
      return {
        intermediate: data.m3,
        entry: data.m1,
      };
    }

    return {
      intermediate: data.m5,
      entry: tfSelection.entryTf === '1M' ? data.m1 : data.m3,
    };
  }

  private confirmOnRefinementTimeframe(
    data: MultiTimeframeData,
    refinementTf: Timeframe,
    entryResult: EntryDetectionResult,
    direction: SignalDirection
  ): boolean {
    const refinementCandles = this.getRefinementCandlesForTf(data, refinementTf);
    if (refinementCandles.length < 3) return false;

    const lastCandle = refinementCandles[refinementCandles.length - 1];
    const prevCandle = refinementCandles[refinementCandles.length - 2];

    if (direction === 'buy') {
      const bullishClose = lastCandle.close > lastCandle.open;
      const higherLow = lastCandle.low > prevCandle.low;
      const priceReaction = lastCandle.close > prevCandle.high;

      return bullishClose && (higherLow || priceReaction);
    } else {
      const bearishClose = lastCandle.close < lastCandle.open;
      const lowerHigh = lastCandle.high < prevCandle.high;
      const priceReaction = lastCandle.close < prevCandle.low;

      return bearishClose && (lowerHigh || priceReaction);
    }
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
    tfSelection: TimeframeSelection,
    data: MultiTimeframeData
  ): StrategySignal {
    const setup = entryResult.setup!;
    const marketContext = buildMarketContext(h4Result, h4Result.swingPoints);

    const allReasoning = [
      `Context TF: ${tfSelection.contextTf} (clarity: ${tfSelection.contextClarity.score}%)`,
      `Zone TF: ${tfSelection.zoneTf} (clarity: ${tfSelection.zoneClarity.score}%)`,
      `Entry TF: ${tfSelection.entryTf} (clarity: ${tfSelection.entryClarity.score}%)`,
      `Refinement TF: ${tfSelection.refinementTf} (clarity: ${tfSelection.refinementClarity.score}%)`,
      ...tfSelection.reasoning,
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
      timeframe: tfSelection.entryTf,
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
