import "./styles/install";   // installs the stylesheet + fonts into <head> BEFORE first paint
import { useTradeSync } from "./hooks/useTradeSync";
import { Toast } from "./components/Toast";
import { AppHeader } from "./sections/AppHeader";
import { Sidebar } from "./sections/Sidebar";
import { KpiRow } from "./sections/KpiRow";
import { HistoryPage } from "./sections/HistoryPage";
import { ProviderStudioPage } from "./sections/ProviderStudioPage";
import { EngineSetup } from "./sections/EngineSetup";
import { ConnectedAccounts } from "./sections/feed/ConnectedAccounts";
import { MirrorFeed } from "./sections/feed/MirrorFeed";
import { MobileNav } from "./sections/MobileNav";

interface TradeSyncAppProps {
  /**
   * Render as a PANEL inside a host page (Journal), which keeps its own navbar and sidebar —
   * the same shape as every other Journal nav item. Re-anchors this UI's viewport-sized frame to
   * the host's scroll container; see styles/panel.ts. Omit for a standalone full-page render.
   */
  panel?: boolean;
}

/**
 * Trade Sync — copy-trading dashboard (presentation only; no backend wiring yet).
 *
 * `.ct-app` is the boundary: every token, utility and font rule in CT_STYLES is scoped to it, so
 * this screen neither reads nor leaks the host app's theme. See styles/fontGuard.ts for why the
 * scoping is load-bearing rather than cosmetic.
 */
export function TradeSyncApp({ panel = false }: TradeSyncAppProps = {}) {
  const ts = useTradeSync();
  const { theme, collapsed, setCollapsed, activePage, setActivePage, helpOpen, accountOpen, closeMenus, toast, setup, feed } = ts;

  return (
    <div className={`ct-app ${panel ? "ct-panel" : ""} ${theme === "dark" ? "theme-dark" : ""}`}>
      <AppHeader ts={ts} />
      {(helpOpen || accountOpen) && <div className="fixed inset-0 z-30" onClick={closeMenus} />}

      {/*
        THE COPY NAV RENDERS ON THE RIGHT. This UI is a PANEL inside Journal, which keeps its own
        left sidebar — so a left-hand copy rail put two vertical navs an inch apart and left the
        user working out which one governed what. One rail per flank instead.

        `md:order-last`, NOT a DOM move. DOM order drives tab and screen-reader order, so keeping
        the nav first in the markup means keyboard users still reach navigation before content
        while it paints on the right. Moving it below <main> would look identical and quietly make
        the page worse for anyone not using a mouse.
      */}
      <div className="flex">
        <Sidebar
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          activePage={activePage}
          setActivePage={setActivePage}
          panel={panel}
          overview={ts.overview}
        />

        <main className="flex-1 overflow-x-hidden p-6 pb-24 md:pb-6">
          {activePage !== "history" && activePage !== "provider" && <KpiRow overview={ts.overview} />}

          {activePage === "history" ? (
            <HistoryPage overview={ts.overview} />
          ) : activePage === "provider" ? (
            <ProviderStudioPage ts={ts} />
          ) : (
            <div className="flex flex-col lg:flex-row">
              <EngineSetup ts={ts} />
              {/*
                This column takes the slot the copy nav vacated, so the two rails now flank the
                content instead of stacking on the left. It moves as a UNIT — Connected accounts
                and the Mirror feed belong together, the feed being the trades those accounts are
                mirroring.

                `lg:order-first`, and the DOM order left alone, for two reasons. Tab order still
                reaches Engine setup — the primary action — first. And below `lg` this stack is
                `flex-col`, so a DOM move would push the accounts list above Engine setup on every
                phone; `order` only applies at the breakpoint, the reading order does not.
              */}
              <div className="w-full lg:w-96 lg:order-first flex flex-col bg-surface">
                <ConnectedAccounts accounts={setup.accounts} onToggle={setup.toggleAccountStatus} />
                <MirrorFeed feed={feed} mirroring={setup.mirroring} />
              </div>
            </div>
          )}
        </main>
      </div>

      <MobileNav activePage={activePage} setActivePage={setActivePage} />

      {toast && <Toast message={toast} />}
    </div>
  );
}

export default TradeSyncApp;
