/**
 * nvidiaScreenshot.test.ts — run with:
 *     npx tsx server/services/nvidiaScreenshot.test.ts            (offline: NVIDIA faked)
 *     NVIDIA_LIVE=1 NVIDIA_API_KEY=... npx tsx server/services/nvidiaScreenshot.test.ts   (+ real calls)
 *
 * The NVIDIA backup for journal screenshot extraction; his rule that NO money value is read off a chart
 * (16 Nov 2026); and the 17 Nov rebuild after *"It never worked"*: copy the printed labels, calculate in code,
 * prices only from numbers printed on the chart — blank rather than wrong.
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
const img = (f: string) => "data:image/png;base64," + readFileSync(join(ROOT, "attached_assets", f)).toString("base64");
const EURUSD = img("Screenshot_2026-05-05_235024_1778091371233.png");
const GBPJPY = img("journal_gbpjpy_ctrader_replay.png");   // HIS screenshot, 17 Nov 2026

// What the model copied off HIS chart (5 of 5 identical), and the WRONG full-form answer it gave (self-consistent:
// the stop price taken as the entry, a stop invented 6.7 pips below it).
const HIS_LABELS = { symbol: "GBP/JPY", positionArrow: "up",
  entryLabelRow: "0.01 lot Closed P/L 18.5 points / USD 1.16 Drawdown 3.0 points / USD -0.19 TP/SL Ratio 2.76",
  slLabel: "SL 6.7 points USD -0.42", tpLabel: null,
  timeAxisHighlighted: ["Wed 01 Dec 21 05:44", "Wed 01 Dec 21 07:12:20"] };
const HIS_PRICES = { slLineAxisPrice: "150.866", tpLineAxisPrice: "151.123", entryPricePrinted: null };
const HIS_WRONG_FULL = { instrument: "GBP/JPY", direction: "Long", entryPrice: 150.866, stopLoss: 150.799,
  closingPrice: 151.051, entryTime: "2020-12-01T05:44:00", dayOfWeek: "Tuesday", outcome: "Win" };

/** A fake NVIDIA that answers each of the three questions by what it asks. */
const answering = (full: object, labels: object, prices: object, counter?: { n: number }): any =>
  async (_u: string, init: any) => {
    if (counter) counter.n++;
    const text = JSON.parse(init.body).messages[1].content[0].text as string;
    const a = text.startsWith("You are copying text") ? labels : text.startsWith("You are copying numbers") ? prices : full;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(a) } }] }) };
  };

