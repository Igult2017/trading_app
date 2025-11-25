import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Eye, 
  Target
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PendingSetup } from '@shared/schema';

interface WatchlistCardProps {
  item: PendingSetup;
}

export default function WatchlistCard({ item }: WatchlistCardProps) {
  const currentPrice = item.currentPrice?.toString() || '—';
  const zoneLevel = item.zoneLevel?.toString() || null;
  const isPriceUp = parseFloat(currentPrice) > 0;
  const changeColor = isPriceUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  const ChangeIcon = isPriceUp ? ArrowUpRight : ArrowDownRight;
  
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

      {/* Price and Change (Col 5-7) */}
      <div className="col-span-3 py-4 px-6 border-l border-border">
        <div className="text-xl font-extrabold" data-testid={`text-price-${item.id}`}>
          {currentPrice}
        </div>
        <div className={`text-xs font-bold flex items-center gap-1 ${changeColor}`}>
          <ChangeIcon className="w-3 h-3" /> 
          Monitoring
        </div>
      </div>

      {/* Key Level (Col 8-10) */}
      <div className="col-span-3 py-4 px-6 border-l border-border flex flex-col justify-center">
        {zoneLevel && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Target className="w-3 h-3" /> {zoneLevel}
          </div>
        )}
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
    </div>
  );
}
