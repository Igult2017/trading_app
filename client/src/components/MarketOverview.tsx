import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Activity, AlertTriangle, BarChart3, Calendar } from 'lucide-react';

interface WatchlistItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  category: 'forex' | 'stocks' | 'crypto';
  watchReason: 'technical' | 'fundamental' | 'news';
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
  keyLevel: number;
  timeframe: string;
}

export default function MarketOverview() {
  // TODO: Remove mock data - replace with real watchlist data
  const watchlistData: WatchlistItem[] = [
    {
      symbol: 'EUR/USD',
      name: 'Euro / US Dollar',
      price: 1.0845,
      change: 0.0012,
      changePercent: 0.11,
      category: 'forex',
      watchReason: 'technical',
      reasoning: 'Approaching key resistance at 1.0870, potential breakout setup',
      priority: 'high',
      keyLevel: 1.0870,
      timeframe: '4H'
    },
    {
      symbol: 'GBP/USD',
      name: 'British Pound / US Dollar',
      price: 1.2678,
      change: -0.0045,
      changePercent: -0.35,
      category: 'forex',
      watchReason: 'fundamental',
      reasoning: 'BoE policy decision tomorrow, volatility expected',
      priority: 'high',
      keyLevel: 1.2650,
      timeframe: '1D'
    },
    {
      symbol: 'USD/JPY',
      name: 'US Dollar / Japanese Yen',
      price: 150.25,
      change: 0.85,
      changePercent: 0.57,
      category: 'forex',
      watchReason: 'news',
      reasoning: 'BoJ intervention risk above 150.50 level',
      priority: 'medium',
      keyLevel: 150.50,
      timeframe: '1H'
    },
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      price: 185.92,
      change: 2.15,
      changePercent: 1.17,
      category: 'stocks',
      watchReason: 'technical',
      reasoning: 'Breaking above 50MA, momentum building',
      priority: 'medium',
      keyLevel: 188.00,
      timeframe: '1D'
    },
    {
      symbol: 'BTC/USD',
      name: 'Bitcoin',
      price: 43250,
      change: 850,
      changePercent: 2.01,
      category: 'crypto',
      watchReason: 'technical',
      reasoning: 'Testing major resistance zone, high volume confirmation',
      priority: 'high',
      keyLevel: 44000,
      timeframe: '4H'
    },
    {
      symbol: 'GOLD',
      name: 'Gold Spot',
      price: 2035.50,
      change: -12.30,
      changePercent: -0.60,
      category: 'forex',
      watchReason: 'fundamental',
      reasoning: 'Fed dovish pivot expectations, safe haven demand',
      priority: 'medium',
      keyLevel: 2050.00,
      timeframe: '1D'
    }
  ];

  const getCategoryBadgeColor = (category: string) => {
    switch(category) {
      case 'forex': return 'hsl(210 100% 60%)';
      case 'stocks': return 'hsl(120 60% 50%)';
      case 'crypto': return 'hsl(45 90% 60%)';
      default: return '';
    }
  };

  const getReasonIcon = (reason: string) => {
    switch(reason) {
      case 'technical': return <BarChart3 className="w-3 h-3" />;
      case 'fundamental': return <Activity className="w-3 h-3" />;
      case 'news': return <Calendar className="w-3 h-3" />;
      default: return null;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case 'high': return 'hsl(0 75% 60%)';
      case 'medium': return 'hsl(45 90% 60%)';
      case 'low': return 'hsl(120 60% 50%)';
      default: return '';
    }
  };

  const formatPrice = (price: number, symbol: string) => {
    if (symbol.includes('/') || symbol === 'GOLD') {
      return price < 10 ? price.toFixed(4) : price.toFixed(2);
    }
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <Card data-testid="card-market-overview">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Activity className="w-5 h-5" />
          Instruments to Watch
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {watchlistData.map((item) => (
            <div
              key={item.symbol}
              className="p-3 rounded-md border border-border hover-elevate transition-colors"
              data-testid={`card-watchlist-${item.symbol.replace('/', '-')}`}
            >
              <div className="flex items-start justify-between mb-2">
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
                    <div className="text-xs text-muted-foreground">
                      {item.timeframe} • Key: {formatPrice(item.keyLevel, item.symbol)}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline"
                    className="text-xs"
                    style={{ borderColor: getPriorityColor(item.priority), color: getPriorityColor(item.priority) }}
                  >
                    {item.priority === 'high' && <AlertTriangle className="w-3 h-3 mr-1" />}
                    {item.priority.toUpperCase()}
                  </Badge>
                </div>
              </div>
              
              <div className="flex items-center justify-between mb-2">
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
              </div>
              
              <div className="flex items-start gap-2 text-xs">
                <div className="flex items-center gap-1">
                  {getReasonIcon(item.watchReason)}
                  <Badge variant="secondary" className="text-xs">
                    {item.watchReason.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex-1 text-muted-foreground">
                  {item.reasoning}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}