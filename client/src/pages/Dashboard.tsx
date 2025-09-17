import TradingSession from '@/components/TradingSession';
import MarketOverview from '@/components/MarketOverview';
import EconomicCalendar from '@/components/EconomicCalendar';
import TradingSignals from '@/components/TradingSignals';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Dashboard() {
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connected');
  
  useEffect(() => {
    // TODO: Replace with real WebSocket connection status
    const interval = setInterval(() => {
      const statuses: Array<'connected' | 'disconnected' | 'connecting'> = ['connected', 'connecting'];
      setConnectionStatus(statuses[Math.floor(Math.random() * statuses.length)]);
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header with Status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">
            Infod Trading Partner
          </h1>
          <p className="text-muted-foreground">
            Advanced market analysis and signal generation system
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {connectionStatus === 'connected' ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : connectionStatus === 'connecting' ? (
              <Wifi className="w-4 h-4 text-yellow-500 animate-pulse" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            <Badge 
              variant={connectionStatus === 'connected' ? 'default' : 'secondary'}
              className="text-xs"
              data-testid="badge-connection-status"
            >
              {connectionStatus === 'connected' ? 'Live Data' : 
               connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-stat-active-signals">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">2 profitable, 1 pending</p>
          </CardContent>
        </Card>
        
        <Card data-testid="card-stat-daily-pnl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Daily P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">+$1,250</div>
            <p className="text-xs text-muted-foreground">+2.8% portfolio</p>
          </CardContent>
        </Card>
        
        <Card data-testid="card-stat-win-rate">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">78.5%</div>
            <p className="text-xs text-muted-foreground">Last 30 trades</p>
          </CardContent>
        </Card>
        
        <Card data-testid="card-stat-risk-exposure">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Risk Exposure</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2.5%</div>
            <p className="text-xs text-muted-foreground">Of total portfolio</p>
          </CardContent>
        </Card>
      </div>

      {/* Alert Banner */}
      <Card className="border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/20" data-testid="card-alert-banner">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-medium">Market Alert:</span>
            <span className="text-sm">High volatility expected during NFP release at 14:30 EST</span>
          </div>
        </CardContent>
      </Card>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <TradingSession />
          <EconomicCalendar />
        </div>
        
        <div className="lg:col-span-2 space-y-6">
          <TradingSignals />
          <MarketOverview />
        </div>
      </div>
    </div>
  );
}