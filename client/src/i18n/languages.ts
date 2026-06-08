export const ALL_LANGUAGES: Record<string, { name: string; flag: string; dir: 'ltr' | 'rtl'; static?: true }> = {
  en: { name: 'English',       flag: '🇬🇧', dir: 'ltr', static: true },
  es: { name: 'Español',       flag: '🇪🇸', dir: 'ltr', static: true },
  fr: { name: 'Français',      flag: '🇫🇷', dir: 'ltr', static: true },
  pt: { name: 'Português',     flag: '🇧🇷', dir: 'ltr', static: true },
  de: { name: 'Deutsch',       flag: '🇩🇪', dir: 'ltr', static: true },
  ar: { name: 'العربية',       flag: '🇸🇦', dir: 'rtl', static: true },
  zh: { name: '中文',           flag: '🇨🇳', dir: 'ltr', static: true },
  sw: { name: 'Kiswahili',     flag: '🇰🇪', dir: 'ltr', static: true },
  hi: { name: 'हिन्दी',         flag: '🇮🇳', dir: 'ltr' },
  ru: { name: 'Русский',       flag: '🇷🇺', dir: 'ltr' },
  ja: { name: '日本語',          flag: '🇯🇵', dir: 'ltr' },
  ko: { name: '한국어',          flag: '🇰🇷', dir: 'ltr' },
  it: { name: 'Italiano',      flag: '🇮🇹', dir: 'ltr' },
  tr: { name: 'Türkçe',        flag: '🇹🇷', dir: 'ltr' },
  id: { name: 'Bahasa Indo',   flag: '🇮🇩', dir: 'ltr' },
  ms: { name: 'Bahasa Melayu', flag: '🇲🇾', dir: 'ltr' },
  vi: { name: 'Tiếng Việt',    flag: '🇻🇳', dir: 'ltr' },
  th: { name: 'ภาษาไทย',       flag: '🇹🇭', dir: 'ltr' },
  fa: { name: 'فارسی',         flag: '🇮🇷', dir: 'rtl' },
  ur: { name: 'اردو',          flag: '🇵🇰', dir: 'rtl' },
  bn: { name: 'বাংলা',          flag: '🇧🇩', dir: 'ltr' },
  nl: { name: 'Nederlands',    flag: '🇳🇱', dir: 'ltr' },
  pl: { name: 'Polski',        flag: '🇵🇱', dir: 'ltr' },
  yo: { name: 'Yorùbá',        flag: '🇳🇬', dir: 'ltr' },
  ha: { name: 'Hausa',         flag: '🇳🇬', dir: 'ltr' },
  ig: { name: 'Igbo',          flag: '🇳🇬', dir: 'ltr' },
  am: { name: 'አማርኛ',          flag: '🇪🇹', dir: 'ltr' },
  so: { name: 'Soomaali',      flag: '🇸🇴', dir: 'ltr' },
  zu: { name: 'isiZulu',       flag: '🇿🇦', dir: 'ltr' },
  ta: { name: 'தமிழ்',          flag: '🇱🇰', dir: 'ltr' },
};

export type LangCode = keyof typeof ALL_LANGUAGES;

export const STATIC_LANGS = Object.entries(ALL_LANGUAGES)
  .filter(([, v]) => v.static)
  .map(([k]) => k);
