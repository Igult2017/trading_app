import { Switch, Route, useLocation } from "wouter";
import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from "react";
import { usePageTracking } from "@/hooks/usePageTracking";
import { titleFromPath, usePageTitle } from "@/hooks/usePageTitle";
import { queryClient, fetchJson, localStoragePersister } from "./lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AuthModal, { openAuthModal, type AuthModalMode } from "@/components/auth/AuthModal";
import { warmJournalCache } from "@/lib/prefetchPanels";
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

/**
 * PAGES ARE FETCHED WHEN FIRST OPENED, not all up front (2026-08-30).
 *
 * The whole app used to ship as ONE 2,130 KB file (583 KB compressed), so somebody arriving on a
 * blog article from a search result downloaded the admin panel, the trading journal, the charting
 * library and everything else before a word appeared on screen. Slow loading is also a ranking
 * signal, so this was costing search traffic as well as patience.
 *
 * STAYING EAGER, DELIBERATELY:
 *   HomePage             — the first thing most visitors see; delaying it would be the wrong trade
 *   BlogPage
 *   EconomicCalendarPage — these two are ALWAYS MOUNTED on purpose (see the note further down),
 *                          so making them lazy would fetch them on every route anyway and risk the
 *                          instant-navigation behaviour that arrangement exists to give.
 */
const TradeHistoryPage = lazy(() => import("@/pages/TradeHistoryPage"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Join = lazy(() => import("@/pages/Join"));
const Journal = lazy(() => import("@/pages/Journal"));
const AssetPage = lazy(() => import("@/pages/AssetPage"));
const TscPage = lazy(() => import("@/pages/TscPage"));
const BlogPostPage = lazy(() => import("@/pages/BlogPostPage"));
const SupportPage = lazy(() => import("@/pages/support/SupportPage"));
const AboutPage = lazy(() => import("@/pages/AboutPage"));
const LegalPage = lazy(() => import("@/pages/legal/LegalPage"));
const AuthCallbackPage = lazy(() => import("@/pages/AuthCallbackPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const AdminPanel = lazy(() => import("@/pages/AdminPanel"));
const AccountsPage = lazy(() => import("@/pages/AccountsPage"));






import BlogPage from "@/pages/BlogPage";

import EconomicCalendarPage from "@/pages/EconomicCalendarPage";







import NotFound from "@/pages/not-found";

// ── Shared loading screen ─────────────────────────────────────────────────────
//
// HIS INSTRUCTION, 2026-09-06: *"i noticed there is a rolling loader when the user reloads the page,
// please remove it because i havent seen that approach in any modern app. Just make the page go
// white when the user reloads."*
//
// What was here: a spinning ring, a progress bar that crept to 90% on a timer — measuring NOTHING,
// it was a `setInterval` that just kept adding — and ten rotating messages ("Crunching your trade
// data…"). A reload is usually a few hundred milliseconds of re-checking the session, so all of that
// appeared and vanished, which is worse than nothing at all.
//
// PAINTED IN THE APP'S OWN BACKGROUND, NOT WHITE. The journal is a dark app; a literal white flash
// on every reload would be the more jarring of the two. Same idea, one colour value if he wants it
// white after all.
// ── UPDATE 2026-09-12 — the blankness was right for a RELOAD and wrong for a LOGIN ──────────
//
// He reported staring at an empty screen after signing in, on both the panel and the journal.
// Two things were stacked up behind that blank rectangle:
//   1. sign-in AWAITED the dashboard data before it would navigate — up to six seconds (see the
//      note in AuthContext.signIn, now fixed);
//   2. the route's JavaScript is only fetched once you arrive, and measured against production
//      that is 1.8-2.2s on a cold cache.
//
// The reasoning above still holds for the case it was written for: on a fast reload a spinner
// appears and vanishes, which is worse than nothing. So the skeleton is DELAYED — nothing at all
// for the first 400ms, so a quick reload stays clean, and only a genuinely slow wait ever shows
// it. Both cases are served rather than one traded for the other.

/** Shows nothing until `after` ms have passed, then renders. Keeps fast waits flicker-free. */
function AfterDelay({ after = 400, children }: { after?: number; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), after);
    return () => clearTimeout(t);
  }, [after]);
  return show ? <>{children}</> : null;
}

/** One placeholder block. No backticks anywhere in the style tag below — a backtick inside a
 *  template-literal <style> is a runtime crash that still builds clean. */
function Bone({ w, h, r = 8, dark = false, mt = 0 }: { w: number | string; h: number; r?: number; dark?: boolean; mt?: number }) {
  return (
    <div className="app-bone" style={{
      width: w, height: h, borderRadius: r, marginTop: mt,
      background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)',
    }} />
  );
}

