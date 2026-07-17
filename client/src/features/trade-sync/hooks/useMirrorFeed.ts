import { useEffect, useState } from "react";
import { FEED_SYMBOLS, INITIAL_FEED } from "../data/dashboard";
import type { FeedRow } from "../types";

/** Demo-only: synthesises a copied trade every 4.5s while mirroring, capped at 6 rows. */
export function useMirrorFeed(mirroring: boolean) {
  const [feed, setFeed] = useState<FeedRow[]>(INITIAL_FEED);

  useEffect(() => {
    if (!mirroring) return undefined;
    const t = setInterval(() => {
      const symbol = FEED_SYMBOLS[Math.floor(Math.random() * FEED_SYMBOLS.length)];
      const side: FeedRow["side"] = Math.random() > 0.5 ? "BUY" : "SELL";
      const lot = (Math.random() * 1.5 + 0.1).toFixed(2);
      const price = (symbol === "XAU/USD" ? 2400 + Math.random() * 40 : Math.random() * 2 + 1).toFixed(
        symbol === "XAU/USD" || symbol === "US30" ? 2 : 4
      );
      const pnl = (Math.random() - 0.35) * 300;
      setFeed((prev) =>
        [
          { id: Date.now(), side, symbol, lot, price, ms: 20 + Math.floor(Math.random() * 60), pnl, time: "just now" },
          ...prev,
        ].slice(0, 6)
      );
    }, 4500);
    return () => clearInterval(t);
  }, [mirroring]);

  return feed;
}
