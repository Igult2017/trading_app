import { extractFromScreenshot } from "./screenshotExtract";

export function isGeminiScreenshotAvailable(): boolean {
  return Boolean(process.env.GOOGLE_API_KEY);
}

export async function analyzeScreenshotWithGemini(
  base64Image: string,
): Promise<{ success: boolean; fields?: Record<string, any>; method?: string; error?: string }> {
  return extractFromScreenshot(base64Image);
}
