import { useState } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  BarChart2, 
  DollarSign,
  Info,
  Clock,
  ChevronUp,
  Target,
  TrendingUp,
  Shield,
  Activity
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
  if (diffMins < 60) return `${diffMins} min ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
};

interface SignalCardProps {
  signal: TradingSignal;
  isWatchlist?: boolean;
}

const StatBlock = ({ label, value, colorClass = "text-foreground", icon: Icon }: any) => (
  <div className="flex flex-col min-w-0">
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
      {Icon && <Icon className="w-3 h-3" />} {label}
    </span>
    <span className={`text-sm font-extrabold ${colorClass} break-all tabular-nums`}>{value}</span>
  </div>
);

const DetailsIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="2" y="4" width="4" height="4"/>
    <rect x="8" y="4" width="14" height="4"/>
    <rect x="2" y="14" width="4" height="4"/>
    <rect x="8" y="14" width="14" height="4"/>
  </svg>
);

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

  return (
    <div 
      className={`bg-card border-l-4 border-r border-b border-border p-0 relative group transition-all ${isWatchlist ? 'opacity-80 bg-amber-500/5' : ''}`}
      style={{ borderLeftColor: isWatchlist ? 'hsl(45 93% 47%)' : (isBuy ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-5))') }}
      data-testid={`card-signal-${signal.id}`}
    >
      <div className="p-6 grid grid-cols-1 md:grid-cols-12 items-center gap-4 md:gap-8">
        
        {/* Signal Pair and Type (Col 1-3) */}
        <div className="md:col-span-3 flex flex-col gap-2">
          <Badge 
            variant={isBuy ? 'default' : 'destructive'} 
            className="w-fit px-3 py-1 text-xs font-bold uppercase tracking-widest"
            data-testid={`badge-type-${signal.id}`}
          >
            {signal.type}
          </Badge>
          <h3 className="text-2xl font-extrabold text-foreground tracking-tight" data-testid={`text-symbol-${signal.id}`}>
            {signal.symbol}
          </h3>
        </div>

        {/* Stats Grid (Col 4-9) */}
        <div className="md:col-span-6 flex flex-wrap gap-4 border-l border-r border-border px-4 md:px-8 py-2">
          {hasCompleteData ? (
            <>
              <div className="flex-1 min-w-[90px]">
                <LivePriceWithEntry 
                  symbol={signal.symbol}
                  assetClass={assetClass}
                  entryPrice={signal.entryPrice}
                  signalType={signal.type}
                />
              </div>
              <div className="flex-1 min-w-[80px]">
                <StatBlock 
                  label="Entry" 
                  value={entryPrice} 
                  icon={DollarSign} 
                />
              </div>
              <div className="flex-1 min-w-[80px]">
                <StatBlock 
                  label="Stop" 
                  value={stopLoss} 
                  colorClass="text-destructive" 
                  icon={ArrowDownRight} 
                />
              </div>
              <div className="flex-1 min-w-[80px]">
                <StatBlock 
                  label="Target" 
                  value={takeProfit} 
                  colorClass="text-emerald-600 dark:text-emerald-400" 
                  icon={ArrowUpRight} 
                />
              </div>
              <div className="flex-1 min-w-[60px]">
                <StatBlock 
                  label="R:R" 
                  value={riskRewardRatio} 
                  icon={BarChart2} 
                  colorClass="text-foreground" 
                />
              </div>
            </>
          ) : (
            <div className="w-full text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center">
              <Info className="w-4 h-4 mr-2" /> Bias awaiting confirmation or entry.
            </div>
          )}
        </div>

        {/* Timeframe, Time Ago and Details Button (Col 10-12) */}
        <div className="md:col-span-3 flex flex-col items-start md:items-end gap-2 pt-2">
          {/* Timeframe */}
          <div className="text-sm font-bold text-muted-foreground uppercase">
            {signal.primaryTimeframe || '4H'}
          </div>
          
          {/* Time Since Posted */}
          {signal.createdAt && (
            <div 
              className="text-xs text-muted-foreground flex items-center gap-1"
              data-testid={`time-ago-${signal.id}`}
            >
              <Clock className="w-3 h-3" />
              {formatTimeAgo(signal.createdAt)}
            </div>
          )}
          
          {/* Enhanced Details Button */}
          <button 
            className="flex items-center justify-center px-4 py-2 text-sm font-bold text-white bg-blue-600 shadow-lg transition-all duration-300 ease-in-out transform hover:bg-blue-700 hover:scale-[1.02] hover:shadow-xl active:bg-blue-800 active:scale-100 focus:outline-none focus:ring-4 focus:ring-blue-300 focus:ring-opacity-50 lowercase"
            data-testid={`button-details-${signal.id}`}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-5 h-5 mr-2" />
                hide details
              </>
            ) : (
              <>
                <DetailsIcon className="w-5 h-5 mr-2" />
                show details
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expanded Details Section */}
      {isExpanded && (
        <div className="px-6 pb-6 pt-2 border-t border-border animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Market Context */}
            {signal.marketContext && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Market Context
                </h4>
                <p className="text-sm">{signal.marketContext}</p>
              </div>
            )}

            {/* Technical Reasons */}
            {signal.technicalReasons && signal.technicalReasons.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <Target className="w-3 h-3" /> Technical Reasons
                </h4>
                <ul className="text-sm space-y-1">
                  {signal.technicalReasons.map((reason: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* SMC Factors */}
            {signal.smcFactors && signal.smcFactors.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <Shield className="w-3 h-3" /> SMC Factors
                </h4>
                <ul className="text-sm space-y-1">
                  {signal.smcFactors.map((factor: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Additional Stats */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                <BarChart2 className="w-3 h-3" /> Signal Stats
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {signal.overallConfidence && (
                  <div>
                    <span className="text-muted-foreground">Confidence:</span>
                    <span className={`ml-2 font-semibold ${winRateColor}`}>{signal.overallConfidence}%</span>
                  </div>
                )}
                {signal.trendStrength && (
                  <div>
                    <span className="text-muted-foreground">Trend:</span>
                    <span className="ml-2 font-semibold">{signal.trendStrength}</span>
                  </div>
                )}
                {signal.trendDirection && (
                  <div>
                    <span className="text-muted-foreground">Direction:</span>
                    <span className="ml-2 font-semibold">{signal.trendDirection}</span>
                  </div>
                )}
                {signal.orderBlockType && (
                  <div>
                    <span className="text-muted-foreground">Order Block:</span>
                    <span className="ml-2 font-semibold">{signal.orderBlockType}</span>
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
