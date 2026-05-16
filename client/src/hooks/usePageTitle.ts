import { useEffect } from "react";

export const HOME_TITLE = "myfm | journal – journal your trades seamlessly";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title || HOME_TITLE;
    return () => {
      document.title = HOME_TITLE;
    };
  }, [title]);
}

/** Map a top-level pathname to a human-readable page title. */
export function titleFromPath(pathname: string): string {
  if (pathname === "/" || pathname === "")         return HOME_TITLE;
  if (pathname.startsWith("/auth/callback"))       return "journal | authenticating";
  if (pathname.startsWith("/auth"))                return "journal | sign in";
  if (pathname.startsWith("/join"))                return "journal | join";
  if (pathname.startsWith("/tsc"))                 return "journal | terms";
  if (pathname.startsWith("/blog"))                return "journal | blog";
  if (pathname.startsWith("/calendar"))            return "journal | economic calendar";
  if (pathname.startsWith("/support"))             return "journal | support";
  if (pathname.startsWith("/legal"))               return "journal | legal";
  if (pathname.startsWith("/history"))             return "journal | trade history";
  if (pathname.startsWith("/analytics"))           return "journal | analytics";
  if (pathname.startsWith("/assets"))              return "journal | assets";
  if (pathname.startsWith("/accounts"))            return "journal | accounts";
  if (pathname.startsWith("/major-pairs"))         return "journal | major pairs";
  if (pathname.startsWith("/commodities"))         return "journal | commodities";
  if (pathname.startsWith("/crypto"))              return "journal | cryptocurrency";
  if (pathname.startsWith("/markets"))             return "journal | markets";
  if (pathname.startsWith("/signals"))             return "journal | signals";
  if (pathname.startsWith("/stocks"))              return "journal | stocks";
  if (pathname.startsWith("/admin"))               return "journal | admin";
  if (pathname.startsWith("/journal"))             return "journal | dashboard";
  return HOME_TITLE;
}

/** Map a Journal sidebar nav ID to a human-readable page title. */
export function titleFromJournalNav(navId: string): string {
  const map: Record<string, string> = {
    dashboard:   "journal | dashboard",
    sessions:    "journal | sessions",
    accounts:    "journal | accounts",
    journal:     "journal | trading journal",
    vault:       "journal | trade vault",
    calendar:    "journal | calendar",
    drawdown:    "journal | drawdown",
    metrics:     "journal | metrics",
    tfmetrics:   "journal | tf metrics",
    strategy:    "journal | strategy audit",
    fsdai:       "journal | trader ai",
    sync:        "journal | sync trade",
    assets:      "journal | assets",
    leaderboard: "journal | leaderboard",
    settings:    "journal | settings",
  };
  return map[navId] ?? "journal";
}
