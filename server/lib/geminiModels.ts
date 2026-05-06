export const GEMINI_MODELS = [
  { id: "gemini-1.5-flash",               label: "Gemini 1.5 Flash",         desc: "Fast · stable GA" },
  { id: "gemini-1.5-pro",                 label: "Gemini 1.5 Pro",           desc: "Powerful · stable GA" },
  { id: "gemini-2.0-flash-lite",          label: "Gemini 2.0 Flash Lite",    desc: "Newer · efficient" },
  { id: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash Preview", desc: "Latest Flash · preview" },
  { id: "gemini-2.5-pro-preview-05-06",   label: "Gemini 2.5 Pro Preview",   desc: "Most capable · preview" },
] as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"];
export const DEFAULT_GEMINI_MODEL: GeminiModelId = "gemini-1.5-flash";

export function isValidGeminiModel(id: unknown): id is GeminiModelId {
  return typeof id === "string" && GEMINI_MODELS.some(m => m.id === id);
}
