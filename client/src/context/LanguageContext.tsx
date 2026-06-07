import { createContext, useContext, useState, useEffect } from 'react';
import { T, LANGUAGES } from '@/i18n/translations';
import type { LangCode, TranslationKeys } from '@/i18n/translations';

const LS_KEY = 'journal_lang';

interface LangCtx {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  t: (key: TranslationKeys) => string;
  dir: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LangCtx>({
  lang: 'en', setLang: () => {}, t: (k) => k, dir: 'ltr',
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangRaw] = useState<LangCode>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY) as LangCode | null;
      return stored && stored in T ? stored : 'en';
    } catch { return 'en'; }
  });

  function setLang(l: LangCode) {
    setLangRaw(l);
    try { localStorage.setItem(LS_KEY, l); } catch {}
    document.documentElement.lang = l;
    document.documentElement.dir = LANGUAGES[l].dir;
  }

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = LANGUAGES[lang].dir;
  }, []);

  const t = (key: TranslationKeys): string =>
    (T[lang] as Record<string, string>)[key] ?? (T.en as Record<string, string>)[key] ?? key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, dir: LANGUAGES[lang].dir as 'ltr' | 'rtl' }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLang = () => useContext(LanguageContext);
