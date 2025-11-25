import { useState } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign,
  Info,
  TrendingUp,
  TrendingDown,
  Clock,
  ChevronDown,
  ChevronUp,
  Target,
  BarChart2,
  Shield
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TradingSignal } from '@shared/schema';

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

interface StockSignalCardProps {
  signal: TradingSignal;
}

const StatBlock = ({ label, value, colorClass = "text-foreground", icon: Icon }: any) => (
  <div className="flex flex-col min-w-0">
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
      {Icon && <Icon className="w-3 h-3" />} {label}
    </span>
    <span className={`text-sm font-extrabold ${colorClass} break-all tabular-nums`}>{value}</span>
  </div>
);

export default function StockSignalCard({ signal }: StockSignalCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const isBuy = signal.type?.toLowerCase() === 'buy';
  const trendColor = isBuy ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400';
  const TrendIcon = isBuy ? TrendingUp : TrendingDown;
  const winRateColor = (signal.overallConfidence ?? 0) >= 90 
    ? 'text-emerald-600 dark:text-emerald-400' 
    : (signal.overallConfidence ?? 0) >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';

  const entryPrice = signal.entryPrice?.toString() || '—';
  const stopLoss = signal.stopLoss?.toString() || '—';
  const takeProfit = signal.takeProfit?.toString() || '—';
  
  const hasCompleteData = entryPrice !== '—' && entryPrice !== 'N/A';

  return (
    <div 
      className="bg-card border-l-4 border-r border-b border-border p-0 relative group transition-all cursor-pointer" 
      style={{ borderLeftColor: isBuy ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-5))' }}
      data-testid={`card-stock-${signal.id}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="p-6 grid grid-cols-1 md:grid-cols-12 items-center gap-4 md:gap-8">
        
        {/* Ticker, Name, Type (Col 1-3) */}
        <div className="md:col-span-3 flex flex-col gap-2">
          <Badge 
            variant={isBuy ? 'default' : 'destructive'} 
            className="w-fit px-3 py-1 text-xs font-bold uppercase tracking-widest"
            data-testid={`badge-type-${signal.id}`}
          >
            {signal.type}
          </Badge>
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-extrabold text-foreground tracking-tight" data-testid={`text-symbol-${signal.id}`}>
              {signal.symbol}
            </h3>
            <TrendIcon className={`w-5 h-5 ${trendColor}`} />
          </div>
        </div>

        {/* Stats Grid (Col 4-9) */}
        <div className="md:col-span-6 flex flex-wrap gap-4 border-l border-r border-border px-4 md:px-8 py-2">
          {hasCompleteData ? (
            <>
              <div className="flex-1 min-w-[100px]">
                <StatBlock 
                  label="Entry" 
                  value={entryPrice} 
                  icon={DollarSign} 
                />
              </div>
              <div className="flex-1 min-w-[100px]">
                <StatBlock 
                  label="Stop" 
                  value={stopLoss} 
                  colorClass="text-destructive" 
                  icon={ArrowDownRight} 
                />
              </div>
              <div className="flex-1 min-w-[100px]">
                <StatBlock 
                  label="Target" 
                  value={takeProfit} 
                  colorClass="text-emerald-600 dark:text-emerald-400" 
                  icon={ArrowUpRight} 
                />
              </div>
            </>
          ) : (
            <div className="w-full text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center">
              <Info className="w-4 h-4 mr-2" /> Waiting for activation price.
            </div>
          )}
        </div>

        {/* Timeframe, Time Ago and Chevron (Col 10-12) */}
        <div className="md:col-span-3 flex flex-col items-start md:items-end gap-2 pt-2">
          <div className="flex items-center gap-3">
            <div className="text-sm font-bold text-muted-foreground uppercase">
              {signal.primaryTimeframe || '4H'}
            </div>
            
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          
          {signal.createdAt && (
            <div 
              className="text-xs text-muted-foreground flex items-center gap-1"
              data-testid={`time-ago-${signal.id}`}
            >
              <Clock className="w-3 h-3" />
              {formatTimeAgo(signal.createdAt)}
            </div>
          )}
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
                {signal.riskRewardRatio && (
                  <div>
                    <span className="text-muted-foreground">R:R:</span>
                    <span className="ml-2 font-semibold">{signal.riskRewardRatio}</span>
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
