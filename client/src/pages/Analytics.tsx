import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Target } from 'lucide-react';

interface Analytics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnL: string;
  averagePnL: string;
  winRate: string;
  averageWin: string;
  averageLoss: string;
}

export default function Analytics() {
  const { data: analytics, isLoading } = useQuery<Analytics>({
    queryKey: ['/api/analytics'],
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-8 text-muted-foreground">
          Loading analytics...
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-8 text-muted-foreground">
          No analytics data available
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: 'Total Trades',
      value: analytics.totalTrades,
      icon: BarChart3,
      color: 'text-blue-500',
    },
    {
      title: 'Total P&L',
      value: `$${analytics.totalPnL}`,
      icon: DollarSign,
      color: parseFloat(analytics.totalPnL) >= 0 ? 'text-green-500' : 'text-red-500',
    },
    {
      title: 'Win Rate',
      value: `${analytics.winRate}%`,
      icon: Target,
      color: 'text-purple-500',
    },
    {
      title: 'Average Win',
      value: `$${analytics.averageWin}`,
      icon: TrendingUp,
      color: 'text-green-500',
    },
    {
      title: 'Average Loss',
      value: `$${analytics.averageLoss}`,
      icon: TrendingDown,
      color: 'text-red-500',
    },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-analytics">
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 className="w-8 h-8" />
        <h1 className="text-3xl font-bold">Trading Analytics</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} data-testid={`card-${stat.title.toLowerCase().replace(' ', '-')}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stat.color}`} data-testid={`value-${stat.title.toLowerCase().replace(' ', '-')}`}>
                {stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-performance-breakdown">
          <CardHeader>
            <CardTitle>Performance Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Winning Trades</span>
              <span className="font-semibold text-green-500" data-testid="text-winning-trades">
                {analytics.winningTrades}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Losing Trades</span>
              <span className="font-semibold text-red-500" data-testid="text-losing-trades">
                {analytics.losingTrades}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Average P&L</span>
              <span className={`font-semibold ${parseFloat(analytics.averagePnL) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                ${analytics.averagePnL}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-risk-reward">
          <CardHeader>
            <CardTitle>Risk/Reward Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Win Rate</span>
              <span className="font-semibold" data-testid="text-win-rate">{analytics.winRate}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Avg Win</span>
              <span className="font-semibold text-green-500">${analytics.averageWin}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Avg Loss</span>
              <span className="font-semibold text-red-500">${analytics.averageLoss}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