const BONE_CSS = '@keyframes appBonePulse{0%,100%{opacity:.55}50%{opacity:1}}'
               + '.app-bone{animation:appBonePulse 1.5s ease-in-out infinite}';

/** The wait between "you are signed in" and "the screen is here".
 *  `admin` mirrors the panel (dark rail, light content); `journal` is the dark app. */
function LoadingScreen({ variant = 'journal' }: { variant?: 'journal' | 'admin' }) {
  const admin = variant === 'admin';
  return (
    <div style={{ position: 'fixed', inset: 0, background: admin ? '#f5f7fa' : '#07090f', display: 'flex' }}
         role="status" aria-label="Loading">
      <style>{BONE_CSS}</style>
      <AfterDelay>
        <div style={{ display: 'flex', width: '100%' }}>
          {/* the navigation rail */}
          <div style={{ width: admin ? 224 : 232, flexShrink: 0, background: '#0a0f16',
                        padding: '22px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Bone w={120} h={26} dark />
            <div style={{ height: 10 }} />
            {Array.from({ length: 8 }).map((_, i) => <Bone key={i} w="100%" h={17} dark />)}
          </div>
          {/* the content */}
          <div style={{ flex: 1, padding: '28px 28px 0', minWidth: 0 }}>
            <Bone w={210} h={30} r={10} dark={!admin} />
            <Bone w={330} h={14} mt={12} dark={!admin} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginTop: 28 }}>
              {Array.from({ length: 4 }).map((_, i) => <Bone key={i} w="100%" h={122} r={14} dark={!admin} />)}
            </div>
            <Bone w="100%" h={300} r={14} mt={18} dark={!admin} />
          </div>
        </div>
      </AfterDelay>
    </div>
  );
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

  if (loading || !session || role !== 'admin') return <LoadingScreen variant="admin" />;
  return <>{children}</>;
}

// ── Protected inner pages (require auth, include header + footer) ─────────────
/** Shown for the moment a page's code is being fetched. Deliberately near-invisible: these files
 *  are small and usually arrive in well under a second, so a spinner would flash and be worse than
 *  nothing. It reserves the height so the page does not jump when the content lands. */
/** The gap while a route's JavaScript downloads, INSIDE an already-painted shell. Measured
 *  against production that is 1.8-2.2s on a cold cache, and it used to be an empty box. */
/**
 * ⚠ THE SHAPE FOLLOWS THE ROUTE. His report, 2026-10-10: *"fix skeletones in other pages where the
 * skeleton does not look like that page. One of such pages is the landing page."*
 *
 * He was right. There was ONE placeholder — a left-aligned title, a line, FOUR CARDS IN A ROW and a
 * big block — and all three Suspense boundaries used it. That is a dashboard, and it is the correct
 * shape for exactly four of the routes it was covering:
 *
 *     /                       a CENTRED hero: pill, huge headline, two buttons, chips, wide panel
 *     /legal /support /about  a narrow column of article text
 *     /blog/:slug             the same
 *     /journal /admin         a full app shell with a navigation rail
 *     /history /analytics ... a dashboard  <- the only ones the old shape fitted
 *
 * So the landing page announced itself as a four-card dashboard and then painted a centred hero,
 * which is a visible lurch on every cold load.
 *
 * It reads the path rather than taking a prop because a Suspense fallback cannot be told which
 * route it is standing in for — the route has not resolved yet. `useLocation` works here: wouter
 * reads browser history directly, and TitleUpdater beside this Suspense already relies on it.
 */
