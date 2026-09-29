import { useEffect, useState } from "react";
import { useCtFonts } from "./useCtFonts";
import { useToast } from "./useToast";
import { useOverview } from "./useOverview";
import { useBrokerAccount } from "./useBrokerAccount";
import { useCopySetup } from "./useCopySetup";
import { useMirrorFeed } from "./useMirrorFeed";
import { useFollowRequests } from "./useFollowRequests";
import { useProviderSearch } from "./useProviderSearch";
import { useProviderStudio } from "./useProviderStudio";
import type { PageId } from "../types";

/**
 * Composes the whole Trade Sync screen's state — WIRED: everything renders from the
 * GET /api/copy/overview aggregate and every action hits the real /api/copy endpoints.
 */
export function useTradeSync() {
  // NO theme state. This panel's palette follows the journal's light/dark marker class, so the app's
  // one switch moves it too (2026-09-27). It used to hold useState<"light"|"dark">("dark") here plus
  // its own header button, which is why it stayed dark when the rest of the app went white.
  const [collapsed, setCollapsed] = useState(false);
  const [activePage, setActivePage] = useState<PageId>("dashboard");

  useCtFonts();
  const { toast, setToast } = useToast();

  const ov = useOverview();
  const overview = ov.data;
  const invalidate = ov.invalidate;

  // ONE view now. There were two identical `useBrokerAccount` instances — the copy-from side and a
  // "broadcast side" for the Provider studio's connect widget. That widget is gone (2026-09-29): the
  // studio lists the accounts he ALREADY has rather than offering to connect one, so the second
  // instance had no consumer and was doing the same work twice on every render.
  const account = useBrokerAccount(setToast, overview, invalidate);

  const setup = useCopySetup(setToast, account.status, overview, invalidate);
  const feed = useMirrorFeed(overview);
  const follow = useFollowRequests(setToast, overview, invalidate, setup);
  const search = useProviderSearch(overview);
  const studio = useProviderStudio(setToast, overview, invalidate);

  // Navigating to Copy trading / Self copying / Telegram signals jumps the engine-setup panel
  // straight into that source instead of leaving it inert.
  const { setSource } = setup;
  useEffect(() => {
    if (activePage === "copy") setSource("provider");
    else if (activePage === "self") setSource("self-copy");
    else if (activePage === "telegram") setSource("telegram");
  }, [activePage, setSource]);

  return {
    collapsed, setCollapsed,
    activePage, setActivePage,
    toast, setToast,
    overview, overviewLoading: ov.isLoading, invalidate,
    account,
    setup, feed, follow, search, studio,
  };
}

export type TradeSync = ReturnType<typeof useTradeSync>;
