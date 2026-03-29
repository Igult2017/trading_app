import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  Globe,
  Clock,
  AlertCircle,
  ArrowRightLeft,
} from 'lucide-react';
import HomeHeader from '@/components/HomeHeader';
import HomeFooter from '@/components/HomeFooter';

const calendarEvents = [
  { id: 1, date: 'Dec 29', time: '15:30', country: 'US', currency: 'USD', event: 'Pending Home Sales MoM (Nov)', importance: 'High', actual: '3.3%', forecast: '1.0%', previous: '2.4%', category: 'Stocks' },
  { id: 2, date: 'Dec 29', time: '11:00', country: 'BR', currency: 'BRL', event: 'IGP-M Inflation MoM (Dec)', importance: 'Medium', actual: '-0.01%', forecast: '0.15%', previous: '0.27%', category: 'Currencies' },
  { id: 3, date: 'Dec 29', time: '15:30', country: 'US', currency: 'USD', event: 'Dallas Fed Manufacturing Index', importance: 'Medium', actual: '-10.9', forecast: '-2.5', previous: '-10.4', category: 'Stocks' },
  { id: 4, date: 'Dec 30', time: '19:00', country: 'US', currency: 'USD', event: 'FOMC Meeting Minutes (Dec)', importance: 'High', actual: '-', forecast: '-', previous: '-', category: 'Currencies' },
  { id: 5, date: 'Dec 30', time: '08:00', country: 'ES', currency: 'EUR', event: 'Inflation Rate YoY Prel (Dec)', importance: 'High', actual: '3.0%', forecast: '2.8%', previous: '3.0%', category: 'Currencies' },
  { id: 6, date: 'Dec 31', time: '01:30', country: 'CN', currency: 'CNY', event: 'NBS Manufacturing PMI (Dec)', importance: 'High', actual: '-', forecast: '50.1', previous: '50.3', category: 'Stocks' },
  { id: 7, date: 'Dec 31', time: '15:30', country: 'US', currency: 'USD', event: 'EIA Crude Oil Stocks Change', importance: 'High', actual: '-', forecast: '-2.4M', previous: '-1.27M', category: 'Commodities' },
  { id: 8, date: 'Jan 02', time: '09:00', country: 'EU', currency: 'EUR', event: 'HCOB Manufacturing PMI (Dec)', importance: 'Medium', actual: '-', forecast: '46.0', previous: '46.0', category: 'Currencies' },
  { id: 9, date: 'Jan 13', time: '13:30', country: 'US', currency: 'USD', event: 'CPI Inflation Rate YoY (Dec)', importance: 'High', actual: '-', forecast: '2.4%', previous: '2.6%', category: 'Currencies' },
];

const bankData: Record<string, { nominal: number; inflation: number }> = {
  USD: { nominal: 3.75, inflation: 2.60 },
  EUR: { nominal: 2.15, inflation: 2.20 },
  GBP: { nominal: 3.75, inflation: 2.10 },
  JPY: { nominal: 0.75, inflation: 2.40 },
  AUD: { nominal: 3.60, inflation: 2.80 },
  CAD: { nominal: 2.25, inflation: 2.00 },
  CHF: { nominal: 0.00, inflation: 1.40 },
  NZD: { nominal: 2.25, inflation: 2.10 },
  BRL: { nominal: 15.00, inflation: 4.50 },
  INR: { nominal: 5.25, inflation: 4.80 },
};

const currencyPairs = [
  { base: 'USD', quote: 'JPY', trend: 'up' },
  { base: 'EUR', quote: 'USD', trend: 'down' },
  { base: 'GBP', quote: 'USD', trend: 'down' },
  { base: 'AUD', quote: 'USD', trend: 'up' },
  { base: 'USD', quote: 'CAD', trend: 'up' },
  { base: 'USD', quote: 'CHF', trend: 'up' },
  { base: 'NZD', quote: 'USD', trend: 'down' },
  { base: 'EUR', quote: 'GBP', trend: 'down' },
];

const filterCategories = ['All', 'Currencies', 'Crypto', 'Commodities', 'Stocks', 'Rate Differentials'];

function getImportanceColor(imp: string) {
  switch (imp) {
    case 'High': return 'bg-red-100 text-red-700 border-red-200';
    case 'Medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    default: return 'bg-blue-100 text-blue-700 border-blue-200';
  }
}

