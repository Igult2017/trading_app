import { Switch, Route, useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { titleFromPath, usePageTitle } from "@/hooks/usePageTitle";
import { queryClient, authFetch, localStoragePersister } from "./lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { prefetchAllPanels } from "@/lib/prefetchPanels";
import HomeHeader from "@/components/HomeHeader";
import HomeFooter from "@/components/HomeFooter";
import HomePage from "@/pages/HomePage";
import TradeHistoryPage from "@/pages/TradeHistoryPage";
import Analytics from "@/pages/Analytics";
import Stocks from "@/pages/Stocks";
import MajorPairs from "@/pages/MajorPairs";
import Commodities from "@/pages/Commodities";
import Cryptocurrency from "@/pages/Cryptocurrency";
import Join from "@/pages/Join";
import Journal from "@/pages/Journal";
import AssetPage from "@/pages/AssetPage";
import TscPage from "@/pages/TscPage";
import BlogPage from "@/pages/BlogPage";
import BlogPostPage from "@/pages/BlogPostPage";
import EconomicCalendarPage from "@/pages/EconomicCalendarPage";
import SupportPage from "@/pages/SupportPage";
import LegalPage from "@/pages/LegalPage";
import AuthPage from "@/pages/AuthPage";
import AuthCallbackPage from "@/pages/AuthCallbackPage";
import AdminPanel from "@/pages/AdminPanel";
import AccountsPage from "@/pages/AccountsPage";
import NotFound from "@/pages/not-found";

import TradingLoader from "@/components/TradingLoader";

// ── Shared loading screen ─────────────────────────────────────────────────────
function LoadingScreen() {
  return <TradingLoader fullScreen message="Connecting to your journal…" />;
}

// ── Route guards ─────────────────────────────────────────────────────────────

/** Redirects unauthenticated users to /auth. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const [, navigate] = useLocation();
  const didRedirect = useRef(false);

  useEffect(() => {
    if (!loading && !session && !didRedirect.current) {
      didRedirect.current = true;
      navigate('/auth');
    }
  }, [loading, session, navigate]);

  if (loading || !session) return <LoadingScreen />;
  return <>{children}</>;
}

/**
 * Redirects non-admin users.
 * - Not authenticated → /auth
 * - Authenticated but not admin → /journal
 */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { session, role, loading } = useAuth();
  const [, navigate] = useLocation();
  const didRedirect = useRef(false);

  useEffect(() => {
    if (!loading && !didRedirect.current) {
      if (!session) { didRedirect.current = true; navigate('/auth'); }
      else if (role !== 'admin') { didRedirect.current = true; navigate('/journal'); }
    }
  }, [loading, session, role, navigate]);

  if (loading || !session || role !== 'admin') return <LoadingScreen />;
  return <>{children}</>;
}

// ── Protected inner pages (require auth, include header + footer) ─────────────
function InnerPages() {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <HomeHeader darkMode={true} setDarkMode={() => {}} activePath={undefined} />
      <main className="flex-1 bg-background">
        <Switch>
          <Route path="/history"     component={TradeHistoryPage} />
          <Route path="/analytics"   component={Analytics} />
          <Route path="/assets"      component={AssetPage} />
          <Route path="/accounts"    component={AccountsPage} />
          <Route path="/stocks"      component={Stocks} />
          <Route path="/major-pairs" component={MajorPairs} />
          <Route path="/commodities" component={Commodities} />
          <Route path="/crypto"      component={Cryptocurrency} />
          <Route path="/markets"     component={Stocks} />
          <Route path="/signals"     component={Stocks} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <HomeFooter />
    </div>
  );
}

// ── Dynamic tab title — updates on every navigation ──────────────────────────
function TitleUpdater() {
  const [location] = useLocation();
  usePageTitle(titleFromPath(location));
  return null;
}

// ── Top-level router ──────────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <>
    <TitleUpdater />
    <Switch>
      {/* Public routes — no login required */}
      <Route path="/"              component={HomePage} />
      <Route path="/auth"          component={AuthPage} />
      <Route path="/auth/callback" component={AuthCallbackPage} />
      <Route path="/join"          component={Join} />
      <Route path="/tsc"           component={TscPage} />
      <Route path="/blog"          component={BlogPage} />
      <Route path="/blog/:slug"    component={BlogPostPage} />
      <Route path="/calendar"      component={EconomicCalendarPage} />
      <Route path="/support"       component={SupportPage} />
      <Route path="/legal"         component={LegalPage} />

      {/* Journal — protected, has its own header (no shared header/footer) */}
      <Route path="/journal">
        {() => <RequireAuth><Journal /></RequireAuth>}
      </Route>

      {/* Admin route */}
      <Route path="/admin">
        {() => <RequireAdmin><AdminPanel /></RequireAdmin>}
      </Route>

      {/* Protected inner routes — login required */}
      <Route>
        {() => <RequireAuth><InnerPages /></RequireAuth>}
      </Route>
    </Switch>
    </>
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

/**
 * Silently warms the journal panel cache the moment a session is confirmed —
 * even before the user navigates to /journal.
 *
 * Strategy:
 *  1. Fetch the sessions list and cache it.
 *  2. Find the active session: prefer the ID saved in localStorage (last
 *     session the user had open), fall back to the most recently updated one.
 *  3. Fire prefetchAllPanels so metrics, entries, drawdown, calendar, etc.
 *     are already resolved by the time the dashboard renders.
 *
 * Everything is fire-and-forget — no UI is blocked.
 */
function JournalPrefetcher() {
  const { session, user } = useAuth();
  const qc = useQueryClient();
  const prefetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!session || !user) return;
    // Only run once per session (access_token changes on every refresh)
    const key = session.access_token;
    if (prefetchedFor.current === key) return;
    prefetchedFor.current = key;

    const STALE = 2 * 60 * 1000;

    // Step 1 — warm the sessions list
    qc.prefetchQuery({
      queryKey: ['/api/sessions', user.id],
      queryFn: () => authFetch('/api/sessions').then(r => r.ok ? r.json() : []).catch(() => []),
      staleTime: STALE,
    }).then(() => {
      // Step 2 — resolve which session to warm panels for
      const sessions: any[] = qc.getQueryData(['/api/sessions', user.id]) ?? [];
      if (sessions.length === 0) return;

      const savedId = typeof window !== 'undefined'
        ? localStorage.getItem('journal_active_session_id')
        : null;

      const target =
        (savedId && sessions.find((s: any) => s.id === savedId)) ??
        sessions.sort((a: any, b: any) =>
          new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
          new Date(a.updatedAt ?? a.createdAt ?? 0).getTime()
        )[0];

      if (!target) return;

      // Step 3 — warm all panel endpoints for that session
      prefetchAllPanels(qc, target.id, user.id);
    }).catch(() => { /* silent — prefetch is best-effort */ });
  }, [session?.access_token, user?.id, qc]);

  return null;
}

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: localStoragePersister, maxAge: 24 * 60 * 60 * 1000 }}
    >
      <PrefetchCalendar />
      <TooltipProvider>
        <AuthProvider>
          <JournalPrefetcher />
          <AppRoutes />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </PersistQueryClientProvider>
  );
}
