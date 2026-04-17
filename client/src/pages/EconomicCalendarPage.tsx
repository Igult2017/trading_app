import { useState } from 'react';
import { usePageTracking } from '@/hooks/usePageTracking';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  Globe,
  Clock,
  AlertCircle,
  ArrowRightLeft,
  Loader2,
} from 'lucide-react';
import HomeHeader from '@/components/HomeHeader';
import HomeFooter from '@/components/HomeFooter';

interface CalendarEvent {
  date: string;
  time: string;
  currency: string;
  event: string;
  importance: 'High' | 'Medium' | 'Low';
  actual: string;
  forecast: string;
  previous: string;
  eventTime: string;
  category: string;
}

interface RateEntry {
  nominal: number;
  inflation: number | null;
  bank: string;
  live: boolean;
}

const currencyPairs = [
  { base: 'USD', quote: 'JPY' },
  { base: 'EUR', quote: 'USD' },
  { base: 'GBP', quote: 'USD' },
  { base: 'AUD', quote: 'USD' },
  { base: 'USD', quote: 'CAD' },
  { base: 'USD', quote: 'CHF' },
  { base: 'NZD', quote: 'USD' },
  { base: 'EUR', quote: 'GBP' },
];

const filterCategories = ['All', 'Currencies', 'Crypto', 'Commodities', 'Stocks', 'Rate Differentials'];

function getImportanceColor(imp: string) {
  switch (imp) {
    case 'High':   return 'bg-red-100 text-red-700 border-red-200';
    case 'Medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    default:       return 'bg-blue-100 text-blue-700 border-blue-200';
  }
}

const IMPACT_LEVELS = ['All', 'High', 'Medium', 'Low'] as const;