(async () => {
  const nv = await import("./nvidiaScreenshot");
  const L = await import("./screenshotLabels");
  const { stripMoneyFields } = await import("../lib/noMoneyFields");
  console.log("\nNVIDIA BACKUP — COPY, THEN CALCULATE; NO MONEY VALUES\n");

  // ── what is asked ───────────────────────────────────────────────────────
  const req: any = nv.buildNvidiaRequest("PROMPT", "image/jpeg", "AAA");
  check("thinking is OFF (with it on the model returned no answer at all)", req.chat_template_kwargs, { enable_thinking: false });
  check("the image goes with the instruction", req.messages[1].content[1].image_url.url.startsWith("data:image/jpeg;base64,"), true);

  // ── the label copy → fields, all in OUR code ───────────────────────────
  const p = L.parseLabels(HIS_LABELS);
  check("his chart: symbol, Long, 0.01 lot", [p.instrument, p.direction, p.lotSize], ["GBP/JPY", "Long", 0.01]);
  check("his chart: Dec'21 → 2021, both times", [p.entryTime, p.exitTime], ["2021-12-01T05:44:00", "2021-12-01T07:12:20"]);
  check("his chart: weekday CALCULATED from the date (the model said Tuesday)", p.dayOfWeek, "Wednesday");
  check("his chart: SL 6.7, closed 18.5, drawdown 3.0, ratio 2.76, achieved 2.76, Win",
        [p.stopLossDistance, p.closedPLPips, p.drawdownPoints, p.riskReward, p.achievedRR, p.outcome], [6.7, 18.5, 3, 2.76, 2.76, "Win"]);
  check("'SL -7.9 points' (minus sign) still reads 7.9", L.parseLabels({ slLabel: "SL -7.9 points /USD -0.79" }).stopLossDistance, 7.9);
  check("a losing trade → Loss", L.parseLabels({ entryLabelRow: "Closed P/L -6.7 points" }).outcome, "Loss");
  check("one time label alone → no time claimed (it could be either end)",
        L.parseLabels({ timeAxisHighlighted: ["Wed 01 Dec 21 05:44"] }).entryTime, undefined);
  check("an impossible date is refused", L.parsePrintedDateTime("31 Feb'21 10:00"), null);

  // ── prices: only printed numbers, blank rather than wrong ──────────────
  const good = L.checkPrices({ ...HIS_WRONG_FULL, ...p, ...L.parsePrintedPrices(HIS_PRICES) });
  check("his chart: entry = printed stop 150.866 + 6.7 pips = 150.933; stop 150.866",
        [good.fields.entryPrice, good.fields.stopLoss, good.blanked], [150.933, 150.866, false]);
  check("...the model's own wrong prices are never used (150.799 gone)", good.fields.stopLoss === 150.799, false);
  check("...target 0.5 pip off the ratio → left blank, not filled wrong", good.fields.takeProfit, null);
  const noStop = L.checkPrices({ ...HIS_WRONG_FULL, ...p, ...L.parsePrintedPrices({ ...HIS_PRICES, slLineAxisPrice: null }) });
  check("TEETH — no printed stop → ALL prices blank (the self-consistent wrong pair is not kept)",
        [noStop.fields.entryPrice, noStop.fields.stopLoss, noStop.blanked], [null, null, true]);
  const badEntry = L.checkPrices({ ...p, ...L.parsePrintedPrices({ ...HIS_PRICES, entryPricePrinted: "151.123" }) });
  check("a 'printed entry' that disagrees with the stop distance → blank", badEntry.blanked, true);
  check("gold: no guessed pip size → prices blank", L.checkPrices({ ...p, instrument: "XAU/USD", ...L.parsePrintedPrices(HIS_PRICES) }).blanked, true);

  // ── the whole reader, faked NVIDIA ─────────────────────────────────────
  process.env.NVIDIA_API_KEY = "test-key";
  const r = await nv.extractWithNvidia(GBPJPY, null, answering(HIS_WRONG_FULL, HIS_LABELS, HIS_PRICES), [0, 0]);
  check("his screenshot, end to end: corrected fields reach the form",
        [r.success, r.fields?.entryTime, r.fields?.dayOfWeek, r.fields?.entryPrice, r.fields?.stopLoss, r.fields?.pipsGainedLost],
        [true, "2021-12-01T05:44:00", "Wednesday", 150.933, 150.866, 18.5]);
  check("...no dollar P&L in the fields", r.fields?.profitLoss, undefined);
  const blankR = await nv.extractWithNvidia(GBPJPY, null, answering(HIS_WRONG_FULL, HIS_LABELS, {}), [0, 0]);
  check("prices unreadable → blank + a note asking him to type them", [blankR.fields?.entryPrice, blankR.note], [null, nv.PRICES_BLANK_NOTE]);

  const c402 = { n: 0 };
  const refused: any = async () => { c402.n++; return { ok: false, status: 402, json: async () => ({ detail: "credits depleted" }) }; };
  const bad = await nv.extractWithNvidia(EURUSD, null, refused, [0, 0]);
  check("no credit → clean failure, each question asked ONCE", [bad.success, bad.error, c402.n], [false, "NVIDIA: credits depleted", 3]);

  let blips = 0;
  const blip: any = async (u: string, init: any) => (++blips === 1
    ? { ok: false, status: 503, json: async () => ({ detail: "content safety screening is temporarily unavailable" }) }
    : answering(HIS_WRONG_FULL, HIS_LABELS, HIS_PRICES)(u, init));
  check("his 16 Nov refusal → asked again, read", (await nv.extractWithNvidia(GBPJPY, null, blip, [0, 0])).success, true);

  let silent = 0;
  const silence: any = async (u: string, init: any) => {
    if (++silent === 1) { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; throw e; }
    return answering(HIS_WRONG_FULL, HIS_LABELS, HIS_PRICES)(u, init);
  };
  check("his 15:12 silence → asked again, read", (await nv.extractWithNvidia(GBPJPY, null, silence, [0, 0])).success, true);

  const cDown = { n: 0 };
  const down: any = async () => { cDown.n++; return { ok: false, status: 503, json: async () => ({ detail: "temporarily unavailable" }) }; };
  const rd = await nv.extractWithNvidia(EURUSD, null, down, [0, 0]);
  check("still down → clean failure after 3 tries per question, no more", [rd.success, cDown.n], [false, 9]);
  delete process.env.NVIDIA_API_KEY;
  check("no key set → the backup is off", nv.isNvidiaScreenshotAvailable(), false);

  // ── money never reaches the form, from ANY reader ──────────────────────
  const f: any = { profitLoss: 1.9, profitLossUSD: 1.9, drawdownUSD: -0.08, pipsGainedLost: 19, riskReward: 2.41,
                   aiExtractedRaw: { profitLossUSD: 1.9, lotSize: 0.01 } };
  stripMoneyFields(f);
  check("money fields stripped (in the raw copy too); pips, R:R, lot kept",
        [f.profitLoss, f.profitLossUSD, f.drawdownUSD, f.aiExtractedRaw.profitLossUSD, f.pipsGainedLost, f.riskReward, f.aiExtractedRaw.lotSize],
        [undefined, undefined, undefined, undefined, 19, 2.41, 0.01]);

  const routes = readFileSync(join(ROOT, "server", "routes.ts"), "utf8");
  const g = routes.indexOf("analyzeScreenshotWithGemini(image"), n = routes.indexOf("extractWithNvidia(image"),
        o = routes.indexOf("analyzeScreenshotWithOCR(image");
  check("TEETH — order is Gemini, then NVIDIA, then OCR", g > 0 && g < n && n < o, true);
  check("TEETH — every reader's result passes the money strip", /normalizeFields[\s\S]{0,400}stripMoneyFields\(f\)/.test(routes), true);
  check("TEETH — the warning never hard-codes 'Gemini failed' around another reader's error",
        /geminiWarning: `Gemini failed: \$\{geminiErrorMsg\}/.test(routes), false);
  const prompt = readFileSync(join(ROOT, "server", "services", "screenshotExtract.ts"), "utf8");
  check("the instruction no longer asks for USD amounts", /"(profitLoss|drawdown|runUp)USD"/.test(prompt), false);
  const form = readFileSync(join(ROOT, "client", "src", "components", "JournalForm.tsx"), "utf8");
  check("TEETH — the form never copies a screenshot P&L", /fields\.profitLoss\b/.test(form), false);
  check("TEETH — an NVIDIA reading is labelled AI, not OCR",
        /const methodLabel = res\.method === "gemini" \|\| res\.method === "nvidia" \? "Powered by AI"/.test(form), true);
  check("TEETH — the form shows the 'type the prices' note", /\[res\.note, res\.geminiWarning\]/.test(form), true);
  check("TEETH — the page paste listener skips a paste the box already took",
        /const handler = \(e: ClipboardEvent\) => \{\s*if \(e\.defaultPrevented\) return;/.test(form), true);
  check("TEETH — the box stops the REAL browser paste event (React's has no such method)",
        /\(\(e as any\)\.nativeEvent \?\? e\)\.stopImmediatePropagation\?\.\(\)/.test(form), true);

  // ── REAL calls, when asked ──────────────────────────────────────────────
  if (process.env.NVIDIA_LIVE === "1" && LIVE_KEY) {
    process.env.NVIDIA_API_KEY = LIVE_KEY;
    const live = await nv.extractWithNvidia(GBPJPY, null);
    const lf: any = live.fields ?? {};
    console.log(`\n   LIVE: success=${live.success} ${live.error ?? ""}`);
    check("LIVE — HIS GBP/JPY screenshot: the printed facts",
          [lf.instrument, lf.direction, lf.lotSize, lf.entryTime, lf.exitTime, lf.dayOfWeek, lf.stopLossDistancePips, lf.closedPLPips, lf.outcome],
          ["GBP/JPY", "Long", 0.01, "2021-12-01T05:44:00", "2021-12-01T07:12:20", "Wednesday", 6.7, 18.5, "Win"]);
    check("LIVE — his prices are right or blank, never wrong",
          [[150.933, null].includes(lf.entryPrice), [150.866, null].includes(lf.stopLoss)], [true, true]);
    const eu: any = (await nv.extractWithNvidia(EURUSD, null)).fields ?? {};
    check("LIVE — the EUR/USD screenshot still reads (no regression)",
          [eu.instrument, eu.direction, eu.entryTime, eu.outcome, [1.0405, null].includes(eu.entryPrice)],
          ["EUR/USD", "Long", "2022-11-24T00:22:00", "Win", true]);
  }

  console.log(`\n${failed ? `${failed} of ${total} FAILED` : `ALL PASS (${total} checks)`}\n`);
  process.exit(failed ? 1 : 0);
})();
