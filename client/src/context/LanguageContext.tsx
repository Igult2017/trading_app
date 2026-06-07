import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { STATIC_T, ALL_LANGUAGES, TRANSLATION_KEYS, BATCH_SEP } from '@/i18n/translations';
import type { LangCode, TranslationKeys } from '@/i18n/translations';

const LS_LANG_KEY   = 'journal_lang';
const LS_CACHE_PFX  = 'journal_t_'; // journal_t_{langCode}

type Translations = Record<TranslationKeys, string>;

interface LangCtx {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  t: (key: TranslationKeys) => string;
  dir: 'ltr' | 'rtl';
  loading: boolean;
}

const LanguageContext = createContext<LangCtx>({
  lang: 'en', setLang: () => {}, t: (k) => k, dir: 'ltr', loading: false,
});

// ── MyMemory batch fetch ───────────────────────────────────────────────────────
// Joins all UI strings with BATCH_SEP → one API call → splits result back.
// Free, no API key, 1 000 words/day per IP (our batch is ~30 words — trivial).
async function fetchFromMyMemory(targetLang: string): Promise<Translations | null> {
  const sourceStrings = TRANSLATION_KEYS.map(k => STATIC_T.en[k]);
  const batch = sourceStrings.join(BATCH_SEP);
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(batch)}&langpair=en|${targetLang}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const translated: string = json?.responseData?.translatedText ?? '';
    const parts = translated.split(BATCH_SEP);
    if (parts.length !== TRANSLATION_KEYS.length) return null;
    return Object.fromEntries(
      TRANSLATION_KEYS.map((k, i) => [k, parts[i].trim() || STATIC_T.en[k]])
    ) as Translations;
  } catch {
    return null;
  }
}

function loadCache(lang: LangCode): Translations | null {
  try {
    const raw = localStorage.getItem(LS_CACHE_PFX + lang);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveCache(lang: LangCode, t: Translations) {
  try { localStorage.setItem(LS_CACHE_PFX + lang, JSON.stringify(t)); } catch {}
}

function getStatic(lang: LangCode): Translations | null {
  return (STATIC_T as any)[lang] ?? null;
}

function applyLang(lang: LangCode) {
  document.documentElement.lang = lang;
  document.documentElement.dir = ALL_LANGUAGES[lang]?.dir ?? 'ltr';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangRaw] = useState<LangCode>(() => {
    try {
      const s = localStorage.getItem(LS_LANG_KEY) as LangCode | null;
      return s && s in ALL_LANGUAGES ? s : 'en';
    } catch { return 'en'; }
  });

  const [translations, setTranslations] = useState<Translations>(
    () => getStatic(lang as LangCode) ?? loadCache(lang as LangCode) ?? STATIC_T.en as Translations
  );
  const [loading, setLoading] = useState(false);

  const loadLang = useCallback(async (code: LangCode) => {
    // 1. Static — instant
    const stat = getStatic(code);
    if (stat) { setTranslations(stat); return; }
    // 2. Cached — instant
    const cached = loadCache(code);
    if (cached) { setTranslations(cached); return; }
    // 3. Fetch from MyMemory — once, then cached forever
    setLoading(true);
    const fetched = await fetchFromMyMemory(code);
    setLoading(false);
    if (fetched) { saveCache(code, fetched); setTranslations(fetched); }
    // If fetch failed, translations stay as English (already set on setLangRaw)
  }, []);

  function setLang(code: LangCode) {
    setLangRaw(code);
    try { localStorage.setItem(LS_LANG_KEY, code); } catch {}
    applyLang(code);
    loadLang(code);
  }

  useEffect(() => { applyLang(lang); loadLang(lang); }, []);

  const t = useCallback(
    (key: TranslationKeys): string => translations[key] ?? STATIC_T.en[key] ?? key,
    [translations]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, dir: ALL_LANGUAGES[lang]?.dir ?? 'ltr', loading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLang = () => useContext(LanguageContext);
