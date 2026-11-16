/**
 * nvidiaScreenshot.test.ts — run with:
 *     npx tsx server/services/nvidiaScreenshot.test.ts            (offline: NVIDIA faked)
 *     NVIDIA_LIVE=1 NVIDIA_API_KEY=... npx tsx server/services/nvidiaScreenshot.test.ts   (+ one real call)
 *
 * The NVIDIA backup for journal screenshot extraction, and his rule that NO money value is read off a
 * chart (16 Nov 2026): *"we dont extract money values. The journal requires that one enters amount he
 * risks in every trade then it calculates the rest."*
 */
import { readFileSync } from "fs";
import { join } from "path";

process.env.DATABASE_URL ||= "postgresql://x/x";
const LIVE_KEY = process.env.NVIDIA_API_KEY;   // kept aside: the offline checks below set and clear the key
let failed = 0, total = 0;
function check(name: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}: got ${JSON.stringify(got)}${ok ? "" : `, want ${JSON.stringify(want)}`}`);
}

const ROOT = join(import.meta.dirname, "..", "..");
const IMG = "data:image/png;base64," + readFileSync(join(ROOT, "attached_assets",
  "Screenshot_2026-05-05_235024_1778091371233.png")).toString("base64");

(async () => {
  const nv = await import("./nvidiaScreenshot");
  const { stripMoneyFields } = await import("../lib/noMoneyFields");
  console.log("\nNVIDIA BACKUP + NO MONEY VALUES\n");

  // ── what is asked ───────────────────────────────────────────────────────
  const req: any = nv.buildNvidiaRequest("PROMPT", "image/jpeg", "AAA");
  check("thinking is OFF (with it on the model returned no answer at all)", req.chat_template_kwargs, { enable_thinking: false });
  check("the image-reading model is asked", req.model, "nvidia/nemotron-3.5-super-vl-120b-a12b");
  check("the image goes with the instruction", req.messages[1].content[1].image_url.url.startsWith("data:image/jpeg;base64,"), true);

  // ── a faked answer that carries money ──────────────────────────────────
  process.env.NVIDIA_API_KEY = "test-key";
  const answer = { instrument: "EUR/USD", direction: "Long", entryPrice: 1.0405, stopLoss: 1.03971,
                   closingPrice: 1.04249, units: 1000, riskReward: 2.41, profitLossPoints: 19,
                   profitLossUSD: 1.9, drawdownUSD: -0.08, outcome: "Win", entryTime: "2022-11-24T00:22:00" };
  let sentKey = "";
  const fake: any = async (_u: string, init: any) => {
    sentKey = init.headers.Authorization;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(answer) } }] }) };
  };
  const r = await nv.extractWithNvidia(IMG, null, fake);
  check("a good answer → success, method nvidia", [r.success, r.method], [true, "nvidia"]);
  check("...the key goes as a bearer token, from the server setting", sentKey, "Bearer test-key");
  check("...trade fields mapped like Gemini's", [r.fields?.instrument, r.fields?.entryPrice, r.fields?.pipsGainedLost],
        ["EUR/USD", 1.0405, 19]);
  check("...NO dollar P&L in the mapped fields", r.fields?.profitLoss, undefined);

  const refused: any = async () => ({ ok: false, status: 402, json: async () => ({ detail: "credits depleted" }) });
  const bad = await nv.extractWithNvidia(IMG, null, refused);
  check("NVIDIA refuses → a clean failure (the route then falls to OCR)", [bad.success, bad.error], [false, "NVIDIA: credits depleted"]);
  const empty: any = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: null } }] }) });
  check("an empty answer (thinking left on) → failure, not a blank form",
        (await nv.extractWithNvidia(IMG, null, empty)).success, false);
  delete process.env.NVIDIA_API_KEY;
  check("no key set → the backup is off", nv.isNvidiaScreenshotAvailable(), false);

  // ── money never reaches the form, from ANY reader ──────────────────────
  const f: any = { instrument: "EUR/USD", profitLoss: 1.9, profitLossUSD: 1.9, drawdownUSD: -0.08, runUpUSD: 2,
                   pipsGainedLost: 19, closedPLPips: 19, riskReward: 2.41,
                   aiExtractedRaw: { profitLossUSD: 1.9, lotSize: 0.01 } };
  stripMoneyFields(f);
  check("money fields stripped (P&L, USD amounts, in the raw copy too)",
        [f.profitLoss, f.profitLossUSD, f.drawdownUSD, f.runUpUSD, f.aiExtractedRaw.profitLossUSD],
        [undefined, undefined, undefined, undefined, undefined]);
  check("...points, pips, R:R and lot size kept", [f.pipsGainedLost, f.closedPLPips, f.riskReward, f.aiExtractedRaw.lotSize],
        [19, 19, 2.41, 0.01]);

  const routes = readFileSync(join(ROOT, "server", "routes.ts"), "utf8");
  const g = routes.indexOf("analyzeScreenshotWithGemini(image"), n = routes.indexOf("extractWithNvidia(image"),
        o = routes.indexOf("analyzeScreenshotWithOCR(image");
  check("TEETH — order is Gemini, then NVIDIA, then OCR", g > 0 && g < n && n < o, true);
  check("TEETH — every reader's result passes the money strip", /normalizeFields[\s\S]{0,400}stripMoneyFields\(f\)/.test(routes), true);
  const prompt = readFileSync(join(ROOT, "server", "services", "screenshotExtract.ts"), "utf8");
  check("the instruction no longer asks for USD amounts", /"(profitLoss|drawdown|runUp)USD"/.test(prompt), false);
  const form = readFileSync(join(ROOT, "client", "src", "components", "JournalForm.tsx"), "utf8");
  check("TEETH — the form never copies a screenshot P&L", /fields\.profitLoss\b/.test(form), false);

  // ── one REAL call, when asked ───────────────────────────────────────────
  if (process.env.NVIDIA_LIVE === "1" && LIVE_KEY) {
    process.env.NVIDIA_API_KEY = LIVE_KEY;
    const live = await nv.extractWithNvidia(IMG, null);
    const lf = live.fields ?? {};
    console.log(`\n   LIVE: success=${live.success} ${live.error ?? ""}`);
    check("LIVE — his EUR/USD screenshot read by the real backup",
          [lf.instrument, lf.direction, lf.entryPrice, lf.closingPrice, lf.outcome],
          ["EUR/USD", "Long", 1.0405, 1.04249, "Win"]);
    check("LIVE — no dollar P&L came back", lf.profitLoss, undefined);
  }

  console.log(`\n${failed ? `${failed} of ${total} FAILED` : `ALL PASS (${total} checks)`}\n`);
  process.exit(failed ? 1 : 0);
})();