function PageLoading() {
  const [path] = useLocation();

  // The landing page is the one surface that is not part of the signed-in shell, so it is also the
  // one whose placeholder has to follow the public light/dark switch (stored by usePublicTheme).
  let pubDark = false;
  try { pubDark = localStorage.getItem('pub-theme') === 'dark'; } catch { /* storage blocked */ }

  const isLanding = path === '/';
  const isArticle = /^\/(legal|support|about|blog)(\/|$)/.test(path);
  const isAppShell = /^\/(journal|admin)(\/|$)/.test(path);

  // An app shell already has a dedicated full-screen placeholder with the navigation rail.
  if (isAppShell) return <LoadingScreen variant={path.startsWith('/admin') ? 'admin' : 'journal'} />;

  return (
    <div style={{ minHeight: "60vh", padding: "8px 4px" }} aria-busy="true" aria-live="polite" role="status" aria-label="Loading">
      <style>{BONE_CSS}</style>
      <AfterDelay>
        {isLanding ? (
          // CENTRED, matching HomeHero: badge, two headline lines, one supporting line, two
          // buttons, the six feature chips, then the wide showcase panel.
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '72px 32px 0', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}><Bone w={240} h={30} r={999} dark={pubDark} /></div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}><Bone w="62%" h={54} r={12} dark={pubDark} /></div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}><Bone w="48%" h={54} r={12} dark={pubDark} /></div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}><Bone w={420} h={16} dark={pubDark} /></div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 30 }}>
              <Bone w={168} h={48} r={12} dark={pubDark} /><Bone w={150} h={48} r={12} dark={pubDark} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 44 }}>
              {Array.from({ length: 6 }).map((_, i) => <Bone key={i} w="100%" h={56} r={12} dark={pubDark} />)}
            </div>
            {/* the showcase panel: 2.6:1, the shape HomeShowcase locks itself to */}
            <div style={{ marginTop: 56 }}><Bone w="100%" h={430} r={22} dark={pubDark} /></div>
          </div>
        ) : isArticle ? (
          // A column of running text, which is what these pages actually are.
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px 24px 0' }}>
            <Bone w="70%" h={36} r={10} />
            <Bone w={200} h={14} mt={16} />
            <div style={{ marginTop: 34 }}>
              {[100, 96, 99, 72, 98, 94, 99, 61].map((pc, i) => (
                <Bone key={i} w={pc + '%'} h={13} mt={i ? 14 : 0} />
              ))}
            </div>
            <Bone w="100%" h={220} r={12} mt={32} />
            <div style={{ marginTop: 30 }}>
              {[98, 93, 100, 68].map((pc, i) => <Bone key={i} w={pc + '%'} h={13} mt={i ? 14 : 0} />)}
            </div>
          </div>
        ) : (
          // The dashboard shape, kept for the pages it was always right for.
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <Bone w={240} h={28} r={10} />
            <Bone w={380} h={14} mt={12} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 18, marginTop: 26 }}>
              {Array.from({ length: 4 }).map((_, i) => <Bone key={i} w="100%" h={112} r={14} />)}
            </div>
            <Bone w="100%" h={280} r={14} mt={18} />
          </div>
        )}
      </AfterDelay>
    </div>
  );
}

function InnerPages() {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <HomeHeader darkMode={true} setDarkMode={() => {}} activePath={undefined} />
      {/* Same header, same real height — this was pt-16 (64px) too. */}
      <main className="flex-1 bg-background" style={{ paddingTop: 'var(--app-header-h, 101px)' }}>
        <Suspense fallback={<PageLoading />}>
        <Switch>
          <Route path="/history"     component={TradeHistoryPage} />
          <Route path="/analytics"   component={Analytics} />
          <Route path="/assets"      component={AssetPage as React.ComponentType<any>} />
          <Route path="/accounts"    component={AccountsPage as React.ComponentType<any>} />
          <Route component={NotFound} />
        </Switch>
        </Suspense>
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

      {/* RESERVE EXACTLY WHAT THE HEADER OCCUPIES, measured by the header itself.
          This was `pt-16` — a hardcoded 64px, with a comment calling the header 64px tall. It is
          101px (the ticker band plus the 68px nav row), so 37px of every public page sat underneath
          it, invisible. On the blog that was the entire row of category filters (2026-08-30).
          The fallback matches today's measurement and only applies for the first paint. */}
      <div style={{ paddingTop: 'var(--app-header-h, 101px)' }}>

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
        <Suspense fallback={<PageLoading />}>
        <Switch>
          <Route path="/blog/:slug" component={BlogPostPage} />
          <Route path="/tsc"        component={TscPage} />
          <Route path="/legal"      component={LegalPage} />
          <Route path="/support"    component={SupportPage} />
          <Route path="/about"      component={AboutPage} />
          <Route component={NotFound} />
        </Switch>
        </Suspense>
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
    <Suspense fallback={<PageLoading />}>
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

      {/* Public sub-pages — shared layout keeps HomeHeader mounted across navigations.
          This catch-all also handles 404 via NotFound inside PublicPagesGroup. */}
      <Route component={PublicPagesGroup} />
    </Switch>
    </Suspense>
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

    // Fallback warm-up: covers page reload with an existing session and OAuth-redirect
    // logins (where signIn() isn't called). A password login warms eagerly inside
    // signIn(); prefetchQuery dedupes so this second call is a cheap no-op.
    warmJournalCache(qc, user.id);
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
      persistOptions={{ persister: localStoragePersister, maxAge: 30 * 24 * 60 * 60 * 1000 }}
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
