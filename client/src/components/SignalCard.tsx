import { useState } from 'react';
import { 
  Clock,
  Target,
  TrendingUp,
  Shield,
  BarChart2,
  Globe,
  Zap,
  ShieldCheck,
  Check
} from 'lucide-react';
import type { TradingSignal } from '@shared/schema';
import { LivePriceWithEntry, LiveNetGain } from './LivePriceDisplay';

const formatTimeAgo = (timestamp: Date | string): string => {
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

const formatPrice = (price: number | string | null | undefined, decimals: number = 5): string => {
  if (price === null || price === undefined) return '—';
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) return '—';
  return num.toFixed(decimals);
};

interface SignalCardProps {
  signal: TradingSignal;
  isWatchlist?: boolean;
}

const getAssetClassForSymbol = (symbol: string, assetClass?: string): 'stock' | 'forex' | 'commodity' | 'crypto' => {
  if (assetClass === 'crypto' || assetClass === 'cryptocurrency') return 'crypto';
  if (assetClass === 'commodity' || assetClass === 'commodities') return 'commodity';
  if (assetClass === 'forex' || assetClass === 'currency') return 'forex';
  if (assetClass === 'stock' || assetClass === 'stocks' || assetClass === 'index') return 'stock';
  
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
      {/* Header Section: Action, Pair, and Entry */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 gap-3">
        {/* Clickable Area (Action + Pair) - clicking toggles details */}
        <div 
          id={`pair-header-${signal.id}`}
          className="group flex items-center gap-3 cursor-pointer hover:opacity-80 transition duration-200"
          onClick={() => setIsExpanded(!isExpanded)}
          data-testid={`clickable-header-${signal.id}`}
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
            className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight group-hover:underline"
            data-testid={`text-symbol-${signal.id}`}
          >
            {signal.symbol}
          </h1>
        </div>
        
        {/* Entry Status */}
        {hasCompleteData && (
          <div className="text-right">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Entry</p>
            <p className="text-lg font-bold text-foreground">{entryPrice}</p>
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
            <p className="text-lg font-bold text-foreground">---</p>
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
            <p className="text-lg font-bold text-red-600 dark:text-red-400 truncate tabular-nums">
              {formatPrice(signal.stopLoss)}
            </p>
          </div>

          {/* Target Price */}
          <div className="p-4 bg-green-50/50 dark:bg-green-950/30 rounded-lg border-l-4 border-green-500 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Target</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400 truncate tabular-nums">
              {formatPrice(signal.takeProfit)}
            </p>
          </div>

          {/* Risk/Reward Ratio */}
          <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-lg col-span-2 md:col-span-1 border-l-4 border-indigo-500 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">R.R.</p>
            <p className="text-2xl font-extrabold text-indigo-700 dark:text-indigo-400 tabular-nums">
              {signal.riskRewardRatio?.toString() || '—'}
            </p>
          </div>

          {/* Net Gain */}
          <div className="p-4 rounded-lg col-span-2 md:col-span-1 bg-muted/50 border-l-4 border-muted-foreground/40 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Net Gain</p>
            <LiveNetGain
              symbol={signal.symbol}
              assetClass={assetClass}
              entryPrice={signal.entryPrice}
              signalType={signal.type}
            />
          </div>
        </div>
      )}

      {/* No entry data message */}
      {!hasCompleteData && (
        <div className="text-sm font-medium text-amber-600 dark:text-amber-400 py-2">
          Bias awaiting confirmation or entry.
        </div>
      )}

      {/* Expanded Details Section - shown when clicking on the instrument */}
      {isExpanded && (
        <div className="pt-6 border-t border-border animate-in fade-in duration-200 space-y-6">
          
          {/* Signal Stats Section - AI Generated Signal Bias Metrics */}
          <div className="bg-card p-4 sm:p-6 border border-border rounded-md">
            <h2 className="text-lg font-bold mb-4 flex items-center text-indigo-600 dark:text-indigo-400">
              <BarChart2 className="w-5 h-5 mr-2" />
              AI Generated Signal Bias Metrics
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Stat 1: Confidence */}
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 text-center rounded-md">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Confidence Level</p>
                <p className="text-4xl font-extrabold text-indigo-700 dark:text-indigo-400 mt-2 mb-2">
                  {signal.overallConfidence ?? 50}%
                </p>
                <div className="w-full bg-indigo-200 dark:bg-indigo-800 rounded-full h-2">
                  <div 
                    className="bg-indigo-500 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${signal.overallConfidence ?? 50}%` }}
                  />
                </div>
              </div>

              {/* Stat 2: Direction */}
              <div className={`p-4 text-center rounded-md border ${
                signal.trendDirection?.toLowerCase() === 'bullish' 
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' 
                  : signal.trendDirection?.toLowerCase() === 'bearish'
                  ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
              }`}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Primary Direction</p>
                <p className={`text-3xl font-extrabold mt-2 capitalize ${
                  signal.trendDirection?.toLowerCase() === 'bullish' 
                    ? 'text-emerald-700 dark:text-emerald-400' 
                    : signal.trendDirection?.toLowerCase() === 'bearish'
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}>
                  {signal.trendDirection || 'Sideways'}
                </p>
                <div className={`text-xs mt-1 ${
                  signal.trendDirection?.toLowerCase() === 'bullish' 
                    ? 'text-emerald-500' 
                    : signal.trendDirection?.toLowerCase() === 'bearish'
                    ? 'text-red-500'
                    : 'text-amber-500'
                }`}>
                  ({signal.trendDirection?.toLowerCase() === 'bullish' ? 'Uptrend' : signal.trendDirection?.toLowerCase() === 'bearish' ? 'Downtrend' : 'Consolidation Phase'})
                </div>
              </div>

              {/* Stat 3: Order Block / Zone */}
              <div className={`p-4 text-center rounded-md border ${
                signal.orderBlockType?.toLowerCase() === 'demand' 
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' 
                  : signal.orderBlockType?.toLowerCase() === 'supply'
                  ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                  : 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700'
              }`}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current Zone</p>
                <p className={`text-3xl font-extrabold mt-2 capitalize ${
                  signal.orderBlockType?.toLowerCase() === 'demand' 
                    ? 'text-emerald-700 dark:text-emerald-400' 
                    : signal.orderBlockType?.toLowerCase() === 'supply'
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-gray-700 dark:text-gray-400'
                }`}>
                  {signal.orderBlockType || 'Neutral'}
                </p>
                <div className={`text-xs mt-1 ${
                  signal.orderBlockType?.toLowerCase() === 'demand' 
                    ? 'text-emerald-500' 
                    : signal.orderBlockType?.toLowerCase() === 'supply'
                    ? 'text-red-500'
                    : 'text-gray-500'
                }`}>
                  ({signal.orderBlockType?.toLowerCase() === 'demand' ? 'Potential Bounce' : signal.orderBlockType?.toLowerCase() === 'supply' ? 'Potential Reversal' : 'No Zone'})
                </div>
              </div>
            </div>
          </div>

          {/* Analysis Grid for Context & Reasons (Responsive 3-Column Layout) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* 1. Market Context Card */}
            <div className="bg-card p-4 border border-border rounded-md">
              <div className="flex items-center text-indigo-600 dark:text-indigo-400 mb-4 border-b pb-2 border-indigo-100 dark:border-indigo-900">
                <Globe className="w-5 h-5 mr-2" />
                <h2 className="text-base font-bold">MARKET CONTEXT (MTF)</h2>
              </div>
              
              <div className="space-y-3">
                {/* Overall Status */}
                <div className="flex justify-between items-center gap-2 text-sm py-2 px-3 bg-muted/50 border border-border rounded">
                  <span className="font-semibold text-foreground">Overall Status:</span>
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${
                    isWatchlist 
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' 
                      : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  }`}>
                    {isWatchlist ? 'Watchlist' : 'Confirmed'}
                  </span>
                </div>

                {signal.marketContext && (
                  <p className="text-sm text-muted-foreground">{signal.marketContext}</p>
                )}

                <p className="text-xs font-semibold text-muted-foreground uppercase pt-1 tracking-wider">Timeframe Analysis:</p>
                
                {signal.technicalReasons && signal.technicalReasons.length > 0 && (
                  <ul className="space-y-2 text-sm">
                    {signal.technicalReasons.slice(0, 5).map((reason: string, idx: number) => (
                      <li key={idx} className="flex justify-between items-center gap-2">
                        <span className="font-medium flex items-center text-foreground">
                          <Check className="text-emerald-500 w-4 h-4 mr-1" />
                          {reason.split(':')[0] || `TF ${idx + 1}`}:
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground truncate max-w-[140px]">
                          {reason.includes(':') ? reason.split(':').slice(1).join(':').trim() : reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* 2. Technical Indicators Card */}
            <div className="bg-card p-4 border border-border rounded-md">
              <div className="flex items-center text-emerald-600 dark:text-emerald-400 mb-4 border-b pb-2 border-emerald-100 dark:border-emerald-900">
                <Zap className="w-5 h-5 mr-2" />
                <h2 className="text-base font-bold">TECHNICAL INDICATORS</h2>
              </div>
              
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase pt-1 tracking-wider">Key Confirmation Signals:</p>
                
                <ul className="space-y-2 text-sm">
                  {/* Trend Strength */}
                  <li className="flex justify-between items-center border-b pb-2 border-dashed border-border">
                    <span className="font-medium text-foreground">Trend (ADX):</span>
                    <span className={`font-semibold ${
                      signal.trendStrength?.toLowerCase() === 'strong' 
                        ? 'text-emerald-600 dark:text-emerald-400' 
                        : signal.trendStrength?.toLowerCase() === 'weak'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-muted-foreground'
                    }`}>
                      {signal.trendStrength || 'Moderate'}
                    </span>
                  </li>
                  {/* Momentum */}
                  <li className="flex justify-between items-center border-b pb-2 border-dashed border-border">
                    <span className="font-medium text-foreground">Momentum (RSI):</span>
                    <span className={`font-semibold ${
                      signal.trendDirection?.toLowerCase() === 'bullish' 
                        ? 'text-emerald-600 dark:text-emerald-400' 
                        : signal.trendDirection?.toLowerCase() === 'bearish'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      {signal.trendDirection?.toLowerCase() === 'bullish' ? 'Rising' : signal.trendDirection?.toLowerCase() === 'bearish' ? 'Falling' : 'Neutral'}
                    </span>
                  </li>
                  {/* Volume */}
                  <li className="flex justify-between items-center border-b pb-2 border-dashed border-border">
                    <span className="font-medium text-foreground">Volume (OBV):</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {(signal.overallConfidence ?? 0) >= 70 ? 'Confirmed' : 'Pending'}
                    </span>
                  </li>
                  {/* Structure */}
                  <li className="flex justify-between items-center">
                    <span className="font-medium text-foreground">Structure:</span>
                    <span className="font-semibold text-muted-foreground">
                      {signal.type?.toLowerCase() === 'buy' ? 'Higher Highs' : signal.type?.toLowerCase() === 'sell' ? 'Lower Lows' : 'Range'}
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* 3. SMC Framework Card */}
            <div className="bg-card p-4 border border-border rounded-md">
              <div className="flex items-center text-purple-600 dark:text-purple-400 mb-4 border-b pb-2 border-purple-100 dark:border-purple-900">
                <ShieldCheck className="w-5 h-5 mr-2" />
                <h2 className="text-base font-bold">SMC FRAMEWORK</h2>
              </div>
              
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase pt-1 tracking-wider">Structural Conditions:</p>
                
                {signal.smcFactors && signal.smcFactors.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {signal.smcFactors.map((factor: string, idx: number) => (
                      <li key={idx} className="flex items-start">
                        <span className="text-purple-600 dark:text-purple-400 mr-2 flex-shrink-0 pt-0.5">&#x2022;</span>
                        <span className="text-foreground">{factor}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start">
                      <span className="text-purple-600 dark:text-purple-400 mr-2 flex-shrink-0 pt-0.5">&#x2022;</span>
                      <span className="text-foreground">
                        Price approaching {signal.orderBlockType?.toLowerCase() === 'demand' ? 'demand' : 'supply'} zone
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-600 dark:text-purple-400 mr-2 flex-shrink-0 pt-0.5">&#x2022;</span>
                      <span className="text-foreground">
                        {signal.type?.toLowerCase() === 'buy' ? 'Bullish' : 'Bearish'} structure on {signal.primaryTimeframe || '4H'} timeframe
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-600 dark:text-purple-400 mr-2 flex-shrink-0 pt-0.5">&#x2022;</span>
                      <span className="text-foreground">
                        {isWatchlist ? 'Awaiting entry confirmation' : 'Entry confirmed'}
                      </span>
                    </li>
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
