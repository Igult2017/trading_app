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
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [collapsed, setCollapsed] = useState(false);
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useCtFonts();
  const { toast, setToast } = useToast();

  const ov = useOverview();
  const overview = ov.data;
  const invalidate = ov.invalidate;

  // Two views over the SAME account link set: the copy-from side and the broadcast side both
  // resolve against the user's real connected accounts, so connecting once serves both.
  const account = useBrokerAccount(setToast, overview, invalidate);
  const providerAccount = useBrokerAccount(setToast, overview, invalidate);

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

  const closeMenus = () => {
    setHelpOpen(false);
    setAccountOpen(false);
  };

  return {
    theme, setTheme,
    collapsed, setCollapsed,
    activePage, setActivePage,
    helpOpen, setHelpOpen,
    accountOpen, setAccountOpen,
    closeMenus,
    toast, setToast,
    overview, overviewLoading: ov.isLoading, invalidate,
    account, providerAccount,
    setup, feed, follow, search, studio,
  };
}

export type TradeSync = ReturnType<typeof useTradeSync>;
