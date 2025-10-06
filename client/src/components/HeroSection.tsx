import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  TrendingUp, 
  Search, 
  Wifi,
  WifiOff,
  Send,
  Settings,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { useState } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Notifications } from '@/components/Notifications';
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

const mainNavItems = [
  { name: 'Dashboard', path: '/' },
  { name: 'Markets', path: '/markets' },
  { name: 'Signals', path: '/signals' },
  { name: 'Calendar', path: '/calendar' },
  { name: 'History', path: '/history' },
  { name: 'Analytics', path: '/analytics' },
];

export function HeroSection() {
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

  return (
    <header className="sticky top-0 z-50 w-full bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 dark:from-orange-600 dark:via-orange-700 dark:to-orange-900">
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
            <Notifications />

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
            <ThemeToggle />

            {/* Mobile Menu */}
            <SidebarTrigger data-testid="button-mobile-menu" className="hidden md:block text-white" />
          </div>
        </div>
      </div>
    </header>
  );
}
