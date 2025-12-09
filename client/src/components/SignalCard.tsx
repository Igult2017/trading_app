import { useState } from 'react';
import { 
  Clock,
  ChevronUp,
  ChevronDown,
  Target,
  TrendingUp,
  Shield,
  BarChart2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TradingSignal } from '@shared/schema';
import { LivePriceWithEntry } from './LivePriceDisplay';

const formatTimeAgo = (timestamp: Date | string) => {
  const now = new Date();
  const created = new Date(timestamp);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

interface SignalCardProps {
  signal: TradingSignal;
  isWatchlist?: boolean;
}

const getAssetClassForSymbol = (symbol: string, assetClass?: string): 'stock' | 'forex' | 'commodity' | 'crypto' => {
  if (assetClass === 'crypto' || assetClass === 'cryptocurrency') return 'crypto';
  if (assetClass === 'commodity' || assetClass === 'commodities') return 'commodity';
  if (assetClass === 'forex' || assetClass === 'currency') return 'forex';
  if (assetClass === 'stock' || assetClass === 'stocks') return 'stock';
  
  if (symbol.includes('/USD') && ['BTC', 'ETH', 'BNB', 'SOL', 'XRP'].some(c => symbol.startsWith(c))) return 'crypto';
  if (symbol.includes('/')) return 'forex';
  if (['XAU', 'XAG', 'WTI', 'BRENT', 'GOLD', 'SILVER', 'OIL'].some(c => symbol.includes(c))) return 'commodity';
  
  return 'stock';
};

export default function SignalCard({ signal, isWatchlist = false }: SignalCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const isBuy = signal.type?.toLowerCase() === 'buy';
  const assetClass = getAssetClassForSymbol(signal.symbol, signal.assetClass);
  const winRateColor = (signal.overallConfidence ?? 0) >= 90 
    ? 'text-emerald-600 dark:text-emerald-400' 
    : (signal.overallConfidence ?? 0) >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';

  const entryPrice = signal.entryPrice?.toString() || '—';
  const stopLoss = signal.stopLoss?.toString() || '—';
  const takeProfit = signal.takeProfit?.toString() || '—';
  const riskRewardRatio = signal.riskRewardRatio?.toString() || '—';
  
  const hasCompleteData = entryPrice !== '—' && entryPrice !== 'N/A';
  
  const borderColor = isWatchlist 
    ? 'hsl(45 93% 47%)' 
    : (isBuy ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-5))');

  return (
    <div 
      className={`bg-card border border-border relative transition-all ${isWatchlist ? 'opacity-90' : ''}`}
      style={{ borderLeftWidth: '6px', borderLeftColor: borderColor }}
      data-testid={`card-signal-${signal.id}`}
    >
      {/* Header Row: Badge + Symbol + Entry Price */}
      <div className="flex items-center justify-between gap-2 p-4 pb-3">
        <div className="flex items-center gap-3">
          <Badge 
            variant={isBuy ? 'default' : 'destructive'} 
            className="px-3 py-1 text-xs font-bold uppercase tracking-wider"
            data-testid={`badge-type-${signal.id}`}
          >
            {signal.type}
          </Badge>
          <h3 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight" data-testid={`text-symbol-${signal.id}`}>
            {signal.symbol}
          </h3>
        </div>
        {hasCompleteData && (
          <div className="text-right">
            <span className="text-[10px] uppercase text-muted-foreground block">Entry</span>
            <span className="text-sm font-bold tabular-nums">{entryPrice}</span>
          </div>
        )}
      </div>

      {/* Current Price Section */}
      {hasCompleteData ? (
        <div className="px-4 pb-3">
          <LivePriceWithEntry 
            symbol={signal.symbol}
            assetClass={assetClass}
            entryPrice={signal.entryPrice}
            signalType={signal.type}
          />
        </div>
      ) : (
        <div className="px-4 pb-3 text-sm font-medium text-amber-600 dark:text-amber-400">
          Bias awaiting confirmation or entry.
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border mx-4" />

      {/* Trade Levels: Stop | Target | R:R */}
      {hasCompleteData && (
        <div className="grid grid-cols-3 gap-2 px-4 py-3 text-center">
          <div>
            <span className="text-[10px] uppercase text-muted-foreground block mb-1">Stop</span>
            <span className="text-sm font-semibold text-destructive tabular-nums">{stopLoss}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-muted-foreground block mb-1">Target</span>
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{takeProfit}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-muted-foreground block mb-1">R:R</span>
            <span className="text-base font-extrabold tabular-nums">{riskRewardRatio}</span>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border mx-4" />

      {/* Footer: Timeframe + Time + Details Button */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-bold uppercase">{signal.primaryTimeframe || '4H'}</span>
          {signal.createdAt && (
            <span className="flex items-center gap-1" data-testid={`time-ago-${signal.id}`}>
              <Clock className="w-3 h-3" />
              {formatTimeAgo(signal.createdAt)}
            </span>
          )}
        </div>
        
        <button 
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-blue-600 transition-colors hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400 uppercase tracking-wide"
          data-testid={`button-details-${signal.id}`}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Hide Details
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show Details
            </>
          )}
        </button>
      </div>

      {/* Expanded Details Section */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border animate-in fade-in duration-200">
          <div className="space-y-4">
            {/* Market Context */}
            {signal.marketContext && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Market Context
                </h4>
                <p className="text-sm">{signal.marketContext}</p>
              </div>
            )}

            {/* Technical Reasons */}
            {signal.technicalReasons && signal.technicalReasons.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <Target className="w-3 h-3" /> Technical Reasons
                </h4>
                <ul className="text-sm space-y-1">
                  {signal.technicalReasons.map((reason: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-blue-500">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* SMC Factors */}
            {signal.smcFactors && signal.smcFactors.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <Shield className="w-3 h-3" /> SMC Factors
                </h4>
                <ul className="text-sm space-y-1">
                  {signal.smcFactors.map((factor: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-blue-500">•</span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Additional Stats */}
            <div className="space-y-1">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                <BarChart2 className="w-3 h-3" /> Signal Stats
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {signal.overallConfidence && (
                  <div>
                    <span className="text-muted-foreground">Confidence:</span>
                    <span className={`ml-1 font-semibold ${winRateColor}`}>{signal.overallConfidence}%</span>
                  </div>
                )}
                {signal.trendStrength && (
                  <div>
                    <span className="text-muted-foreground">Trend:</span>
                    <span className="ml-1 font-semibold">{signal.trendStrength}</span>
                  </div>
                )}
                {signal.trendDirection && (
                  <div>
                    <span className="text-muted-foreground">Direction:</span>
                    <span className="ml-1 font-semibold">{signal.trendDirection}</span>
                  </div>
                )}
                {signal.orderBlockType && (
                  <div>
                    <span className="text-muted-foreground">Order Block:</span>
                    <span className="ml-1 font-semibold">{signal.orderBlockType}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
