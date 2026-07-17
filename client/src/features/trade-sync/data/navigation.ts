import type { ActivityItem, NavItem } from "../types";

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

export const RECENT_ACTIVITY: ActivityItem[] = [
  { text: "Copied BUY XAU/USD from Titan Scalper Pro", time: "2m ago" },
  { text: "Paused Kingsman Signals", time: "18m ago" },
];
