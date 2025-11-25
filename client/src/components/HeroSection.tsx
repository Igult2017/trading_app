import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface TradingSignal {
  symbol: string;
  direction: 'BUY' | 'SELL';
  confidence: number;
}

export function HeroSection() {
  const { data: signals } = useQuery<TradingSignal[]>({
    queryKey: ['/api/trading-signals'],
  });

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
            <button className="px-8 py-3 text-lg font-extrabold text-blue-600 bg-white rounded-full border-2 border-white hero-dotted-outline hover:bg-blue-50 transition duration-150 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2">
              Learn More
            </button>
          </motion.div>
        </motion.div>

        {/* Right Side: Live Signals */}
        <motion.div 
          className="lg:w-1/2"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Live Signals Card */}
          <div className="overflow-hidden rounded-xl shadow-lg bg-gradient-to-br from-blue-500 to-blue-700">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-white/20">
              <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
              <span className="text-white text-xl font-bold">Live Signals</span>
            </div>
            <div className="w-full h-64 overflow-hidden px-4 py-3">
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
        </motion.div>
      </div>
    </header>
  );
}
