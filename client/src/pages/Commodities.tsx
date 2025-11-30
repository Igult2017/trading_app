import { useQuery } from '@tanstack/react-query';
import SignalCard from '@/components/SignalCard';
import WatchlistCard from '@/components/WatchlistCard';
import SectionHeader from '@/components/SectionHeader';
import { Target, Bookmark } from 'lucide-react';

export default function Commodities() {
  const { data: allSignals = [], isLoading: signalsLoading } = useQuery<any[]>({
    queryKey: ['/api/trading-signals'],
    refetchInterval: 10000,
  });

  const { data: pendingSetups = [], isLoading: setupsLoading } = useQuery<any[]>({
    queryKey: ['/api/pending-setups'],
    refetchInterval: 15000,
  });

  const commoditySignals = allSignals.filter(s => s.assetClass === 'commodity');
  const watchlistItems = pendingSetups.filter(s => !s.readyForSignal && s.assetClass === 'commodity');

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 flex flex-col gap-8">
          <section className="bg-card border-t-2 border-gray-900 dark:border-foreground">
            <SectionHeader 
              icon={Target} 
              title="Commodity Signals (Gold, Oil, Metals)" 
              countLabel={`${commoditySignals.length} Active`}
              variant="active"
            />
            <div className="flex flex-col">
              {signalsLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading signals...</div>
              ) : commoditySignals.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No active commodity signals</div>
              ) : (
                commoditySignals.map(signal => (
                  <SignalCard key={signal.id} signal={signal} />
                ))
              )}
            </div>
          </section>
        </div>

        <div className="lg:col-span-4">
          <section className="bg-card border-t-2 border-gray-900 dark:border-foreground sticky top-8">
            <SectionHeader 
              icon={Bookmark} 
              title="Commodity Watchlist" 
              countLabel={`${watchlistItems.length} Pending`}
              variant="pending"
            />
            <div className="flex flex-col">
              {setupsLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading watchlist...</div>
              ) : watchlistItems.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No instruments being monitored</div>
              ) : (
                watchlistItems.map(item => (
                  <WatchlistCard key={item.id} item={item} />
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
