import { useQuery } from '@tanstack/react-query';
import SignalCard from '@/components/SignalCard';
import WatchlistCard from '@/components/WatchlistCard';
import { Target, Eye } from 'lucide-react';

const SectionHeader = ({ icon: Icon, title, countLabel }: any) => (
  <div className="flex items-center justify-between py-4 border-b-2 border-gray-900 bg-white dark:bg-background px-6">
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5 text-gray-900 dark:text-foreground" />
      <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground tracking-tight uppercase">{title}</h2>
    </div>
    {countLabel && (
      <span className="px-3 py-1 text-xs font-bold text-gray-900 dark:text-foreground bg-amber-200 dark:bg-amber-500/30 uppercase tracking-widest border border-gray-900 dark:border-amber-500">
        {countLabel}
      </span>
    )}
  </div>
);

export default function Stocks() {
  const { data: allSignals = [], isLoading: signalsLoading } = useQuery<any[]>({
    queryKey: ['/api/trading-signals'],
    refetchInterval: 10000,
  });

  const { data: pendingSetups = [], isLoading: setupsLoading } = useQuery<any[]>({
    queryKey: ['/api/pending-setups'],
    refetchInterval: 15000,
  });

  const stockSignals = allSignals.filter(s => s.assetClass === 'stock');
  const watchlistItems = pendingSetups.filter(s => !s.readyForSignal && s.assetClass === 'stock');

  return (
    <div className="min-h-screen bg-[#f7f7f7] dark:bg-background text-gray-800 dark:text-foreground p-4 md:p-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 flex flex-col gap-8">
          <section className="bg-white dark:bg-background border-t-2 border-gray-900 dark:border-foreground">
            <SectionHeader 
              icon={Target} 
              title="US Stock Signals" 
              countLabel={`${stockSignals.length} Active`}
            />
            <div className="flex flex-col">
              {signalsLoading ? (
                <div className="p-8 text-center text-gray-500 dark:text-muted-foreground">Loading signals...</div>
              ) : stockSignals.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-muted-foreground">No active stock signals</div>
              ) : (
                stockSignals.map(signal => (
                  <SignalCard key={signal.id} signal={signal} />
                ))
              )}
            </div>
          </section>
        </div>

        <div className="lg:col-span-4">
          <section className="bg-white dark:bg-background border-t-2 border-gray-900 dark:border-foreground sticky top-8">
            <SectionHeader icon={Eye} title="Stock Watchlist" />
            <div className="flex flex-col">
              {setupsLoading ? (
                <div className="p-8 text-center text-gray-500 dark:text-muted-foreground">Loading watchlist...</div>
              ) : watchlistItems.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-muted-foreground">No stocks being monitored</div>
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
