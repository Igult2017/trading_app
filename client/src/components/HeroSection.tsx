import { motion } from 'framer-motion';

export function HeroSection() {
  return (
    <header className="bg-blue-600 py-6 sm:py-8 lg:py-10 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div 
          className="text-center flex flex-col items-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.h1 
            className="text-3xl sm:text-4xl lg:text-6xl font-extrabold leading-tight tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Less Charting. No worries. Only precision.
          </motion.h1>
          <motion.p 
            className="mt-4 lg:mt-6 text-base sm:text-lg lg:text-xl text-blue-100 max-w-xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Access premium signals, real-time analytics, and expert research to confidently navigate global financial markets.
          </motion.p>
        </motion.div>
      </div>
    </header>
  );
}
