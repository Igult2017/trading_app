import { useState } from 'react';
import { Link } from 'wouter';
import {
  BellRing,
  Sun,
  Moon,
  Menu,
  X,
} from 'lucide-react';

const TelegramIcon = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

interface JournalHeaderProps {
  isDark: boolean;
  toggleTheme: () => void;
}

export default function JournalHeader({ isDark, toggleTheme }: JournalHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const sectionBorder = isDark ? 'border-white/5' : 'border-black/5';
  const borderColor = isDark ? 'border-white/10' : 'border-black/10';

  return (
    <>
      <nav className={`fixed w-full z-50 ${isDark ? 'bg-[#0d1117]' : 'bg-white'}`} data-testid="journal-nav-header">
        <div className={`border-b ${sectionBorder} ${isDark ? 'bg-[#0d1117]/40' : 'bg-white/40'} backdrop-blur-md`}>
          <div className="max-w-[1800px] mx-auto px-4 py-1.5 flex justify-between items-center text-[8px] font-bold uppercase tracking-widest">
            <div className="flex items-center gap-4">
              <a href="#" className={`flex items-center gap-1.5 transition-colors group ${isDark ? 'hover:text-white' : 'hover:text-black'}`} data-testid="link-telegram">
                <TelegramIcon size={10} color="#229ED9" /> <span className="group-hover:text-[#229ED9]">Join Telegram</span>
              </a>
              <a href="#" className="flex items-center gap-1.5 hover:text-blue-500 transition-colors" data-testid="link-subscribe">
                <BellRing size={10} /> Subscribe
              </a>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={toggleTheme}
                className={`flex items-center gap-1.5 p-0.5 px-1.5 border transition-all ${isDark ? 'border-white/10 hover:bg-white/5 text-slate-400' : 'border-black/10 hover:bg-black/5 text-slate-600'}`}
                data-testid="button-theme-toggle"
              >
                {isDark ? <Sun size={8} /> : <Moon size={8} />}
                <span className="text-[7px]">{isDark ? 'LIGHT' : 'DARK'}</span>
              </button>
              <span className={isDark ? 'text-white/20' : 'text-black/20'}>|</span>
              <div className="flex gap-3">
                <a href="#" className="hover:text-blue-500 transition-colors" data-testid="link-signin">Sign In</a>
                <a href="#" className="text-blue-500 hover:text-blue-400 transition-colors" data-testid="link-signup">Sign Up</a>
              </div>
            </div>
          </div>
        </div>

        <div className={`border-b ${borderColor}`}>
          <div className="max-w-[1800px] mx-auto px-4 py-2 flex items-center justify-between gap-4">
            <Link href="/" className={`text-base font-black tracking-tighter flex items-center shrink-0 ${isDark ? 'text-white' : 'text-black'}`} data-testid="link-logo" style={{ textDecoration: 'none' }}>
              FSDZONES<span className="text-blue-500">.COM</span>
            </Link>

            <div className={`hidden lg:flex items-center gap-5 text-[8px] font-black uppercase tracking-[0.12em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <Link href="/" className="hover:text-blue-500 transition-colors whitespace-nowrap" data-testid="link-nav-home">Home</Link>
              <Link href="/journal" className="hover:text-blue-500 transition-colors whitespace-nowrap" data-testid="link-nav-journal">Free Journal</Link>
              <a href="#tsc" className="hover:text-blue-500 transition-colors whitespace-nowrap" data-testid="link-nav-tsc">TSC</a>
              <a href="#calendar" className="hover:text-blue-500 transition-colors whitespace-nowrap" data-testid="link-nav-calendar">Economic Calendar</a>
              <a href="#blog" className="hover:text-blue-500 transition-colors whitespace-nowrap" data-testid="link-nav-blog">Blog</a>
              <span className={`${isDark ? 'text-white/10' : 'text-black/10'}`}>|</span>
              <a href="#major-pairs" className="hover:text-blue-500 transition-colors whitespace-nowrap" data-testid="link-subnav-major-pairs">Major Pairs</a>
              <a href="#us-stocks" className="hover:text-blue-500 transition-colors whitespace-nowrap" data-testid="link-subnav-us-stocks">US Stocks</a>
              <a href="#commodities" className="hover:text-blue-500 transition-colors whitespace-nowrap" data-testid="link-subnav-commodities">Commodities</a>
              <a href="#cryptocurrency" className="hover:text-blue-500 transition-colors whitespace-nowrap" data-testid="link-subnav-cryptocurrency">Cryptocurrency</a>
              <a href="#verified-strategies" className="hover:text-blue-500 transition-colors whitespace-nowrap" data-testid="link-subnav-strategies">Verified Strategies</a>
            </div>

            <button className={`lg:hidden ${isDark ? 'text-white' : 'text-black'}`} onClick={() => setIsMenuOpen(!isMenuOpen)} data-testid="button-mobile-menu">
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </nav>

      {isMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" data-testid="mobile-menu-overlay">
          <div className="absolute inset-0 bg-black/60" onClick={() => setIsMenuOpen(false)} />
          <div className={`absolute top-0 right-0 h-full w-72 ${isDark ? 'bg-[#0d1117]' : 'bg-white'} shadow-2xl p-8 overflow-y-auto`} data-testid="mobile-menu-drawer">
            <div className="flex justify-between items-center mb-8">
              <div className={`text-lg font-black tracking-tighter ${isDark ? 'text-white' : 'text-black'}`}>
                FSDZONES<span className="text-blue-500">.COM</span>
              </div>
              <button onClick={() => setIsMenuOpen(false)} className={isDark ? 'text-white' : 'text-black'} data-testid="button-close-mobile-menu">
                <X size={24} />
              </button>
            </div>
            <nav className="space-y-6 text-[11px] font-black uppercase tracking-[0.15em]">
              <Link href="/" className="block text-blue-500" onClick={() => setIsMenuOpen(false)}>Home</Link>
              <Link href="/journal" className={`block ${isDark ? 'text-slate-300 hover:text-blue-500' : 'text-slate-700 hover:text-blue-500'} transition-colors`} onClick={() => setIsMenuOpen(false)}>Free Journal</Link>
              <a href="#tsc" className={`block ${isDark ? 'text-slate-300 hover:text-blue-500' : 'text-slate-700 hover:text-blue-500'} transition-colors`} onClick={() => setIsMenuOpen(false)}>TSC</a>
              <a href="#calendar" className={`block ${isDark ? 'text-slate-300 hover:text-blue-500' : 'text-slate-700 hover:text-blue-500'} transition-colors`} onClick={() => setIsMenuOpen(false)}>Economic Calendar</a>
              <a href="#blog" className={`block ${isDark ? 'text-slate-300 hover:text-blue-500' : 'text-slate-700 hover:text-blue-500'} transition-colors`} onClick={() => setIsMenuOpen(false)}>Blog</a>
            </nav>
            <hr className={`my-8 ${isDark ? 'border-white/10' : 'border-black/10'}`} />
            <div className="space-y-4 text-[11px] font-black uppercase tracking-[0.15em]">
              <a href="#major-pairs" className={`block ${isDark ? 'text-slate-400 hover:text-blue-500' : 'text-slate-500 hover:text-blue-500'} transition-colors`} onClick={() => setIsMenuOpen(false)}>Major Pairs</a>
              <a href="#us-stocks" className={`block ${isDark ? 'text-slate-400 hover:text-blue-500' : 'text-slate-500 hover:text-blue-500'} transition-colors`} onClick={() => setIsMenuOpen(false)}>US Stocks</a>
              <a href="#commodities" className={`block ${isDark ? 'text-slate-400 hover:text-blue-500' : 'text-slate-500 hover:text-blue-500'} transition-colors`} onClick={() => setIsMenuOpen(false)}>Commodities</a>
              <a href="#cryptocurrency" className={`block ${isDark ? 'text-slate-400 hover:text-blue-500' : 'text-slate-500 hover:text-blue-500'} transition-colors`} onClick={() => setIsMenuOpen(false)}>Cryptocurrency</a>
              <a href="#verified-strategies" className={`block ${isDark ? 'text-slate-400 hover:text-blue-500' : 'text-slate-500 hover:text-blue-500'} transition-colors`} onClick={() => setIsMenuOpen(false)}>Verified Strategies</a>
            </div>
            <hr className={`my-8 ${isDark ? 'border-white/10' : 'border-black/10'}`} />
            <div className="space-y-4">
              <a href="#" className="block w-full py-3 primary-btn text-white text-center" data-testid="mobile-link-signup">Sign Up</a>
              <a href="#" className={`block text-center text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`} data-testid="mobile-link-signin">Sign In</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
