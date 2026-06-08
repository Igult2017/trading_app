import type { LangCode } from './languages';

const BATCH_SEP = '§';
const CACHE_PFX = 'i18n_v2_';

async function fetchSection(lang: string, ns: string, strings: Record<string, string>): Promise<Record<string, string> | null> {
  const keys = Object.keys(strings);
  const values = Object.values(strings);
  const batch = values.join(BATCH_SEP);
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(batch)}&langpair=en|${lang}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const json = await res.json();
    const translated: string = json?.responseData?.translatedText ?? '';
    const parts = translated.split(BATCH_SEP);
    if (parts.length !== keys.length) return null;
    return Object.fromEntries(keys.map((k, i) => [k, parts[i].trim() || values[i]]));
  } catch {
    return null;
  }
}

function cacheKey(lang: string) { return `${CACHE_PFX}${lang}`; }

function readCache(lang: string): Record<string, Record<string, string>> | null {
  try { const r = localStorage.getItem(cacheKey(lang)); return r ? JSON.parse(r) : null; }
  catch { return null; }
}

function writeCache(lang: string, data: Record<string, Record<string, string>>) {
  try { localStorage.setItem(cacheKey(lang), JSON.stringify(data)); } catch {}
}

export async function fetchAllSections(
  lang: LangCode,
  sections: Record<string, Record<string, string>>,
): Promise<Record<string, Record<string, string>>> {
  const results: Record<string, Record<string, string>> = {};
  await Promise.all(
    Object.entries(sections).map(async ([ns, strings]) => {
      const fetched = await fetchSection(lang, ns, strings);
      results[ns] = fetched ?? strings; // fallback to English on failure
    }),
  );
  return results;
}

export { readCache, writeCache };
