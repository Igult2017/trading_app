import type { NavItem } from "../types";

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "copy", label: "Copy trading", icon: "sync_alt" },
  { id: "self", label: "Self copying", icon: "content_copy" },
  { id: "telegram", label: "Telegram signals", telegram: true },
  { id: "provider", label: "Provider studio", icon: "business_center" },
  { id: "history", label: "History and risk", icon: "history" },
];

/** The mobile bar carries four of the six destinations, under shorter labels. */
export const MOBILE_TABS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "copy", label: "Accounts", icon: "account_tree" },
  { id: "history", label: "History", icon: "receipt_long" },
  { id: "self", label: "Settings", icon: "settings" },
];

// RECENT_ACTIVITY was mock copy — the sidebar now derives it from the real mirror feed
// (see Sidebar.tsx), so nothing invented appears there.
