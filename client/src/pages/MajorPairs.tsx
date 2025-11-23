import { useQuery } from '@tanstack/react-query';
import SignalCard from '@/components/SignalCard';
import WatchlistCard from '@/components/WatchlistCard';
import { Target, Eye } from 'lucide-react';

const SectionHeader = ({ icon: Icon, title, countLabel }: any) => (
  <div className="flex items-center justify-between py-4 border-b-2 border-gray-900 bg-white px-6">
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5 text-gray-900" />
      <h2 className="text-xl font-extrabold text-gray-900 tracking-tight uppercase">{title}</h2>
    </div>
    {countLabel && (
      <span className="px-3 py-1 text-xs font-bold text-gray-900 bg-amber-200 uppercase tracking-widest border border-gray-900">
        {countLabel}
      </span>
    )}
  </div>
);

export default function MajorPairs() {
  const { data: allSignals = [], isLoading: signalsLoading } = useQuery<any[]>({
    queryKey: ['/api/trading-signals'],
    refetchInterval: 10000,
  });

  const { data: pendingSetups = [], isLoading: setupsLoading } = useQuery<any[]>({
    queryKey: ['/api/pending-setups'],
    refetchInterval: 15000,
  });

  const forexSignals = allSignals.filter(s => s.assetClass === 'forex');
  const watchlistItems = pendingSetups.filter(s => !s.readyForSignal && s.assetClass === 'forex');

  return (
    <div className="min-h-screen bg-[#f7f7f7] text-gray-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 flex flex-col gap-8">
          <section className="bg-white border-t-2 border-gray-900">
            <SectionHeader 
              icon={Target} 
              title="Major Forex Pairs Signals" 
              countLabel={`${forexSignals.length} Active`}
            />
            <div className="flex flex-col">
              {signalsLoading ? (
                <div className="p-8 text-center text-gray-500">Loading signals...</div>
              ) : forexSignals.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No active forex signals</div>
              ) : (
                forexSignals.map(signal => (
                  <SignalCard key={signal.id} signal={signal} />
                ))
              )}
            </div>
          </section>
        </div>

        <div className="lg:col-span-4">
          <section className="bg-white border-t-2 border-gray-900 sticky top-8">
            <SectionHeader icon={Eye} title="Forex Watchlist" />
            <div className="flex flex-col">
              {setupsLoading ? (
                <div className="p-8 text-center text-gray-500">Loading watchlist...</div>
              ) : watchlistItems.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No instruments being monitored</div>
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
