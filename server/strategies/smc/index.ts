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
import { analyzeVolatility, hasCleanPriceAction, VolatilityAnalysis } from '../shared/candlePatterns';

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

      this.logAnalysis(`TF Selection: ${tfSelection.dailyContextTf}/${tfSelection.majorZoneTf}/${tfSelection.zoneIdentificationTf}/${tfSelection.entryRefinementTf}`);
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

      const volatilityCheck = this.checkVolatility(data);
      if (volatilityCheck.isVolatile) {
        this.logAnalysis(`Skipping ${symbol}: ${volatilityCheck.reasons.join(', ')}`);
        return {
          strategyId: this.id,
          signals: [],
          pendingSetups: [],
          errors: [],
          analysisTimeMs: Date.now() - startTime,
        };
      }

      const contextCandles = this.getContextCandles(data);
      const dailyContext = analyzeH4Context(contextCandles, currentPrice);
      this.logAnalysis(`1D Context: ${dailyContext.control}, Trend: ${dailyContext.trend}`);

      const majorZoneCandles = this.getMajorZoneCandles(data, tfSelection.majorZoneTf);
      const majorZonesResult = analyzeM15Zones(majorZoneCandles, dailyContext.control, currentPrice);
      this.logAnalysis(`${tfSelection.majorZoneTf} Major Zones: ${majorZonesResult.tradableZones.length} zones found`);

      if (majorZonesResult.tradableZones.length === 0) {
        this.logAnalysis('No major zones found, skipping...');
        return {
          strategyId: this.id,
          signals: [],
          pendingSetups: [],
          errors: [],
          analysisTimeMs: Date.now() - startTime,
        };
      }

      for (const majorZone of majorZonesResult.tradableZones.slice(0, 3)) {
        const zoneIdCandles = this.getZoneIdentificationCandles(data, tfSelection.zoneIdentificationTf);
        const unmitigatedZonesResult = analyzeM15Zones(zoneIdCandles, dailyContext.control, currentPrice);
        this.logAnalysis(`${tfSelection.zoneIdentificationTf}: ${unmitigatedZonesResult.tradableZones.length} unmitigated zones`);

        const refinementCandles = this.getEntryRefinementCandles(data, tfSelection.entryRefinementTf);
        const refinementResult = refineZoneToLowerTimeframe(
          majorZone,
          zoneIdCandles,
          refinementCandles
        );

        const zoneToUse = refinementResult.refinedZone || majorZone;
        
        if (refinementResult.refinedZone) {
          this.logAnalysis(`Zone refined on ${tfSelection.entryRefinementTf}`);
        } else {
          this.logAnalysis(`Using ${tfSelection.zoneIdentificationTf} zone (refinement unclear)`);
        }

        const direction: SignalDirection = majorZone.type === 'demand' ? 'buy' : 'sell';

        const nearestTarget = direction === 'buy'
          ? findNearestUnmitigatedZone(unmitigatedZonesResult.unmitigatedSupply, currentPrice, 'above')
            || dailyContext.nearestSupplyTarget
          : findNearestUnmitigatedZone(unmitigatedZonesResult.unmitigatedDemand, currentPrice, 'below')
            || dailyContext.nearestDemandTarget;

        const entryResult = detectEntry(
          refinementCandles,
          zoneToUse,
          direction,
          nearestTarget,
          [...unmitigatedZonesResult.allZones]
        );

        if (!entryResult.hasValidEntry) {
          if (entryResult.setup && entryResult.setup.confidence >= 40) {
            const pendingSetup = {
              ...entryResult.setup,
              symbol: instrument.symbol,
              assetClass: instrument.assetClass,
              direction: direction,
              timeframe: tfSelection.zoneIdentificationTf,
            };
            pendingSetups.push(pendingSetup);
            this.logAnalysis(`Zone monitoring: ${direction} (${entryResult.setup.confidence}% confidence, awaiting entry trigger)`);
          }
          continue;
        }

        if (entryResult.hasValidEntry && entryResult.setup) {
          const entryConfirmation = this.confirmEntryTrigger(
            data,
            tfSelection.entryRefinementTf,
            entryResult,
            direction
          );

          if (!entryConfirmation.confirmed) {
            this.logAnalysis(`Entry trigger not confirmed on ${tfSelection.entryRefinementTf}: ${entryConfirmation.confirmations.join(', ')}`);
            if (entryResult.setup.confidence >= 50) {
              const pendingSetup = {
                ...entryResult.setup,
                symbol: instrument.symbol,
                assetClass: instrument.assetClass,
                direction: direction,
                timeframe: tfSelection.zoneIdentificationTf,
              };
              pendingSetups.push(pendingSetup);
              this.logAnalysis(`Added to watchlist: ${direction} (${entryResult.setup.confidence}%)`);
            }
            continue;
          }

          this.logAnalysis(`Entry confirmed: ${entryConfirmation.confirmations.join(', ')}`);
          
          entryResult.setup.confirmations = [
            ...entryResult.setup.confirmations,
            ...entryConfirmation.confirmations
          ];

          const confidence = entryResult.setup.confidence;

          if (confidence >= this.minConfidence) {
            const signal = this.buildSignal(
              instrument,
              entryResult,
              dailyContext,
              unmitigatedZonesResult,
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

  private getContextCandles(data: MultiTimeframeData): Candle[] {
    return data.d1 || data.h4;
  }

  private getMajorZoneCandles(data: MultiTimeframeData, tf: Timeframe): Candle[] {
    switch (tf) {
      case '4H': return data.h4;
      case '2H': return data.h2;
      case '1H': return data.h1 || data.h2;
      default: return data.h4;
    }
  }

  private getZoneIdentificationCandles(data: MultiTimeframeData, tf: Timeframe): Candle[] {
    switch (tf) {
      case '30M': return data.m30;
      case '15M': return data.m15;
      default: return data.m15;
    }
  }

  private getEntryRefinementCandles(data: MultiTimeframeData, tf: Timeframe): Candle[] {
    switch (tf) {
      case '5M': return data.m5;
      case '3M': return data.m3;
      case '1M': return data.m1;
      default: return data.m5;
    }
  }

  private checkVolatility(data: MultiTimeframeData): VolatilityAnalysis {
    const h1Volatility = data.h1 ? analyzeVolatility(data.h1, 20) : null;
    const m15Volatility = analyzeVolatility(data.m15, 20);
    const m5Volatility = analyzeVolatility(data.m5, 20);

    const reasons: string[] = [];
    let isVolatile = false;

    if (h1Volatility?.isVolatile) {
      isVolatile = true;
      reasons.push(...h1Volatility.reasons.map(r => `1H: ${r}`));
    }

    if (m15Volatility.isVolatile) {
      isVolatile = true;
      reasons.push(...m15Volatility.reasons.map(r => `15M: ${r}`));
    }

    if (m5Volatility.isVolatile && m5Volatility.rangeMultiplier > 3) {
      isVolatile = true;
      reasons.push(...m5Volatility.reasons.map(r => `5M: ${r}`));
    }

    if (!hasCleanPriceAction(data.m15, 15)) {
      if (m15Volatility.avgWickRatio > 0.45) {
        isVolatile = true;
        reasons.push('15M: Choppy price action with unclear structure');
      }
    }

    return {
      isVolatile,
      wickRatio: m15Volatility.wickRatio,
      avgWickRatio: m15Volatility.avgWickRatio,
      rangeMultiplier: m15Volatility.rangeMultiplier,
      longWickCount: m15Volatility.longWickCount,
      reasons,
    };
  }

  private confirmEntryTrigger(
    data: MultiTimeframeData,
    entryTf: Timeframe,
    entryResult: EntryDetectionResult,
    direction: SignalDirection
  ): { confirmed: boolean; confirmations: string[] } {
    const entryCandles = this.getEntryRefinementCandles(data, entryTf);
    if (entryCandles.length < 5) {
      return { confirmed: false, confirmations: ['Insufficient entry candles'] };
    }

    const confirmations: string[] = [];
    let confirmationCount = 0;

    const lastCandle = entryCandles[entryCandles.length - 1];
    const prevCandle = entryCandles[entryCandles.length - 2];
    const prevPrevCandle = entryCandles[entryCandles.length - 3];

    const lastWickRatio = (lastCandle.high - lastCandle.low) > 0
      ? ((Math.max(lastCandle.open, lastCandle.close) - Math.min(lastCandle.open, lastCandle.close)) / 
         (lastCandle.high - lastCandle.low))
      : 0;

    if (lastWickRatio < 0.3) {
      return { confirmed: false, confirmations: ['Entry candle has too much wick - unclear direction'] };
    }

    if (direction === 'buy') {
      const bullishClose = lastCandle.close > lastCandle.open;
      const strongBody = lastWickRatio >= 0.5;
      const higherLow = lastCandle.low > prevCandle.low;
      const higherHigh = lastCandle.high > prevCandle.high;
      const breakPrevHigh = lastCandle.close > prevCandle.high;
      const consecutiveBullish = prevCandle.close > prevCandle.open && bullishClose;

      if (bullishClose && strongBody) {
        confirmations.push('Strong bullish candle with clean body');
        confirmationCount++;
      }

      if (higherLow && higherHigh) {
        confirmations.push('Higher high and higher low formed');
        confirmationCount++;
      }

      if (breakPrevHigh) {
        confirmations.push('Closed above previous high - momentum confirmed');
        confirmationCount++;
      }

      if (consecutiveBullish) {
        confirmations.push('Consecutive bullish candles');
        confirmationCount++;
      }

      const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
      const totalRange = lastCandle.high - lastCandle.low;
      if (totalRange > 0 && lowerWick / totalRange > 0.5) {
        confirmations.push('Bullish rejection wick from zone');
        confirmationCount++;
      }

    } else {
      const bearishClose = lastCandle.close < lastCandle.open;
      const strongBody = lastWickRatio >= 0.5;
      const lowerHigh = lastCandle.high < prevCandle.high;
      const lowerLow = lastCandle.low < prevCandle.low;
      const breakPrevLow = lastCandle.close < prevCandle.low;
      const consecutiveBearish = prevCandle.close < prevCandle.open && bearishClose;

      if (bearishClose && strongBody) {
        confirmations.push('Strong bearish candle with clean body');
        confirmationCount++;
      }

      if (lowerHigh && lowerLow) {
        confirmations.push('Lower high and lower low formed');
        confirmationCount++;
      }

      if (breakPrevLow) {
        confirmations.push('Closed below previous low - momentum confirmed');
        confirmationCount++;
      }

      if (consecutiveBearish) {
        confirmations.push('Consecutive bearish candles');
        confirmationCount++;
      }

      const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
      const totalRange = lastCandle.high - lastCandle.low;
      if (totalRange > 0 && upperWick / totalRange > 0.5) {
        confirmations.push('Bearish rejection wick from zone');
        confirmationCount++;
      }
    }

    const confirmed = confirmationCount >= 2;

    return { confirmed, confirmations };
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
    dailyContext: H4AnalysisResult,
    zonesResult: M15ZoneResult,
    refinementResult: RefinementResult,
    tfSelection: TimeframeSelection,
    data: MultiTimeframeData
  ): StrategySignal {
    const setup = entryResult.setup!;
    const marketContext = buildMarketContext(dailyContext, dailyContext.swingPoints);

    const allReasoning = [
      `1D Context: trend ${dailyContext.trend} (clarity: ${tfSelection.dailyContextClarity.score}%)`,
      `Major Zones: ${tfSelection.majorZoneTf} (clarity: ${tfSelection.majorZoneClarity.score}%)`,
      `Zone ID: ${tfSelection.zoneIdentificationTf} (clarity: ${tfSelection.zoneIdentificationClarity.score}%)`,
      `Entry/Refinement: ${tfSelection.entryRefinementTf} (clarity: ${tfSelection.entryRefinementClarity.score}%)`,
      ...tfSelection.reasoning,
      ...dailyContext.reasoning,
      ...zonesResult.reasoning,
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
      timeframe: tfSelection.entryRefinementTf,
      marketContext,
      entrySetup: setup,
      zones: {
        h4: [...dailyContext.unmitigatedSupply, ...dailyContext.unmitigatedDemand],
        m15: zonesResult.allZones,
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
