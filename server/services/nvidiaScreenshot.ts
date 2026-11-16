/**
 * NVIDIA — the automatic BACKUP for journal screenshot extraction (16 Nov 2026).
 *
 * His ask: *"Yes, write the back up."* Gemini's prepaid credit ran out (HTTP 402 "prepayment credits are
 * depleted") and extraction stopped. This is tried only when Gemini fails; the local OCR stays last.
 *
 * TWO QUESTIONS, ASKED AT THE SAME TIME (17 Nov, after *"It never worked"*):
 *   1. the full instruction Gemini gets (`screenshotExtract.ts`, imported — never copied);
 *   2. "copy the printed labels word for word" (`screenshotLabels.ts`).
 * On his GBP/JPY screenshot the model's own calculations were wrong every time (entry, year, weekday) while its
 * copying was right 5 of 5. So the copied labels overrule the full reading, OUR code does the maths, and prices
 * that do not agree with the printed distances are left blank rather than wrong.
 *
 * ⚠ THINKING MUST BE OFF. With it on, the model spent its whole reply allowance reasoning and returned no
 * answer at all (`content: null`) — the same trap Gemini's `thinkingBudget: 0` avoids.
 *
 * SILENCE IS RETRIED. His 15:12 upload got no answer in 45 s; the same picture normally takes 2-7 s. Each try
 * now gets 20 s, and silence, "temporarily unavailable", busy (429) and server errors (5xx) are asked again.
 *
 * No money values: the shared mapping carries none (his rule — the journal calculates P&L from the risk he
 * enters), and the route strips any that slip through, for every reader.
 */
import { buildExtractionPrompt, compressForGemini, mapToJournalFields, parseGeminiJson } from "./screenshotExtract";
import { LABELS_PROMPT, PRICES_PROMPT, checkPrices, parseLabels, parsePrintedPrices } from "./screenshotLabels";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
export const NVIDIA_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";
const TRY_TIMEOUT_MS = 20_000;
export const PRICES_BLANK_NOTE = "Prices could not be read reliably from this screenshot — please type entry, stop and target.";

export function isNvidiaScreenshotAvailable(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY?.trim());
}

/** The request body sent to NVIDIA — exported so the test can check what is asked, without a network call. */
export function buildNvidiaRequest(prompt: string, mimeType: string, imageData: string) {
  return {
    model: NVIDIA_MODEL,
    temperature: 0,
    max_tokens: 4096,
    chat_template_kwargs: { enable_thinking: false },
    messages: [
      { role: "system", content: "/no_think" },
      { role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageData}` } },
      ] },
    ],
  };
}

/** A refusal worth asking again: NVIDIA busy, briefly down, or silent. Never a wrong key, no credit or a bad
 *  request — asking again cannot help those. */
export function isTemporaryRefusal(status: number, why: string): boolean {
  return status === 429 || status >= 500 || /temporar/i.test(why);
}

/** One question to NVIDIA, asked again on a temporary refusal or silence. Returns the answer text or an error. */
async function ask(key: string, body: string, fetchImpl: typeof fetch, waits: number[], timeoutMs: number)
  : Promise<{ text?: string; error?: string }> {
  for (let attempt = 0; ; attempt++) {
    let status = 0, why = "";
    try {
      const res = await fetchImpl(NVIDIA_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const json: any = await res.json().catch(() => ({}));
      if (res.ok) {
        const text = json?.choices?.[0]?.message?.content;
        return text ? { text } : { error: "NVIDIA returned no answer" };
      }
      status = res.status;
      why = String(json?.detail || json?.error?.message || json?.title || `HTTP ${res.status}`);
    } catch (err: any) {
      status = 0;
      why = /abort|timeout/i.test(`${err?.name} ${err?.message}`) ? `no answer within ${timeoutMs / 1000}s (temporarily slow)`
        : String(err?.message ?? "request failed");
    }
    if (attempt >= waits.length || !(status === 0 || isTemporaryRefusal(status, why))) {
      return { error: `NVIDIA: ${why.slice(0, 200)}` };
    }
    console.warn(`[NvidiaScreenshot] temporary (${why.slice(0, 80)}) — asking again in ${waits[attempt] / 1000}s`);
    await new Promise(r => setTimeout(r, waits[attempt]));
  }
}

export async function extractWithNvidia(
  base64Image: string,
  brokerTimezone?: number | null,
  fetchImpl: typeof fetch = fetch,
  retryWaitsMs: number[] = [2000, 4000],
  timeoutMs: number = TRY_TIMEOUT_MS,
): Promise<{ success: boolean; fields?: Record<string, any>; method: "nvidia"; modelUsed?: string; error?: string; note?: string }> {
  const key = process.env.NVIDIA_API_KEY?.trim();
  if (!key) return { success: false, method: "nvidia", error: "NVIDIA_API_KEY not set" };
  try {
    const { data, mimeType } = await compressForGemini(base64Image);
    const t0 = Date.now();
    const q = (prompt: string) => ask(key, JSON.stringify(buildNvidiaRequest(prompt, mimeType, data)), fetchImpl, retryWaitsMs, timeoutMs);
    const [full, labels, prices] = await Promise.all([q(buildExtractionPrompt(brokerTimezone)), q(LABELS_PROMPT), q(PRICES_PROMPT)]);
    if (!full.text) return { success: false, method: "nvidia", error: full.error };

    // The copies are corrections; if one fails, the rest still stands (and prices stay blank without theirs).
    let printed: Record<string, any> = {};
    try { if (labels.text) printed = parseLabels(parseGeminiJson(labels.text)); } catch { /* keep the full reading */ }
    try { if (prices.text) printed = { ...printed, ...parsePrintedPrices(parseGeminiJson(prices.text)) }; } catch { /* prices blank */ }
    const merged = { ...parseGeminiJson(full.text), ...printed };
    const { fields: checked, blanked } = checkPrices(merged);
    const fields = mapToJournalFields(checked, brokerTimezone);
    console.log(`[NvidiaScreenshot] ${NVIDIA_MODEL} answered in ${((Date.now() - t0) / 1000).toFixed(1)}s`
      + ` | labels: ${Object.keys(printed).length} fields${labels.error ? ` (${labels.error})` : ""}`
      + ` | prices ${blanked ? "BLANKED — did not agree with the printed distances" : "kept"}`);
    return { success: true, fields, method: "nvidia", modelUsed: NVIDIA_MODEL, ...(blanked ? { note: PRICES_BLANK_NOTE } : {}) };
  } catch (err: any) {
    return { success: false, method: "nvidia", error: `NVIDIA: ${err?.message ?? "request failed"}` };
  }
}
