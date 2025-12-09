import { useState, useEffect } from 'react';
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
  { name: 'Research', path: '/research' },
];

const SESSIONS = [
  { name: 'Sydney', start: 22, end: 7, nextDayEnd: true },
  { name: 'Tokyo', start: 0, end: 9 },
  { name: 'London', start: 7, end: 16 },
  { name: 'New York', start: 12, end: 21 }
];

function getSessionInfo(): { utcTime: string; sessionName: string | null; timeInSession: string } {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const utcSeconds = now.getUTCSeconds();
  const utcTimeInMinutes = utcHours * 60 + utcMinutes;

  const formatTime = (unit: number) => String(unit).padStart(2, '0');
  const utcTime = `${formatTime(utcHours)}:${formatTime(utcMinutes)}:${formatTime(utcSeconds)}`;

  let activeSession: string | null = null;
  let timeInMinutes = 0;

  for (const session of SESSIONS) {
    const startTimeInMinutes = session.start * 60;
    const endTimeInMinutes = session.end * 60;

    let isActive = false;

    if (session.nextDayEnd) {
      if (utcTimeInMinutes >= startTimeInMinutes || utcTimeInMinutes < endTimeInMinutes) {
        isActive = true;
        if (utcTimeInMinutes >= startTimeInMinutes) {
          timeInMinutes = utcTimeInMinutes - startTimeInMinutes;
        } else {
          const minutesInDay = 24 * 60;
          timeInMinutes = (minutesInDay - startTimeInMinutes) + utcTimeInMinutes;
        }
      }
    } else {
      if (utcTimeInMinutes >= startTimeInMinutes && utcTimeInMinutes < endTimeInMinutes) {
        isActive = true;
        timeInMinutes = utcTimeInMinutes - startTimeInMinutes;
      }
    }

    if (isActive) {
      activeSession = session.name;
      break;
    }
  }

  let timeInSession = '';
  if (activeSession) {
    const hoursIn = Math.floor(timeInMinutes / 60);
    const minutesIn = timeInMinutes % 60;
    if (hoursIn > 0) {
      timeInSession = `${hoursIn}h ${minutesIn}m`;
    } else {
      timeInSession = `${minutesIn}m`;
    }
  }

  return { utcTime, sessionName: activeSession, timeInSession };
}

