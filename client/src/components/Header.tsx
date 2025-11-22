import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { TrendingUp } from 'lucide-react';

const subNavLinks = [
  { name: 'Signals Feed', path: '/' },
  { name: 'Calendar', path: '/calendar' },
  { name: 'Major Pairs', path: '/major-pairs' },
  { name: 'US Stocks', path: '/stocks' },
  { name: 'Commodities', path: '/commodities' },
  { name: 'Cryptocurrency', path: '/crypto' },
];

export default function Header() {
  const [location] = useLocation();

  const isActivePath = (path: string) => {
    if (path === '/') return location === '/';
    return location.startsWith(path);
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      {/* TOP NAVIGATION BAR */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        
        {/* Left Section: Logo and Signals Link */}
        <div className="flex items-center space-x-4">
          {/* Logo: FindBuyandSellZones.com */}
          <Link href="/" className="flex items-center text-xl font-extrabold">
            <TrendingUp className="h-6 w-6 mr-2 text-bull-green" />
            <span className="text-bull-green">Find</span>
            <span className="text-gray-900">Buy</span>
            <span className="text-gray-900">and</span>
            <span className="text-bear-red">Sell</span>
            <span className="text-gray-900">Zones.com</span>
          </Link>
          
          {/* Separator and Signals Link */}
          <div className="flex items-center space-x-4">
            <span className="h-6 w-px bg-gray-300 hidden sm:block"></span>
            <Link href="/" className="text-base font-semibold text-gray-600 hover:text-blue-600 transition-colors hidden sm:block">
              Signals
            </Link>
          </div>
        </div>

        {/* Right Section: Action Buttons */}
        <div className="flex items-center space-x-3">
          <button className="px-5 py-2.5 text-base font-extrabold text-blue-600 bg-white rounded-full border-2 border-blue-600 dotted-outline hover:bg-blue-50 transition duration-150 transform hover:scale-[1.02] active:scale-[0.98]">
            Login
          </button>
          <button className="px-6 py-2.5 text-base font-extrabold text-blue-600 bg-white rounded-full border-2 border-blue-600 dotted-outline hover:bg-blue-50 transition duration-150 transform hover:scale-[1.02] active:scale-[0.98]">
            Subscribe
          </button>
        </div>
      </nav>

      {/* SUB-NAVIGATION BAR */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 bg-white">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm font-medium border-t border-gray-200 pt-2">
          {subNavLinks.map((link) => (
            <Link
              key={link.path}
              href={link.path}
              className={`py-3 px-1 transition-colors ${
                isActivePath(link.path)
                  ? 'text-blue-600 border-b-3 border-blue-600 sub-nav-active'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {link.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
