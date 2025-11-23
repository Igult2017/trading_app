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
import type { TradingSignal } from '@shared/schema';

interface StockSignalCardProps {
  signal: TradingSignal;
}

const StatBlock = ({ label, value, colorClass = "text-foreground", icon: Icon }: any) => (
  <div className="flex flex-col">
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
      {Icon && <Icon className="w-3 h-3" />} {label}
    </span>
    <span className={`text-base font-extrabold ${colorClass}`}>{value}</span>
  </div>
);

export default function StockSignalCard({ signal }: StockSignalCardProps) {
  const isBuy = signal.type?.toLowerCase() === 'buy';
  const trendColor = isBuy ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400';
  const TrendIcon = isBuy ? TrendingUp : TrendingDown;
  
  const statusClasses = signal.status === 'active' 
    ? 'bg-primary text-primary-foreground' 
    : 'bg-muted text-muted-foreground';

  const entryPrice = signal.entryPrice?.toString() || '—';
  const stopLoss = signal.stopLoss?.toString() || '—';
  const takeProfit = signal.takeProfit?.toString() || '—';
  
  const hasCompleteData = entryPrice !== '—' && entryPrice !== 'N/A';

  return (
    <div 
      className="bg-card border-l-4 border-r border-b border-border p-0 relative group hover:z-10 transition-all hover:border-foreground/30" 
      style={{ borderLeftColor: isBuy ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-5))' }}
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
            <h3 className="text-2xl font-extrabold text-foreground tracking-tight" data-testid={`text-symbol-${signal.id}`}>
              {signal.symbol}
            </h3>
            <TrendIcon className={`w-5 h-5 ${trendColor}`} />
          </div>
        </div>

        {/* Stats Grid (Col 4-9) */}
        <div className="md:col-span-6 grid grid-cols-3 gap-4 border-l border-r border-border px-4 md:px-8 py-2">
          {hasCompleteData ? (
            <>
              <StatBlock 
                label="Entry" 
                value={entryPrice} 
                icon={DollarSign} 
              />
              <StatBlock 
                label="Stop" 
                value={stopLoss} 
                colorClass="text-destructive" 
                icon={ArrowDownRight} 
              />
              <StatBlock 
                label="Target" 
                value={takeProfit} 
                colorClass="text-emerald-600 dark:text-emerald-400" 
                icon={ArrowUpRight} 
              />
            </>
          ) : (
            <div className="col-span-3 text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center">
              <Info className="w-4 h-4 mr-2" /> Waiting for activation price.
            </div>
          )}
        </div>

        {/* Confidence and Actions (Col 10-12) */}
        <div className="md:col-span-3 flex flex-col items-start md:items-end gap-3 pt-2">
          <div className="text-right">
            <div className="text-sm font-semibold text-foreground uppercase tracking-widest">
              {signal.primaryTimeframe || '—'}
            </div>
            {signal.status && (
              <div className={`text-base font-semibold ${statusClasses} px-3 py-1 border border-foreground mt-1`}>
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
