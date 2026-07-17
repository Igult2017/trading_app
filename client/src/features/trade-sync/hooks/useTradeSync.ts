import { useEffect, useState } from "react";
import { useCtFonts } from "./useCtFonts";
import { useToast } from "./useToast";
import { useBrokerAccount } from "./useBrokerAccount";
import { useCopySetup } from "./useCopySetup";
import { useMirrorFeed } from "./useMirrorFeed";
import { useFollowRequests } from "./useFollowRequests";
import { useProviderSearch } from "./useProviderSearch";
import { useProviderStudio } from "./useProviderStudio";
import type { PageId } from "../types";

/**
 * Composes the whole Trade Sync screen's state. Nothing here talks to an API — every value is
 * local and every "connection" is simulated; the backend comes later.
 */
export function useTradeSync() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [collapsed, setCollapsed] = useState(false);
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useCtFonts();
  const { toast, setToast } = useToast();

  // Two independent account links: the one you copy trades FROM (follower side) and the one you
  // broadcast FROM (provider studio). Same hook, separate state — connecting one must not
  // silently connect the other.
  const account = useBrokerAccount(setToast);
  const providerAccount = useBrokerAccount(setToast);

  const setup = useCopySetup(setToast, account.status);
  const feed = useMirrorFeed(setup.mirroring);
  const follow = useFollowRequests(setToast);
  const search = useProviderSearch();
  const studio = useProviderStudio(setToast);

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
    account, providerAccount,
    setup, feed, follow, search, studio,
  };
}

export type TradeSync = ReturnType<typeof useTradeSync>;
