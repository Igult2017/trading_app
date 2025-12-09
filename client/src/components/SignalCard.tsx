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

const formatPrice = (price: number | string | null | undefined): string => {
  if (price === null || price === undefined) return '—';
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) return '—';
  return num.toFixed(4);
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
  const hasCompleteData = entryPrice !== '—' && entryPrice !== 'N/A';

  return (
    <div 
      className={`p-6 sm:p-8 space-y-6 ${isWatchlist ? 'opacity-90' : ''}`}
      data-testid={`card-signal-${signal.id}`}
    >
      {/* Context / Status Bar */}
      {signal.marketContext && (
        <div className="text-xs text-muted-foreground font-medium leading-relaxed border-b border-border pb-4">
          {signal.marketContext}
        </div>
      )}

      {/* Header Section: Action, Pair, and Entry */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 gap-3">
        {/* Clickable Area (Action + Pair) */}
        <div 
          className="group flex items-center gap-3 cursor-pointer transition duration-200"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* Action Indicator */}
          <span 
            className={`inline-flex items-center px-3 py-1 text-sm font-semibold text-white shadow-md ${
              isBuy ? 'bg-emerald-600' : 'bg-red-600'
            }`}
            data-testid={`badge-type-${signal.id}`}
          >
            {signal.type}
          </span>
          {/* Trading Pair */}
          <h1 
            className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight group-hover:underline"
            data-testid={`text-symbol-${signal.id}`}
          >
            {signal.symbol}
          </h1>
        </div>
        
        {/* Entry Status */}
        {hasCompleteData && (
          <div className="text-right">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Entry</p>
            <p className="text-2xl font-bold text-foreground">{entryPrice}</p>
          </div>
        )}
      </div>

      {/* Current Price and Timeframe Bar */}
      <div className="border-y border-border py-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        {/* Current Price */}
        <div>
          <p className="text-sm font-semibold text-muted-foreground uppercase mb-1">Current Price</p>
          {hasCompleteData ? (
            <LivePriceWithEntry 
              symbol={signal.symbol}
              assetClass={assetClass}
              entryPrice={signal.entryPrice}
              signalType={signal.type}
            />
          ) : (
            <p className="text-4xl font-bold text-foreground">---</p>
          )}
        </div>
        {/* Timeframe and Age */}
        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
          <span className="px-2 py-0.5 bg-muted text-foreground rounded text-xs font-mono font-semibold">
            {signal.primaryTimeframe || '4H'}
          </span>
          {signal.createdAt && (
            <span className="flex items-center" data-testid={`time-ago-${signal.id}`}>
              <Clock className="w-4 h-4 mr-1 text-muted-foreground" />
              {formatTimeAgo(signal.createdAt)}
            </span>
          )}
        </div>
      </div>

      {/* Metrics Grid: Stop, Target, R.R., Net Gain */}
      {hasCompleteData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
          {/* Stop Price */}
          <div className="p-4 bg-red-50/50 dark:bg-red-950/30 rounded-lg border-l-4 border-red-500 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Stop</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400 truncate tabular-nums">
              {formatPrice(signal.stopLoss)}
            </p>
          </div>

          {/* Target Price */}
          <div className="p-4 bg-green-50/50 dark:bg-green-950/30 rounded-lg border-l-4 border-green-500 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Target</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400 truncate tabular-nums">
              {formatPrice(signal.takeProfit)}
            </p>
          </div>

          {/* Risk/Reward Ratio */}
          <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-lg col-span-2 md:col-span-1 border-l-4 border-indigo-500 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">R.R.</p>
            <p className="text-3xl font-extrabold text-indigo-700 dark:text-indigo-400 tabular-nums">
              {signal.riskRewardRatio?.toString() || '—'}
            </p>
          </div>

          {/* Net Gain Placeholder */}
          <div className="hidden md:block p-4 bg-muted/50 rounded-lg border-l-4 border-muted-foreground/40 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Net Gain</p>
            <p className="text-xl font-bold text-muted-foreground">
              --.--
            </p>
          </div>
        </div>
      )}

      {/* No entry data message */}
      {!hasCompleteData && (
        <div className="text-sm font-medium text-amber-600 dark:text-amber-400 py-2">
          Bias awaiting confirmation or entry.
        </div>
      )}

      {/* Show Details Button */}
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

      {/* Expanded Details Section */}
      {isExpanded && (
        <div className="pt-4 border-t border-border animate-in fade-in duration-200">
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
