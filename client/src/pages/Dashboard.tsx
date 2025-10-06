import TradingSession from '@/components/TradingSession';
import MarketOverview from '@/components/MarketOverview';
import EconomicCalendar from '@/components/EconomicCalendar';
import TradingSignals from '@/components/TradingSignals';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-6 pb-0 space-y-6">
        {/* Trading Sessions */}
        <TradingSession />

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
      </div>

      {/* Main Dashboard Grid with Fixed Height */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-hidden">
        <div className="lg:col-span-1 overflow-y-auto">
          <EconomicCalendar />
        </div>
        
        <div className="lg:col-span-2 overflow-y-auto space-y-6">
          <TradingSignals />
          <MarketOverview />
        </div>
      </div>
    </div>
  );
}