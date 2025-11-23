import { useQuery } from '@tanstack/react-query';
import SignalCard from '@/components/SignalCard';
import StockSignalCard from '@/components/StockSignalCard';
import WatchlistCard from '@/components/WatchlistCard';
import SectionHeader from '@/components/SectionHeader';
import { Target, Activity, Eye, Search, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <div className="min-h-screen bg-muted/30 text-foreground p-4 md:p-8">
      {/* Header */}
      <header className="mb-8 max-w-7xl mx-auto bg-card border-2 border-foreground p-6">
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">AI Trading Market Analyzer</h1>
        <p className="text-sm text-muted-foreground mt-1">Consolidated view of real-time market data and instrument analysis.</p>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Signals (takes 8/12 = 2/3 width) */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          
          {/* Section 1: Currency & Crypto Bias */}
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

          {/* Section 2: Stocks Bias */}
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

        {/* Right Column: Watchlist (takes 4/12 = 1/3 width) */}
        <div className="lg:col-span-4">
          <section className="bg-card border-t-2 border-foreground sticky top-8">
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
            
            <div className="p-4 border-t border-border bg-muted/50 text-center">
              <Button 
                variant="ghost" 
                className="text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-1 w-full transition-colors"
                data-testid="button-search-instruments"
              >
                <Search className="w-4 h-4"/> 
                Search All Instruments 
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
