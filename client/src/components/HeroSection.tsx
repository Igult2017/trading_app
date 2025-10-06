import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';

export function HeroSection() {

  const bars = [
    { height: 60, delay: 0.1 },
    { height: 85, delay: 0.2 },
    { height: 45, delay: 0.3 },
    { height: 95, delay: 0.4 },
    { height: 70, delay: 0.5 },
    { height: 55, delay: 0.6 },
    { height: 90, delay: 0.7 },
    { height: 65, delay: 0.8 },
    { height: 80, delay: 0.9 },
    { height: 50, delay: 1.0 },
    { height: 75, delay: 1.1 },
    { height: 40, delay: 1.2 },
  ];

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 dark:from-orange-600 dark:via-orange-700 dark:to-orange-900">
      <div className="absolute inset-0 bg-black/10" />
      
      <div className="relative px-6 py-6 md:px-12 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="z-10"
          >
            <motion.h1 
              className="text-3xl md:text-4xl font-bold text-white mb-2 leading-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Market opportunities
              <br />
              <span className="text-white/90">don't wait.</span>
            </motion.h1>
            
            <motion.p
              className="text-lg md:text-xl text-white/95 mb-4 font-medium"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              Find your edge now.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              <Button 
                size="default" 
                className="bg-black hover:bg-black/90 text-white px-6 rounded-full shadow-2xl"
                data-testid="button-hero-cta"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Discover Trading Signals
              </Button>
            </motion.div>
          </motion.div>

          <div className="relative h-32 md:h-40 lg:h-48 flex items-end justify-center gap-2 md:gap-3 lg:gap-4">
            {bars.map((bar, index) => (
              <motion.div
                key={index}
                className="relative flex-1 bg-gradient-to-t from-black/40 to-black/60 rounded-t-lg shadow-lg"
                style={{
                  maxWidth: '40px',
                }}
                initial={{ height: 0, opacity: 0 }}
                animate={{ 
                  height: `${bar.height}%`, 
                  opacity: 1 
                }}
                transition={{
                  duration: 1.2,
                  delay: bar.delay,
                  ease: "easeOut"
                }}
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-t from-white/20 to-white/40 rounded-t-lg"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{
                    duration: 0.8,
                    delay: bar.delay + 0.3,
                    ease: "easeOut"
                  }}
                  style={{ transformOrigin: 'bottom' }}
                />
                
                <motion.div
                  className="absolute -top-1 left-0 right-0 h-1 bg-white/60 rounded-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: 0.3,
                    delay: bar.delay + 1
                  }}
                />

                <motion.div
                  className="absolute inset-0"
                  animate={{
                    boxShadow: [
                      '0 0 0px rgba(255,255,255,0)',
                      '0 0 20px rgba(255,255,255,0.3)',
                      '0 0 0px rgba(255,255,255,0)'
                    ]
                  }}
                  transition={{
                    duration: 2,
                    delay: bar.delay + 1.5,
                    repeat: Infinity,
                    repeatDelay: 1
                  }}
                />
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          className="absolute top-1/2 right-0 w-96 h-96 bg-orange-400/20 rounded-full blur-3xl -translate-y-1/2"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>
    </div>
  );
}
