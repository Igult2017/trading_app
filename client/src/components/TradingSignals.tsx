import { useState } from 'react';
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
  
  const activeSignals: TradingSignal[] = [
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
      status: 'active'
    },
    {
      id: '4',
      symbol: 'WTI OIL',
      type: 'sell',
      strategy: 'swing',
      entry: 82.50,
      stopLoss: 84.20,
      takeProfit: 78.80,
      riskReward: 2.2,
      timeframe: '4H',
      confidence: 76,
      reasoning: [
        'Resistance at $85 zone rejected',
        'Oversupply concerns mounting',
        'Technical breakdown imminent'
      ],
      smcFactors: [
        'Supply zone activated',
        'Institutional selling pressure',
        'Liquidity pool below $79'
      ],
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      status: 'pending'
    },
    {
      id: '5',
      symbol: 'XAU/USD',
      type: 'buy',
      strategy: 'day',
      entry: 2035.00,
      stopLoss: 2025.00,
      takeProfit: 2055.00,
      riskReward: 2.0,
      timeframe: '30M',
      confidence: 88,
      reasoning: [
        'Demand zone confluence',
        'Dollar weakness setup',
        'Safe haven flow expected'
      ],
      smcFactors: [
        'Order block activated',
        'Imbalance mitigation',
        'Institutional buying'
      ],
      timestamp: new Date(Date.now() - 20 * 60 * 1000),
      status: 'active'
    }
  ];

  const previousSignals: TradingSignal[] = [
    {
      id: 'prev1',
      symbol: 'AUD/USD',
      type: 'buy',
      strategy: 'swing',
      entry: 0.6580,
      stopLoss: 0.6550,
      takeProfit: 0.6640,
      riskReward: 2.0,
      timeframe: '4H',
      confidence: 75,
      reasoning: ['Bounce off support', 'Bullish divergence'],
      smcFactors: ['Demand zone test', 'Liquidity sweep'],
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
      status: 'executed'
    },
    {
      id: 'prev2',
      symbol: 'ETH/USD',
      type: 'sell',
      strategy: 'day',
      entry: 2280.00,
      stopLoss: 2310.00,
      takeProfit: 2220.00,
      riskReward: 2.0,
      timeframe: '1H',
      confidence: 68,
      reasoning: ['Resistance rejection', 'Volume decline'],
      smcFactors: ['Supply zone active', 'Imbalance below'],
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
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
    <div data-testid="card-trading-signals" className="bg-white dark:bg-background">
      <div className="pb-4 mb-4 border-b border-border/50">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Target className="w-5 h-5" />
          Trading Signals
          <Badge variant="secondary" className="ml-auto">
            {activeSignals.filter(s => s.status === 'active').length}/5 Active
          </Badge>
        </div>
      </div>
      <div>
        <div>
          {/* Active Signals Section */}
          <div>
            <h3 className="text-sm font-semibold mb-4 pb-2 text-muted-foreground tracking-wide border-b-2 border-border/60">Currency, Gold, Oil and Crypto Signals</h3>
            <div className="divide-y divide-border/50">
              {activeSignals.map((signal) => (
            <div
              key={signal.id}
              className={`py-4 transition-all ${
                selectedSignal === signal.id ? 'bg-primary/5' : 'hover-elevate'
              }`}
              data-testid={`card-signal-${signal.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: getSignalTypeColor(signal.type) }} />
                    <Badge 
                      variant="secondary"
                      className="text-xs font-medium ml-3"
                      style={{ 
                        backgroundColor: getSignalTypeColor(signal.type) + '20', 
                        color: getSignalTypeColor(signal.type) 
                      }}
                    >
                      {signal.type.toUpperCase()}
                    </Badge>
                  </div>
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

              <div className="flex items-stretch gap-0 text-xs mb-3 ml-3">
                <div className="flex-1 pr-4 border-r border-border/50">
                  <span className="text-muted-foreground">Entry:</span>
                  <div className="font-mono font-semibold" data-testid={`text-entry-${signal.id}`}>
                    {signal.entry.toLocaleString()}
                  </div>
                </div>
                <div className="flex-1 px-4 border-r border-border/50">
                  <span className="text-muted-foreground">Stop Loss:</span>
                  <div className="font-mono font-semibold text-red-500">
                    {signal.stopLoss.toLocaleString()}
                  </div>
                </div>
                <div className="flex-1 px-4 border-r border-border/50">
                  <span className="text-muted-foreground">Take Profit:</span>
                  <div className="font-mono font-semibold text-green-500">
                    {signal.takeProfit.toLocaleString()}
                  </div>
                </div>
                <div className="flex-1 pl-4">
                  <span className="text-muted-foreground">R:R Ratio:</span>
                  <div className="font-mono font-semibold" data-testid={`text-rr-${signal.id}`}>
                    1:{signal.riskReward}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between ml-3 pt-3 border-t border-border/30">
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
                <div className="mt-4 pt-4 ml-3 border-t border-border space-y-3" data-testid={`details-${signal.id}`}>
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
          </div>

          {/* Previous Signals Section */}
          {previousSignals.length > 0 && (
            <div className="mt-6 pt-6 border-t-2 border-border/60">
              <h3 className="text-sm font-semibold mb-4 pb-2 text-muted-foreground uppercase tracking-wide border-b-2 border-border/60">
                Recently Expired
                <span className="ml-2 text-xs font-normal normal-case">(Before Archive)</span>
              </h3>
              <div className="divide-y divide-border/50">
                {previousSignals.map((signal) => (
                  <div
                    key={signal.id}
                    className="py-3 opacity-75"
                    data-testid={`card-prev-signal-${signal.id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="absolute left-0 top-0 bottom-0 w-0.5 opacity-50" style={{ backgroundColor: getSignalTypeColor(signal.type) }} />
                          <Badge 
                            variant="secondary"
                            className="text-xs font-medium opacity-75 ml-3"
                            style={{ 
                              backgroundColor: getSignalTypeColor(signal.type) + '20', 
                              color: getSignalTypeColor(signal.type) 
                            }}
                          >
                            {signal.type.toUpperCase()}
                          </Badge>
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm">
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
                      
                      <Badge variant="outline" className="text-xs">
                        EXPIRED
                      </Badge>
                    </div>

                    <div className="flex items-stretch gap-0 text-xs ml-3 pt-2 border-t border-border/30">
                      <div className="flex-1 pr-4 border-r border-border/50">
                        <span className="text-muted-foreground">Entry:</span>
                        <div className="font-mono font-semibold">
                          {signal.entry.toLocaleString()}
                        </div>
                      </div>
                      <div className="flex-1 px-4 border-r border-border/50">
                        <span className="text-muted-foreground">R:R:</span>
                        <div className="font-mono font-semibold">
                          1:{signal.riskReward}
                        </div>
                      </div>
                      <div className="flex-1 px-4 border-r border-border/50">
                        <span className="text-muted-foreground">Confidence:</span>
                        <div className="font-mono font-semibold">
                          {signal.confidence}%
                        </div>
                      </div>
                      <div className="flex-1 pl-4">
                        <span className="text-muted-foreground">Status:</span>
                        <div className="font-semibold text-green-500">
                          {signal.status.toUpperCase()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}