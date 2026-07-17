import type { OwnAccount, Provider } from "../types";

/** The marketplace directory — other people's services you can request to follow. */
export const AVAILABLE_PROVIDERS: Provider[] = [
  { id: "meridian-swing", name: "Meridian Swing Desk", handle: "@meridian_fx", verified: true, rating: 4.8, winRate: 74, monthlyReturn: "+8.2%", followers: "2.1K", risk: "Low" },
  { id: "atlas-fx", name: "Atlas FX Group", handle: "@atlas_group", verified: true, rating: 4.3, winRate: 68, monthlyReturn: "+11.4%", followers: "5.6K", risk: "Medium" },
  { id: "nordic-precision", name: "Nordic Precision Trading", handle: "@nordic_prec", verified: true, rating: 4.9, winRate: 81, monthlyReturn: "+5.9%", followers: "980", risk: "Low" },
  { id: "vega-options", name: "Vega Options Desk", handle: "@vega_desk", verified: false, rating: 3.6, winRate: 62, monthlyReturn: "+14.7%", followers: "3.4K", risk: "High" },
  { id: "quiet-harbor", name: "Quiet Harbor Capital", handle: "@quietharbor", verified: true, rating: 4.5, winRate: 71, monthlyReturn: "+6.6%", followers: "1.3K", risk: "Low" },
];

/** Your own linked accounts — the self-copy master and mirror destinations come from here. */
export const OWN_ACCOUNTS: OwnAccount[] = [
  { id: "ic-markets-live", name: "IC Markets Live", platform: "MT4", broker: "IC Markets", balance: "$14,820" },
  { id: "ftmo-challenge-2", name: "FTMO Challenge #2", platform: "MT4", broker: "FTMO", balance: "$100,000" },
  { id: "prop-eval-100k", name: "Prop Firm Eval — 100K", platform: "MT5", broker: "The5ers", balance: "$100,000" },
  { id: "personal-ctrader", name: "Personal cTrader", platform: "cTrader", broker: "Pepperstone", balance: "$6,410" },
  { id: "swing-low-risk", name: "Swing Account — Low Risk", platform: "MT5", broker: "IC Markets", balance: "$22,050" },
];
