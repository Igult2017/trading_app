import "./styles/install";   // installs the stylesheet + fonts into <head> BEFORE first paint
import { useTradeSync } from "./hooks/useTradeSync";
import { Toast } from "./components/Toast";
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
  /** Called when the user leaves the copier — the host returns to its landing page. */
  onExit?: () => void;
}

/**
 * Trade Sync — copy-trading dashboard.
 *
 * `.ct-app` is the boundary: every token, utility and font rule in CT_STYLES is scoped to it, so
 * this screen owns its own palette and cannot leak colours into the host app. See styles/fontGuard.ts
 * for why the scoping is load-bearing rather than cosmetic.
 *
 * THERE IS NO HEADER STRIP (removed 2026-09-29, at his instruction — he circled it). It held three
 * things and none of them was real: a notifications bell counting follow requests for a feature that
 * does not exist yet, a Help menu whose items only raised a toast, and an account menu showing a
 * hardcoded "Alex Warren / Prestige plan" with a Sign out that signed nobody out. Its two genuine
 * destinations, Provider studio and History and risk, are both in the nav rail already, and this
 * panel sits inside Journal which has its own header — so it was a second bar of demo content above
 * a real one.
 *
 * IT DOES, HOWEVER, FOLLOW THE HOST'S LIGHT/DARK CHOICE (changed 2026-09-27). Which of its two
 * palettes applies is decided by the journal's marker class on an ancestor, so the app's single
 * theme switch moves this panel too. It holds no theme state of its own — styles/tokens.ts says why.
 */
export function TradeSyncApp({ panel = false, onExit }: TradeSyncAppProps = {}) {
  const ts = useTradeSync();
  const { collapsed, setCollapsed, activePage, setActivePage, toast, setup, feed } = ts;

  // NO theme class here. The palette follows the journal's own light/dark marker on .journal-root,
  // so the main switch moves this panel too — see styles/tokens.ts for why it is a class and not a hook.
  return (
    <div className={`ct-app ${panel ? "ct-panel" : ""}`}>

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
          onExit={onExit}
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
                <ConnectedAccounts accounts={setup.accounts} onDrop={setup.dropAccount} />
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
