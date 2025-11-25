import { useState } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock,
  ChevronUp,
  Target,
  TrendingUp,
  Shield,
  BarChart2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PendingSetup } from '@shared/schema';
import LivePriceDisplay from './LivePriceDisplay';

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

export default function WatchlistCard({ item, showProbability = false }: WatchlistCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const assetClass = getAssetClassForSymbol(item.symbol, item.assetClass);
  
  const priority = item.setupStage === 'ready' ? 'HIGH' : 'MEDIUM';
  const isHighPriority = priority === 'HIGH';
  const priorityBadgeClass = isHighPriority 
    ? 'bg-destructive text-destructive-foreground border-destructive' 
    : 'bg-amber-600 text-white dark:bg-amber-700 dark:text-white border-amber-600 dark:border-amber-700';

  return (
    <div 
      className="bg-card border-b border-r border-l border-border p-0 group transition-colors"
      data-testid={`card-watchlist-${item.id}`}
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

        {/* Live Price (Col 5-7) */}
        <div className="col-span-3 py-4 px-6 border-l border-border">
          <LivePriceDisplay 
            symbol={item.symbol} 
            assetClass={assetClass}
            size="md"
            showChange={true}
          />
        </div>

        {showProbability ? (
          <>
            {/* Priority Level (Col 8-10) - Only shown when showProbability is true */}
            <div className="col-span-3 py-4 px-6 border-l border-border flex flex-col justify-center">
              <Badge className={`w-fit px-3 py-1 text-xs font-bold uppercase tracking-widest border ${priorityBadgeClass}`}>
                {priority}
              </Badge>
            </div>

            {/* Time and Details Button (Col 11-12) */}
            <div className="col-span-2 py-4 px-3 border-l border-border flex flex-col items-end gap-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> 
                {item.createdAt ? formatTimeAgo(item.createdAt) : 'Monitoring'}
              </div>
              {/* Enhanced Details Button */}
              <button 
                className="flex items-center justify-center px-3 py-1.5 text-xs font-bold text-white bg-blue-600 shadow-lg transition-all duration-300 ease-in-out transform hover:bg-blue-700 hover:scale-[1.02] hover:shadow-xl active:bg-blue-800 active:scale-100 focus:outline-none focus:ring-4 focus:ring-blue-300 focus:ring-opacity-50 lowercase"
                data-testid={`button-details-${item.id}`}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-1" />
                    hide
                  </>
                ) : (
                  <>
                    <DetailsIcon className="w-4 h-4 mr-1" />
                    details
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          /* Time and Details Button (Col 8-12) - Full width when no probability shown */
          <div className="col-span-5 py-4 px-3 border-l border-border flex flex-col items-end gap-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> 
              {item.createdAt ? formatTimeAgo(item.createdAt) : 'Monitoring'}
            </div>
            {/* Enhanced Details Button */}
            <button 
              className="flex items-center justify-center px-3 py-1.5 text-xs font-bold text-white bg-blue-600 shadow-lg transition-all duration-300 ease-in-out transform hover:bg-blue-700 hover:scale-[1.02] hover:shadow-xl active:bg-blue-800 active:scale-100 focus:outline-none focus:ring-4 focus:ring-blue-300 focus:ring-opacity-50 lowercase"
              data-testid={`button-details-${item.id}`}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-1" />
                  hide
                </>
              ) : (
                <>
                  <DetailsIcon className="w-4 h-4 mr-1" />
                  details
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Expanded Details Section */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-3 border-t border-border animate-in fade-in duration-200">
          <div className="space-y-3">
            {/* Market Context */}
            {item.marketContext && (
              <div className="space-y-1">
                <h4 className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Market Context
                </h4>
                <p className="text-xs leading-relaxed">{item.marketContext}</p>
              </div>
            )}

            {/* Setup Notes */}
            {item.setupNotes && item.setupNotes.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <Target className="w-3 h-3" /> Setup Notes
                </h4>
                <ul className="text-xs space-y-0.5">
                  {item.setupNotes.map((note: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-1">
                      <span className="text-primary">•</span>
                      <span className="break-words">{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Confirmations Pending */}
            {item.confirmationsPending && item.confirmationsPending.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Confirmations Pending
                </h4>
                <ul className="text-xs space-y-0.5">
                  {item.confirmationsPending.map((conf: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-1">
                      <span className="text-amber-500">•</span>
                      <span className="break-words">{conf}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Setup Stats */}
            <div className="space-y-1">
              <h4 className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
                <BarChart2 className="w-3 h-3" /> Setup Stats
              </h4>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <div>
                  <span className="text-muted-foreground">Stage:</span>
                  <span className="ml-1 font-semibold capitalize">{item.setupStage}</span>
                </div>
                {item.trendBias && (
                  <div>
                    <span className="text-muted-foreground">Trend:</span>
                    <span className="ml-1 font-semibold">{item.trendBias}</span>
                  </div>
                )}
                {item.chochDetected && (
                  <div>
                    <span className="text-muted-foreground">CHOCH:</span>
                    <span className="ml-1 font-semibold text-emerald-500">Yes</span>
                  </div>
                )}
                {item.liquiditySweepDetected && (
                  <div>
                    <span className="text-muted-foreground">Sweep:</span>
                    <span className="ml-1 font-semibold text-emerald-500">Yes</span>
                  </div>
                )}
                {item.zoneLevel && (
                  <div>
                    <span className="text-muted-foreground">Zone:</span>
                    <span className="ml-1 font-semibold">{item.zoneLevel}</span>
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