export default function Header() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(getSessionInfo());

  useEffect(() => {
    const interval = setInterval(() => {
      setSessionInfo(getSessionInfo());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const isActivePath = (path: string) => {
    if (path === '/') return location === '/';
    return location.startsWith(path);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <header className="bg-white dark:bg-gray-900 shadow-md sticky top-0 z-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4 border-b border-gray-100 dark:border-gray-800 lg:border-none">
          <div className="flex-shrink-0">
            <Link 
              href="/" 
              className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight"
              data-testid="link-logo"
            >
              F<span className="text-emerald-500">S</span>D<span className="text-emerald-500">ZONES</span>.com
            </Link>
          </div>

          <div className="hidden md:flex items-center text-sm font-medium text-gray-600 dark:text-gray-400 gap-3 bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded-lg shadow-inner">
            <span className="text-xs font-normal text-gray-400 dark:text-gray-500">
              UTC: <span className="font-semibold text-gray-800 dark:text-gray-200" data-testid="text-utc-time">{sessionInfo.utcTime}</span>
            </span>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span data-testid="text-session-status">
              {sessionInfo.sessionName ? (
                <>
                  Session: <span className="font-bold text-emerald-600">{sessionInfo.sessionName}</span> (<span className="font-bold text-emerald-600">{sessionInfo.timeInSession}</span> In)
                </>
              ) : (
                <>Session: <span className="font-bold text-gray-500">Quiet</span></>
              )}
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-6">
            <a 
              href="https://t.me/BuySellZonesBot" 
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 transition duration-150 flex items-center gap-1 p-2 rounded-full bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50"
              data-testid="link-telegram"
            >
              <SiTelegram className="w-4 h-4" />
              <span>Join Telegram</span>
            </a>
            <Link 
              href="/join" 
              className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition duration-150"
              data-testid="link-subscribe"
            >
              Subscribe
            </Link>
            <div className="flex items-center gap-2">
              <Link 
                href="/login" 
                className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition duration-150"
                data-testid="link-signin"
              >
                Sign In
              </Link>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <Link 
                href="/signup"
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-emerald-700 transition duration-200"
                data-testid="link-signup"
              >
                Sign Up
              </Link>
            </div>
          </div>

          <button 
            className="lg:hidden text-gray-500 hover:text-emerald-600 focus:outline-none p-2 rounded-md transition duration-150" 
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

        <nav className="hidden lg:block py-3">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                href={link.path}
                className={`text-sm font-medium transition duration-150 relative ${
                  isActivePath(link.path)
                    ? 'text-emerald-600 font-semibold'
                    : 'text-gray-600 dark:text-gray-400 hover:text-emerald-600'
                }`}
                data-testid={`link-nav-${link.name.toLowerCase().replace(/\s+/g, '-').replace('/', '-')}`}
              >
                {link.name}
                {isActivePath(link.path) && (
                  <span className="absolute left-0 -bottom-2 w-full h-0.5 bg-emerald-600 rounded-full" />
                )}
              </Link>
            ))}
          </div>
        </nav>
      </div>

      <div className="md:hidden bg-gray-50 dark:bg-gray-800 px-4 py-2 flex items-center justify-center gap-3 text-sm border-t border-gray-100 dark:border-gray-700">
        <span className="text-xs text-gray-400">
          UTC: <span className="font-semibold text-gray-800 dark:text-gray-200">{sessionInfo.utcTime}</span>
        </span>
        <span className="text-gray-300">|</span>
        <span>
          {sessionInfo.sessionName ? (
            <>
              <span className="font-bold text-emerald-600">{sessionInfo.sessionName}</span> (<span className="text-emerald-600">{sessionInfo.timeInSession}</span>)
            </>
          ) : (
            <span className="text-gray-500">Quiet</span>
          )}
        </span>
      </div>

      {mobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-y-0 right-0 w-64 bg-white dark:bg-gray-900 z-40 shadow-xl overflow-y-auto transform transition-transform duration-300"
          style={{ fontFamily: "'Inter', sans-serif" }}
          data-testid="mobile-drawer"
        >
          <div className="p-5">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Navigation</h3>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="text-gray-500 hover:text-emerald-600 focus:outline-none p-2 rounded-md"
                aria-label="Close menu"
                data-testid="button-close-menu"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <nav className="space-y-4">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  href={link.path}
                  className={`block text-base font-medium pl-3 transition duration-150 ${
                    isActivePath(link.path)
                      ? 'text-emerald-600 font-semibold border-l-4 border-emerald-600'
                      : 'text-gray-700 dark:text-gray-300 hover:text-emerald-600 hover:border-l-4 hover:border-emerald-600'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid={`mobile-link-nav-${link.name.toLowerCase().replace(/\s+/g, '-').replace('/', '-')}`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>

            <hr className="my-6 border-gray-200 dark:border-gray-700" />

            <div className="space-y-4">
              <a 
                href="https://t.me/BuySellZonesBot" 
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-blue-600 text-blue-600 text-sm font-semibold rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition duration-150"
                data-testid="mobile-link-telegram"
              >
                <SiTelegram className="w-5 h-5" />
                <span>Join Telegram</span>
              </a>
              <Link 
                href="/signup"
                className="w-full flex items-center justify-center px-4 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-lg shadow-lg hover:bg-emerald-700 transition duration-150"
                onClick={() => setMobileMenuOpen(false)}
                data-testid="mobile-link-signup"
              >
                Sign Up
              </Link>
              <Link 
                href="/login"
                className="w-full block text-center text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                onClick={() => setMobileMenuOpen(false)}
                data-testid="mobile-link-signin"
              >
                Already have an account? <span className="text-emerald-600 font-semibold">Sign In</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
