import { useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/queryClient";

/**
 * TickerTape — the price band across the top of the journal, on REAL broker prices since 2026-10-11.
 *
 * HIS ASK: real-time tick data in the ticker, *"in the journal only not landing page"*. The landing
 * page keeps its own static band in HomeHeader.tsx and is deliberately untouched — the prices here
 * come from an endpoint that REQUIRES A LOGIN, which is the mechanism behind "journal only", not a
 * convention someone could undo by importing this file.
 *
 * WHERE THE NUMBERS COME FROM. The signal platform holds a live FIX quote stream for the instruments
 * the strategies trade and pushes it to Node every ~2s; Node keeps the newest one per symbol in
 * memory and this polls it. No browser ever opens a broker connection — one feed in, fanned out.
 *
 * ⚠ FIVE SYMBOLS, NOT EIGHT, AND THAT IS NOT AN OVERSIGHT. The old band listed EUR/USD, BTC/USD,
 * GOLD, SPX500, GBP/USD, ETH/USD, OIL/WTI and USD/JPY as fixed strings that never moved. Of those,
 * only the forex and gold have a feed; nothing in this system subscribes to crypto, indices or oil.
 * They were dropped rather than left as invented numbers sitting beside real ones, which reads as
 * four live prices that happen to be frozen. Adding one back means adding a broker subscription for
 * it first (`signal_platform/data/fix_wire.SYMBOL_IDS`), not a line here.
 *
 * ⚠ NO PERCENTAGE CHANGE YET. "+0.45%" needs the day's opening price, which a quote feed does not
 * carry — bid and ask is all it has. The tint below shows which way the last tick went, which is
 * honest about what is known; it is NOT a day change and must not be labelled as one.
 *
 * ⚠ "MARKET CLOSED" IS SAID ONLY WHEN IT IS TRUE. Measured during the build: a 401 was being
 * rendered as "Market closed", so an expired login reported the market shut — a false statement
 * about the market, on a page traders act on. Being signed out, being unable to reach the server,
 * and the market genuinely being closed are three different sentences below.
 */

const POLL_MS = 2_000;
/** After a refusal, back off instead of stopping for good — a token can come back, and a band that
 *  never recovers until the next page load is a dead band. */
const RETRY_MS = 30_000;
/** Older than this and the price is not news any more. Minutes, not seconds, on purpose: the feed
 *  itself tolerates 15s of quiet before it withholds a quote, and a thin market is not a dead one. */
const STALE_MS = 120_000;

interface LivePrice { symbol: string; bid: number; ask: number; ageMs: number; }
type Feed =
  | { state: "loading" }
  | { state: "denied" }                                       // signed out, or the token expired
  | { state: "ok"; rows: LivePrice[]; fetchedAt: number };

/** Decimals the BROKER shows for this instrument. Getting this wrong is the difference between a
 *  price and a lookalike, so it follows the instrument's own convention: 3 for a yen cross, 2 for
 *  gold, 5 for the rest. Verified against the broker's own `digits` before shipping. */
function digitsFor(symbol: string): number {
  if (symbol.endsWith("/JPY")) return 3;
  if (symbol.startsWith("XAU") || symbol.startsWith("XAG")) return 2;
  return 5;
}

function format(symbol: string, value: number): string {
  const d = digitsFor(symbol);
  return value.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function TickerTape() {
  const [feed, setFeed] = useState<Feed>({ state: "loading" });
  // Bumped EVERY cycle, success or failure. It is what makes a price visibly go stale when the
  // server stops answering: without it a failed poll causes no re-render, the last prices sit there
  // with the age they arrived with, and a dead feed looks exactly like a live one for ever.
  const [now, setNow] = useState(() => Date.now());
  // Which way the last tick went, per symbol. Refs, not state: they are read while rendering the
  // next batch and must never cause a render of their own.
  const dirRef = useRef<Record<string, "up" | "down" | undefined>>({});
  const lastRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      let next = POLL_MS;
      try {
        const r = await authFetch("/api/prices/live");
        if (!alive) return;
        if (r.ok) {
          const d = await r.json();
          const rows: LivePrice[] = Array.isArray(d?.prices) ? d.prices : [];
          for (const p of rows) {
            const mid = (p.bid + p.ask) / 2;
            const prev = lastRef.current[p.symbol];
            // Only a REAL move repaints the tint. Quote feeds resend an unchanged price constantly,
            // and treating that as a tick would make the band flicker at random.
            if (prev !== undefined && mid !== prev) {
              dirRef.current[p.symbol] = mid > prev ? "up" : "down";
            }
            lastRef.current[p.symbol] = mid;
          }
          setFeed({ state: "ok", rows, fetchedAt: Date.now() });
        } else if (r.status === 401 || r.status === 403) {
          setFeed({ state: "denied" });
          next = RETRY_MS;
        } else {
          // A 5xx or the offline fallback. Keep whatever is on screen and let it age out; saying
          // nothing is better than replacing real prices with an error.
          next = RETRY_MS;
        }
      } catch {
        /* A ticker must never raise. */
        next = RETRY_MS;
      }
      if (!alive) return;
      setNow(Date.now());
      timer = setTimeout(tick, next);
    };

    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  const band: React.CSSProperties = {
    background: "#080c10", borderBottom: "1px solid #0f1923", height: 32,
    overflow: "hidden", display: "flex", alignItems: "center",
  };
  const note: React.CSSProperties = {
    color: "var(--jr-ink-dim)", fontSize: 12.5, fontWeight: 600,
    letterSpacing: "0.04em", padding: "0 20px",
  };
  const quiet = (text: string) => <div style={band}><span style={note}>{text}</span></div>;

  // THE EMPTY STATES, AND EACH SAYS WHAT IS ACTUALLY TRUE. The band is 32px of solid black
  // otherwise, which reads as a broken page rather than a quiet one.
  if (feed.state === "loading") return quiet("Connecting to the price feed…");
  if (feed.state === "denied")  return quiet("Prices unavailable — sign in again");

  // Age as of NOW, not as of the response: the server's number is only right at the instant it was
  // sent, and the gap matters precisely when the server has stopped sending.
  const since = Math.max(0, now - feed.fetchedAt);
  const live = feed.rows.filter(p => p.ageMs + since < STALE_MS);
  if (live.length === 0) return quiet("Market closed — no live prices");

  // Doubled so the marquee can loop seamlessly at translateX(-50%) — the second copy is what is on
  // screen as the first scrolls out. Keyed by symbol AND copy so React keeps the same nodes while
  // the numbers change underneath; re-creating them would restart the animation every two seconds.
  const items = [...live, ...live];
  // Pace scales with how many symbols there are, so five do not race past at the speed tuned for
  // eight. ~4.4s per symbol is the band's original feel.
  const seconds = Math.max(12, Math.round(live.length * 4.4));

  return (
    <div style={band}>
      <style>{`
        @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .ticker-wrap { display:flex; animation: ticker var(--tt-dur) linear infinite; will-change:transform; }
        .ticker-wrap:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .ticker-wrap { animation: none; } }
      `}</style>
      <div className="ticker-wrap" style={{ ['--tt-dur' as string]: `${seconds}s` }}>
        {items.map((t, i) => {
          const dir = dirRef.current[t.symbol];
          const mid = (t.bid + t.ask) / 2;
          return (
            <div key={`${t.symbol}-${i >= live.length ? 1 : 0}`}
                 style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 28px", borderRight: "1px solid #0f1923", whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--jr-ink-dim)", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.06em" }}>
                {t.symbol}
              </span>
              {/* The price carries the tint, and there is no badge beside it: a badge here would be
                  the slot the old fake "+0.12%" sat in, and filling it with a tick arrow invites
                  reading it as a day change. tabular-nums so the digits do not jitter as they move. */}
              <span style={{
                fontSize: 12.5, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                color: dir === "up" ? "#22d3a5" : dir === "down" ? "#f4617f" : "#c8d8e8",
                transition: "color 0.5s ease",
              }}>
                {format(t.symbol, mid)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
