import { useState } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock,
  ChevronDown,
  ChevronUp,
  Target,
  TrendingUp,
  Shield,
  BarChart2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PendingSetup } from '@shared/schema';

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

interface WatchlistCardProps {
  item: PendingSetup;
  showProbability?: boolean;
}

export default function WatchlistCard({ item, showProbability = false }: WatchlistCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const currentPrice = item.currentPrice?.toString() || '—';
  const isPriceUp = parseFloat(currentPrice) > 0;
  const changeColor = isPriceUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  const ChangeIcon = isPriceUp ? ArrowUpRight : ArrowDownRight;
  
  const priority = item.setupStage === 'ready' ? 'HIGH' : 'MEDIUM';
  const isHighPriority = priority === 'HIGH';
  const priorityBadgeClass = isHighPriority 
    ? 'bg-destructive text-destructive-foreground border-destructive' 
    : 'bg-amber-600 text-white dark:bg-amber-700 dark:text-white border-amber-600 dark:border-amber-700';

  return (
    <div 
      className="bg-card border-b border-r border-l border-border p-0 group transition-colors cursor-pointer"
      data-testid={`card-watchlist-${item.id}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="grid grid-cols-12 items-center text-foreground">
        {/* Pair and Type (Col 1-4) */}
        <div className="col-span-4 py-4 px-6 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold tracking-tight" data-testid={`text-symbol-${item.id}`}>
              {item.symbol}
            </h3>
            <span className="text-xs text-muted-foreground font-medium">
              ({item.primaryTimeframe || '—'})
            </span>
          </div>
          <p className="text-xs text-muted-foreground italic line-clamp-1">
            {(item.setupNotes && item.setupNotes.length > 0) ? item.setupNotes[0] : (item.marketContext || 'Monitoring for setup')}
          </p>
        </div>

        {/* Price (Col 5-7) */}
        <div className="col-span-3 py-4 px-6 border-l border-border">
          <div className="text-xl font-extrabold" data-testid={`text-price-${item.id}`}>
            {currentPrice}
          </div>
        </div>

        {showProbability ? (
          <>
            {/* Priority Level (Col 8-10) - Only shown when showProbability is true */}
            <div className="col-span-3 py-4 px-6 border-l border-border flex flex-col justify-center">
              <Badge className={`w-fit px-3 py-1 text-xs font-bold uppercase tracking-widest border ${priorityBadgeClass}`}>
                {priority}
              </Badge>
            </div>

            {/* Time and Chevron (Col 11-12) */}
            <div className="col-span-2 py-4 px-3 border-l border-border flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 
                  {item.createdAt ? formatTimeAgo(item.createdAt) : 'Monitoring'}
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </>
        ) : (
          /* Time and Chevron (Col 8-12) - Full width when no probability shown */
          <div className="col-span-5 py-4 px-3 border-l border-border flex items-center justify-end gap-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> 
              {item.createdAt ? formatTimeAgo(item.createdAt) : 'Monitoring'}
            </div>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {/* Expanded Details Section */}
      {isExpanded && (
        <div className="px-6 pb-4 pt-2 border-t border-border animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Market Context */}
            {item.marketContext && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Market Context
                </h4>
                <p className="text-sm">{item.marketContext}</p>
              </div>
            )}

            {/* Setup Notes */}
            {item.setupNotes && item.setupNotes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <Target className="w-3 h-3" /> Setup Notes
                </h4>
                <ul className="text-sm space-y-1">
                  {item.setupNotes.map((note: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Confirmations Pending */}
            {item.confirmationsPending && item.confirmationsPending.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Confirmations Pending
                </h4>
                <ul className="text-sm space-y-1">
                  {item.confirmationsPending.map((conf: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-amber-500">•</span>
                      <span>{conf}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Setup Stats */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                <BarChart2 className="w-3 h-3" /> Setup Stats
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Stage:</span>
                  <span className="ml-2 font-semibold capitalize">{item.setupStage}</span>
                </div>
                {item.trendBias && (
                  <div>
                    <span className="text-muted-foreground">Trend:</span>
                    <span className="ml-2 font-semibold">{item.trendBias}</span>
                  </div>
                )}
                {item.chochDetected && (
                  <div>
                    <span className="text-muted-foreground">CHOCH:</span>
                    <span className="ml-2 font-semibold text-emerald-500">Detected</span>
                  </div>
                )}
                {item.liquiditySweepDetected && (
                  <div>
                    <span className="text-muted-foreground">Liquidity Sweep:</span>
                    <span className="ml-2 font-semibold text-emerald-500">Yes</span>
                  </div>
                )}
                {item.zoneLevel && (
                  <div>
                    <span className="text-muted-foreground">Zone Level:</span>
                    <span className="ml-2 font-semibold">{item.zoneLevel}</span>
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
