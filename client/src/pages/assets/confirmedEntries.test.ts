/**
 * confirmedEntries.test.ts — run with:  npx tsx client/src/pages/assets/confirmedEntries.test.ts
 *
 * No test framework is installed in this repo (only `tsx`), so this is a plain script rather than a
 * new dependency added on the way past — same shape as `client/src/lib/tradeCalculations.test.ts`.
 *
 * THE FIXTURE IS REAL. These six rows were pulled verbatim from production
 * (`GET /api/trading-signals?status=watching,active,executed,invalidated`) on 2026-08-22 — the exact
 * week he was looking at when he asked *"Did we only have 3 signals the whole of last week?"*
 *
 * The board showed him 3 rows. Five of these are confirmed entries.
 */
import { confirmedEntries, hasConfirmedEntry, type SignalRow } from "./confirmedEntries";

let failed = 0;
let count = 0;

function check(name: string, got: unknown, want: unknown) {
  count++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}: got ${JSON.stringify(got)}` +
              (ok ? "" : `, want ${JSON.stringify(want)}`));
  if (!ok) failed++;
}

function teeth(name: string, brokeIt: boolean) {
  count++;
  console.log(`   ${brokeIt ? "PASS" : "FAIL"}  TEETH — ${name}: ${brokeIt}`);
  if (!brokeIt) failed++;
}

// ── the real week, exactly as production returned it ─────────────────────────
const REAL: SignalRow[] = [
  { id: "59d45c9a", symbol: "XAU/USD", type: "buy",  status: "watching",    strategy: "vix1_watch",
    createdAt: "2026-08-21T16:09:23.431Z", triggeredAt: null },
  { id: "7a55f140", symbol: "XAU/USD", type: "buy",  status: "executed",    strategy: "vix1",
    createdAt: "2026-08-19T13:16:05.132Z", triggeredAt: "2026-08-19T13:17:00.000Z" },
  { id: "bff07ac7", symbol: "EUR/USD", type: "buy",  status: "executed",    strategy: "vix1",
    createdAt: "2026-08-19T13:15:24.699Z", triggeredAt: "2026-08-19T13:16:00.000Z" },
  { id: "cfdc2bdd", symbol: "XAU/USD", type: "sell", status: "invalidated", strategy: "vix1",
    createdAt: "2026-08-19T03:51:37.013Z", triggeredAt: "2026-08-19T03:54:00.000Z" },
  { id: "d277089f", symbol: "GBP/USD", type: "sell", status: "invalidated", strategy: "vix1",
    createdAt: "2026-08-18T09:00:15.080Z", triggeredAt: "2026-08-18T09:15:00.000Z" },
  { id: "3c7dc4bd", symbol: "EUR/USD", type: "buy",  status: "executed",    strategy: "vix1",
    createdAt: "2026-08-17T07:11:25.224Z", triggeredAt: "2026-08-17T07:16:00.000Z" },
];

console.log();
console.log("THE REAL WEEK — 5 confirmed entries, and the board was showing 3 rows");

const got = confirmedEntries(REAL);

check("five confirmed entries, not three", got.length, 5);
check("the vix1_watch heads-up is not one of them",
      got.some(s => s.strategy === "vix1_watch"), false);
check("newest first, oldest last",
      got.map(s => s.id), ["7a55f140", "bff07ac7", "cfdc2bdd", "d277089f", "3c7dc4bd"]);

// THE ROWS HE COULD NOT SEE. XAU/USD traded twice on 19 Aug; both were hidden because a watch alert
// on 21 Aug took the single XAU/USD slot. EUR/USD traded on the 17th and the 19th; the 17th was hidden.
check("BOTH XAU/USD entries are present (both were invisible before)",
      got.filter(s => s.symbol === "XAU/USD").map(s => s.id), ["7a55f140", "cfdc2bdd"]);
check("BOTH EUR/USD entries are present",
      got.filter(s => s.symbol === "EUR/USD").map(s => s.id), ["bff07ac7", "3c7dc4bd"]);
check("a symbol may appear more than once — this is a signal list, not an instrument list",
      new Set(got.map(s => s.symbol)).size < got.length, true);

// ── TEETH: reproduce the OLD one-row-per-symbol rule and show it returns 3 ────
function oldPerSymbolDedup(rows: SignalRow[]): SignalRow[] {
  const seen = new Set<string>();
  const out: SignalRow[] = [];
  for (const s of rows) {
    if (s.symbol && !seen.has(s.symbol)) { seen.add(s.symbol); out.push(s); }
  }
  return out;
}
teeth("the OLD rule really did collapse this week to 3 rows",
      oldPerSymbolDedup(REAL).length === 3);
teeth("...and the new rule does not", got.length === 5);
teeth("the old rule surfaced a WATCH as XAU/USD's row, hiding two real entries",
      oldPerSymbolDedup(REAL)[0]?.strategy === "vix1_watch");

// ── boundaries the live data cannot cover ────────────────────────────────────
console.log();
console.log("BOUNDARIES — what counts as a confirmed entry");

const pendingOrder: SignalRow = { id: "p", symbol: "EUR/USD", status: "active",
                                  createdAt: "2026-08-20T10:00:00Z", triggeredAt: null };
const openTrade: SignalRow    = { id: "o", symbol: "EUR/USD", status: "active",
                                  createdAt: "2026-08-20T11:00:00Z", triggeredAt: "2026-08-20T11:05:00Z" };
const cancelled: SignalRow    = { id: "x", symbol: "GBP/JPY", status: "expired",
                                  createdAt: "2026-08-20T09:00:00Z", triggeredAt: null };
const snakeCase: SignalRow    = { id: "s", symbol: "USD/JPY", status: "executed",
                                  createdAt: "2026-08-20T08:00:00Z", triggered_at: "2026-08-20T08:03:00Z" };

check("a stop order still waiting is NOT a confirmed entry", hasConfirmedEntry(pendingOrder), false);
check("a trade that is open right now IS one", hasConfirmedEntry(openTrade), true);
check("a cancelled setup (entry never filled) is NOT one", hasConfirmedEntry(cancelled), false);
check("snake_case triggered_at is accepted too", hasConfirmedEntry(snakeCase), true);
check("a live trade sorts by time like any other",
      confirmedEntries([pendingOrder, openTrade, cancelled, snakeCase]).map(s => s.id), ["o", "s"]);

// ── it must never throw on the shapes React actually hands it ────────────────
check("no rows yet", confirmedEntries([]), []);
check("undefined while the query is loading", confirmedEntries(undefined), []);
check("null", confirmedEntries(null), []);
check("a junk row does not take the list down",
      confirmedEntries([{ id: "junk" } as SignalRow, openTrade]).map(s => s.id), ["o"]);

console.log();
if (failed) {
  console.log(`${failed} of ${count} FAILED`);
  process.exit(1);
}
console.log(`ALL PASS (${count} checks)`);
