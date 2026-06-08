import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n/index';
import { ALL_LANGUAGES } from '@/i18n/languages';
import { readCache, writeCache, fetchAllSections } from '@/i18n/backend';
import type { LangCode } from '@/i18n/languages';

import en from '@/i18n/locales/en.json';

const LS_LANG_KEY = 'journal_lang';
const STATIC_LANGS = new Set(['en', 'es', 'fr', 'pt', 'de', 'ar', 'zh', 'sw']);

interface LangCtx {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  dir: 'ltr' | 'rtl';
  loading: boolean;
}

const LanguageContext = createContext<LangCtx>({
  lang: 'en', setLang: () => {}, dir: 'ltr', loading: false,
});

function applyDom(lang: LangCode) {
  document.documentElement.lang = lang;
  document.documentElement.dir = ALL_LANGUAGES[lang]?.dir ?? 'ltr';
}

async function ensureDynamicLang(lang: LangCode) {
  if (STATIC_LANGS.has(lang)) return;
  const cached = readCache(lang);
  if (cached?.nav) {
    i18n.addResourceBundle(lang, 'translation', cached, true, true);
    return;
  }
  const fetched = await fetchAllSections(lang, en as unknown as Record<string, Record<string, string>>);
  writeCache(lang, fetched);
  i18n.addResourceBundle(lang, 'translation', fetched, true, true);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangRaw] = useState<LangCode>(() => {
    try {
      const s = localStorage.getItem(LS_LANG_KEY) as LangCode | null;
      return s && s in ALL_LANGUAGES ? s : 'en';
    } catch { return 'en'; }
  });
  const [loading, setLoading] = useState(false);

  const setLang = useCallback(async (code: LangCode) => {
    setLangRaw(code);
    try { localStorage.setItem(LS_LANG_KEY, code); } catch {}
    applyDom(code);
    if (!STATIC_LANGS.has(code)) {
      setLoading(true);
      await ensureDynamicLang(code);
      setLoading(false);
    }
    await i18n.changeLanguage(code);
  }, []);

  useEffect(() => {
    applyDom(lang);
    if (!STATIC_LANGS.has(lang)) {
      setLoading(true);
      ensureDynamicLang(lang).then(() => {
        i18n.changeLanguage(lang);
        setLoading(false);
      });
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, setLang, dir: ALL_LANGUAGES[lang]?.dir ?? 'ltr', loading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLang = () => useContext(LanguageContext);

// Backward-compat hook: old code that calls t('vault') still works via nav.vault
export function useLangT() {
  const { t } = useTranslation();
  return useCallback((key: string) => {
    const navKey = `nav.${key}`;
    const val = t(navKey, { defaultValue: '' });
    return val || t(key, { defaultValue: key });
  }, [t]);
}
