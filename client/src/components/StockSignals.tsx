import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card data-testid="card-stock-signals">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <TrendingUp className="w-5 h-5" />
          Stock Signals
          <Badge variant="secondary" className="ml-auto">
            {stockSignals.filter(s => s.status === 'active').length} Active
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {stockSignals.map((signal) => (
            <div
              key={signal.id}
              onClick={() => setSelectedSignalId(selectedSignalId === signal.id ? null : signal.id)}
              className={`group p-3 rounded-md border border-border hover-elevate active-elevate-2 transition-all cursor-pointer ${
                selectedSignalId === signal.id ? 'border-primary/50 bg-primary/5' : ''
              }`}
              data-testid={`card-stock-${signal.id}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3 flex-1">
                  <Badge 
                    variant="secondary"
                    className="text-xs font-medium shrink-0"
                    style={{ 
                      backgroundColor: getSignalTypeColor(signal.type) + '20', 
                      color: getSignalTypeColor(signal.type) 
                    }}
                  >
                    {signal.type.toUpperCase()}
                  </Badge>
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
                
                <div className="flex items-center gap-2 shrink-0">
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

              <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                <div>
                  <span className="text-muted-foreground">Entry:</span>
                  <div className="font-mono font-semibold" data-testid={`text-entry-${signal.id}`}>
                    ${signal.entry.toFixed(2)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Stop:</span>
                  <div className="font-mono font-semibold text-red-500">
                    ${signal.stopLoss.toFixed(2)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Target:</span>
                  <div className="font-mono font-semibold text-green-500">
                    ${signal.takeProfit.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
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
      </CardContent>
    </Card>
  );
}
