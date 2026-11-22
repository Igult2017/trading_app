/**
 * The Accounts page's shared shapes and its two colour sets (22 Nov 2026, sync plan step 9 — his new design).
 *
 * The design is dark and editorial; the journal also has a light theme (`.journal-dark` off), so every colour
 * comes from ONE of two sets below and no component hard-codes either. Classes are written out in full so
 * Tailwind's scanner sees them.
 */
export interface BrokerAccount {
  id: string;
  name: string;                    // HIS label for it — shown as a nickname under the broker
  loginId: string;
  server: string | null;
  platform: string;
  accountType: string;             // demo | live | funded — for cTrader, from cTrader itself
  connectionType: string;          // api | webhook
  currency: string;
  balance: string | null;
  syncStatus: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  tradeCount: number;
  webhookToken: string | null;
  defaultSessionId: string | null;
  isActive: boolean;
  copyEnabled?: boolean;
  // FROM cTRADER, never typed (step 6): the broker / prop firm, leverage 1:N, hedged | netted.
  brokerName?: string | null;
  leverage?: number | null;
  positionMode?: string | null;
}

export const DISCONNECTED = "disconnected";

/** What the page shows as the account's name: the broker / prop firm from cTrader, else his label.
 *  cTrader sends some in lowercase ("pepperstone") — the first letter is raised for display only. */
export function displayName(a: BrokerAccount): string {
  const b = a.brokerName?.trim();
  if (!b) return a.name;
  return b === b.toLowerCase() ? b.charAt(0).toUpperCase() + b.slice(1) : b;
}

/**
 * ONE column layout for the heading strip AND every row — two grids that each sized their own columns put the
 * headings out of line with the rows (seen in the 22 Nov screenshot). The actions column is a FIXED width for
 * the same reason. Rows switch to this layout at `lg` (1024 px); below that each account is a stacked card.
 */
// `minmax(0, …)`: a plain `fr` column never shrinks below its longest text, so ONE long error message widened
// that row's column and shifted the row out of line with the rest (second screenshot, 22 Nov).
export const ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.6fr)_minmax(0,0.5fr)_minmax(0,1.3fr)_minmax(0,0.6fr)_minmax(0,1fr)_372px]";

/** The balance in the account's OWN currency (EUR for a EUR account — it used to print "$" for all). */
export function formatMoney(amount: string | null, currency: string): string {
  if (amount === null || amount === "") return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD",
                                              minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  } catch {   // a code Intl does not know (a crypto asset) — the number and the code, never a wrong symbol
    return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

export interface Theme {
  page: string; surface: string; surfaceHover: string; row: string; rowHover: string; inset: string;
  text: string; strong: string; muted: string; faint: string; accent: string; accentHover: string;
  primaryBtn: string; secondaryBtn: string; pillOn: string; pillOff: string; tooltip: string; focus: string;
  /** Text meaning "fine" / "failed" — per theme: the dark theme's green is 2.5:1 on white (measured 22 Nov). */
  good: string; bad: string;
}

export const DARK: Theme = {
  page: "bg-[#0B0F17] text-[#F3EFE6]",
  surface: "bg-[#131926]", surfaceHover: "hover:bg-[#161D2C]",
  row: "bg-[#111724] shadow-[0_4px_20px_rgba(0,0,0,0.22)]",
  rowHover: "hover:bg-[#171F30] hover:shadow-[0_10px_30px_rgba(0,0,0,0.38)]",
  inset: "bg-[#111622]",
  text: "text-[#CBD5E1]", strong: "text-[#F8FAFC]", muted: "text-[#94A3B8]", faint: "text-[#8A96AC]",
  accent: "text-[#38BDF8]", accentHover: "hover:text-[#7DD3FC]",
  primaryBtn: "bg-[#172A45] text-[#38BDF8] hover:bg-[#1D3557] hover:text-[#7DD3FC] shadow-[0_6px_22px_rgba(14,165,233,0.16)]",
  secondaryBtn: "bg-[#182030] text-[#E2E8F0] hover:bg-[#202B40] hover:text-white shadow-[0_6px_20px_rgba(0,0,0,0.3)]",
  pillOn: "bg-[#1F293D] text-[#38BDF8] shadow-sm", pillOff: "bg-transparent text-[#8A96AC] hover:text-[#CBD5E1]",
  tooltip: "bg-[#232A3B] text-[#F4F1EA]",
  focus: "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38BDF8]",
  good: "text-[#34D399]", bad: "text-[#F87171]",
};

export const LIGHT: Theme = {
  page: "bg-[#F4F1EA] text-[#1E293B]",
  surface: "bg-white shadow-sm", surfaceHover: "hover:bg-[#FBFAF7]",
  row: "bg-white shadow-[0_2px_10px_rgba(15,23,42,0.06)]",
  rowHover: "hover:bg-[#FBFAF7] hover:shadow-[0_8px_24px_rgba(15,23,42,0.10)]",
  inset: "bg-[#EAE6DC]",
  text: "text-[#334155]", strong: "text-[#0F172A]", muted: "text-[#475569]", faint: "text-[#64748B]",
  accent: "text-[#0369A1]", accentHover: "hover:text-[#075985]",
  primaryBtn: "bg-[#0369A1] text-white hover:bg-[#075985] shadow-[0_6px_18px_rgba(3,105,161,0.22)]",
  secondaryBtn: "bg-white text-[#1E293B] hover:bg-[#F1F5F9] shadow-sm",
  pillOn: "bg-white text-[#0369A1] shadow-sm", pillOff: "bg-transparent text-[#475569] hover:text-[#0F172A]",
  tooltip: "bg-[#0F172A] text-white",
  focus: "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0369A1]",
  good: "text-[#047857]", bad: "text-[#B91C1C]",
};
