import { useState, useEffect } from 'react';
import { 
  Calendar, 
  BookOpen, 
  TrendingUp, 
  Zap, 
  LineChart, 
  ShieldCheck, 
  Newspaper,
  UserPlus,
  LogIn, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  ChevronRight, 
  Activity, 
  BarChart3, 
  Coins, 
  History, 
  Loader2, 
  Mail, 
  TrendingDown, 
  Target,
  Search,
  Gem
} from 'lucide-react';
import NewHeader from '@/components/NewHeader';
import NewFooter from '@/components/NewFooter';

const MarketRow = ({ pair, price, change, up }: { pair: string; price: string; change: string; up: boolean }) => (
  <div className="flex justify-between items-center py-3 border-b border-white/5 hover:bg-white/5 transition-all px-2 group cursor-pointer" data-testid={`market-row-${pair.toLowerCase()}`}>
    <span className="font-mono text-xs font-bold text-slate-400 group-hover:text-blue-400 transition-colors uppercase tracking-wider">{pair}</span>
    <div className="flex gap-4 items-center">
      <span className="font-mono text-sm font-semibold text-white tabular-nums">{price}</span>
      <span className={`text-[10px] font-bold px-2 py-1 min-w-[55px] text-center font-mono ${up ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'}`}>
        {change}
      </span>
    </div>
  </div>
);

