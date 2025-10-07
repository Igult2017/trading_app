import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, TrendingUp, TrendingDown, Target, Layers } from 'lucide-react';

interface PendingSetup {
  id: string;
  symbol: string;
  assetClass: string;
  type: string;
  setupStage: string;
  potentialStrategy?: string;
  currentPrice: string;
  primaryTimeframe: string;
  confirmationTimeframe?: string;
  interestRateBias?: string;
  inflationBias?: string;
  trendBias?: string;
  chochDetected?: boolean;
  chochDirection?: string;
  liquiditySweepDetected?: boolean;
  supplyDemandZoneTargeted?: boolean;
  zoneLevel?: string;
  zoneMitigated?: boolean;
  levelsBroken?: number;
  confirmationsPending?: string[];
  setupNotes?: string[];
  marketContext?: string;
  lastCheckedAt: Date;
  readyForSignal?: boolean;
  createdAt: Date;
}

interface InstrumentsToWatchProps {
  assetClassFilter?: string;
}

export default function InstrumentsToWatch({ assetClassFilter }: InstrumentsToWatchProps = {}) {
  const [selectedSetupId, setSelectedSetupId] = useState<string | null>(null);
  
  const { data: allPendingSetups = [], isLoading } = useQuery<PendingSetup[]>({
    queryKey: ['/api/pending-setups'],
    refetchInterval: 15000,
  });

  const pendingSetups = assetClassFilter
    ? allPendingSetups.filter(s => s.assetClass === assetClassFilter)
    : allPendingSetups;

  const activeSetups = pendingSetups.filter(s => !s.readyForSignal);

  const getSetupTypeColor = (type: string) => {
    return type === 'buy' ? 'hsl(120 60% 50%)' : 'hsl(0 75% 60%)';
  };

  const getStageColor = (stage: string) => {
    if (stage === 'forming') return 'text-yellow-500';
    if (stage === 'monitoring') return 'text-blue-500';
    return 'text-purple-500';
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
      <div data-testid="card-instruments-watch" className="bg-white dark:bg-background p-6">
        <div className="flex items-center gap-2 text-lg font-semibold mb-4">
          <Eye className="w-5 h-5" />
          Instruments to Watch
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <p>Loading pending setups...</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="card-instruments-watch" className="bg-white dark:bg-background">
      <div className="pb-4 mb-4 border-b-2 border-border/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Eye className="w-5 h-5" />
            Instruments to Watch
          </div>
          <Badge variant="secondary" className="mr-2">
            {activeSetups.length} Forming
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Setups pending confirmation - price action developing
        </p>
      </div>

      <div>
        {activeSetups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No pending setups at the moment</p>
            <p className="text-sm mt-2">Watching for potential opportunities...</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {activeSetups.map((setup) => (
              <div
                key={setup.id}
                className="py-4"
                data-testid={`card-setup-${setup.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div 
                        className="absolute left-0 top-0 bottom-0 w-0.5" 
                        style={{ backgroundColor: getSetupTypeColor(setup.type) }} 
                      />
                      <Badge 
                        variant="secondary"
                        className="text-xs font-medium ml-3"
                        style={{ 
                          backgroundColor: getSetupTypeColor(setup.type) + '20', 
                          color: getSetupTypeColor(setup.type) 
                        }}
                      >
                        {setup.type.toUpperCase()}
                      </Badge>
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm" data-testid={`text-symbol-${setup.id}`}>
                        {setup.symbol}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={getStageColor(setup.setupStage)}>
                          {setup.setupStage.toUpperCase()}
                        </span>
                        {setup.potentialStrategy && (
                          <>
                            <span>•</span>
                            <span>{setup.potentialStrategy}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <Badge variant="outline" className="text-xs mr-2 capitalize">
                    {setup.assetClass}
                  </Badge>
                </div>

                <div className="flex items-stretch gap-0 text-xs mb-3 ml-3">
                  <div className="flex-1 pr-4 border-r border-border/50">
                    <span className="text-muted-foreground">Current:</span>
                    <div className="font-mono font-semibold">
                      {parseFloat(setup.currentPrice).toLocaleString()}
                    </div>
                  </div>
                  {setup.zoneLevel && (
                    <div className="flex-1 px-4 border-r border-border/50">
                      <span className="text-muted-foreground">Zone:</span>
                      <div className="font-mono font-semibold text-blue-500">
                        {parseFloat(setup.zoneLevel).toLocaleString()}
                      </div>
                    </div>
                  )}
                  <div className="flex-1 pl-4">
                    <span className="text-muted-foreground">TF:</span>
                    <div className="font-semibold">
                      {setup.primaryTimeframe}
                    </div>
                  </div>
                </div>

                {/* SMC Indicators */}
                <div className="flex items-center gap-2 text-xs ml-3 mb-3">
                  {setup.chochDetected && (
                    <Badge variant="default" className="text-xs">
                      <Layers className="w-3 h-3 mr-1" />
                      CHoCH {setup.chochDirection}
                    </Badge>
                  )}
                  {setup.liquiditySweepDetected && (
                    <Badge variant="default" className="text-xs">
                      <Target className="w-3 h-3 mr-1" />
                      Liquidity Sweep
                    </Badge>
                  )}
                  {setup.supplyDemandZoneTargeted && (
                    <Badge variant="secondary" className="text-xs">
                      S/D Zone Targeted
                    </Badge>
                  )}
                  {setup.levelsBroken && setup.levelsBroken > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {setup.levelsBroken} Levels Broken
                    </Badge>
                  )}
                </div>

                {/* Confirmations Pending */}
                {setup.confirmationsPending && setup.confirmationsPending.length > 0 && (
                  <div className="ml-3 mb-3">
                    <p className="text-xs text-muted-foreground mb-1">Waiting for:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {setup.confirmationsPending.map((confirmation, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {confirmation}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Setup Notes */}
                {setup.setupNotes && setup.setupNotes.length > 0 && (
                  <div className="ml-3 pt-3 border-t border-border/30">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedSetupId(selectedSetupId === setup.id ? null : setup.id)}
                      className="text-xs mb-2"
                      data-testid={`button-details-${setup.id}`}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      {selectedSetupId === setup.id ? 'Hide' : 'Show'} Analysis
                    </Button>

                    {selectedSetupId === setup.id && (
                      <div className="space-y-2" data-testid={`details-${setup.id}`}>
                        <div>
                          <h5 className="font-medium text-xs mb-1">Setup Analysis:</h5>
                          <ul className="space-y-1 text-xs">
                            {setup.setupNotes.map((note, index) => (
                              <li key={index} className="flex items-start gap-2">
                                <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                                <span className="text-muted-foreground">{note}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {setup.marketContext && (
                          <div>
                            <h5 className="font-medium text-xs mb-1">Market Context:</h5>
                            <p className="text-xs text-muted-foreground">{setup.marketContext}</p>
                          </div>
                        )}

                        {/* Bias Indicators */}
                        {(setup.trendBias || setup.interestRateBias || setup.inflationBias) && (
                          <div>
                            <h5 className="font-medium text-xs mb-1">Bias Analysis:</h5>
                            <div className="flex flex-wrap gap-2">
                              {setup.trendBias && (
                                <Badge variant="outline" className="text-xs">
                                  Trend: {setup.trendBias}
                                </Badge>
                              )}
                              {setup.interestRateBias && (
                                <Badge variant="outline" className="text-xs">
                                  IR: {setup.interestRateBias}
                                </Badge>
                              )}
                              {setup.inflationBias && (
                                <Badge variant="outline" className="text-xs">
                                  Inflation: {setup.inflationBias}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="text-xs text-muted-foreground ml-3 mt-2">
                  Last checked: {formatTimeAgo(setup.lastCheckedAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
