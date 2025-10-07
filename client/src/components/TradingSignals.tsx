import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Target, Clock, Eye, BarChart3 } from 'lucide-react';

interface TradingSignal {
  id: string;
  symbol: string;
  assetClass: string;
  type: string;
  strategy: string;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  riskRewardRatio: string;
  primaryTimeframe: string;
  overallConfidence: number;
  interestRateDiffScore?: string;
  inflationImpactScore?: string;
  trendScore?: string;
  smcScore?: string;
  institutionalCandleDetected?: boolean;
  smcFactors?: string[];
  technicalReasons?: string[];
  marketContext?: string;
  status: string;
  strength?: string;
  createdAt: Date;
}

export default function TradingSignals() {
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
  
  const { data: signals = [], isLoading } = useQuery<TradingSignal[]>({
    queryKey: ['/api/trading-signals'],
    refetchInterval: 30000,
  });

  const activeSignals = signals.filter(s => s.status === 'active' || s.status === 'pending');
  const previousSignals = signals.filter(s => s.status === 'expired' || s.status === 'executed');

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
    const diffMs = now.getTime() - new Date(timestamp).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  if (isLoading) {
    return (
      <div data-testid="card-trading-signals" className="bg-white dark:bg-background">
        <div className="pb-4 mb-4 border-b border-border/50">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Target className="w-5 h-5" />
            Currency, Gold, Oil and Crypto Signals
            <Badge variant="secondary" className="ml-auto mr-2">Loading...</Badge>
          </div>
        </div>
        <div className="text-center py-8 text-muted-foreground">Scanning markets for signals...</div>
      </div>
    );
  }

  return (
    <div data-testid="card-trading-signals" className="bg-white dark:bg-background">
      <div className="pb-4 mb-4 border-b border-border/50">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Target className="w-5 h-5" />
          Currency, Gold, Oil and Crypto Signals
          <Badge variant="secondary" className="ml-auto mr-2">
            {activeSignals.length}/{signals.length} Active
          </Badge>
        </div>
      </div>
      <div>
        {activeSignals.length === 0 && previousSignals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No signals detected yet</p>
            <p className="text-sm mt-2">Algorithm scanning markets every 30 minutes...</p>
          </div>
        ) : (
          <div>
            {/* Active Signals Section */}
            {activeSignals.length > 0 && (
              <div>
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
                              <span>{signal.primaryTimeframe}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTimeAgo(signal.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 mr-2">
                          <Badge 
                            variant="outline"
                            className="text-xs"
                            style={{ 
                              borderColor: getConfidenceColor(signal.overallConfidence), 
                              color: getConfidenceColor(signal.overallConfidence) 
                            }}
                          >
                            {signal.overallConfidence}%
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
                            {parseFloat(signal.entryPrice).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex-1 px-4 border-r border-border/50">
                          <span className="text-muted-foreground">Stop Loss:</span>
                          <div className="font-mono font-semibold text-red-500">
                            {parseFloat(signal.stopLoss).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex-1 px-4 border-r border-border/50">
                          <span className="text-muted-foreground">Take Profit:</span>
                          <div className="font-mono font-semibold text-green-500">
                            {parseFloat(signal.takeProfit).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex-1 pl-4">
                          <span className="text-muted-foreground">R:R Ratio:</span>
                          <div className="font-mono font-semibold" data-testid={`text-rr-${signal.id}`}>
                            1:{signal.riskRewardRatio}
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
                        <div className="mt-4 pt-4 ml-3 border-t border-border space-y-4" data-testid={`details-${signal.id}`}>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <h5 className="font-medium text-sm">Scoring Breakdown</h5>
                              <div className="space-y-1.5 text-xs">
                                {signal.interestRateDiffScore && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Interest Rate (40%):</span>
                                    <Badge variant="outline" className="text-xs">
                                      {parseFloat(signal.interestRateDiffScore).toFixed(1)}
                                    </Badge>
                                  </div>
                                )}
                                {signal.inflationImpactScore && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Inflation (25%):</span>
                                    <Badge variant="outline" className="text-xs">
                                      {parseFloat(signal.inflationImpactScore).toFixed(1)}
                                    </Badge>
                                  </div>
                                )}
                                {signal.trendScore && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Trend (20%):</span>
                                    <Badge variant="outline" className="text-xs">
                                      {parseFloat(signal.trendScore).toFixed(1)}
                                    </Badge>
                                  </div>
                                )}
                                {signal.smcScore && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">SMC (15%):</span>
                                    <Badge variant="outline" className="text-xs">
                                      {parseFloat(signal.smcScore).toFixed(1)}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <h5 className="font-medium text-sm">Signal Attributes</h5>
                              <div className="space-y-1.5 text-xs">
                                {signal.strength && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Strength:</span>
                                    <Badge variant="secondary" className="text-xs capitalize">
                                      {signal.strength}
                                    </Badge>
                                  </div>
                                )}
                                {signal.institutionalCandleDetected !== undefined && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Institutional Candle:</span>
                                    <Badge 
                                      variant={signal.institutionalCandleDetected ? "default" : "outline"} 
                                      className="text-xs"
                                    >
                                      {signal.institutionalCandleDetected ? 'Detected' : 'None'}
                                    </Badge>
                                  </div>
                                )}
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">Asset Class:</span>
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {signal.assetClass}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div>
                            <h5 className="font-medium text-sm mb-2">Technical Analysis Reasoning:</h5>
                            <ul className="space-y-1 text-xs">
                              {signal.technicalReasons?.map((reason, index) => (
                                <li key={index} className="flex items-center gap-2">
                                  <div className="w-1 h-1 rounded-full bg-primary" />
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                          
                          {signal.smcFactors && signal.smcFactors.length > 0 && (
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
                          )}

                          {signal.marketContext && (
                            <div>
                              <h5 className="font-medium text-sm mb-2">Market Context:</h5>
                              <p className="text-xs text-muted-foreground">{signal.marketContext}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                              <span>{signal.primaryTimeframe}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTimeAgo(signal.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <Badge variant="outline" className="text-xs mr-2">
                          EXPIRED
                        </Badge>
                      </div>

                      <div className="flex items-stretch gap-0 text-xs ml-3 pt-2 border-t border-border/30">
                        <div className="flex-1 pr-4 border-r border-border/50">
                          <span className="text-muted-foreground">Entry:</span>
                          <div className="font-mono font-semibold">
                            {parseFloat(signal.entryPrice).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex-1 px-4 border-r border-border/50">
                          <span className="text-muted-foreground">R:R:</span>
                          <div className="font-mono font-semibold">
                            1:{signal.riskRewardRatio}
                          </div>
                        </div>
                        <div className="flex-1 px-4 border-r border-border/50">
                          <span className="text-muted-foreground">Confidence:</span>
                          <div className="font-mono font-semibold">
                            {signal.overallConfidence}%
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
        )}
      </div>
    </div>
  );
}
