import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Bell, User, Menu } from 'lucide-react';
import { Notifications } from '@/components/Notifications';

const navLinks = [
  { name: 'Dashboard', path: '/' },
  { name: 'Signals Feed', path: '/signals' },
  { name: 'Calendar', path: '/calendar' },
  { name: 'Research', path: '/analytics' },
];

const categoryLinks = [
  { name: 'Major Pairs', path: '/', active: true },
  { name: 'US Stocks', path: '/stocks' },
  { name: 'Commodities', path: '/commodities' },
  { name: 'Cryptocurrency', path: '/crypto' },
];

export default function Header() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActivePath = (path: string) => {
    if (path === '/') return location === '/';
    return location.startsWith(path);
  };

  return (
    <header className="bg-white shadow-xl sticky top-0 z-50">
      
      {/* SECONDARY TOP NAVIGATION BAR */}
      <div className="flex items-center justify-between px-4 md:px-8 py-2 bg-gray-50 border-b border-gray-200">
        
        {/* Left: Navigation Links */}
        <div className="flex flex-nowrap gap-x-6 py-1 overflow-x-auto no-scrollbar flex-shrink max-w-[50%] md:max-w-none">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              href={link.path}
              className={`nav-link text-sm font-medium flex-shrink-0 ${
                isActivePath(link.path)
                  ? 'text-gray-900 font-semibold active-nav-link'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {link.name}
            </Link>
          ))}
        </div>

        {/* Right: Desktop Utilities */}
        <div className="hidden md:flex items-center space-x-3 md:space-x-4 ml-4 flex-shrink-0">
          
          {/* Search Bar */}
          <div className="relative hidden sm:block">
            <input
              type="text"
              placeholder="Search markets, pairs..."
              className="w-48 lg:w-64 px-4 py-2 text-gray-800 bg-gray-100 rounded-lg placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary-accent transition duration-200 border border-transparent"
            />
          </div>

          {/* Live Status Indicator */}
          <div className="flex items-center space-x-2 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
            <span className="relative flex h-2.5 w-2.5">
              <span className="signal-pulse-container" style={{ '--pulse-color': '#f59e0b' } as React.CSSProperties}></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500"></span>
            </span>
            <span className="text-xs font-semibold text-gray-700">Market Open</span>
          </div>
          
          {/* Utility Icons */}
          <div className="[&_button]:text-gray-600 [&_button]:hover:bg-gray-200">
            <Notifications />
          </div>

          <button className="p-2 text-gray-600 transition duration-200 rounded-full hover:bg-gray-200 hover:text-gray-900" title="Profile">
            <User className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* PRIMARY LOGO BAR WITH MARQUEE ALERTS */}
      <nav className="flex items-center justify-between px-4 md:px-8 py-3.5">
        
        <div className="flex items-center w-full space-x-6 md:space-x-10">

          {/* Logo Block */}
          <Link href="/" className="flex flex-col flex-shrink-0 group">
            <div className="flex items-center text-2xl md:text-3xl font-extrabold tracking-tight leading-none">
              <span className="text-bull-green transition-transform duration-300 group-hover:scale-105">Bullsend</span>
              <span className="text-bear-red">Bears</span>
            </div>
            <p className="text-xs text-gray-500 mt-1 hidden sm:block">Clarity in Chaos. Your next move starts here.</p>
          </Link>

          {/* MARQUEE (Signal Alert) */}
          <div className="hidden sm:flex items-center bg-gray-100 rounded-xl p-3 flex-grow shadow-inner cursor-pointer transition duration-200 hover:bg-gray-200 overflow-hidden max-w-xl min-w-0 border border-gray-200">
            
            {/* Pulse indicator */}
            <div className="relative flex items-center h-3 w-3 mr-4 flex-shrink-0">
              <span className="signal-pulse-container" style={{ '--pulse-color': '#10b981' } as React.CSSProperties}></span>
              <span className="relative h-3 w-3 rounded-full bg-bull-green"></span>
            </div>

            {/* Marquee Container */}
            <div className="marquee-container text-xs lg:text-sm font-semibold text-gray-900">
              
              {/* Marquee Track */}
              <div className="marquee-track">

                {/* SET 1 */}
                <div className="marquee-set flex items-center whitespace-nowrap">
                  <span className="text-bull-green font-bold mr-1">Signal:</span> Buy EUR/USD @ 1.0855 (15m)
                  <span className="mx-6 text-gray-400 font-normal">|</span> 

                  <span className="text-bear-red font-bold mr-1">Alert:</span> Sell GOLD @ 2005.10 (30m)
                  <span className="mx-6 text-gray-400 font-normal">|</span> 

                  <span className="text-primary-accent font-bold mr-1">Update:</span> Long USD/CAD Target 1 Hit
                  <span className="mx-6 text-gray-400 font-normal">|</span> 

                  <span className="text-bull-green font-bold mr-1">Signal:</span> Buy AUD/NZD @ 1.0501 (1H)
                  <span className="mx-6 text-gray-400 font-normal">|</span> 

                  <span className="text-bear-red font-bold mr-1">Alert:</span> Short SPX Target 2 Hit
                  <span className="mx-6 text-gray-400 font-normal">|</span> 
                </div>

                {/* SET 2 (Duplicate for seamless loop) */}
                <div className="marquee-set flex items-center whitespace-nowrap">
                  <span className="text-bull-green font-bold mr-1">Signal:</span> Buy EUR/USD @ 1.0855 (15m)
                  <span className="mx-6 text-gray-400 font-normal">|</span> 

                  <span className="text-bear-red font-bold mr-1">Alert:</span> Sell GOLD @ 2005.10 (30m)
                  <span className="mx-6 text-gray-400 font-normal">|</span> 

                  <span className="text-primary-accent font-bold mr-1">Update:</span> Long USD/CAD Target 1 Hit
                  <span className="mx-6 text-gray-400 font-normal">|</span> 

                  <span className="text-bull-green font-bold mr-1">Signal:</span> Buy AUD/NZD @ 1.0501 (1H)
                  <span className="mx-6 text-gray-400 font-normal">|</span> 

                  <span className="text-bear-red font-bold mr-1">Alert:</span> Short SPX Target 2 Hit
                  <span className="mx-6 text-gray-400 font-normal">|</span> 
                </div>
              </div>
            </div>

            {/* View Button */}
            <Link href="/signals" className="text-xs font-semibold text-primary-accent ml-4 flex-shrink-0 hover:underline">
              View All
            </Link>
          </div>
        </div>

        {/* Mobile Menu Toggle */}
        <div className="flex items-center space-x-4 flex-shrink-0">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer transition"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </nav>
      
      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-white shadow-xl z-40 border-t border-gray-100">
          <div className="flex flex-col p-4 space-y-3">
            {/* Mobile Search Input */}
            <input
              type="text"
              placeholder="Search markets, pairs..."
              className="w-full px-4 py-2 text-gray-800 bg-gray-100 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-accent"
            />
            
            {/* Utility Icons (Mobile) */}
            <div className="flex justify-around py-3 border-y border-gray-200">
              <button className="p-2 text-gray-700 transition duration-200 hover:text-gray-900" title="Notifications">
                <Bell className="w-6 h-6" />
              </button>
              <button className="p-2 text-gray-700 transition duration-200 hover:text-gray-900" title="Profile">
                <User className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Categories Bar */}
      <div className="flex overflow-x-auto no-scrollbar justify-start px-4 md:px-8 gap-6 md:gap-8 border-t border-gray-100 bg-gray-50">
        {categoryLinks.map((link) => (
          <Link
            key={link.name}
            href={link.path}
            className={`text-sm font-medium py-3 border-b-2 flex-shrink-0 whitespace-nowrap ${
              link.active
                ? 'font-semibold text-primary-accent border-primary-accent'
                : 'text-gray-600 border-transparent hover:text-gray-900 hover:border-gray-400'
            }`}
          >
            {link.name}
          </Link>
        ))}
        
        {/* Telegram Link */}
        <a
          href="#"
          className="telegram-link text-sm font-bold text-[#1d90e6] py-3 border-b-2 border-transparent hover:border-primary-accent flex-shrink-0 whitespace-nowrap space-x-1.5 flex items-center"
          title="Join Our Telegram Group"
        >
          <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" fill="currentColor">
            <path d="M120,0C53.7,0,0,53.7,0,120s53.7,120,120,120s120-53.7,120-120S186.3,0,120,0z M175.6,80.3
            l-22.3,105.1c-1.7,7.5-6.1,9.3-12.3,5.8l-34-25.1l-16.4,15.8c-1.8,1.8-3.3,3.3-6.8,3.3l2.4-34.3l62.5-56.5
            c2.7-2.4-0.6-3.7-4.2-1.3l-77.2,48.6l-33.2-10.4c-7.2-2.2-7.3-7.1,1.6-10.5l129.8-50.1C171.6,67.5,178.1,72.1,175.6,80.3z"/>
          </svg>
          <span>Join Telegram</span>
        </a>
        
        <Link href="/news" className="text-sm font-medium text-gray-600 transition hover:text-gray-900 py-3 border-b-2 border-transparent hover:border-gray-400 flex-shrink-0 whitespace-nowrap hidden sm:block">
          Pre-Market News
        </Link>
      </div>
    </header>
  );
}
