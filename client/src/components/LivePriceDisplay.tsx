import { ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';
import { usePrice, formatPrice, formatChange } from '@/hooks/usePrices';

interface LivePriceDisplayProps {
  symbol: string;
  assetClass: 'stock' | 'forex' | 'commodity' | 'crypto';
  showChange?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function LivePriceDisplay({ 
  symbol, 
  assetClass, 
  showChange = true,
  size = 'md',
  className = ''
}: LivePriceDisplayProps) {
  const { data: priceData, isLoading, isError } = usePrice(symbol, assetClass);
  
  const sizeClasses = {
    sm: { price: 'text-sm', change: 'text-xs', icon: 'w-3 h-3' },
    md: { price: 'text-xl', change: 'text-sm', icon: 'w-4 h-4' },
    lg: { price: 'text-2xl', change: 'text-base', icon: 'w-5 h-5' }
  };
  
  const sizes = sizeClasses[size];
  
  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 className={`${sizes.icon} animate-spin text-muted-foreground`} />
        <span className={`${sizes.price} font-bold text-muted-foreground`}>Loading...</span>
      </div>
    );
  }
  
  if (isError || !priceData || priceData.error) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className={`${sizes.price} font-bold text-muted-foreground`}>---</span>
      </div>
    );
  }
  
  const { text: changeText, isPositive } = formatChange(priceData.change, priceData.changePercent);
  const priceText = formatPrice(priceData.price, assetClass === 'forex' ? 5 : 2);
  const changeColor = isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  const ChangeIcon = isPositive ? ArrowUpRight : ArrowDownRight;
  
  return (
    <div className={`flex flex-col ${className}`}>
      <div className={`${sizes.price} font-extrabold tabular-nums`} data-testid="live-price-value">
        {priceText}
      </div>
      {showChange && (
        <div className={`flex items-center gap-1 ${sizes.change} ${changeColor}`} data-testid="live-price-change">
          <ChangeIcon className={sizes.icon} />
          <span className="font-semibold tabular-nums">{changeText}</span>
        </div>
      )}
    </div>
  );
}

interface CompactLivePriceProps {
  symbol: string;
  assetClass: 'stock' | 'forex' | 'commodity' | 'crypto';
  className?: string;
}

export function CompactLivePrice({ symbol, assetClass, className = '' }: CompactLivePriceProps) {
  const { data: priceData, isLoading, isError } = usePrice(symbol, assetClass);
  
  if (isLoading) {
    return <span className={`text-muted-foreground ${className}`}>...</span>;
  }
  
  if (isError || !priceData || priceData.error) {
    return <span className={`text-muted-foreground ${className}`}>---</span>;
  }
  
  const priceText = formatPrice(priceData.price, assetClass === 'forex' ? 5 : 2);
  const { isPositive } = formatChange(priceData.change, priceData.changePercent);
  const changeColor = isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  
  return (
    <span className={`font-bold tabular-nums ${changeColor} ${className}`} data-testid="compact-live-price">
      {priceText}
    </span>
  );
}

interface LivePriceWithEntryProps {
  symbol: string;
  assetClass: 'stock' | 'forex' | 'commodity' | 'crypto';
  entryPrice?: number | string | null;
  signalType?: 'buy' | 'sell' | string;
  className?: string;
}

export function LivePriceWithEntry({ 
  symbol, 
  assetClass, 
  entryPrice,
  signalType,
  className = '' 
}: LivePriceWithEntryProps) {
  const { data: priceData, isLoading, isError } = usePrice(symbol, assetClass);
  
  const entry = typeof entryPrice === 'string' ? parseFloat(entryPrice) : entryPrice;
  const isBuy = signalType?.toLowerCase() === 'buy';
  
  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading price...</span>
      </div>
    );
  }
  
  if (isError || !priceData || priceData.error) {
    return (
      <div className={`flex flex-col ${className}`}>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
          Current Price
        </span>
        <span className="text-sm font-extrabold text-muted-foreground">---</span>
      </div>
    );
  }
  
  const currentPrice = priceData.price ?? 0;
  const priceText = formatPrice(currentPrice, assetClass === 'forex' ? 5 : 2);
  const { text: changeText, isPositive } = formatChange(priceData.change, priceData.changePercent);
  const marketChangeColor = isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  
  let pnlColor = 'text-foreground';
  let pnlText = '';
  
  if (entry && !isNaN(entry) && entry > 0) {
    // For BUY: profit when current > entry (positive %)
    // For SELL: profit when current < entry (show positive % for profit)
    const rawPnlPercent = ((currentPrice - entry) / entry) * 100;
    // Invert the percentage for SELL signals so profit shows as positive
    const pnlPercent = isBuy ? rawPnlPercent : -rawPnlPercent;
    const inProfit = pnlPercent > 0;
    pnlColor = inProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    const sign = pnlPercent >= 0 ? '+' : '';
    pnlText = `${sign}${pnlPercent.toFixed(2)}% from entry`;
  }
  
  return (
    <div className={`flex flex-col ${className}`}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 flex items-center gap-1">
        Current Price
        <span className={`${marketChangeColor}`}>({changeText})</span>
      </span>
      <span className="text-sm font-extrabold tabular-nums" data-testid="live-current-price">
        {priceText}
      </span>
      {pnlText && (
        <span className={`text-xs ${pnlColor} mt-0.5`} data-testid="live-pnl-from-entry">
          {pnlText}
        </span>
      )}
    </div>
  );
}
