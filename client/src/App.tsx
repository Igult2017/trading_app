import { Switch, Route, useLocation } from "wouter";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { usePageTracking } from "@/hooks/usePageTracking";
import { titleFromPath, usePageTitle } from "@/hooks/usePageTitle";
import { queryClient, fetchJson, localStoragePersister } from "./lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AuthModal, { openAuthModal, type AuthModalMode } from "@/components/auth/AuthModal";
import { prefetchAllPanels } from "@/lib/prefetchPanels";
import { prefetchAdminData } from "@/lib/prefetchAdmin";
import { startCalendarBackgroundRefresh } from "@/lib/prefetchCalendar";

// Populate cache from server-injected data before any component renders.
// window.__PREFETCH__ is written into the HTML shell by the server (injectPrefetch.ts)
// so this data is available synchronously — no network request needed.
const _pf = (window as any).__PREFETCH__;
if (_pf?.calendar?.length > 0)           queryClient.setQueryData(["/api/homepage/calendar"], _pf.calendar);
if (_pf?.rates && Object.keys(_pf.rates).length > 0) queryClient.setQueryData(["/api/homepage/rates"], _pf.rates);

// Background refresh loop — keeps cache fresh every 3 min
startCalendarBackgroundRefresh(queryClient);
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import HomeHeader from "@/components/HomeHeader";
import HomeFooter from "@/components/HomeFooter";
import { PublicThemeContext, usePublicTheme } from "@/context/PublicThemeContext";
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
import AuthCallbackPage from "@/pages/AuthCallbackPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
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
      <main className="flex-1 bg-background pt-16">
        <Switch>
          <Route path="/history"     component={TradeHistoryPage} />
          <Route path="/analytics"   component={Analytics} />
          <Route path="/assets"      component={AssetPage as React.ComponentType<any>} />
          <Route path="/accounts"    component={AccountsPage as React.ComponentType<any>} />
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

/**
 * Shared layout for public sub-pages (/calendar, /blog, /tsc, /legal, /support).
 *
 * This component is used as the CATCH-ALL route at the bottom of AppRoutes.
 * Because it is always the same Route element that matches, React never
 * unmounts it while navigating between public pages — only the inner <Switch>
 * content swaps.  HomeHeader therefore stays mounted and never re-renders from
 * scratch on navigation, eliminating the "whole page loads" flash.
 *
 * darkMode is persisted to localStorage so the user's preference survives
 * page-to-page navigation and browser sessions.
 */
function PublicPagesGroup() {
  const { darkMode, setDarkMode: handleSetDark } = usePublicTheme();
  const [location] = useLocation();

  const isCalendar = location === '/calendar';
  const isBlog     = location === '/blog';
  // Any other public route (TSC, legal, support, /blog/:slug) falls to the Switch
  const isOther    = !isCalendar && !isBlog;

  // Centralised page tracking — calendar/blog are always-mounted so they
  // cannot self-track via useEffect on mount; do it here instead.
  const trackPage = useMemo(
    () => (isCalendar ? 'calendar' : isBlog ? 'blog' : ''),
    [isCalendar, isBlog]
  );
  usePageTracking(trackPage);

  return (
    <>
      <HomeHeader darkMode={darkMode} setDarkMode={handleSetDark} activePath={location} />

      {/* pt-16 offsets the 64px fixed header so content is not hidden beneath it */}
      <div className="pt-16">

      {/*
       * EconomicCalendarPage and BlogPage are ALWAYS mounted.
       * We hide the inactive one with the HTML `hidden` attribute (display:none)
       * instead of unmounting it via a Switch route.
       *
       * Why: the Switch would unmount the component on every navigation away,
       * forcing React to rebuild the entire tree from scratch on return — that
       * is exactly the "whole page loading" the user sees.  With always-mounted
       * components, navigation is instant CSS toggling with zero re-initialisation.
       * Queries keep polling in the background so data is always fresh.
       */}
      <div hidden={!isCalendar} aria-hidden={!isCalendar} style={isCalendar ? undefined : { display: 'none' }}>
        <EconomicCalendarPage active={isCalendar} />
      </div>
      <div hidden={!isBlog} aria-hidden={!isBlog} style={isBlog ? undefined : { display: 'none' }}>
        <BlogPage active={isBlog} />
      </div>

      {/* Remaining public routes — less frequently visited, mount/unmount is fine */}
      {isOther && (
        <Switch>
          <Route path="/blog/:slug" component={BlogPostPage} />
          <Route path="/tsc"        component={TscPage} />
          <Route path="/legal"      component={LegalPage} />
          <Route path="/support"    component={SupportPage} />
          <Route component={NotFound} />
        </Switch>
      )}

      </div>{/* end pt-16 offset wrapper */}

      <HomeFooter darkMode={darkMode} />
    </>
  );
}

