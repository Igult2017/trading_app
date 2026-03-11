import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Mail,
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

interface NewHeaderProps {
  isDark: boolean;
  toggleTheme: () => void;
}

export default function NewHeader({ isDark, toggleTheme }: NewHeaderProps) {
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const borderColor = isDark ? 'border-white/10' : 'border-black/10';
  const navBg = isDark ? (scrolled ? 'bg-[#0d1117]/95' : 'bg-transparent') : (scrolled ? 'bg-white/95' : 'bg-transparent');
  const subNavBg = isDark ? 'bg-white/[0.02]' : 'bg-black/[0.02]';
  const sectionBorder = isDark ? 'border-white/5' : 'border-black/5';

  return (
    <>
      <nav className={`fixed w-full z-50 transition-all duration-500 ${navBg} ${scrolled ? 'shadow-2xl' : ''}`}>
        <div className={`border-b ${sectionBorder} ${isDark ? 'bg-[#0d1117]/40' : 'bg-white/40'} backdrop-blur-md`}>
          <div className="max-w-7xl mx-auto px-6 py-2 flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
            <div className="flex items-center gap-6">
              <a href="#" className={`flex items-center gap-2 transition-colors group ${isDark ? 'hover:text-white' : 'hover:text-black'}`} data-testid="link-telegram">
                <TelegramIcon size={12} color="#229ED9" /> <span className="group-hover:text-[#229ED9]">Join Telegram</span>
              </a>
              <a href="#" className={`flex items-center gap-2 transition-colors group ${isDark ? 'hover:text-white' : 'hover:text-black'}`} data-testid="link-subscribe">
                <Mail size={12} /> <span>Subscribe</span>
              </a>
            </div>
            <div className="flex items-center gap-6">
              <button
                onClick={toggleTheme}
                className={`flex items-center gap-2 p-1 px-2 border transition-all ${isDark ? 'border-white/10 hover:bg-white/5 text-slate-400' : 'border-black/10 hover:bg-black/5 text-slate-600'}`}
                data-testid="button-theme-toggle"
              >
                {isDark ? <Sun size={10} /> : <Moon size={10} />}
                <span className="text-[8px]">{isDark ? 'LIGHT' : 'DARK'}</span>
              </button>

              <span className={isDark ? 'text-white/20' : 'text-black/20'}>|</span>
              <div className="flex gap-4">
                <a href="#" className="hover:text-blue-500 transition-colors" data-testid="link-signin">Sign In</a>
                <a href="#" className="text-blue-500 hover:text-blue-400 transition-colors" data-testid="link-signup">Sign Up</a>
              </div>
            </div>
          </div>
        </div>

        <div className={`border-b ${borderColor}`}>
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className={`text-xl md:text-2xl font-black tracking-tighter flex items-center ${isDark ? 'text-white' : 'text-black'}`} data-testid="link-logo" style={{ textDecoration: 'none' }}>
              FSDZONES<span className="text-blue-500">.COM</span>
            </Link>

            <div className="hidden lg:flex items-center space-x-8 text-[10px] font-black uppercase tracking-[0.15em]">
              <Link href="/" className="hover:text-blue-500 transition-colors" data-testid="link-nav-home">Home</Link>
              <Link href="/journal" className="hover:text-blue-500 transition-colors" data-testid="link-nav-journal">Free Journal</Link>
              <a href="#tsc" className="hover:text-blue-500 transition-colors" data-testid="link-nav-tsc">TSC</a>
              <a href="#calendar" className="hover:text-blue-500 transition-colors" data-testid="link-nav-calendar">Economic Calendar</a>
              <a href="#blog" className="hover:text-blue-500 transition-colors" data-testid="link-nav-blog">Blog</a>
            </div>

            <button className={`lg:hidden ${isDark ? 'text-white' : 'text-black'}`} onClick={() => setIsMenuOpen(!isMenuOpen)} data-testid="button-mobile-menu">
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        <div className={`${subNavBg} border-b ${sectionBorder} hidden lg:block overflow-x-auto no-scrollbar transition-all duration-300 ${scrolled ? 'max-h-0 opacity-0 py-0 border-b-0 overflow-hidden' : 'max-h-20 opacity-100'}`}>
          <div className={`max-w-7xl mx-auto px-6 py-3 flex items-center justify-center space-x-10 text-[9px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <a href="#major-pairs" className="hover:text-blue-500 transition-colors flex items-center gap-2 pb-0.5" data-testid="link-subnav-major-pairs">
              Major Pairs
            </a>
            <a href="#us-stocks" className="hover:text-blue-500 transition-colors flex items-center gap-2 pb-0.5" data-testid="link-subnav-us-stocks">
              US Stocks
            </a>
            <a href="#commodities" className="hover:text-blue-500 transition-colors flex items-center gap-2 pb-0.5" data-testid="link-subnav-commodities">
              Commodities
            </a>
            <a href="#cryptocurrency" className="hover:text-blue-500 transition-colors flex items-center gap-2 pb-0.5" data-testid="link-subnav-cryptocurrency">
              Cryptocurrency
            </a>
            <a href="#verified-strategies" className="hover:text-blue-500 transition-colors flex items-center gap-2 pb-0.5" data-testid="link-subnav-strategies">
              Verified Strategies
            </a>
          </div>
        </div>
      </nav>

      {isMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden bg-[#0a0a0a] flex flex-col" data-testid="mobile-menu-overlay">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <Link
              href="/"
              className="text-xl font-black tracking-tighter text-white"
              style={{ textDecoration: 'none' }}
              onClick={() => setIsMenuOpen(false)}
            >
              FSDZONES<span className="text-blue-500">.COM</span>
            </Link>
            <button
              onClick={() => setIsMenuOpen(false)}
              className="text-white p-1"
              data-testid="button-close-mobile-menu"
            >
              <Menu size={24} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto" data-testid="mobile-menu-drawer">
            {[
              { label: 'Home', href: '/', isLink: true, active: location === '/' },
              { label: 'Currency Pairs', href: '#major-pairs', isLink: false, active: false },
              { label: 'US Stocks', href: '#us-stocks', isLink: false, active: false },
              { label: 'Commodities', href: '#commodities', isLink: false, active: false },
              { label: 'Crypto', href: '#cryptocurrency', isLink: false, active: false },
              { label: 'TSC', href: '#tsc', isLink: false, active: false },
              { label: 'Economic Calendar', href: '#calendar', isLink: false, active: false },
            ].map((item) => (
              item.isLink ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`block px-5 py-5 text-[13px] font-black uppercase tracking-[0.12em] border-b border-white/10 transition-colors ${item.active ? 'text-blue-500' : 'text-white hover:text-blue-400'}`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  className="block px-5 py-5 text-[13px] font-black uppercase tracking-[0.12em] border-b border-white/10 text-white hover:text-blue-400 transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </a>
              )
            ))}
          </nav>
        </div>
      )}
    </>
  );
}