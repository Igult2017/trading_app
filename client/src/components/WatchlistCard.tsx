import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Eye,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      className="bg-card border-b border-r border-l border-border p-0 group hover:bg-muted/50 transition-colors grid grid-cols-12 items-center text-foreground"
      data-testid={`card-watchlist-${item.id}`}
    >
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

      {/* Price and Time (Col 5-7) */}
      <div className="col-span-3 py-4 px-6 border-l border-border">
        <div className="text-xl font-extrabold" data-testid={`text-price-${item.id}`}>
          {currentPrice}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" /> 
          {item.createdAt ? formatTimeAgo(item.createdAt) : 'Monitoring'}
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

          {/* Action (Col 11-12) */}
          <div className="col-span-2 py-4 px-3 border-l border-border flex justify-end">
            <Button 
              size="sm" 
              variant="default"
              className="px-3 py-1 text-xs font-bold uppercase tracking-wider"
              data-testid={`button-details-${item.id}`}
            >
              <Eye className="w-4 h-4 mr-1" />
              Details
            </Button>
          </div>
        </>
      ) : (
        /* Action (Col 8-12) - Full width when no probability shown */
        <div className="col-span-5 py-4 px-3 border-l border-border flex justify-end">
          <Button 
            size="sm" 
            variant="default"
            className="px-3 py-1 text-xs font-bold uppercase tracking-wider"
            data-testid={`button-details-${item.id}`}
          >
            <Eye className="w-4 h-4 mr-1" />
            Details
          </Button>
        </div>
      )}
    </div>
  );
}
