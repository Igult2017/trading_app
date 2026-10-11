import { useEffect } from "react";

/**
 * BROWSER TAB TITLES — one builder, one separator.
 *
 * His instruction, 2026-08-29, pointing at a tab reading "Blog — DORIXÉ": *"Make our dashes in the
 * tab to be as long as this one here."* That is an EM DASH (—) with a space either side.
 *
 * THREE PLACES WERE BUILDING TAB TITLES AND ALL THREE DISAGREED, so changing one dash would have
 * fixed one third of the tabs:
 *
 *     SEOHead.tsx        "Blog | <app name>"             a pipe, and an en dash (–) on the default
 *     Journal.tsx        "Drawdown-<app name>"           a hyphen with NO spaces
 *     this file          "journal | blog"                lowercase, and the two halves reversed
 *
 * They now all call `pageTitle()`, so the separator exists once. Anything that wants a tab title
 * asks here rather than assembling its own.
 */

/** THE APP'S NAME, AND THE ONLY PLACE IT IS SPELLED FOR A BROWSER TAB. Renamed from
 *  "Trade&Journal" on 2026-10-11, his instruction: *"Change the app name to DailyTradeBook
 *  everywhere including the favicon text that appears in the tabs."* Every tab in the app builds
 *  its title through `pageTitle` below, so this one line is all of them — EXCEPT the static
 *  `<title>` in client/index.html, which is what the tab reads before React has started. Change
 *  both or a tab shows the old name for the first second. */
export const SITE_NAME = "DailyTradeBook";

/** The em dash he asked for, with the spaces that make it read as a separator rather than a join. */
export const TITLE_SEP = " — ";

/** "<Page> — DailyTradeBook", or the site's own line when there is no page name. */
export function pageTitle(page?: string | null): string {
  const p = page?.trim();
  return p ? `${p}${TITLE_SEP}${SITE_NAME}` : `${SITE_NAME}${TITLE_SEP}Professional Trading Journal`;
}

export const HOME_TITLE = pageTitle();

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title || HOME_TITLE;
    return () => {
      document.title = HOME_TITLE;
    };
  }, [title]);
}

/** The page name for a top-level path. Title Case, because it is read by a person in a tab strip —
 *  it used to be lowercase ("journal | blog"), which read as a debug string. */
const PATH_TITLES: [string, string][] = [
  ["/auth/callback", "Signing In"],
  ["/auth",          "Sign In"],
  ["/join",          "Join"],
  ["/tsc",           "Session"],
  ["/blog",          "Blog"],
  ["/calendar",      "Economic Calendar"],
  ["/support",       "Support"],
  ["/legal",         "Legal"],
  ["/history",       "Trade History"],
  ["/analytics",     "Analytics"],
  ["/assets",        "Assets"],
  ["/accounts",      "Accounts"],
  ["/major-pairs",   "Major Pairs"],
  ["/commodities",   "Commodities"],
  ["/crypto",        "Cryptocurrency"],
  ["/markets",       "Markets"],
  ["/signals",       "Signals"],
  ["/stocks",        "Stocks"],
  ["/admin",         "Admin"],
  ["/journal",       "Journal"],
];

export function titleFromPath(pathname: string): string {
  if (!pathname || pathname === "/") return HOME_TITLE;
  const hit = PATH_TITLES.find(([prefix]) => pathname.startsWith(prefix));
  return hit ? pageTitle(hit[1]) : HOME_TITLE;
}
