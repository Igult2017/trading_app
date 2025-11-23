import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Eye, 
  Target
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface WatchlistCardProps {
  item: {
    id: string;
    symbol: string;
    currentPrice?: string;
    setupStage?: string;
    primaryTimeframe?: string;
    setupNotes?: string[];
    type?: string;
    marketContext?: string;
    zoneLevel?: string;
  };
}

export default function WatchlistCard({ item }: WatchlistCardProps) {
  const isPriceUp = parseFloat(item.currentPrice || '0') > 0;
  const changeColor = isPriceUp ? 'text-emerald-600' : 'text-rose-600';
  const ChangeIcon = isPriceUp ? ArrowUpRight : ArrowDownRight;
  
  const priority = item.setupStage === 'ready' ? 'HIGH' : 'MEDIUM';
  const isHighPriority = priority === 'HIGH';

  const priorityBadgeClass = isHighPriority 
    ? 'bg-red-600 text-white border-red-600' 
    : 'bg-amber-600 text-white border-amber-600';

  return (
    <div 
      className={`bg-white border-b border-r border-l border-gray-200 p-0 group hover:bg-gray-50 transition-colors grid grid-cols-12 items-center text-gray-900 ${isHighPriority ? 'border-l-4 border-l-red-500' : ''}`}
      data-testid={`card-watchlist-${item.id}`}
    >
      {/* Pair and Type (Col 1-4) */}
      <div className="col-span-4 py-4 px-6 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold tracking-tight" data-testid={`text-symbol-${item.id}`}>
            {item.symbol}
          </h3>
          <span className="text-xs text-gray-500 font-medium">
            ({item.primaryTimeframe || '—'})
          </span>
        </div>
        <p className="text-xs text-gray-500 italic line-clamp-1">
          {item.setupNotes?.[0] || item.marketContext || 'Monitoring for setup'}
        </p>
      </div>

      {/* Price and Change (Col 5-7) */}
      <div className="col-span-3 py-4 px-6 border-l border-gray-200">
        <div className="text-xl font-extrabold" data-testid={`text-price-${item.id}`}>
          {item.currentPrice || '—'}
        </div>
        <div className={`text-xs font-bold flex items-center gap-1 ${changeColor}`}>
          <ChangeIcon className="w-3 h-3" /> 
          Monitoring
        </div>
      </div>

      {/* Priority and Key Level (Col 8-10) */}
      <div className="col-span-3 py-4 px-6 border-l border-gray-200 flex flex-col gap-1">
        <Badge className={`w-fit px-3 py-1 text-xs font-bold uppercase tracking-widest border ${priorityBadgeClass}`}>
          {priority}
        </Badge>
        {item.zoneLevel && (
          <div className="text-xs text-gray-600 flex items-center gap-1">
            <Target className="w-3 h-3" /> {item.zoneLevel}
          </div>
        )}
      </div>

      {/* Action (Col 11-12) */}
      <div className="col-span-2 py-4 px-3 border-l border-gray-200 flex justify-end">
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
