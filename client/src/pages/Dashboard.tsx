import { HeroSection } from '@/components/HeroSection';
import TradingSession from '@/components/TradingSession';
import MarketOverview from '@/components/MarketOverview';
import StockSignals from '@/components/StockSignals';
import TradingSignals from '@/components/TradingSignals';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Search } from 'lucide-react';

export default function Dashboard() {
  return (
    <div>
      {/* Hero Section */}
      <HeroSection />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Search Bar */}
        <div className="border border-blue-500/50 bg-white rounded-xl shadow-md">
          <div className="relative flex items-center py-4 px-6">
            <Search className="h-6 w-6 text-gray-500 mr-4" />
            <input
              type="text"
              placeholder="Search markets, pairs, or signals..."
              className="flex-grow bg-transparent text-lg text-gray-900 placeholder-gray-500 focus:outline-none"
            />
          </div>
        </div>

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

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <StockSignals />
          </div>
          
          <div className="lg:col-span-2 space-y-6">
            <TradingSignals />
            <MarketOverview />
          </div>
        </div>
      </div>
    </div>
  );
}