// Legacy /auth route → bounce to the homepage and open the auth modal, so the
// old full-page auth UI is never shown. ?mode=signup|forgot selects the tab.
function AuthRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    const m: AuthModalMode = mode === "signup" ? "signup" : mode === "forgot" ? "forgot" : "login";
    navigate("/", { replace: true });
    openAuthModal(m);
  }, [navigate]);
  return null;
}

// ── Top-level router ──────────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <>
    <TitleUpdater />
    <Switch>
      {/* Pages with their own full layouts — must come before the catch-all */}
      <Route path="/"                     component={HomePage} />
      <Route path="/auth"                 component={AuthRedirect} />
      <Route path="/auth/callback"        component={AuthCallbackPage} />
      <Route path="/auth/reset-password"  component={ResetPasswordPage} />
      <Route path="/join"                 component={Join} />

      {/* Journal — protected, has its own header */}
      <Route path="/journal">
        {() => <RequireAuth><InactivityWatcher /><Journal /></RequireAuth>}
      </Route>

      {/* Admin */}
      <Route path="/admin">
        {() => <RequireAdmin><InactivityWatcher /><AdminPanel /></RequireAdmin>}
      </Route>

      {/* Protected inner pages — listed explicitly so they aren't caught by PublicPagesGroup */}
      <Route path="/history">    <RequireAuth><InnerPages /></RequireAuth></Route>
      <Route path="/analytics">  <RequireAuth><InnerPages /></RequireAuth></Route>
      <Route path="/assets">     <RequireAuth><InnerPages /></RequireAuth></Route>
      <Route path="/accounts">   <RequireAuth><InnerPages /></RequireAuth></Route>
      <Route path="/stocks">     <RequireAuth><InnerPages /></RequireAuth></Route>
      <Route path="/major-pairs"><RequireAuth><InnerPages /></RequireAuth></Route>
      <Route path="/commodities"><RequireAuth><InnerPages /></RequireAuth></Route>
      <Route path="/crypto">     <RequireAuth><InnerPages /></RequireAuth></Route>
      <Route path="/markets">    <RequireAuth><InnerPages /></RequireAuth></Route>
      <Route path="/signals">    <RequireAuth><InnerPages /></RequireAuth></Route>

      {/* Public sub-pages — shared layout keeps HomeHeader mounted across navigations.
          This catch-all also handles 404 via NotFound inside PublicPagesGroup. */}
      <Route component={PublicPagesGroup} />
    </Switch>
    </>
  );
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
function InactivityWatcher() {
  useInactivityLogout();
  return null;
}

function AdminPrefetcher() {
  const { session, role } = useAuth();
  const qc = useQueryClient();
  const prefetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (role !== 'admin' || !session) return;
    const key = session.access_token;
    if (prefetchedFor.current === key) return;
    prefetchedFor.current = key;
    prefetchAdminData(qc);
  }, [role, session?.access_token, qc]);

  return null;
}

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
    // Key must match Journal.tsx useQuery key exactly: ['/api/sessions']
    qc.prefetchQuery({
      // Throw on a bad response so a failed prefetch never overwrites the shared
      // ['/api/sessions'] cache with [] (which would blank the session cards).
      queryKey: ['/api/sessions'],
      queryFn: () => fetchJson('/api/sessions'),
      staleTime: STALE,
    }).then(() => {
      // Step 2 — resolve which session to warm panels for
      const sessions: any[] = qc.getQueryData(['/api/sessions']) ?? [];
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
  // Single source of truth for the public-pages dark mode toggle.
  // Stored in localStorage so the preference survives page refreshes and
  // cross-page navigation (HomePage, Calendar, Blog, TSC, etc. all share it).
  const [darkMode, setDarkModeRaw] = useState<boolean>(() => {
    try { return localStorage.getItem("pub-theme") === "1"; } catch { return false; }
  });

  const setDarkMode = useCallback((val: boolean) => {
    setDarkModeRaw(val);
    try { localStorage.setItem("pub-theme", val ? "1" : "0"); } catch {}
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: localStoragePersister, maxAge: 24 * 60 * 60 * 1000 }}
    >
      <PublicThemeContext.Provider value={{ darkMode, setDarkMode }}>
        <TooltipProvider>
          <AuthProvider>
            <JournalPrefetcher />
            <AdminPrefetcher />
            <AppRoutes />
            <AuthModal />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </PublicThemeContext.Provider>
    </PersistQueryClientProvider>
  );
}
