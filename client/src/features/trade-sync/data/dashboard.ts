import type { Source } from "../types";

/** Static copy — the three source types and the filter vocabularies. All LIVE data (KPIs, feed,
 *  accounts, providers) now comes from GET /api/copy/overview; nothing numeric lives here. */
export const SOURCES: Source[] = [
  {
    id: "provider",
    icon: "person_search",
    title: "Provider",
    desc: "Follow a verified signal provider from the marketplace",
    options: ["cTrader", "MT5"],
  },
  {
    id: "self-copy",
    icon: "content_copy",
    title: "Self-copy",
    desc: "Mirror trades across your own linked accounts",
    options: ["cTrader", "MT5"],
  },
  {
    id: "telegram",
    telegram: true,
    title: "Telegram",
    desc: "Parse and execute specific channel signals",
    options: ["Channel", "Bot", "Group"],
  },
];

export const SESSIONS = ["London", "New York", "Tokyo", "Sydney"];
export const INSTRUMENTS = ["Forex", "Metals", "Indices", "Crypto"];
