import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Menu, X } from 'lucide-react';
import { SiTelegram } from 'react-icons/si';

const navLinks = [
  { name: 'Home/Bias', path: '/' },
  { name: 'Economic Calendar', path: '/calendar' },
  { name: 'Major Pairs', path: '/major-pairs' },
  { name: 'US Stocks', path: '/stocks' },
  { name: 'Commodities', path: '/commodities' },
  { name: 'Cryptocurrency', path: '/crypto' },
  { name: 'History', path: '/history' },
  { name: 'Blog', path: '/blog' },
  { name: 'Premarket', path: '/premarket' },
  { name: 'Stats', path: '/stats' },
  { name: 'Charting', path: '/charting' },
];

export default function Header() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActivePath = (path: string) => {
    if (path === '/') return location === '/';
    return location.startsWith(path);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <header className="bg-card shadow-md sticky top-0 z-50">
      {/* ROW 1: Logo, Bias, Telegram, Subscribe, Sign In / Sign Up */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo: FSDZones.com */}
          <Link 
            href="/" 
            className="flex items-center space-x-2 text-xl font-extrabold tracking-tight"
            data-testid="link-logo"
          >
            <span className="text-foreground">F<span className="text-[#3B82F6]">S</span><span className="text-[#34D399]">D</span>Zones.com</span>
          </Link>

          {/* Desktop/Medium Screen Links & CTAs */}
          <div className="hidden sm:flex items-center space-x-6">
            <Link 
              href="/" 
              className="text-muted-foreground hover:text-[#3B82F6] text-sm font-medium transition duration-150 py-1 px-2 rounded-md"
              data-testid="link-bias"
            >
              Bias
            </Link>
            
            <a 
              href="https://t.me/BuySellZonesBot" 
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 px-3 py-2 text-sm font-semibold text-[#229ED9] hover:text-blue-700 transition duration-150 rounded-lg"
              data-testid="link-telegram"
            >
              <SiTelegram className="w-4 h-4" />
              <span>Join Telegram</span>
            </a>
            
            {/* Subscribe link */}
            <Link 
              href="/join" 
              className="text-sm font-semibold text-[#3B82F6] hover:underline transition duration-150"
              data-testid="link-subscribe"
            >
              Subscribe
            </Link>
            
            {/* Auth links */}
            <div className="text-sm font-semibold text-foreground space-x-1">
              <Link 
                href="/login" 
                className="hover:text-[#3B82F6] transition duration-150"
                data-testid="link-signin"
              >
                Sign In
              </Link> 
              <span className="text-muted-foreground">/</span> 
              <Link 
                href="/signup" 
                className="text-[#EF4444] hover:text-red-600 transition duration-150"
                data-testid="link-signup"
              >
                Sign Up
              </Link>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="sm:hidden p-2 rounded-md text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-[#34D399]" 
            type="button" 
            onClick={toggleMobileMenu}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            data-testid="button-mobile-menu"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* ROW 2: Primary Navigation Links - Visible and wrapped on small screens */}
      <div className="block bg-card border-t border-border shadow-sm">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              href={link.path}
              className={`py-1 transition duration-150 ${
                isActivePath(link.path)
                  ? 'text-[#3B82F6] font-semibold border-b-2 border-[#3B82F6]'
                  : 'text-muted-foreground hover:text-[#3B82F6]'
              }`}
              data-testid={`link-nav-${link.name.toLowerCase().replace(/\s+/g, '-').replace('/', '-')}`}
            >
              {link.name}
            </Link>
          ))}
        </nav>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div 
          className="sm:hidden bg-card border-t border-border pb-4 shadow-xl fixed inset-x-0 top-16 overflow-y-auto z-40"
          style={{ height: 'calc(100vh - 4rem)' }}
          data-testid="mobile-drawer"
        >
          <div className="pt-2 pb-3 space-y-1 px-4">
            <Link 
              href="/" 
              className="block px-3 py-2 rounded-md text-base font-medium text-foreground hover:bg-muted hover:text-[#3B82F6] border-l-4 border-transparent hover:border-[#3B82F6]"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-signals"
            >
              Signals
            </Link>
          </div>
          <div className="pt-4 pb-3 border-t border-border px-4 space-y-3">
            {/* Mobile CTAs */}
            <a 
              href="https://t.me/BuySellZonesBot" 
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center space-x-1 w-full px-4 py-3 text-base font-semibold text-[#229ED9] border border-[#229ED9] rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950 transition duration-150 shadow-md"
              data-testid="mobile-link-telegram"
            >
              <SiTelegram className="w-5 h-5" />
              <span>Join Telegram</span>
            </a>
            <Link 
              href="/login"
              className="block w-full text-center px-4 py-3 text-base font-semibold text-[#3B82F6] border border-[#3B82F6] rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950 transition duration-150 shadow-sm"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-signin"
            >
              Sign In
            </Link>
            <Link 
              href="/join"
              className="block w-full text-center px-4 py-3 text-base font-semibold text-[#3B82F6] border border-[#3B82F6] rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950 transition duration-150 shadow-sm"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-subscribe"
            >
              Subscribe
            </Link>
            {/* Primary CTA: Sign Up */}
            <Link 
              href="/signup"
              className="block w-full text-center px-4 py-3 text-base font-bold text-white bg-[#EF4444] rounded-xl hover:bg-red-600 transition duration-150 shadow-lg ring-2 ring-red-300"
              onClick={() => setMobileMenuOpen(false)}
              data-testid="mobile-link-signup"
            >
              Sign Up
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
