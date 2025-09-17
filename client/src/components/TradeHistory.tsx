import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History, TrendingUp, TrendingDown, Filter, Download } from 'lucide-react';

interface Trade {
  id: string;
  symbol: string;
  type: 'buy' | 'sell';
  strategy: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  outcome: 'win' | 'loss';
  timeframe: string;
  entryReason: string;
  exitDate: Date;
  duration: string;
}

export default function TradeHistory() {
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all');
  
  // TODO: Remove mock data - replace with real trade history
  const trades: Trade[] = [
    {
      id: '1',
      symbol: 'EUR/USD',
      type: 'buy',
      strategy: 'SMC + Volume',
      entryPrice: 1.0820,
      exitPrice: 1.0865,
      quantity: 0.1,
      pnl: 450,
      pnlPercent: 4.16,
      outcome: 'win',
      timeframe: '15M',
      entryReason: 'FVG retest + order block hold',
      exitDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      duration: '2h 15m'
    },
    {
      id: '2',
      symbol: 'GBP/USD',
      type: 'sell',
      strategy: 'Breakout',
      entryPrice: 1.2695,
      exitPrice: 1.2745,
      quantity: 0.1,
      pnl: -500,
      pnlPercent: -3.94,
      outcome: 'loss',
      timeframe: '30M',
      entryReason: 'False breakout, SL hit',
      exitDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      duration: '45m'
    },
    {
      id: '3',
      symbol: 'USD/JPY',
      type: 'buy',
      strategy: 'Trend Follow',
      entryPrice: 149.80,
      exitPrice: 150.45,
      quantity: 0.1,
      pnl: 650,
      pnlPercent: 4.34,
      outcome: 'win',
      timeframe: '4H',
      entryReason: 'HTF trend + demand zone',
      exitDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      duration: '6h 30m'
    },
    {
      id: '4',
      symbol: 'BTC/USD',
      type: 'buy',
      strategy: 'ORB',
      entryPrice: 42800,
      exitPrice: 43350,
      quantity: 0.01,
      pnl: 550,
      pnlPercent: 12.86,
      outcome: 'win',
      timeframe: '1H',
      entryReason: 'Opening range breakout',
      exitDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      duration: '3h 20m'
    },
    {
      id: '5',
      symbol: 'AUD/USD',
      type: 'sell',
      strategy: 'Reversal',
      entryPrice: 0.6580,
      exitPrice: 0.6620,
      quantity: 0.1,
      pnl: -400,
      pnlPercent: -6.08,
      outcome: 'loss',
      timeframe: '15M',
      entryReason: 'Failed reversal at resistance',
      exitDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      duration: '1h 10m'
    }
  ];

  const filteredTrades = trades.filter(trade => {
    if (filter === 'wins') return trade.outcome === 'win';
    if (filter === 'losses') return trade.outcome === 'loss';
    return true;
  });

  const totalPnL = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const winRate = (trades.filter(t => t.outcome === 'win').length / trades.length) * 100;
  const avgWin = trades.filter(t => t.outcome === 'win').reduce((sum, t) => sum + t.pnl, 0) / trades.filter(t => t.outcome === 'win').length;
  const avgLoss = Math.abs(trades.filter(t => t.outcome === 'loss').reduce((sum, t) => sum + t.pnl, 0) / trades.filter(t => t.outcome === 'loss').length);

  return (
    <Card data-testid="card-trade-history">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <History className="w-5 h-5" />
            Trade History
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => console.log('Downloading trade history')}
              data-testid="button-download-history"
            >
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
        
        {/* Performance Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 p-4 bg-muted/30 rounded-md">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Total P&L</div>
            <div className={`font-mono font-semibold ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              ${totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(0)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Win Rate</div>
            <div className="font-mono font-semibold">
              {winRate.toFixed(1)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Avg Win</div>
            <div className="font-mono font-semibold text-green-500">
              ${avgWin.toFixed(0)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Avg Loss</div>
            <div className="font-mono font-semibold text-red-500">
              ${avgLoss.toFixed(0)}
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Filter Buttons */}
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
            data-testid="button-filter-all"
          >
            All ({trades.length})
          </Button>
          <Button
            variant={filter === 'wins' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('wins')}
            data-testid="button-filter-wins"
          >
            Wins ({trades.filter(t => t.outcome === 'win').length})
          </Button>
          <Button
            variant={filter === 'losses' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('losses')}
            data-testid="button-filter-losses"
          >
            Losses ({trades.filter(t => t.outcome === 'loss').length})
          </Button>
        </div>

        {/* Trade List */}
        <div className="space-y-3">
          {filteredTrades.map((trade) => (
            <div
              key={trade.id}
              className="p-3 rounded-md border border-border hover-elevate transition-colors"
              data-testid={`card-trade-${trade.id}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Badge 
                    variant="secondary"
                    className="text-xs font-medium"
                    style={{ 
                      backgroundColor: trade.type === 'buy' ? 'hsl(120 60% 50%)20' : 'hsl(0 75% 60%)20',
                      color: trade.type === 'buy' ? 'hsl(120 60% 50%)' : 'hsl(0 75% 60%)'
                    }}
                  >
                    {trade.type.toUpperCase()}
                  </Badge>
                  <div>
                    <h4 className="font-semibold text-sm" data-testid={`text-symbol-${trade.id}`}>
                      {trade.symbol}
                    </h4>
                    <div className="text-xs text-muted-foreground">
                      {trade.strategy} • {trade.timeframe} • {trade.duration}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`font-mono font-semibold text-sm ${trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(0)}
                  </div>
                  <div className={`text-xs ${trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ({trade.pnl >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%)
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <div className="flex gap-4">
                  <div>
                    <span className="text-muted-foreground">Entry: </span>
                    <span className="font-mono">{trade.entryPrice.toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Exit: </span>
                    <span className="font-mono">{trade.exitPrice.toFixed(4)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {trade.outcome === 'win' ? (
                    <TrendingUp className="w-3 h-3 text-green-500" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-500" />
                  )}
                  <Badge 
                    variant={trade.outcome === 'win' ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    {trade.outcome}
                  </Badge>
                </div>
              </div>
              
              <div className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium">Reason:</span> {trade.entryReason}
              </div>
              
              <div className="mt-1 text-xs text-muted-foreground">
                Closed: {trade.exitDate.toLocaleDateString()} {trade.exitDate.toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}