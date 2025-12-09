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
import type { PendingSetup } from '@shared/schema';
import LivePriceDisplay from './LivePriceDisplay';

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

interface WatchlistCardProps {
  item: PendingSetup;
  showProbability?: boolean;
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

export default function WatchlistCard({ item, showProbability = false }: WatchlistCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const assetClass = getAssetClassForSymbol(item.symbol, item.assetClass);
  
  const priority = item.setupStage === 'ready' ? 'HIGH' : 'MEDIUM';
  const isHighPriority = priority === 'HIGH';

  return (
    <div 
      className="bg-card border border-border relative transition-all"
      style={{ borderLeftWidth: '6px', borderLeftColor: 'hsl(45 93% 47%)' }}
      data-testid={`card-watchlist-${item.id}`}
    >
      {/* Header Row: Symbol + Timeframe + Priority */}
      <div className="flex items-center justify-between gap-2 p-4 pb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight" data-testid={`text-symbol-${item.id}`}>
            {item.symbol}
          </h3>
          <span className="text-xs text-muted-foreground font-medium">
            {item.primaryTimeframe || '—'}
          </span>
        </div>
        {showProbability && (
          <Badge 
            className={`px-3 py-1 text-xs font-bold uppercase tracking-wider ${
              isHighPriority 
                ? 'bg-destructive text-destructive-foreground' 
                : 'bg-amber-600 text-white dark:bg-amber-700'
            }`}
          >
            {priority}
          </Badge>
        )}
      </div>

      {/* Setup Note */}
      {(item.setupNotes && item.setupNotes.length > 0) || item.marketContext ? (
        <div className="px-4 pb-3">
          <p className="text-sm text-muted-foreground italic line-clamp-2">
            {(item.setupNotes && item.setupNotes.length > 0) ? item.setupNotes[0] : item.marketContext}
          </p>
        </div>
      ) : null}

      {/* Divider */}
      <div className="border-t border-border mx-4" />

      {/* Current Price Section */}
      <div className="px-4 py-3">
        <LivePriceDisplay 
          symbol={item.symbol} 
          assetClass={assetClass}
          size="md"
          showChange={true}
        />
      </div>

      {/* Divider */}
      <div className="border-t border-border mx-4" />

      {/* Footer: Time + Details Button */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-end text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {item.createdAt ? formatTimeAgo(item.createdAt) : 'Monitoring'}
          </span>
        </div>
        
        <button 
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-blue-600 transition-colors hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400 uppercase tracking-wide"
          data-testid={`button-details-${item.id}`}
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
            {item.marketContext && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Market Context
                </h4>
                <p className="text-sm">{item.marketContext}</p>
              </div>
            )}

            {/* Setup Notes */}
            {item.setupNotes && item.setupNotes.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                  <Target className="w-3 h-3" /> Setup Notes
                </h4>
                <ul className="text-sm space-y-1">
                  {item.setupNotes.map((note: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-blue-500">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Confirmations Pending */}
            {item.confirmationsPending && item.confirmationsPending.length > 0 && (
              <div className="space-y-1">
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
            <div className="space-y-1">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                <BarChart2 className="w-3 h-3" /> Setup Stats
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
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