export default function EconomicCalendarPage() {
  usePageTracking('calendar');
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [ccyFilter, setCcyFilter] = useState('All');
  const [impactFilter, setImpactFilter] = useState('All');
  const [darkMode, setDarkMode] = useState(true);
  const [location] = useLocation();

  const { data: eventsRaw, isLoading: loadingEvents } = useQuery<CalendarEvent[]>({
    queryKey: ['/api/homepage/calendar'],
    queryFn: () => fetch('/api/homepage/calendar').then(r => r.json()).then(d => Array.isArray(d) ? d : []).catch(() => []),
    staleTime: 5 * 60 * 1000,
    gcTime:    30 * 60 * 1000,
  });
  const { data: bankDataRaw, isLoading: loadingRates } = useQuery<Record<string, RateEntry>>({
    queryKey: ['/api/homepage/rates'],
    queryFn: () => fetch('/api/homepage/rates').then(r => r.json()).then(d => (d && typeof d === 'object' ? d : {})).catch(() => ({})),
    staleTime: 5 * 60 * 1000,
    gcTime:    30 * 60 * 1000,
  });
  const events   = eventsRaw   ?? [];
  const bankData = bankDataRaw ?? {};

  const availableCurrencies = ['All', ...Array.from(new Set(events.map(e => e.currency))).filter(Boolean).sort()];

  const filteredEvents = events.filter(event => {
    if (filter === 'Rate Differentials') return false;
    const matchesCategory = filter === 'All' || event.category === filter;
    const matchesSearch =
      event.event.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.currency.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCcy = ccyFilter === 'All' || event.currency === ccyFilter;
    const matchesImpact = impactFilter === 'All' || event.importance === impactFilter;
    return matchesCategory && matchesSearch && matchesCcy && matchesImpact;
  });

  const loading = loadingEvents || loadingRates;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>
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

          {/* Search + CCY + Impact filters (hidden on Rate Differentials tab) */}
          {filter !== 'Rate Differentials' && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Search events or currency..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-400"
              />

              {/* CCY dropdown */}
              <div className="relative">
                <select
                  value={ccyFilter}
                  onChange={e => setCcyFilter(e.target.value)}
                  className="appearance-none border border-slate-300 bg-white px-4 py-2 pr-8 text-[10px] font-black uppercase tracking-widest text-slate-700 outline-none focus:border-indigo-400 cursor-pointer w-full sm:w-auto"
                >
                  {availableCurrencies.map(ccy => (
                    <option key={ccy} value={ccy}>{ccy === 'All' ? 'All CCY' : ccy}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                  <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Impact dropdown */}
              <div className="relative">
                <select
                  value={impactFilter}
                  onChange={e => setImpactFilter(e.target.value)}
                  className="appearance-none border border-slate-300 bg-white px-4 py-2 pr-8 text-[10px] font-black uppercase tracking-widest text-slate-700 outline-none focus:border-indigo-400 cursor-pointer w-full sm:w-auto"
                >
                  {IMPACT_LEVELS.map(level => (
                    <option key={level} value={level}>{level === 'All' ? 'All Impact' : `${level} Impact`}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                  <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Clear filters button — only shown when a filter is active */}
              {(ccyFilter !== 'All' || impactFilter !== 'All' || searchQuery) && (
                <button
                  onClick={() => { setCcyFilter('All'); setImpactFilter('All'); setSearchQuery(''); }}
                  className="border border-slate-300 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors whitespace-nowrap"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-16 bg-white border border-slate-300">
              <Loader2 className="animate-spin text-indigo-500 mr-3" size={20} />
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Loading live data…</span>
            </div>
          )}

          {/* Rate Differentials view */}
          {!loading && filter === 'Rate Differentials' && (
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
                          const realRate = data.inflation != null ? data.nominal - data.inflation : null;
                          return (
                            <tr key={ccy} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="font-black text-xs text-slate-800">{ccy}</div>
                                {data.live && (
                                  <div className="text-[8px] text-emerald-600 font-black uppercase">live</div>
                                )}
                              </td>
                              <td className="px-6 py-4 text-xs font-bold text-slate-600 text-right">{data.nominal.toFixed(2)}%</td>
                              <td className="px-6 py-4 text-xs font-bold text-slate-600 text-right">
                                {data.inflation != null ? `${data.inflation.toFixed(2)}%` : '—'}
                              </td>
                              <td className={`px-6 py-4 text-sm font-black text-right ${realRate == null ? 'text-slate-400' : realRate > 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                                {realRate != null ? `${realRate.toFixed(2)}%` : '—'}
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
                    {currencyPairs
                      .filter(p => bankData[p.base] && bankData[p.quote])
                      .map((pair) => {
                        const diff = bankData[pair.base].nominal - bankData[pair.quote].nominal;
                        const isCarry = Math.abs(diff) > 3;
                        return (
                          <div key={`${pair.base}${pair.quote}`} className="p-6 hover:bg-slate-50 transition-all border-slate-200">
                            <div className="flex items-center justify-between mb-4">
                              <span className="font-black text-slate-900 text-sm tracking-tighter">{pair.base}/{pair.quote}</span>
                              <div className={`text-[10px] font-black ${diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {diff > 0 ? 'BULLISH' : 'BEARISH'}
                              </div>
                            </div>
                            <div className="flex items-end justify-between mb-4">
                              <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Spread</p>
                                <h3 className="text-xl font-black text-slate-900 tracking-tighter">
                                  {diff > 0 ? '+' : ''}{diff.toFixed(2)}%
                                </h3>
                              </div>
                              <div className={`text-[9px] font-black border px-2 py-1 ${isCarry ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                {isCarry ? 'CARRY' : 'STANDARD'}
                              </div>
                            </div>
                            <div className="pt-4 border-t border-slate-100 flex justify-between text-[9px] font-black text-slate-400 tracking-tighter uppercase">
                              <span>{pair.base} {bankData[pair.base].nominal.toFixed(2)}%</span>
                              <span>{pair.quote} {bankData[pair.quote].nominal.toFixed(2)}%</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Economic Calendar Table */}
          {!loading && filter !== 'Rate Differentials' && (
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
                  {filteredEvents.map((item, idx) => {
                    const actualNum = parseFloat(item.actual);
                    const forecastNum = parseFloat(item.forecast);
                    const hasNumbers = !isNaN(actualNum) && !isNaN(forecastNum) && item.actual !== '-';
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
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
                        <td className={`px-6 py-4 whitespace-nowrap text-xs font-black text-right ${item.actual === '-' ? 'text-slate-400' : hasNumbers && actualNum > forecastNum ? 'text-emerald-700' : hasNumbers ? 'text-rose-700' : 'text-slate-700'}`}>
                          {item.actual}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600 font-bold text-right">{item.forecast}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600 font-bold text-right">{item.previous}</td>
                      </tr>
                    );
                  })}
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
