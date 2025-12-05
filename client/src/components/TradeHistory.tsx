import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookOpen, TrendingUp, TrendingDown, Filter, Download, Calendar, Target, AlertTriangle, Clock, BarChart3 } from 'lucide-react';
import type { Trade } from '@shared/schema';

const safeParseFloat = (value: string | null | undefined, defaultValue = 0): number => {
  if (value === null || value === undefined || value === '') return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
};

const safeFormatPrice = (value: string | null | undefined, decimals = 5): string => {
  if (value === null || value === undefined || value === '') return 'N/A';
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 'N/A' : parsed.toFixed(decimals);
};

export default function TradeHistory() {
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  
  const { data: trades = [], isLoading } = useQuery<Trade[]>({
    queryKey: ['/api/trades'],
  });

  const filterByTime = (trade: Trade) => {
    if (timeFilter === 'all') return true;
    const exitDate = new Date(trade.exitDate);
    const now = new Date();
    
    if (timeFilter === 'today') {
      return exitDate.toDateString() === now.toDateString();
    } else if (timeFilter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return exitDate >= weekAgo;
    } else if (timeFilter === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return exitDate >= monthAgo;
    }
    return true;
  };

  if (isLoading) {
    return (
      <Card data-testid="card-trade-journal">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Trading Journal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Loading journal entries...
          </div>
        </CardContent>
      </Card>
    );
  }

  const timeFilteredTrades = trades.filter(filterByTime);
  
  const filteredTrades = timeFilteredTrades.filter(trade => {
    if (filter === 'wins') return trade.outcome === 'win';
    if (filter === 'losses') return trade.outcome === 'loss';
    return true;
  });

  const totalPnL = timeFilteredTrades.reduce((sum, trade) => sum + safeParseFloat(trade.pnl), 0);
  const winningTrades = timeFilteredTrades.filter(t => t.outcome === 'win');
  const losingTrades = timeFilteredTrades.filter(t => t.outcome === 'loss');
  const winRate = timeFilteredTrades.length > 0 ? (winningTrades.length / timeFilteredTrades.length) * 100 : 0;
  const avgWin = winningTrades.length > 0 
    ? winningTrades.reduce((sum, t) => sum + safeParseFloat(t.pnl), 0) / winningTrades.length 
    : 0;
  const avgLoss = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((sum, t) => sum + safeParseFloat(t.pnl), 0) / losingTrades.length)
    : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : 0;

  if (trades.length === 0) {
    return (
      <Card data-testid="card-trade-journal">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Trading Journal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No journal entries yet</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Your trading journal will automatically record confirmed trades when signals hit their stop-loss or take-profit levels.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const exportToCSV = () => {
    const headers = ['Date', 'Symbol', 'Type', 'Strategy', 'Entry', 'Exit', 'SL', 'TP', 'P&L', 'P&L %', 'R:R', 'Outcome', 'Duration', 'Reason', 'Lesson'];
    const rows = filteredTrades.map(t => [
      new Date(t.exitDate).toLocaleDateString(),
      t.symbol,
      t.type,
      t.strategy,
      t.entryPrice,
      t.exitPrice,
      t.stopLoss || 'N/A',
      t.takeProfit || 'N/A',
      t.pnl,
      t.pnlPercent + '%',
      t.riskReward || 'N/A',
      t.outcome,
      t.duration,
      t.entryReason,
      t.lesson || ''
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trading-journal-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card data-testid="card-trade-journal">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <BookOpen className="w-5 h-5" />
            Trading Journal
            <Badge variant="secondary" className="ml-2">
              {trades.length} trades
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              data-testid="button-export-journal"
            >
              <Download className="w-4 h-4 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 p-4 bg-muted/30 rounded-md">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Total P&L</div>
            <div className={`font-mono font-semibold ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-total-pnl">
              ${totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(0)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
            <div className="font-mono font-semibold" data-testid="text-win-rate">
              {winRate.toFixed(1)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Wins / Losses</div>
            <div className="font-mono font-semibold">
              <span className="text-green-500">{winningTrades.length}</span>
              {' / '}
              <span className="text-red-500">{losingTrades.length}</span>
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Avg Win</div>
            <div className="font-mono font-semibold text-green-500">
              ${avgWin.toFixed(0)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Avg Loss</div>
            <div className="font-mono font-semibold text-red-500">
              ${avgLoss.toFixed(0)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Profit Factor</div>
            <div className={`font-mono font-semibold ${profitFactor >= 1 ? 'text-green-500' : 'text-red-500'}`}>
              {profitFactor.toFixed(2)}
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Button
              variant={timeFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeFilter('all')}
              data-testid="button-time-all"
            >
              All Time
            </Button>
            <Button
              variant={timeFilter === 'today' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeFilter('today')}
              data-testid="button-time-today"
            >
              Today
            </Button>
            <Button
              variant={timeFilter === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeFilter('week')}
              data-testid="button-time-week"
            >
              This Week
            </Button>
            <Button
              variant={timeFilter === 'month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeFilter('month')}
              data-testid="button-time-month"
            >
              This Month
            </Button>
          </div>
          
          <div className="h-4 w-px bg-border mx-2 hidden sm:block" />
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
              data-testid="button-filter-all"
            >
              All ({timeFilteredTrades.length})
            </Button>
            <Button
              variant={filter === 'wins' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('wins')}
              data-testid="button-filter-wins"
            >
              Wins ({winningTrades.length})
            </Button>
            <Button
              variant={filter === 'losses' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('losses')}
              data-testid="button-filter-losses"
            >
              Losses ({losingTrades.length})
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {filteredTrades.map((trade) => (
            <div
              key={trade.id}
              className={`p-4 rounded-md border ${
                trade.outcome === 'win' 
                  ? 'border-green-500/20 bg-green-500/5' 
                  : 'border-red-500/20 bg-red-500/5'
              } hover-elevate transition-colors`}
              data-testid={`card-journal-entry-${trade.id}`}
            >
              <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge 
                    variant="secondary"
                    className="text-xs font-medium"
                    style={{ 
                      backgroundColor: trade.type === 'buy' ? 'hsl(142 76% 36% / 0.2)' : 'hsl(0 84% 60% / 0.2)',
                      color: trade.type === 'buy' ? 'hsl(142 76% 36%)' : 'hsl(0 84% 60%)'
                    }}
                  >
                    {trade.type.toUpperCase()}
                  </Badge>
                  <div>
                    <h4 className="font-semibold text-base" data-testid={`text-symbol-${trade.id}`}>
                      {trade.symbol}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{trade.strategy}</span>
                      <span className="text-muted-foreground/50">|</span>
                      <span>{trade.timeframe}</span>
                      {trade.assetClass && (
                        <>
                          <span className="text-muted-foreground/50">|</span>
                          <span className="capitalize">{trade.assetClass}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`font-mono font-bold text-lg ${safeParseFloat(trade.pnl) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {safeParseFloat(trade.pnl) >= 0 ? '+' : ''}${safeParseFloat(trade.pnl).toFixed(2)}
                  </div>
                  <div className={`text-xs ${safeParseFloat(trade.pnl) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ({safeParseFloat(trade.pnl) >= 0 ? '+' : ''}{safeParseFloat(trade.pnlPercent).toFixed(2)}%)
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-xs">
                <div className="bg-background/50 rounded p-2">
                  <div className="text-muted-foreground mb-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Entry
                  </div>
                  <div className="font-mono font-medium">{safeFormatPrice(trade.entryPrice)}</div>
                </div>
                <div className="bg-background/50 rounded p-2">
                  <div className="text-muted-foreground mb-1 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" />
                    Exit
                  </div>
                  <div className="font-mono font-medium">{safeFormatPrice(trade.exitPrice)}</div>
                </div>
                <div className="bg-background/50 rounded p-2">
                  <div className="text-muted-foreground mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                    Stop Loss
                  </div>
                  <div className="font-mono font-medium text-red-500">
                    {safeFormatPrice(trade.stopLoss)}
                  </div>
                </div>
                <div className="bg-background/50 rounded p-2">
                  <div className="text-muted-foreground mb-1 flex items-center gap-1">
                    <Target className="w-3 h-3 text-green-500" />
                    Take Profit
                  </div>
                  <div className="font-mono font-medium text-green-500">
                    {safeFormatPrice(trade.takeProfit)}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs mb-3">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1">
                    <BarChart3 className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">R:R</span>
                    <span className="font-mono font-medium">{trade.riskReward || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-mono font-medium">{trade.duration}</span>
                  </div>
                </div>
                <Badge 
                  variant={trade.outcome === 'win' ? 'default' : 'destructive'}
                  className="text-xs"
                >
                  {trade.outcome === 'win' ? 'WIN' : 'LOSS'}
                </Badge>
              </div>
              
              <div className="space-y-2 text-xs border-t border-border/50 pt-3">
                <div>
                  <span className="text-muted-foreground font-medium">Entry Reason: </span>
                  <span>{trade.entryReason}</span>
                </div>
                {trade.lesson && (
                  <div>
                    <span className="text-muted-foreground font-medium">Lesson: </span>
                    <span className="italic">{trade.lesson}</span>
                  </div>
                )}
              </div>
              
              <div className="mt-3 text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-2">
                <span>
                  {trade.entryDate && `Opened: ${new Date(trade.entryDate).toLocaleDateString()} ${new Date(trade.entryDate).toLocaleTimeString()}`}
                </span>
                <span>
                  Closed: {new Date(trade.exitDate).toLocaleDateString()} {new Date(trade.exitDate).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
        
        {filteredTrades.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No trades match the selected filters.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
