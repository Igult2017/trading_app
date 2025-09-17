import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: string;
  category: 'forex' | 'stocks' | 'crypto';
}

export default function MarketOverview() {
  // TODO: Remove mock data - replace with real market data
  const marketData: MarketData[] = [
    { symbol: 'EUR/USD', name: 'Euro / US Dollar', price: 1.0845, change: 0.0012, changePercent: 0.11, volume: '2.3B', category: 'forex' },
    { symbol: 'GBP/USD', name: 'British Pound / US Dollar', price: 1.2678, change: -0.0045, changePercent: -0.35, volume: '1.8B', category: 'forex' },
    { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', price: 150.25, change: 0.85, changePercent: 0.57, volume: '1.9B', category: 'forex' },
    { symbol: 'AAPL', name: 'Apple Inc.', price: 185.92, change: 2.15, changePercent: 1.17, volume: '45M', category: 'stocks' },
    { symbol: 'TSLA', name: 'Tesla Inc.', price: 248.50, change: -3.25, changePercent: -1.29, volume: '38M', category: 'stocks' },
    { symbol: 'BTC/USD', name: 'Bitcoin', price: 43250, change: 850, changePercent: 2.01, volume: '28B', category: 'crypto' },
    { symbol: 'ETH/USD', name: 'Ethereum', price: 2685, change: -45, changePercent: -1.65, volume: '15B', category: 'crypto' }
  ];

  const getCategoryBadgeColor = (category: string) => {
    switch(category) {
      case 'forex': return 'hsl(210 100% 60%)';
      case 'stocks': return 'hsl(120 60% 50%)';
      case 'crypto': return 'hsl(45 90% 60%)';
      default: return '';
    }
  };

  const formatPrice = (price: number, symbol: string) => {
    if (symbol.includes('/')) {
      return price < 10 ? price.toFixed(4) : price.toFixed(2);
    }
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <Card data-testid="card-market-overview">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Activity className="w-5 h-5" />
          Market Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {marketData.map((item) => (
            <div
              key={item.symbol}
              className="flex items-center justify-between p-3 rounded-md border border-border hover-elevate transition-colors"
              data-testid={`card-market-${item.symbol.replace('/', '-')}`}
            >
              <div className="flex items-center gap-3">
                <Badge 
                  variant="secondary"
                  className="text-xs font-medium"
                  style={{ backgroundColor: getCategoryBadgeColor(item.category) + '20', color: getCategoryBadgeColor(item.category) }}
                >
                  {item.category.toUpperCase()}
                </Badge>
                <div>
                  <div className="font-semibold text-sm" data-testid={`text-symbol-${item.symbol.replace('/', '-')}`}>
                    {item.symbol}
                  </div>
                  <div className="text-xs text-muted-foreground truncate max-w-32">
                    {item.name}
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <div className="font-mono font-semibold text-sm" data-testid={`text-price-${item.symbol.replace('/', '-')}`}>
                  {formatPrice(item.price, item.symbol)}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {item.change > 0 ? (
                    <TrendingUp className="w-3 h-3 text-green-500" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`font-mono ${item.change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {item.change > 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
              
              <div className="text-right text-xs text-muted-foreground">
                <div>Vol: {item.volume}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}