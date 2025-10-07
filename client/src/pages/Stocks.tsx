import TradingSignals from '@/components/TradingSignals';
import InstrumentsToWatch from '@/components/InstrumentsToWatch';
import { TrendingUp } from 'lucide-react';

export default function Stocks() {
  return (
    <div className="p-6 space-y-6">
      {/* Header Section */}
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <TrendingUp className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Stock Analysis</h1>
            <p className="text-sm text-muted-foreground">
              Real-time analysis of 20 US equities with institutional trading methodology
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Stock Signals */}
        <div>
          <TradingSignals assetClassFilter="stock" title="Stock Signals" />
        </div>
        
        {/* Stock Instruments to Watch */}
        <div>
          <InstrumentsToWatch assetClassFilter="stock" />
        </div>
      </div>
    </div>
  );
}
