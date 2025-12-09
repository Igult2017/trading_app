import TradingSession from '@/components/TradingSession';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import SignalCard from '@/components/SignalCard';
import StockSignalCard from '@/components/StockSignalCard';
import WatchlistCard from '@/components/WatchlistCard';
import SectionHeader from '@/components/SectionHeader';
import { Zap, Activity, Bookmark } from 'lucide-react';
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

  // Filter active signals (all timeframes confirmed) vs watchlist (HTF only)
  const activeSignals = allSignals.filter(s => s.status === 'active');
  const watchlistSignals = allSignals.filter(s => s.status === 'watchlist' || s.status === 'pending');
  
  // Split active signals by asset class
  const activeCurrencySignals = activeSignals.filter(s => {
    const assetClass = s.assetClass?.toLowerCase();
    return assetClass === 'forex' || assetClass === 'crypto' || assetClass === 'commodity';
  });
  const activeStockSignals = activeSignals.filter(s => s.assetClass?.toLowerCase() === 'stock' || s.assetClass?.toLowerCase() === 'index');
  
  // Split watchlist signals by asset class
  const watchlistCurrencySignals = watchlistSignals.filter(s => {
    const assetClass = s.assetClass?.toLowerCase();
    return assetClass === 'forex' || assetClass === 'crypto' || assetClass === 'commodity';
  });
  const watchlistStockSignals = watchlistSignals.filter(s => s.assetClass?.toLowerCase() === 'stock' || s.assetClass?.toLowerCase() === 'index');
  
  // Pending setups from scanner (not yet saved as signals)
  const pendingWatchlistItems = pendingSetups.filter(s => s.readyForSignal !== true);

  return (
    <div>
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Search Bar */}
        <div className="border border-blue-500/50 bg-card dark:bg-background rounded-none shadow-md" style={{ fontFamily: "'Montserrat', sans-serif" }}>
          <div className="relative flex items-center py-4 px-6">
            <Search className="h-5 w-5 text-muted-foreground mr-4" />
            <input
              type="text"
              placeholder="Search markets, pairs, or signals..."
              className="flex-grow bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Trading Sessions */}
        <TradingSession />

        {/* Full-Width Sections - NO SIDEBARS */}
        <div className="space-y-8">
          
          {/* Section 1: Active Currency, Metals & Crypto Signals - ALL 4 TIERS CONFIRMED */}
          <section className="bg-card border-t-2 border-bull-green">
            <SectionHeader 
              icon={Zap} 
              title="Active Signals - Currency, Metals & Crypto" 
              countLabel={`${activeCurrencySignals.length} Confirmed`}
              variant="confirmed"
            />
            <p className="px-6 py-1.5 text-[10px] text-muted-foreground/50 border-b border-border/30 italic">
              1D Context + Major Zone (4H/2H/1H) + Zone ID (30M/15M) + Entry Trigger (5M/3M/1M) all confirmed
            </p>
            <div className="flex flex-col">
              {signalsLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading signals...</div>
              ) : activeCurrencySignals.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground/70 text-sm">No confirmed signals - waiting for entry trigger on 5M/3M/1M</div>
              ) : (
                activeCurrencySignals.slice(0, 10).map(signal => (
                  <SignalCard key={signal.id} signal={signal} />
                ))
              )}
            </div>
          </section>

          {/* Section 2: Active Stock & Index Signals - ALL 4 TIERS CONFIRMED */}
          <section className="bg-card border-t-2 border-bull-green">
            <SectionHeader 
              icon={Zap} 
              title="Active Signals - Stocks & Indices" 
              countLabel={`${activeStockSignals.length} Confirmed`}
              variant="confirmed"
            />
            <p className="px-6 py-1.5 text-[10px] text-muted-foreground/50 border-b border-border/30 italic">
              1D Context + Major Zone (4H/2H/1H) + Zone ID (30M/15M) + Entry Trigger (5M/3M/1M) all confirmed
            </p>
            <div className="flex flex-col">
              {signalsLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading stock signals...</div>
              ) : activeStockSignals.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground/70 text-sm">No confirmed stock signals - waiting for entry trigger on 5M/3M/1M</div>
              ) : (
                activeStockSignals.slice(0, 10).map(signal => (
                  <StockSignalCard key={signal.id} signal={signal} />
                ))
              )}
            </div>
          </section>

          {/* Section 3: Watchlist - 3 TIERS CONFIRMED, AWAITING ENTRY TRIGGER */}
          <section className="bg-card border-t-2 border-amber-500">
            <SectionHeader 
              icon={Bookmark} 
              title="Watchlist - Awaiting Entry Trigger" 
              countLabel={`${watchlistCurrencySignals.length + watchlistStockSignals.length + pendingWatchlistItems.length} Pending`}
              variant="pending"
            />
            <p className="px-6 py-1.5 text-[10px] text-muted-foreground/50 border-b border-border/30 italic">
              1D Context + Major Zone (4H/2H/1H) + Zone ID (30M/15M) confirmed. Watching 5M/3M/1M for entry trigger.
            </p>
            <div className="flex flex-col">
              {signalsLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading watchlist...</div>
              ) : (watchlistCurrencySignals.length + watchlistStockSignals.length + pendingWatchlistItems.length) === 0 ? (
                <div className="p-8 text-center text-muted-foreground/70 text-sm">No pending setups - scanning for major zones on 4H/2H/1H...</div>
              ) : (
                <>
                  {watchlistCurrencySignals.slice(0, 5).map(signal => (
                    <SignalCard key={signal.id} signal={signal} isWatchlist={true} />
                  ))}
                  {watchlistStockSignals.slice(0, 5).map(signal => (
                    <StockSignalCard key={signal.id} signal={signal} isWatchlist={true} />
                  ))}
                  {pendingWatchlistItems.slice(0, 5).map(item => (
                    <WatchlistCard key={`pending-${item.symbol}-${item.id}`} item={item} />
                  ))}
                </>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
