import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface StockSignal {
  id: string;
  symbol: string;
  companyName: string;
  type: 'buy' | 'sell';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  timeframe: string;
  confidence: number;
  timestamp: Date;
  status: 'active' | 'pending';
}

export default function StockSignals() {
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);

  const stockSignals: StockSignal[] = [
    {
      id: '1',
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      type: 'buy',
      entry: 178.50,
      stopLoss: 175.00,
      takeProfit: 185.00,
      riskReward: 1.86,
      timeframe: '1D',
      confidence: 82,
      timestamp: new Date(Date.now() - 10 * 60 * 1000),
      status: 'active'
    },
    {
      id: '2',
      symbol: 'TSLA',
      companyName: 'Tesla Inc.',
      type: 'sell',
      entry: 248.50,
      stopLoss: 252.00,
      takeProfit: 241.00,
      riskReward: 2.1,
      timeframe: '4H',
      confidence: 78,
      timestamp: new Date(Date.now() - 25 * 60 * 1000),
      status: 'pending'
    },
    {
      id: '3',
      symbol: 'NVDA',
      companyName: 'NVIDIA Corp.',
      type: 'buy',
      entry: 485.00,
      stopLoss: 478.00,
      takeProfit: 499.00,
      riskReward: 2.0,
      timeframe: '1D',
      confidence: 88,
      timestamp: new Date(Date.now() - 35 * 60 * 1000),
      status: 'active'
    },
    {
      id: '4',
      symbol: 'MSFT',
      companyName: 'Microsoft Corp.',
      type: 'buy',
      entry: 378.25,
      stopLoss: 373.00,
      takeProfit: 388.50,
      riskReward: 1.95,
      timeframe: '4H',
      confidence: 75,
      timestamp: new Date(Date.now() - 45 * 60 * 1000),
      status: 'pending'
    },
    {
      id: '5',
      symbol: 'AMZN',
      companyName: 'Amazon.com Inc.',
      type: 'sell',
      entry: 145.80,
      stopLoss: 148.50,
      takeProfit: 140.10,
      riskReward: 2.1,
      timeframe: '1D',
      confidence: 80,
      timestamp: new Date(Date.now() - 55 * 60 * 1000),
      status: 'active'
    }
  ];

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const getSignalTypeColor = (type: string) => {
    return type === 'buy' ? 'hsl(120 60% 50%)' : 'hsl(0 75% 60%)';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-500';
    if (confidence >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div data-testid="card-stock-signals" className="bg-white dark:bg-background">
      <div className="pb-4 mb-4 border-b border-border/50">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <TrendingUp className="w-5 h-5" />
          Stock Signals
          <Badge variant="secondary" className="ml-auto">
            {stockSignals.filter(s => s.status === 'active').length} Active
          </Badge>
        </div>
      </div>
      <div>
        <div className="divide-y divide-border/50">
          {stockSignals.map((signal, index) => (
            <div
              key={signal.id}
              onClick={() => setSelectedSignalId(selectedSignalId === signal.id ? null : signal.id)}
              className={`py-4 transition-all cursor-pointer ${
                selectedSignalId === signal.id ? 'bg-primary/5' : 'hover-elevate'
              }`}
              data-testid={`card-stock-${signal.id}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: getSignalTypeColor(signal.type) }} />
                    <Badge 
                      variant="secondary"
                      className="text-xs font-medium shrink-0 ml-3"
                      style={{ 
                        backgroundColor: getSignalTypeColor(signal.type) + '20', 
                        color: getSignalTypeColor(signal.type) 
                      }}
                    >
                      {signal.type.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm" data-testid={`text-symbol-${signal.id}`}>
                        {signal.symbol}
                      </h4>
                      {signal.type === 'buy' ? (
                        <TrendingUp className="w-3 h-3 text-green-500 shrink-0" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{signal.companyName}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <Badge 
                    variant="outline"
                    className={`text-xs ${getConfidenceColor(signal.confidence)}`}
                  >
                    {signal.confidence}%
                  </Badge>
                  <Badge variant={signal.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                    {signal.status}
                  </Badge>
                </div>
              </div>

              <div className="flex items-stretch gap-0 text-xs mb-3 ml-3">
                <div className="flex-1 pr-4 border-r border-border/50">
                  <span className="text-muted-foreground">Entry:</span>
                  <div className="font-mono font-semibold" data-testid={`text-entry-${signal.id}`}>
                    ${signal.entry.toFixed(2)}
                  </div>
                </div>
                <div className="flex-1 px-4 border-r border-border/50">
                  <span className="text-muted-foreground">Stop:</span>
                  <div className="font-mono font-semibold text-red-500">
                    ${signal.stopLoss.toFixed(2)}
                  </div>
                </div>
                <div className="flex-1 pl-4">
                  <span className="text-muted-foreground">Target:</span>
                  <div className="font-mono font-semibold text-green-500">
                    ${signal.takeProfit.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs ml-3 pt-2 border-t border-border/30">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>{signal.timeframe}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimeAgo(signal.timestamp)}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  R:R 1:{signal.riskReward}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