export default function EconomicCalendarPage() {
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const [location] = useLocation();

  const filteredEvents = calendarEvents.filter(event => {
    const matchesCategory = filter === 'All' || event.category === filter;
    const matchesSearch =
      event.event.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.currency.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;900&display=swap');`}</style>

      <HomeHeader darkMode={darkMode} setDarkMode={setDarkMode} activePath={location} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="space-y-4">

          {/* Filter + Search bar */}
          <div className="flex flex-col sm:flex-row gap-0 items-stretch justify-between">
            <div className="flex items-center overflow-x-auto w-full sm:w-auto no-scrollbar border border-slate-300 bg-white">
              {filterCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-200 last:border-r-0 transition-all whitespace-nowrap ${filter === cat ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-slate-600 text-[10px] font-black bg-white px-4 py-3 border border-slate-300 border-t-0 sm:border-t uppercase tracking-widest">
              <Clock size={14} />
              <span>UTC</span>
            </div>
          </div>

          {/* Rate Differentials view */}
          {filter === 'Rate Differentials' ? (
            <div className="space-y-12">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-0 border border-slate-300 bg-white">

                {/* Central Bank Rates */}
                <div className="lg:col-span-2 border-r border-slate-300">
                  <div className="bg-slate-900 p-4 border-b border-slate-900">
                    <h2 className="text-[10px] font-black flex items-center gap-2 text-white uppercase tracking-widest">
                      <Globe size={14} />
                      Terminal Rates &amp; Real Yields
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">CCY</th>
                          <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Nominal</th>
                          <th className="px-6 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Inflation</th>
                          <th className="px-6 py-3 text-[9px] font-black text-indigo-600 uppercase tracking-widest text-right">Real Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {Object.entries(bankData).map(([ccy, data]) => {
                          const realRate = data.nominal - data.inflation;
                          return (
                            <tr key={ccy} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-black text-xs text-slate-800">{ccy}</td>
                              <td className="px-6 py-4 text-xs font-bold text-slate-600 text-right">{data.nominal.toFixed(2)}%</td>
                              <td className="px-6 py-4 text-xs font-bold text-slate-600 text-right">{data.inflation.toFixed(2)}%</td>
                              <td className={`px-6 py-4 text-sm font-black text-right ${realRate > 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                                {realRate.toFixed(2)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Currency Pair Differentials */}
                <div className="lg:col-span-2">
                  <div className="bg-slate-900 p-4 border-b border-slate-900">
                    <h2 className="text-[10px] font-black flex items-center gap-2 text-white uppercase tracking-widest">
                      <ArrowRightLeft size={14} />
                      Currency Pair Differentials
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-y divide-slate-200">
                    {currencyPairs.map((pair) => {
                      const diff = bankData[pair.base].nominal - bankData[pair.quote].nominal;
                      return (
                        <div key={`${pair.base}${pair.quote}`} className="p-6 hover:bg-slate-50 transition-all border-slate-200">
                          <div className="flex items-center justify-between mb-4">
                            <span className="font-black text-slate-900 text-sm tracking-tighter">{pair.base}/{pair.quote}</span>
                            <div className={`text-[10px] font-black ${pair.trend === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {pair.trend === 'up' ? 'BULLISH' : 'BEARISH'}
                            </div>
                          </div>
                          <div className="flex items-end justify-between mb-4">
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Spread</p>
                              <h3 className="text-xl font-black text-slate-900 tracking-tighter">
                                {diff > 0 ? '+' : ''}{diff.toFixed(2)}%
                              </h3>
                            </div>
                            <div className={`text-[9px] font-black border px-2 py-1 ${diff > 3 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                              {diff > 3 ? 'CARRY' : 'STANDARD'}
                            </div>
                          </div>
                          <div className="pt-4 border-t border-slate-100 flex justify-between text-[9px] font-black text-slate-400 tracking-tighter uppercase">
                            <span>{pair.base} {bankData[pair.base].nominal}%</span>
                            <span>{pair.quote} {bankData[pair.quote].nominal}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

          ) : (
            /* Economic Calendar Table */
            <div className="bg-white border border-slate-300 overflow-hidden overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-900">
                    <th className="px-6 py-4 text-[10px] font-black text-white uppercase tracking-widest">Date</th>
                    <th className="px-6 py-4 text-[10px] font-black text-white uppercase tracking-widest">Time</th>
                    <th className="px-6 py-4 text-[10px] font-black text-white uppercase tracking-widest">Ccy</th>
                    <th className="px-6 py-4 text-[10px] font-black text-white uppercase tracking-widest">Event Description</th>
                    <th className="px-6 py-4 text-[10px] font-black text-white uppercase tracking-widest text-center">Impact</th>
                    <th className="px-6 py-4 text-[10px] font-black text-white uppercase tracking-widest text-right">Actual</th>
                    <th className="px-6 py-4 text-[10px] font-black text-white uppercase tracking-widest text-right">Forecast</th>
                    <th className="px-6 py-4 text-[10px] font-black text-white uppercase tracking-widest text-right">Prev</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredEvents.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-black text-slate-700">{item.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-slate-500">{item.time}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="w-8 py-1 inline-flex items-center justify-center bg-slate-200 text-[10px] font-black text-slate-700">
                          {item.currency}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-slate-900 font-bold">{item.event}</div>
                        <div className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">{item.category}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`px-2 py-1 text-[9px] font-black border uppercase tracking-tighter rounded-none ${getImportanceColor(item.importance)}`}>
                          {item.importance}
                        </span>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-xs font-black text-right ${item.actual === '-' ? 'text-slate-400' : (parseFloat(item.actual) > parseFloat(item.forecast) ? 'text-emerald-700' : 'text-rose-700')}`}>
                        {item.actual}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600 font-bold text-right">{item.forecast}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600 font-bold text-right">{item.previous}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredEvents.length === 0 && (
                <div className="p-20 text-center text-slate-400 border-t border-slate-200">
                  <AlertCircle className="mx-auto mb-4 opacity-40" size={32} />
                  <p className="font-black text-xs uppercase tracking-widest text-slate-500">No matching data points found</p>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
      <HomeFooter />
    </div>
  );
}
