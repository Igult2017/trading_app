import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { TrendingUp } from 'lucide-react';

const subNavLinks = [
  { name: 'Signals Feed', path: '/' },
  { name: 'Economic Calendar', path: '/calendar' },
  { name: 'Major Pairs', path: '/major-pairs' },
  { name: 'US Stocks', path: '/stocks' },
  { name: 'Commodities', path: '/commodities' },
  { name: 'Cryptocurrency', path: '/crypto' },
  { name: 'History', path: '/history' },
  { name: 'Blog', path: '/blog' },
];

export default function Header() {
  const [location] = useLocation();

  const isActivePath = (path: string) => {
    if (path === '/') return location === '/';
    return location.startsWith(path);
  };

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
      {/* TOP NAVIGATION BAR */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        
        {/* Left Section: Logo and Signals Link */}
        <div className="flex items-center space-x-4">
          {/* Logo: FindBuyandSellZones.com */}
          <Link 
            href="/" 
            className="flex items-center text-xl font-extrabold"
            data-testid="link-logo"
          >
            <TrendingUp className="h-6 w-6 mr-2 text-bull-green" />
            <span className="text-bull-green">Find</span>
            <span className="text-foreground">Buy</span>
            <span className="text-foreground">and</span>
            <span className="text-bear-red">Sell</span>
            <span className="text-foreground">Zones.com</span>
          </Link>
          
          {/* Separator and Signals Link */}
          <div className="flex items-center space-x-4">
            <span className="h-6 w-px bg-border hidden sm:block"></span>
            <Link 
              href="/" 
              className="text-base font-semibold text-muted-foreground hover:text-primary transition-colors hidden sm:block"
              data-testid="link-signals"
            >
              Signals
            </Link>
            <Link 
              href="/join" 
              className="text-base font-semibold text-muted-foreground hover:text-primary transition-colors hidden sm:block"
              data-testid="link-join"
            >
              Join
            </Link>
          </div>
        </div>

        {/* Right Section: Action Buttons */}
        <div className="flex items-center space-x-3">
          <button 
            className="px-5 py-2.5 text-base font-extrabold text-primary bg-card dark:bg-background rounded-full border-2 border-primary dotted-outline hover:bg-muted dark:hover:bg-muted transition duration-150 transform hover:scale-[1.02] active:scale-[0.98]"
            data-testid="button-login"
          >
            Login
          </button>
          <button 
            className="px-6 py-2.5 text-base font-extrabold text-primary bg-card dark:bg-background rounded-full border-2 border-primary dotted-outline hover:bg-muted dark:hover:bg-muted transition duration-150 transform hover:scale-[1.02] active:scale-[0.98]"
            data-testid="button-subscribe"
          >
            Subscribe
          </button>
          <button 
            className="px-5 py-2.5 text-base font-extrabold text-destructive bg-card dark:bg-background rounded-full border-2 border-destructive dotted-outline hover:bg-muted dark:hover:bg-muted transition duration-150 transform hover:scale-[1.02] active:scale-[0.98]"
            data-testid="button-block"
          >
            Block
          </button>
        </div>
      </nav>

      {/* SUB-NAVIGATION BAR */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 bg-card dark:bg-background">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm font-medium border-t border-border pt-2">
          {subNavLinks.map((link) => (
            <Link
              key={link.path}
              href={link.path}
              className={`py-3 px-1 transition-colors ${
                isActivePath(link.path)
                  ? 'text-primary border-b-3 border-primary sub-nav-active'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`link-${link.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {link.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