export default function HomePage() {
  const [theme, setTheme] = useState('dark');

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const isDark = theme === 'dark';
  const bgColor = isDark ? 'bg-[#0a0e17]' : 'bg-[#f8f9fa]';
  const textColor = isDark ? 'text-[#e8eaed]' : 'text-[#1a1d23]';
  const borderColor = isDark ? 'border-white/10' : 'border-black/10';
  const sectionBorder = isDark ? 'border-white/5' : 'border-black/5';

  const blogImages: Record<string, string> = {
    liquidity: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='500'%3E%3Cdefs%3E%3ClinearGradient id='a' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%231e293b;stop-opacity:1'/%3E%3Cstop offset='100%25' style='stop-color:%230f172a;stop-opacity:1'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='800' height='500' fill='url(%23a)'/%3E%3Cpath d='M100 350 L200 280 L300 320 L400 220 L500 260 L600 180 L700 200' stroke='%233b82f6' stroke-width='4' fill='none' opacity='0.8'/%3E%3Ctext x='400' y='250' font-family='Arial' font-size='48' font-weight='bold' fill='white' text-anchor='middle' opacity='0.1'%3ELIQUIDITY%3C/text%3E%3C/svg%3E",
    fomo: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='500'%3E%3Cdefs%3E%3ClinearGradient id='b' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%231e293b;stop-opacity:1'/%3E%3Cstop offset='100%25' style='stop-color:%230f172a;stop-opacity:1'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='800' height='500' fill='url(%23b)'/%3E%3Cpath d='M100 400 L700 100' stroke='%23ef4444' stroke-width='5' fill='none' opacity='0.6'/%3E%3Ctext x='400' y='280' font-family='Arial' font-size='56' font-weight='bold' fill='white' text-anchor='middle' opacity='0.1'%3EFOMO%3C/text%3E%3C/svg%3E",
    structure: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='500'%3E%3Cdefs%3E%3ClinearGradient id='c' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%231e293b;stop-opacity:1'/%3E%3Cstop offset='100%25' style='stop-color:%230f172a;stop-opacity:1'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='800' height='500' fill='url(%23c)'/%3E%3Crect x='100' y='300' width='50' height='100' fill='%2310b981' opacity='0.5'/%3E%3Crect x='240' y='280' width='50' height='120' fill='%2310b981' opacity='0.5'/%3E%3Ctext x='400' y='120' font-family='Arial' font-size='42' font-weight='bold' fill='white' text-anchor='middle' opacity='0.1'%3ESTRUTURE%3C/text%3E%3C/svg%3E"
  };

  return (
    <div className={`min-h-screen ${bgColor} ${textColor} font-sans selection:bg-blue-500/30 overflow-x-hidden transition-colors duration-300`} style={{ fontFamily: "'Montserrat', 'Helvetica Neue', Arial, sans-serif" }}>
      <style>{`
        * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        .font-serif { font-family: 'Playfair Display', serif; }
        
        .glass-card {
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border-radius: 0 !important;
        }

        .glass-card:hover {
          border-color: rgba(59, 130, 246, 0.3);
          box-shadow: 0 20px 40px -20px rgba(0, 0, 0, 0.5);
          transform: translateY(-2px);
        }

        .section-tag {
          font-family: 'Playfair Display', serif;
          font-size: 1.25rem;
          font-weight: 900;
          font-style: italic;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
          border-bottom: 2px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 8px;
        }

        h3 {
          font-family: 'Playfair Display', serif;
          font-weight: 700;
        }

        .primary-btn {
          background: #2563eb;
          transition: all 0.2s;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 800;
          font-size: 11px;
          border-radius: 0 !important;
        }

        .primary-btn:hover {
          background: #3b82f6;
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
        }

        .secondary-btn {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: all 0.2s;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 800;
          font-size: 11px;
          border-radius: 0 !important;
        }

        .secondary-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .magazine-title {
          font-family: 'Playfair Display', serif;
          font-weight: 900;
          font-size: 1.5rem;
          line-height: 1.1;
          color: #fff;
        }

        input, .inner-card {
           border-radius: 0 !important;
        }
      `}</style>

      <NewHeader isDark={isDark} toggleTheme={toggleTheme} />

      <section className="px-6 py-4 md:py-6">
        <div className="max-w-7xl mx-auto">
          <div className="relative group">
            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
              <Search className="text-blue-500 transition-colors" size={20} />
            </div>
            <input 
              type="text" 
              placeholder="search..." 
              className={`w-full ${isDark ? 'bg-white/[0.03] text-white focus:bg-white/[0.05]' : 'bg-black/[0.03] text-black focus:bg-black/[0.05]'} border ${borderColor} py-6 pl-16 pr-6 text-xs font-black uppercase tracking-[0.2em] focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-500`}
              data-testid="input-search"
            />
          </div>
        </div>
      </section>

      <div className="max-w-[1400px] mx-auto px-6 py-6 md:py-12">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <section id="journal" className="glass-card p-8 border-blue-500/20 bg-blue-500/[0.02]" data-testid="section-journal">
            <h2 className="section-tag">
              <History size={18} className="text-blue-500" /> Free Journal
            </h2>
            <div className="space-y-6">
              <div className="bg-white/5 border border-white/5 p-5 inner-card backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={18} className="text-blue-400" />
                  <h3 className="font-bold text-white text-xl">Build Your Edge</h3>
                </div>
                <p className="text-sm text-blue-400 leading-relaxed mb-4 italic">
                  Build Your Edge. Get real-time analytics on your trades. Track performance and uncover your market edge.
                </p>
                <div className="flex items-center gap-3 p-3 bg-black/40 border border-white/10 inner-card">
                  <Mail size={14} className="text-slate-500" />
                  <input type="text" placeholder="your@email.com" className="bg-transparent text-xs font-medium text-white placeholder-slate-600 outline-none flex-1" data-testid="input-email-journal" />
                </div>
              </div>
              <div className="p-4 bg-white/5 border border-white/5 inner-card hover:border-blue-500/30 transition-all cursor-pointer">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-blue-500 font-mono text-[9px] font-bold tracking-widest uppercase">Latest Entry</p>
                  <TrendingDown size={14} className="text-emerald-400" />
                </div>
                <p className="font-bold text-white font-serif text-lg">XAUUSD Short</p>
                <p className="text-emerald-400 font-mono font-bold text-lg" data-testid="text-latest-entry-result">+2.0R</p>
              </div>
            </div>
            <button className="w-full mt-8 py-4 primary-btn text-white" data-testid="button-join-journal">
              Join Free Now
            </button>
          </section>

          <section id="calendar" className="glass-card p-8" data-testid="section-calendar">
            <h2 className="section-tag">
              <Calendar size={18} className="text-blue-500" /> Calendar
            </h2>
            <div className="space-y-4">
              <div className="p-4 bg-rose-500/5 border border-rose-500/10 hover:bg-rose-500/10 transition-all cursor-pointer inner-card">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-rose-400 font-mono tracking-widest uppercase">14:30 EST</p>
                  <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 text-[8px] font-bold uppercase tracking-tighter border border-rose-500/20">High Impact</span>
                </div>
                <p className="font-bold text-white text-xl font-serif">USD CPI (m/m)</p>
              </div>
              <div className="p-4 bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-all cursor-pointer inner-card">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-amber-400 font-mono tracking-widest uppercase">16:00 EST</p>
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[8px] font-bold rounded uppercase tracking-tighter border border-amber-500/20">Medium</span>
                </div>
                <p className="font-bold text-slate-300 text-xl font-serif">GBP GDP Growth</p>
              </div>
            </div>
            <button className="w-full mt-8 py-4 secondary-btn text-slate-300" data-testid="button-full-schedule">
              Full Schedule
            </button>
          </section>

          <section id="major-pairs" className="glass-card p-8" data-testid="section-major-pairs">
            <h2 className="section-tag">
              <Activity size={18} className="text-blue-500" /> Major Pairs
            </h2>
            <div className="space-y-1 bg-white/[0.02] p-2 border border-white/5 inner-card">
              <MarketRow pair="EURUSD" price="1.0842" change="+0.04%" up={true} />
              <MarketRow pair="GBPUSD" price="1.2631" change="-0.02%" up={false} />
              <MarketRow pair="USDJPY" price="149.22" change="+0.12%" up={true} />
              <MarketRow pair="AUDUSD" price="0.6512" change="-0.08%" up={false} />
            </div>
            <button className="w-full mt-8 py-4 secondary-btn text-slate-300" data-testid="button-view-all-fx">
              View All FX
            </button>
          </section>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <section id="us-stocks" className="glass-card p-8" data-testid="section-us-stocks">
            <h2 className="section-tag">
              <LineChart size={18} className="text-blue-500" /> US Stocks
            </h2>
            <div className="space-y-1 bg-white/[0.02] p-2 border border-white/5 inner-card">
              <MarketRow pair="NAS100" price="17,842" change="+1.24%" up={true} />
              <MarketRow pair="SPX500" price="5,021" change="+0.85%" up={true} />
              <MarketRow pair="US30" price="38,628" change="+0.44%" up={true} />
              <MarketRow pair="TSLA" price="192.45" change="-2.10%" up={false} />
            </div>
            <button className="w-full mt-8 py-4 secondary-btn text-slate-300" data-testid="button-indices-panel">
              Indices Panel
            </button>
          </section>

          <section id="cryptocurrency" className="glass-card p-8" data-testid="section-crypto">
            <h2 className="section-tag">
              <Coins size={18} className="text-blue-500" /> Crypto
            </h2>
            <div className="space-y-1 bg-white/[0.02] p-2 border border-white/5 inner-card">
              <MarketRow pair="BTCUSDT" price="68,412" change="+4.20%" up={true} />
              <MarketRow pair="ETHUSDT" price="3,452" change="+2.15%" up={true} />
              <MarketRow pair="SOLUSDT" price="142.10" change="-1.05%" up={false} />
              <MarketRow pair="BNBUSDT" price="592.30" change="+0.10%" up={true} />
            </div>
            <button className="w-full mt-8 py-4 secondary-btn text-slate-300" data-testid="button-trade-assets">
              Trade Assets
            </button>
          </section>

          <section id="verified-strategies" className="glass-card p-8 border-emerald-500/20 bg-emerald-500/[0.02]" data-testid="section-strategies">
            <h2 className="section-tag">
              <ShieldCheck size={18} className="text-emerald-500" /> Strategies
            </h2>
            <div className="space-y-4">
              <div className="p-5 bg-white/5 border border-white/5 inner-card hover:border-emerald-500/30 transition-all cursor-pointer group">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-bold text-emerald-400 uppercase font-mono tracking-widest">Zone Sniper v4</p>
                  <Target size={16} className="text-emerald-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-black text-white tracking-tighter font-serif" data-testid="text-winrate">68.2%</p>
                  <p className="text-xs font-bold text-emerald-500 uppercase tracking-tighter">Win Rate</p>
                </div>
              </div>
              <div className="p-5 bg-white/5 border border-white/5 inner-card hover:border-blue-500/30 transition-all cursor-pointer group">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-bold text-blue-400 uppercase font-mono tracking-widest">Trend Follower</p>
                  <TrendingUp size={16} className="text-blue-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-black text-white tracking-tighter font-serif" data-testid="text-risk-reward">1:2.4</p>
                  <p className="text-xs font-bold text-blue-500 uppercase tracking-tighter">Risk/Reward</p>
                </div>
              </div>
            </div>
            <button className="w-full mt-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] uppercase tracking-widest transition-all" data-testid="button-view-stats">
              View Full Stats
            </button>
          </section>
        </div>

        <section id="blog" className="glass-card p-8" data-testid="section-blog">
          <h2 className="section-tag">
            <Newspaper size={18} className="text-blue-500" /> Blog
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {['liquidity', 'fomo', 'structure'].map((key, i) => (
              <div key={key} className="group cursor-pointer" data-testid={`blog-card-${key}`}>
                <div className="aspect-[16/10] overflow-hidden border border-white/5 relative mb-5">
                  <img src={blogImages[key]} alt={key} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="magazine-title group-hover:text-blue-400 transition-colors mb-3">
                  {i === 0 && "Institutional Liquidity Gaps: Finding High Odds Entries"}
                  {i === 1 && "Dealing with Trading FOMO during high impact news"}
                  {i === 2 && "Market Structure Masterclass: Shifts vs Breaks"}
                </h3>
                <p className="font-mono text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  {i === 0 && "Education // 09 JAN"}
                  {i === 1 && "Psychology // 07 JAN"}
                  {i === 2 && "Technical // 05 JAN"}
                </p>
              </div>
            ))}
          </div>
        </section>

      </div>

      <NewFooter isDark={isDark} />
    </div>
  );
}