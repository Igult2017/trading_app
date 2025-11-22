import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export function HeroSection() {
  return (
    <header className="bg-blue-600 py-16 sm:py-20 lg:py-24 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center justify-between gap-12">
        
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
              Start Free Trial <ArrowRight className="w-5 h-5" />
            </button>
            <button className="px-8 py-3 text-lg font-extrabold text-white bg-transparent rounded-full border-2 border-white hover:bg-white/10 transition duration-150 ease-in-out transform hover:scale-[1.02] active:scale-[0.98]">
              Learn More
            </button>
          </motion.div>
        </motion.div>

        {/* Right Side: Image Grid */}
        <motion.div 
          className="lg:w-1/2 grid grid-cols-2 gap-4"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="col-span-2 overflow-hidden rounded-xl shadow-lg">
            <div className="w-full h-64 bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-2xl font-bold">
              Market Charts
            </div>
          </div>
          <div className="overflow-hidden rounded-xl shadow-lg">
            <div className="w-full h-48 bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center text-white text-xl font-bold">
              Trader Focused
            </div>
          </div>
          <div className="overflow-hidden rounded-xl shadow-lg">
            <div className="w-full h-48 bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-xl font-bold">
              Global Markets
            </div>
          </div>
        </motion.div>
      </div>
    </header>
  );
}
