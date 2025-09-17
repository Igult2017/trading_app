import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Target, TrendingUp, TrendingDown, Clock, Eye, BarChart3 } from 'lucide-react';

interface TradingSignal {
  id: string;
  symbol: string;
  type: 'buy' | 'sell';
  strategy: 'scalping' | 'day' | 'swing' | 'orb';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  timeframe: string;
  confidence: number;
  reasoning: string[];
  smcFactors: string[];
  timestamp: Date;
  status: 'active' | 'pending' | 'executed';
}

export default function TradingSignals() {
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
  
  // TODO: Remove mock data - replace with real trading signals
  const signals: TradingSignal[] = [
    {
      id: '1',
      symbol: 'EUR/USD',
      type: 'buy',
      strategy: 'scalping',
      entry: 1.0845,
      stopLoss: 1.0820,
      takeProfit: 1.0895,
      riskReward: 2.0,
      timeframe: '15M',
      confidence: 85,
      reasoning: [
        'Break of structure on 15M timeframe',
        'Volume spike confirmation',
        'Confluence with daily support'
      ],
      smcFactors: [
        'FVG identified at 1.0840',
        'Order block holding',
        'Liquidity sweep completed'
      ],
      timestamp: new Date(Date.now() - 15 * 60 * 1000),
      status: 'active'
    },
    {
      id: '2',
      symbol: 'GBP/JPY',
      type: 'sell',
      strategy: 'swing',
      entry: 185.50,
      stopLoss: 186.80,
      takeProfit: 182.90,
      riskReward: 2.0,
      timeframe: '4H',
      confidence: 78,
      reasoning: [
        'Lower high formation',
        'Bearish divergence on RSI',
        'Rejection at key resistance'
      ],
      smcFactors: [
        'Breaker block activated',
        'Unmitigated supply zone',
        'Liquidity void below'
      ],
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      status: 'pending'
    },
    {
      id: '3',
      symbol: 'BTC/USD',
      type: 'buy',
      strategy: 'day',
      entry: 43200,
      stopLoss: 42800,
      takeProfit: 44000,
      riskReward: 2.0,
      timeframe: '1H',
      confidence: 92,
      reasoning: [
        'Bullish flag completion',
        'High volume breakout',
        'Support level holding'
      ],
      smcFactors: [
        'Demand zone activated',
        'Imbalance filled',
        'Institutional candles'
      ],
      timestamp: new Date(Date.now() - 45 * 60 * 1000),
      status: 'executed'
    }
  ];

  const getSignalTypeColor = (type: string) => {
    return type === 'buy' ? 'hsl(120 60% 50%)' : 'hsl(0 75% 60%)';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'hsl(120 60% 50%)';
    if (confidence >= 60) return 'hsl(45 90% 60%)';
    return 'hsl(0 75% 60%)';
  };

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <Card data-testid="card-trading-signals">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Target className="w-5 h-5" />
          Trading Signals
          <Badge variant="secondary" className="ml-auto">
            {signals.filter(s => s.status === 'active').length} Active
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {signals.map((signal) => (
            <div
              key={signal.id}
              className={`p-4 rounded-md border border-border hover-elevate transition-all ${
                selectedSignal === signal.id ? 'border-primary/50 bg-primary/5' : ''
              }`}
              data-testid={`card-signal-${signal.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Badge 
                    variant="secondary"
                    className="text-xs font-medium"
                    style={{ 
                      backgroundColor: getSignalTypeColor(signal.type) + '20', 
                      color: getSignalTypeColor(signal.type) 
                    }}
                  >
                    {signal.type.toUpperCase()}
                  </Badge>
                  <div>
                    <h4 className="font-semibold text-sm" data-testid={`text-symbol-${signal.id}`}>
                      {signal.symbol}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{signal.strategy}</span>
                      <span>•</span>
                      <span>{signal.timeframe}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeAgo(signal.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline"
                    className="text-xs"
                    style={{ 
                      borderColor: getConfidenceColor(signal.confidence), 
                      color: getConfidenceColor(signal.confidence) 
                    }}
                  >
                    {signal.confidence}%
                  </Badge>
                  <Badge variant={signal.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                    {signal.status}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Entry:</span>
                  <div className="font-mono font-semibold" data-testid={`text-entry-${signal.id}`}>
                    {signal.entry.toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Stop Loss:</span>
                  <div className="font-mono font-semibold text-red-500">
                    {signal.stopLoss.toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Take Profit:</span>
                  <div className="font-mono font-semibold text-green-500">
                    {signal.takeProfit.toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">R:R Ratio:</span>
                  <div className="font-mono font-semibold" data-testid={`text-rr-${signal.id}`}>
                    1:{signal.riskReward}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedSignal(selectedSignal === signal.id ? null : signal.id)}
                  className="text-xs"
                  data-testid={`button-details-${signal.id}`}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  {selectedSignal === signal.id ? 'Hide' : 'Show'} Details
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => console.log(`Viewing chart for ${signal.symbol}`)}
                  className="text-xs"
                  data-testid={`button-chart-${signal.id}`}
                >
                  <BarChart3 className="w-3 h-3 mr-1" />
                  View Chart
                </Button>
              </div>

              {selectedSignal === signal.id && (
                <div className="mt-4 pt-4 border-t border-border space-y-3" data-testid={`details-${signal.id}`}>
                  <div>
                    <h5 className="font-medium text-sm mb-2">Technical Analysis Reasoning:</h5>
                    <ul className="space-y-1 text-xs">
                      {signal.reasoning.map((reason, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-primary" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h5 className="font-medium text-sm mb-2">Smart Money Concepts:</h5>
                    <ul className="space-y-1 text-xs">
                      {signal.smcFactors.map((factor, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-secondary" />
                          {factor}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}