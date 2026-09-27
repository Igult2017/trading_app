import { Icon } from "../components/Icon";
import { HelpMenu } from "./HelpMenu";
import { AccountMenu } from "./AccountMenu";
import type { TradeSync } from "../hooks/useTradeSync";

interface AppHeaderProps {
  ts: TradeSync;
}

export function AppHeader({ ts }: AppHeaderProps) {
  const { setActivePage, setToast, helpOpen, setHelpOpen, accountOpen, setAccountOpen, studio } = ts;

  // The light/dark button that used to sit here is GONE (2026-09-27). It was a SECOND theme switch
  // that fought the journal's main one, which is what he asked to have consolidated. This panel now
  // follows .journal-root's marker class — see styles/tokens.ts.
  return (
    <header className="flex justify-end items-center px-6 h-14 w-full bg-surface border-b border-surface-container-highest sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <button
          className="relative"
          onClick={() => setActivePage("provider")}
          aria-label="Notifications"
          title="Follow request notifications"
        >
          <Icon name="notifications" className="text-on-surface-variant text-[16px]" />
          {studio.requests.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 flex items-center justify-center bg-error text-on-error rounded-full text-[8px] font-bold leading-none">
              {studio.requests.length}
            </span>
          )}
        </button>
        <div className="relative">
          <button
            className="text-on-surface-variant hover:text-on-surface"
            onClick={() => {
              setHelpOpen(!helpOpen);
              setAccountOpen(false);
            }}
            aria-label="Help"
            title="Help"
          >
            <Icon name="help_outline" className="text-[16px]" />
          </button>
          {helpOpen && (
            <HelpMenu setToast={setToast} setActivePage={setActivePage} close={() => setHelpOpen(false)} />
          )}
        </div>
        <div className="relative">
          <button
            className="w-7 h-7 bg-surface-container-highest flex items-center justify-center rounded font-dm-mono text-[10px] font-bold text-on-surface"
            onClick={() => {
              setAccountOpen(!accountOpen);
              setHelpOpen(false);
            }}
            aria-label="Account menu"
          >
            AW
          </button>
          {accountOpen && (
            <AccountMenu setToast={setToast} setActivePage={setActivePage} close={() => setAccountOpen(false)} />
          )}
        </div>
      </div>
    </header>
  );
}
