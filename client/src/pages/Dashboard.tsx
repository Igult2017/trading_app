import { HeroSection } from '@/components/HeroSection';
import TradingSession from '@/components/TradingSession';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import SignalCard from '@/components/SignalCard';
import StockSignalCard from '@/components/StockSignalCard';
import WatchlistCard from '@/components/WatchlistCard';
import SectionHeader from '@/components/SectionHeader';
import { Target, Activity, Eye } from 'lucide-react';
import type { TradingSignal, PendingSetup } from '@shared/schema';

export default function Dashboard() {
  const { data: allSignals = [], isLoading: signalsLoading } = useQuery<TradingSignal[]>({
    queryKey: ['/api/trading-signals'],
    refetchInterval: 10000,
  });

  const { data: pendingSetups = [], isLoading: setupsLoading } = useQuery<PendingSetup[]>({
    queryKey: ['/api/pending-setups'],
    refetchInterval: 15000,
  });

  // Filter signals by asset class with guards
  const currencySignals = allSignals.filter(s => {
    const assetClass = s.assetClass?.toLowerCase();
    return assetClass === 'forex' || assetClass === 'crypto' || assetClass === 'commodity';
  });
  const stockSignals = allSignals.filter(s => s.assetClass?.toLowerCase() === 'stock');
  
  // Filter pending setups for watchlist with guard
  const watchlistItems = pendingSetups.filter(s => s.readyForSignal !== true);

  return (
    <div>
      {/* Hero Section */}
      <HeroSection />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Search Bar */}
        <div className="border border-blue-500/50 bg-card dark:bg-background rounded-xl shadow-md">
          <div className="relative flex items-center py-4 px-6">
            <Search className="h-6 w-6 text-muted-foreground mr-4" />
            <input
              type="text"
              placeholder="Search markets, pairs, or signals..."
              className="flex-grow bg-transparent text-lg text-foreground placeholder-muted-foreground focus:outline-none"
              data-testid="input-search"
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
          {/* Left Column: Stock Signals */}
          <div className="lg:col-span-1 space-y-6">
            <section className="bg-card border-t-2 border-foreground">
              <SectionHeader 
                icon={Activity} 
                title="Stock Bias" 
                countLabel={`${stockSignals.length} Active`}
              />
              <div className="flex flex-col">
                {signalsLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading stock signals...</div>
                ) : stockSignals.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No active stock signals at the moment</div>
                ) : (
                  stockSignals.slice(0, 10).map(signal => (
                    <StockSignalCard key={signal.id} signal={signal} />
                  ))
                )}
              </div>
            </section>
          </div>
          
          {/* Right Column: Currency/Crypto Signals and Instruments Watchlist */}
          <div className="lg:col-span-2 space-y-6">
            {/* Currency & Crypto Signals */}
            <section className="bg-card border-t-2 border-foreground">
              <SectionHeader 
                icon={Target} 
                title="Currency, Metals & Crypto Bias" 
                countLabel={`${currencySignals.length} Active`}
              />
              <div className="flex flex-col">
                {signalsLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading signals...</div>
                ) : currencySignals.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No active signals at the moment</div>
                ) : (
                  currencySignals.slice(0, 10).map(signal => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))
                )}
              </div>
            </section>

            {/* Instruments Watchlist */}
            <section className="bg-card border-t-2 border-foreground">
              <SectionHeader 
                icon={Eye} 
                title="Instruments Watchlist" 
              />
              <div className="flex flex-col">
                {setupsLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading watchlist...</div>
                ) : watchlistItems.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No instruments being monitored</div>
                ) : (
                  watchlistItems.slice(0, 8).map(item => (
                    <WatchlistCard key={item.id} item={item} />
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
