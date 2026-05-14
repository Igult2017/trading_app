import { useEffect } from "react";

const APP = "myfm";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${APP} | ${title}` : APP;
    return () => {
      document.title = APP;
    };
  }, [title]);
}

/** Map a top-level pathname to a human-readable page title. */
export function titleFromPath(pathname: string): string {
  if (pathname === "/" || pathname === "")         return "Home";
  if (pathname.startsWith("/auth/callback"))       return "Authenticating…";
  if (pathname.startsWith("/auth"))                return "Sign In";
  if (pathname.startsWith("/join"))                return "Join";
  if (pathname.startsWith("/tsc"))                 return "Terms & Conditions";
  if (pathname.startsWith("/blog"))                return "Blog";
  if (pathname.startsWith("/calendar"))            return "Economic Calendar";
  if (pathname.startsWith("/support"))             return "Support";
  if (pathname.startsWith("/legal"))               return "Legal";
  if (pathname.startsWith("/history"))             return "Trade History";
  if (pathname.startsWith("/analytics"))           return "Analytics";
  if (pathname.startsWith("/assets"))              return "Assets";
  if (pathname.startsWith("/accounts"))            return "Accounts";
  if (pathname.startsWith("/major-pairs"))         return "Major Pairs";
  if (pathname.startsWith("/commodities"))         return "Commodities";
  if (pathname.startsWith("/crypto"))              return "Cryptocurrency";
  if (pathname.startsWith("/markets"))             return "Markets";
  if (pathname.startsWith("/signals"))             return "Signals";
  if (pathname.startsWith("/stocks"))              return "Stocks";
  if (pathname.startsWith("/admin"))               return "Admin";
  if (pathname.startsWith("/journal"))             return "Journal";
  return "";
}

/** Map a Journal sidebar nav ID to a human-readable page title. */
export function titleFromJournalNav(navId: string): string {
  const map: Record<string, string> = {
    dashboard:   "Dashboard",
    sessions:    "Sessions",
    accounts:    "Accounts",
    journal:     "Trading Journal",
    vault:       "Trade Vault",
    calendar:    "Calendar",
    drawdown:    "Drawdown",
    metrics:     "Metrics",
    tfmetrics:   "TF Metrics",
    strategy:    "Strategy Audit",
    fsdai:       "Trader AI",
    sync:        "Sync Trade",
    assets:      "Assets",
    leaderboard: "Leaderboard",
    settings:    "Settings",
  };
  return map[navId] ?? "Journal";
}
