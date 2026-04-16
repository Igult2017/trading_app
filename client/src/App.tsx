import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HomePage from "@/pages/HomePage";
import Dashboard from "@/pages/Dashboard";
import TradeHistoryPage from "@/pages/TradeHistoryPage";
import Analytics from "@/pages/Analytics";
import Stocks from "@/pages/Stocks";
import MajorPairs from "@/pages/MajorPairs";
import Commodities from "@/pages/Commodities";
import Cryptocurrency from "@/pages/Cryptocurrency";
import Join from "@/pages/Join";
import Blog from "@/pages/Blog";
import Journal from "@/pages/Journal";
import AssetPage from "@/pages/AssetPage";
import TscPage from "@/pages/TscPage";
import BlogPage from "@/pages/BlogPage";
import EconomicCalendarPage from "@/pages/EconomicCalendarPage";
import AuthPage from "@/pages/AuthPage";
import AuthCallbackPage from "@/pages/AuthCallbackPage";
import AdminPanel from "@/pages/AdminPanel";
import AccountsPage from "@/pages/AccountsPage";
import NotFound from "@/pages/not-found";

// ── Shared loading screen ─────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', background: '#0D0F14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#4AE8D8', fontSize: 14, fontFamily: 'monospace' }}>Loading…</div>
    </div>
  );
}

// ── Route guards ─────────────────────────────────────────────────────────────

/** Redirects unauthenticated users to /auth. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const [, navigate] = useLocation();
  if (loading) return <LoadingScreen />;
  if (!session) { navigate('/auth'); return null; }
  return <>{children}</>;
}

/**
 * Redirects non-admin users.
 * - Not authenticated → /auth
 * - Authenticated but not admin → /dashboard
 */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { session, role, loading } = useAuth();
  const [, navigate] = useLocation();
  if (loading) return <LoadingScreen />;
  if (!session)          { navigate('/auth');      return null; }
  if (role !== 'admin')  { navigate('/dashboard'); return null; }
  return <>{children}</>;
}

// ── Protected inner pages (require auth, include header + footer) ─────────────
function InnerPages() {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <Header />
      <main className="flex-1 bg-background">
        <Switch>
          <Route path="/dashboard"   component={Dashboard} />
          <Route path="/history"     component={TradeHistoryPage} />
          <Route path="/analytics"   component={Analytics} />
          <Route path="/journal"     component={Journal} />
          <Route path="/assets"      component={AssetPage} />
          <Route path="/accounts"    component={AccountsPage} />
          <Route path="/stocks"      component={Stocks} />
          <Route path="/major-pairs" component={MajorPairs} />
          <Route path="/commodities" component={Commodities} />
          <Route path="/crypto"      component={Cryptocurrency} />
          <Route path="/blog"        component={Blog} />
          <Route path="/markets"     component={Stocks} />
          <Route path="/signals"     component={Stocks} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

// ── Top-level router ──────────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/"             component={HomePage} />
      <Route path="/auth"         component={AuthPage} />
      <Route path="/auth/callback" component={AuthCallbackPage} />
      <Route path="/join"   component={Join} />
      <Route path="/tsc"    component={TscPage} />
      <Route path="/blog/:slug" component={BlogPage} />
      <Route path="/calendar"   component={EconomicCalendarPage} />

      {/* Admin route */}
      <Route path="/admin">
        {() => <RequireAdmin><AdminPanel /></RequireAdmin>}
      </Route>

      {/* Protected inner routes */}
      <Route>
        {() => <RequireAuth><InnerPages /></RequireAuth>}
      </Route>
    </Switch>
  );
}

function PrefetchCalendar() {
  useEffect(() => {
    const opts = { staleTime: 5 * 60 * 1000 };
    queryClient.prefetchQuery({ queryKey: ['/api/homepage/calendar'], queryFn: () => fetch('/api/homepage/calendar').then(r => r.json()).catch(() => []), ...opts });
    queryClient.prefetchQuery({ queryKey: ['/api/homepage/rates'],   queryFn: () => fetch('/api/homepage/rates').then(r => r.json()).catch(() => ({})), ...opts });
  }, []);
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PrefetchCalendar />
      <TooltipProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
