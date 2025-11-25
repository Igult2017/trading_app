import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, TrendingDown, Clock, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

interface TradingSignal {
  symbol: string;
  direction: 'BUY' | 'SELL';
  confidence: number;
}

interface EconomicEvent {
  title: string;
  country: string;
  impactLevel: string;
  eventTime: string;
}

export function HeroSection() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: signals } = useQuery<TradingSignal[]>({
    queryKey: ['/api/trading-signals'],
  });

  const { data: events } = useQuery<EconomicEvent[]>({
    queryKey: ['/api/economic-events'],
  });

  const getCurrentSession = () => {
    const hour = currentTime.getUTCHours();
    if (hour >= 0 && hour < 8) return { name: 'Sydney', color: 'bg-yellow-500', active: true };
    if (hour >= 0 && hour < 9) return { name: 'Tokyo', color: 'bg-red-500', active: true };
    if (hour >= 8 && hour < 16) return { name: 'London', color: 'bg-blue-500', active: true };
    if (hour >= 13 && hour < 21) return { name: 'New York', color: 'bg-green-500', active: true };
    return { name: 'Off Hours', color: 'bg-gray-500', active: false };
  };

  const session = getCurrentSession();

  return (
    <header className="bg-blue-600 py-6 sm:py-8 lg:py-10 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-start justify-between gap-8">
        
        {/* Left Side: Text Content and Buttons */}
        <motion.div 
          className="lg:w-1/2 text-center lg:text-left"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.h1 
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Less Charting. No worries. Only precision.
          </motion.h1>
          <motion.p 
            className="mt-6 text-lg sm:text-xl text-blue-100 max-w-xl mx-auto lg:mx-0"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Access premium signals, real-time analytics, and expert research to confidently navigate global financial markets.
          </motion.p>
          <motion.div 
            className="mt-10 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <button className="px-8 py-3 text-lg font-extrabold text-blue-600 bg-white rounded-full border-2 border-white hero-dotted-outline hover:bg-blue-50 transition duration-150 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2">
              Subscribe <ArrowRight className="w-5 h-5" />
            </button>
            <button className="px-8 py-3 text-lg font-extrabold text-white bg-transparent rounded-full border-2 border-white hover:bg-white/10 transition duration-150 ease-in-out transform hover:scale-[1.02] active:scale-[0.98]">
              Learn More
            </button>
          </motion.div>
        </motion.div>

        {/* Right Side: Live Data Grid */}
        <motion.div 
          className="lg:w-1/2 grid grid-cols-2 gap-4"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* 1. Trading Signals Scroller */}
          <div className="col-span-2 overflow-hidden rounded-xl shadow-lg bg-gradient-to-br from-blue-500 to-blue-700">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-white/20">
              <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
              <span className="text-white text-xl font-bold">Live Signals</span>
            </div>
            <div className="w-full h-52 overflow-hidden px-4 py-3">
              <div className="space-y-2 animate-scroll-up">
                {signals && signals.slice(0, 8).map((signal, idx) => (
                  <div
                    key={idx}
                    className="bg-white/20 backdrop-blur-sm rounded-lg p-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      {signal.direction === 'BUY' ? (
                        <TrendingUp className="w-5 h-5 text-green-300" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-300" />
                      )}
                      <span className="text-white font-bold text-sm">{signal.symbol}</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${signal.direction === 'BUY' ? 'bg-green-500' : 'bg-red-500'} text-white`}>
                      {signal.direction}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Trading Session Tracker */}
          <div className="overflow-hidden rounded-xl shadow-lg bg-gradient-to-br from-green-500 to-green-700">
            <div className="w-full h-48 p-4 flex flex-col items-center justify-center text-white">
              <Clock className="w-12 h-12 mb-3" />
              <div className="text-2xl font-bold mb-2">{session.name}</div>
              <div className="text-sm opacity-90 mb-3">
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} UTC
              </div>
              <div className={`${session.active 
                ? 'bg-[#00BCD4] shadow-[0_0_15px_rgba(0,188,212,0.7),0_0_30px_rgba(0,188,212,0.4)]' 
                : 'bg-gray-500'} px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 text-white border-2 border-[#00BCD4]/50`}>
                <span className={`w-2 h-2 bg-white rounded-full ${session.active ? 'animate-pulse' : ''}`}></span>
                {session.active ? 'ACTIVE' : 'CLOSED'}
              </div>
            </div>
          </div>

          {/* 3. High Impact News Tracker */}
          <div className="overflow-hidden rounded-xl shadow-lg bg-gradient-to-br from-red-500 to-red-700 relative">
            <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
              <Calendar className="w-4 h-4 text-white" />
              <span className="text-white text-sm font-bold">High Impact</span>
            </div>
            <div className="w-full h-48 overflow-hidden pt-12 px-3 pb-3">
              <div className="space-y-2 animate-scroll-up-slow">
                {events && events.filter(e => e.impactLevel === 'high').slice(0, 5).map((event, idx) => (
                  <div
                    key={idx}
                    className="bg-white/20 backdrop-blur-sm rounded-lg p-2"
                  >
                    <div className="text-white font-bold text-xs truncate">{event.title}</div>
                    <div className="text-white/80 text-xs flex items-center gap-1 mt-1">
                      <span className="font-semibold">{event.country}</span>
                      <span>•</span>
                      <span>{new Date(event.eventTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
                {(!events || events.filter(e => e.impactLevel === 'high').length === 0) && (
                  <div className="text-white/80 text-xs text-center py-4">
                    No high impact events scheduled
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </header>
  );
}
