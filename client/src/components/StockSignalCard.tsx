import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Eye, 
  DollarSign,
  Info,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface StockSignalCardProps {
  signal: {
    id: string;
    symbol: string;
    type: string;
    entryPrice?: string;
    stopLoss?: string;
    takeProfit?: string;
    overallConfidence?: number;
    primaryTimeframe?: string;
    status?: string;
  };
}

const StatBlock = ({ label, value, colorClass = "text-gray-900", icon: Icon }: any) => (
  <div className="flex flex-col">
    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1 flex items-center gap-1">
      {Icon && <Icon className="w-3 h-3" />} {label}
    </span>
    <span className={`text-base font-extrabold ${colorClass}`}>{value}</span>
  </div>
);

export default function StockSignalCard({ signal }: StockSignalCardProps) {
  const isBuy = signal.type?.toLowerCase() === 'buy';
  const trendColor = isBuy ? 'text-emerald-500' : 'text-rose-500';
  const TrendIcon = isBuy ? TrendingUp : TrendingDown;
  
  const statusClasses = signal.status === 'active' 
    ? 'bg-blue-500 text-white' 
    : 'bg-gray-200 text-gray-700';

  const hasCompleteData = signal.entryPrice && signal.entryPrice !== '—' && signal.entryPrice !== 'N/A';

  return (
    <div 
      className="bg-white border-l-4 border-r border-b border-gray-300 p-0 relative group hover:z-10 transition-all hover:border-gray-500" 
      style={{ borderLeftColor: isBuy ? 'rgb(5 150 105 / 1)' : 'rgb(225 29 72 / 1)' }}
      data-testid={`card-stock-${signal.id}`}
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
            <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight" data-testid={`text-symbol-${signal.id}`}>
              {signal.symbol}
            </h3>
            <TrendIcon className={`w-5 h-5 ${trendColor}`} />
          </div>
        </div>

        {/* Stats Grid (Col 4-9) */}
        <div className="md:col-span-6 grid grid-cols-3 gap-4 border-l border-r border-gray-200 px-4 md:px-8 py-2">
          {hasCompleteData ? (
            <>
              <StatBlock 
                label="Entry" 
                value={signal.entryPrice} 
                icon={DollarSign} 
              />
              <StatBlock 
                label="Stop" 
                value={signal.stopLoss || '—'} 
                colorClass="text-rose-600" 
                icon={ArrowDownRight} 
              />
              <StatBlock 
                label="Target" 
                value={signal.takeProfit || '—'} 
                colorClass="text-emerald-600" 
                icon={ArrowUpRight} 
              />
            </>
          ) : (
            <div className="col-span-3 text-sm font-semibold text-amber-600 flex items-center">
              <Info className="w-4 h-4 mr-2" /> Waiting for activation price.
            </div>
          )}
        </div>

        {/* Confidence and Actions (Col 10-12) */}
        <div className="md:col-span-3 flex flex-col items-start md:items-end gap-3 pt-2">
          <div className="text-right">
            <div className="text-sm font-semibold text-gray-700 uppercase tracking-widest">
              {signal.primaryTimeframe || '—'}
            </div>
            {signal.status && (
              <div className={`text-base font-semibold ${statusClasses} px-3 py-1 border border-gray-900 mt-1`}>
                {signal.status}
              </div>
            )}
          </div>
          <Button 
            size="sm"
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider"
            data-testid={`button-details-${signal.id}`}
          >
            <Eye className="w-4 h-4 mr-2" />
            Show Details
          </Button>
        </div>
      </div>
    </div>
  );
}
