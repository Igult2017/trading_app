import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Eye, 
  BarChart2, 
  DollarSign,
  Info,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface SignalCardProps {
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

export default function SignalCard({ signal }: SignalCardProps) {
  const isBuy = signal.type?.toLowerCase() === 'buy';
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
      className="bg-card border-l-4 border-r border-b border-border p-0 relative group hover:z-10 transition-all hover:border-foreground/30" 
      style={{ borderLeftColor: isBuy ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-5))' }}
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
              <div className="flex-1 min-w-[100px]">
                <StatBlock 
                  label="Entry Price" 
                  value={entryPrice} 
                  icon={DollarSign} 
                />
              </div>
              <div className="flex-1 min-w-[100px]">
                <StatBlock 
                  label="Stop Loss" 
                  value={stopLoss} 
                  colorClass="text-destructive" 
                  icon={ArrowDownRight} 
                />
              </div>
              <div className="flex-1 min-w-[100px]">
                <StatBlock 
                  label="Take Profit" 
                  value={takeProfit} 
                  colorClass="text-emerald-600 dark:text-emerald-400" 
                  icon={ArrowUpRight} 
                />
              </div>
              <div className="flex-1 min-w-[80px]">
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

        {/* Timeframe, Time Ago and Actions (Col 10-12) */}
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
