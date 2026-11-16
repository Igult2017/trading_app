/**
 * NVIDIA — the automatic BACKUP for journal screenshot extraction (16 Nov 2026).
 *
 * His ask: *"Yes, write the back up."* Gemini's prepaid credit ran out (HTTP 402 "prepayment credits are
 * depleted") and extraction stopped. This is tried only when Gemini fails; the local OCR stays last.
 *
 * IT ASKS EXACTLY WHAT GEMINI ASKS. The instruction, the image shrink and the field mapping are the ones in
 * `screenshotExtract.ts`, imported — not copied — so the two readers can never drift apart. Tested on his
 * cTrader EUR/USD screenshot: Nemotron 3.5 Super VL 120B read every trade field correctly in ~3.4 s.
 *
 * ⚠ THINKING MUST BE OFF. With it on, the model spent its whole reply allowance reasoning and returned no
 * answer at all (`content: null`) — the same trap Gemini's `thinkingBudget: 0` avoids.
 *
 * No money values: the shared mapping carries none (his rule — the journal calculates P&L from the risk he
 * enters), and the route strips any that slip through, for every reader.
 */
import { buildExtractionPrompt, compressForGemini, mapToJournalFields, parseGeminiJson } from "./screenshotExtract";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
export const NVIDIA_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";
const TIMEOUT_MS = 45_000;

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

/** A refusal worth asking again: NVIDIA busy or briefly down (its safety check was "temporarily
 *  unavailable" on 16 Nov). Never a wrong key, no credit or a bad request — asking again cannot help. */
export function isTemporaryRefusal(status: number, why: string): boolean {
  return status === 429 || status >= 500 || /temporar/i.test(why);
}

export async function extractWithNvidia(
  base64Image: string,
  brokerTimezone?: number | null,
  fetchImpl: typeof fetch = fetch,
  retryWaitsMs: number[] = [2000, 4000],
): Promise<{ success: boolean; fields?: Record<string, any>; method: "nvidia"; modelUsed?: string; error?: string }> {
  const key = process.env.NVIDIA_API_KEY?.trim();
  if (!key) return { success: false, method: "nvidia", error: "NVIDIA_API_KEY not set" };
  try {
    const { data, mimeType } = await compressForGemini(base64Image);
    const body = JSON.stringify(buildNvidiaRequest(buildExtractionPrompt(brokerTimezone), mimeType, data));
    const t0 = Date.now();
    let res: Response, json: any;
    for (let attempt = 0; ; attempt++) {
      res = await fetchImpl(NVIDIA_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      json = await res.json().catch(() => ({}));
      if (res.ok) break;
      const why = String(json?.detail || json?.error?.message || json?.title || `HTTP ${res.status}`);
      if (attempt >= retryWaitsMs.length || !isTemporaryRefusal(res.status, why)) {
        return { success: false, method: "nvidia", error: `NVIDIA: ${why.slice(0, 200)}` };
      }
      console.warn(`[NvidiaScreenshot] temporary refusal (${why.slice(0, 80)}) — asking again in ${retryWaitsMs[attempt] / 1000}s`);
      await new Promise(r => setTimeout(r, retryWaitsMs[attempt]));
    }
    const text: string | null = json?.choices?.[0]?.message?.content ?? null;
    if (!text) return { success: false, method: "nvidia", error: "NVIDIA returned no answer" };
    const fields = mapToJournalFields(parseGeminiJson(text), brokerTimezone);
    console.log(`[NvidiaScreenshot] ${NVIDIA_MODEL} answered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return { success: true, fields, method: "nvidia", modelUsed: NVIDIA_MODEL };
  } catch (err: any) {
    return { success: false, method: "nvidia", error: `NVIDIA: ${err?.message ?? "request failed"}` };
  }
}
