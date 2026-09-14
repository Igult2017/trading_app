/**
 * `accountSync` — a manual sync must SHOW the server's answer. Run: npx tsx client/src/lib/accountSync.test.ts
 *
 * The defect this guards (2026-09-14): both Sync buttons threw the reply away, so a dozen successful
 * syncs showed him nothing. The replies below are the server's real wording (server/routes.ts).
 */
import { summarise, syncOne, type SyncResult } from "./accountSync";

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
}

const TT = { id: "e31e9caa", name: "TT", loginId: "5834793" };
const CT = { id: "f0844dd7", name: "ctrader", loginId: "5296567" };
const calls: { url: string; init: RequestInit }[] = [];
const reply = (status: number, body: unknown) => async (url: string, init: RequestInit) => {
  calls.push({ url, init });
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
};

const FOUND = "1 closed trade(s) found — 0 newly recorded, 1 already had.";
const NONE = "Synced — the broker reported no closed trades in the last 7 days.";

async function main() {
  console.log("\nTHE SERVER'S ANSWER IS WHAT HE SEES");
  const found = await syncOne(TT, {}, reply(200, { message: FOUND, fetched: 1, created: 0, duplicates: 1 }));
  check("trades found -> the server's own sentence", found, { ok: true, text: FOUND });
  check("...sent as a POST to that account's sync route", [calls[0].url, calls[0].init.method],
        ["/api/broker-accounts/e31e9caa/sync", "POST"]);
  check("no trades -> said so, not silence", await syncOne(TT, {}, reply(200, { message: NONE })), { ok: true, text: NONE });
  const slow = "Still syncing — it is taking longer than 30s and will finish in the background.";
  check("still running past 30s -> said so", await syncOne(TT, {}, reply(200, { message: slow, pending: true })),
        { ok: true, text: slow });

  console.log("\nA FAILURE NEVER READS AS A SUCCESS");
  check("400 -> the server's reason", await syncOne(TT, {}, reply(400, { error: "No API adapter for platform: mt5" })),
        { ok: false, text: "No API adapter for platform: mt5" });
  check("502 -> the server's reason", await syncOne(TT, {}, reply(502, { error: "cTrader token expired" })),
        { ok: false, text: "cTrader token expired" });
  check("500 with no body -> the status, not a blank", await syncOne(TT, {}, async () => new Response("oops", { status: 500 })),
        { ok: false, text: "sync failed (error 500)." });
  check("401 -> sign in again", (await syncOne(TT, {}, reply(401, { error: "Unauthorized" }))).text,
        "your session has expired — refresh the page or sign in again.");
  check("network down -> said so, and never throws", await syncOne(TT, {}, async () => { throw new TypeError("Failed to fetch"); }),
        { ok: false, text: "couldn't reach the server — check your connection and try again." });

  console.log("\nSYNC ALL — one line per account");
  const both = summarise([{ account: TT, result: { ok: true, text: FOUND } }, { account: CT, result: { ok: true, text: NONE } }]);
  check("names each account by name and number", both.text, `TT (5834793): ${FOUND}  ·  ctrader (5296567): ${NONE}`);
  check("all fine -> ok", both.ok, true);
  check("one failed -> not ok", summarise([{ account: TT, result: { ok: true, text: FOUND } },
                                           { account: CT, result: { ok: false, text: "x" } }]).ok, false);

  // TEETH — the old behaviour (fire, ignore the reply) cannot pass the first check above.
  const ignoresReply = async (): Promise<SyncResult> => ({ ok: true, text: "synced." });
  check("TEETH: a sync that ignores the reply does NOT show the server's answer",
        JSON.stringify(await ignoresReply()) !== JSON.stringify({ ok: true, text: FOUND }), true);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
