import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import de from './locales/de.json';
import ar from './locales/ar.json';
import zh from './locales/zh.json';
import sw from './locales/sw.json';

const storedLang = (() => {
  try { return localStorage.getItem('journal_lang') ?? 'en'; }
  catch { return 'en'; }
})();

i18next
  .use(initReactI18next)
  .init({
    lng: storedLang,
    fallbackLng: 'en',
    defaultNS: 'translation',
    ns: ['translation'],
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      pt: { translation: pt },
      de: { translation: de },
      ar: { translation: ar },
      zh: { translation: zh },
      sw: { translation: sw },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18next;
