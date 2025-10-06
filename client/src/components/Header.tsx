import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  Settings, 
  TrendingUp,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  Send
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Notifications } from '@/components/Notifications';

const mainNavItems = [
  { name: 'Dashboard', path: '/' },
  { name: 'Markets', path: '/markets' },
  { name: 'Signals', path: '/signals' },
  { name: 'Calendar', path: '/calendar' },
  { name: 'History', path: '/history' },
  { name: 'Analytics', path: '/analytics' },
];

const quickLinks = [
  { name: 'Major Pairs', tag: 'forex' },
  { name: 'Indices', tag: 'indices' },
  { name: 'Commodities', tag: 'commodities' },
  { name: 'Crypto', tag: 'crypto' },
  { name: 'Pre-Market', tag: 'pre-market' },
  { name: 'After Hours', tag: 'after-hours' },
  { name: 'High Impact News', tag: 'news', highlight: true },
];

export default function Header() {
  const [location] = useLocation();
  const [connectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connected');
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  const { data: notificationStatus } = useQuery<{ telegramBotActive: boolean; message: string }>({
    queryKey: ['/api/notifications/status'],
  });

  const testSignalMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/notifications/signal', {
        symbol: 'EUR/USD',
        type: 'buy',
        strategy: 'scalping',
        entry: 1.0850,
        stopLoss: 1.0825,
        takeProfit: 1.0900,
        riskReward: 2.0,
        timeframe: '15M',
        confidence: 85,
        reasoning: [
          'Test signal notification',
          'Breaking above resistance'
        ]
      });
    },
    onSuccess: () => {
      toast({
        title: "Test Notification Created!",
        description: "Check the notification bell icon to see it.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create test notification.",
        variant: "destructive",
      });
    },
  });

  const isActivePath = (path: string) => {
    if (path === '/') return location === '/';
    return location.startsWith(path);
  };

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
    <header className="sticky top-0 z-50 w-full">
      <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 dark:from-orange-600 dark:via-orange-700 dark:to-orange-900">
        <div className="absolute inset-0 bg-black/10" />
        
        {/* Navigation Bar */}
        <div className="relative border-b border-white/10">
          <div className="flex h-14 items-center justify-between px-4 md:px-6">
            {/* Left Section - Logo & Nav */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <SidebarTrigger data-testid="button-sidebar-toggle" className="md:hidden text-white" />
                <Link href="/" data-testid="link-logo">
                  <div className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity">
                    <TrendingUp className="w-6 h-6 text-white" />
                    <div className="hidden sm:block">
                      <h1 className="text-base font-bold text-white leading-none">
                        Infod Trading
                      </h1>
                    </div>
                  </div>
                </Link>
              </div>

              {/* Desktop Navigation */}
              <nav className="hidden lg:flex items-center gap-1">
                {mainNavItems.map((item) => (
                  <Link key={item.path} href={item.path}>
                    <Button
                      variant={isActivePath(item.path) ? "secondary" : "ghost"}
                      size="sm"
                      className={`transition-colors text-white ${
                        isActivePath(item.path) 
                          ? 'bg-white/20 hover:bg-white/30' 
                          : 'hover:bg-white/10'
                      }`}
                      data-testid={`nav-${item.name.toLowerCase()}`}
                    >
                      {item.name}
                    </Button>
                  </Link>
                ))}
              </nav>
            </div>

            {/* Center Section - Search */}
            <div className="hidden md:flex flex-1 max-w-md mx-4">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
                <Input
                  type="text"
                  placeholder="Search markets, pairs, indicators..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 h-9 bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:bg-white/20"
                  data-testid="input-search"
                />
              </div>
            </div>

            {/* Right Section - Actions */}
            <div className="flex items-center gap-2">
              {/* Connection Status */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-md bg-white/10">
                {connectionStatus === 'connected' ? (
                  <Wifi className="w-3.5 h-3.5 text-green-300" />
                ) : connectionStatus === 'connecting' ? (
                  <Wifi className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-red-300" />
                )}
                <span className="text-xs font-medium text-white" data-testid="text-connection-status">
                  {connectionStatus === 'connected' ? 'Live' : 
                   connectionStatus === 'connecting' ? 'Connecting' : 'Offline'}
                </span>
              </div>

              {/* In-App Notifications */}
              <div className="[&_button]:text-white [&_button]:hover:bg-white/10">
                <Notifications />
              </div>

              {/* Telegram Setup */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="relative text-white hover:bg-white/10"
                    data-testid="button-telegram-setup"
                  >
                    <Send className="w-4 h-4" />
                    {notificationStatus?.telegramBotActive && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-green-300 rounded-full" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Telegram Setup</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  <div className="px-2 py-3 space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      {notificationStatus?.telegramBotActive ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span className="text-muted-foreground">Bot Status: Active</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-500" />
                          <span className="text-muted-foreground">Bot Status: Inactive</span>
                        </>
                      )}
                    </div>

                    {notificationStatus?.telegramBotActive && (
                      <>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p className="font-semibold">Telegram receives:</p>
                          <ul className="list-disc list-inside space-y-0.5 ml-2">
                            <li>Trading sessions (5 min before open)</li>
                            <li>High/Medium impact economic events</li>
                          </ul>
                          <p className="mt-2 text-xs">All notifications appear in the dashboard bell icon.</p>
                        </div>

                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => testSignalMutation.mutate()}
                          disabled={testSignalMutation.isPending}
                          data-testid="button-test-notification"
                        >
                          <Send className="w-3 h-3 mr-2" />
                          {testSignalMutation.isPending ? 'Sending...' : 'Send Test Notification'}
                        </Button>
                      </>
                    )}

                    {!notificationStatus?.telegramBotActive && (
                      <div className="text-xs text-muted-foreground">
                        <p className="mb-2">To enable Telegram alerts:</p>
                        <ol className="list-decimal list-inside space-y-1 ml-2">
                          <li>Search for @InfodTradingBot on Telegram</li>
                          <li>Send /start to subscribe</li>
                          <li>Receive important alerts via Telegram!</li>
                        </ol>
                      </div>
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Settings Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" data-testid="button-settings">
                    <Settings className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem>
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    Account
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    Preferences
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Theme Toggle */}
              <div className="[&_button]:text-white [&_button]:hover:bg-white/10">
                <ThemeToggle />
              </div>

              {/* Mobile Menu */}
              <SidebarTrigger data-testid="button-mobile-menu" className="hidden md:block text-white" />
            </div>
          </div>
        </div>

        {/* Hero Content */}
        <div className="relative px-4 py-3 md:px-8 md:py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="z-10"
            >
              <motion.h1 
                className="text-xl md:text-2xl font-bold text-white mb-1 leading-tight"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                Market opportunities
                <span className="text-white/90"> don't wait.</span>
              </motion.h1>
              
              <motion.p
                className="text-sm md:text-base text-white/95 mb-2 font-medium"
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
                  size="sm" 
                  className="bg-black hover:bg-black/90 text-white px-4 rounded-full shadow-2xl"
                  data-testid="button-hero-cta"
                >
                  <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                  Discover Trading Signals
                </Button>
              </motion.div>
            </motion.div>

            <div className="relative h-16 md:h-20 lg:h-24 flex items-end justify-center gap-1.5 md:gap-2">
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

        {/* Quick Links Bar */}
        <div className="relative border-t border-white/10 bg-black/10">
          <div className="flex items-center gap-1 px-4 md:px-6 h-10 overflow-x-auto scrollbar-hide">
            {quickLinks.map((link) => (
              <button
                key={link.tag}
                className={`flex-shrink-0 px-3 py-1 text-xs font-medium rounded-md transition-colors hover:bg-white/10 ${
                  link.highlight 
                    ? 'text-orange-200' 
                    : 'text-white/80'
                }`}
                data-testid={`quick-link-${link.tag}`}
              >
                {link.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
