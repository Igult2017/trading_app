// Static translations for the 8 most common languages — zero latency, no API.
// All other languages are fetched once from MyMemory API and cached in localStorage.

export const ALL_LANGUAGES: Record<string, { name: string; flag: string; dir: 'ltr' | 'rtl'; static?: true }> = {
  en: { name: 'English',       flag: '🇬🇧', dir: 'ltr', static: true },
  es: { name: 'Español',       flag: '🇪🇸', dir: 'ltr', static: true },
  fr: { name: 'Français',      flag: '🇫🇷', dir: 'ltr', static: true },
  pt: { name: 'Português',     flag: '🇧🇷', dir: 'ltr', static: true },
  de: { name: 'Deutsch',       flag: '🇩🇪', dir: 'ltr', static: true },
  ar: { name: 'العربية',       flag: '🇸🇦', dir: 'rtl', static: true },
  zh: { name: '中文',           flag: '🇨🇳', dir: 'ltr', static: true },
  sw: { name: 'Kiswahili',     flag: '🇰🇪', dir: 'ltr', static: true },
  // API-translated (MyMemory — cached in localStorage after first use)
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
export type TranslationKeys = keyof typeof STATIC_T.en;

// Ordered list of string keys — MUST stay in sync with SEPARATOR-joined batch
export const TRANSLATION_KEYS: TranslationKeys[] = [
  'dashboard','journal','tradeHistory','analytics','assets','accounts',
  'leaderboard','settings','accountSettings','logout','loginStreak',
  'days','free','language','newTrade','save','cancel','edit','close',
];

// Separator used to batch all strings in a single MyMemory API call
export const BATCH_SEP = '§';

export const STATIC_T = {
  en: {
    dashboard:'Dashboard', journal:'Journal', tradeHistory:'Trade History',
    analytics:'Analytics', assets:'Assets', accounts:'Accounts',
    leaderboard:'Leaderboard', settings:'Settings', accountSettings:'Account Settings',
    logout:'Logout', loginStreak:'Login Streak', days:'days', free:'Free',
    language:'Language', newTrade:'New Trade', save:'Save', cancel:'Cancel',
    edit:'Edit', close:'Close',
  },
  es: {
    dashboard:'Panel', journal:'Diario', tradeHistory:'Historial',
    analytics:'Análisis', assets:'Activos', accounts:'Cuentas',
    leaderboard:'Clasificación', settings:'Ajustes', accountSettings:'Configuración',
    logout:'Cerrar sesión', loginStreak:'Racha', days:'días', free:'Gratis',
    language:'Idioma', newTrade:'Nueva operación', save:'Guardar', cancel:'Cancelar',
    edit:'Editar', close:'Cerrar',
  },
  fr: {
    dashboard:'Tableau de bord', journal:'Journal', tradeHistory:'Historique',
    analytics:'Analytique', assets:'Actifs', accounts:'Comptes',
    leaderboard:'Classement', settings:'Paramètres', accountSettings:'Compte',
    logout:'Déconnexion', loginStreak:'Série', days:'jours', free:'Gratuit',
    language:'Langue', newTrade:'Nouveau trade', save:'Enregistrer', cancel:'Annuler',
    edit:'Modifier', close:'Fermer',
  },
  pt: {
    dashboard:'Painel', journal:'Diário', tradeHistory:'Histórico',
    analytics:'Análise', assets:'Ativos', accounts:'Contas',
    leaderboard:'Classificação', settings:'Configurações', accountSettings:'Conta',
    logout:'Sair', loginStreak:'Sequência', days:'dias', free:'Grátis',
    language:'Idioma', newTrade:'Nova operação', save:'Salvar', cancel:'Cancelar',
    edit:'Editar', close:'Fechar',
  },
  de: {
    dashboard:'Dashboard', journal:'Journal', tradeHistory:'Handelshistorie',
    analytics:'Analyse', assets:'Vermögenswerte', accounts:'Konten',
    leaderboard:'Rangliste', settings:'Einstellungen', accountSettings:'Kontoeinstellungen',
    logout:'Abmelden', loginStreak:'Anmeldeserie', days:'Tage', free:'Kostenlos',
    language:'Sprache', newTrade:'Neuer Trade', save:'Speichern', cancel:'Abbrechen',
    edit:'Bearbeiten', close:'Schließen',
  },
  ar: {
    dashboard:'لوحة القيادة', journal:'مجلة', tradeHistory:'سجل الصفقات',
    analytics:'التحليلات', assets:'الأصول', accounts:'الحسابات',
    leaderboard:'المتصدرون', settings:'الإعدادات', accountSettings:'إعدادات الحساب',
    logout:'تسجيل الخروج', loginStreak:'تواصل الدخول', days:'أيام', free:'مجاني',
    language:'اللغة', newTrade:'صفقة جديدة', save:'حفظ', cancel:'إلغاء',
    edit:'تعديل', close:'إغلاق',
  },
  zh: {
    dashboard:'仪表板', journal:'交易日志', tradeHistory:'交易历史',
    analytics:'分析', assets:'资产', accounts:'账户',
    leaderboard:'排行榜', settings:'设置', accountSettings:'账户设置',
    logout:'退出登录', loginStreak:'登录连续', days:'天', free:'免费',
    language:'语言', newTrade:'新交易', save:'保存', cancel:'取消',
    edit:'编辑', close:'关闭',
  },
  sw: {
    dashboard:'Dashibodi', journal:'Jarida', tradeHistory:'Historia ya Biashara',
    analytics:'Uchanganuzi', assets:'Mali', accounts:'Akaunti',
    leaderboard:'Orodha ya Juu', settings:'Mipangilio', accountSettings:'Mipangilio ya Akaunti',
    logout:'Toka', loginStreak:'Mfululizo', days:'siku', free:'Bure',
    language:'Lugha', newTrade:'Biashara Mpya', save:'Hifadhi', cancel:'Ghairi',
    edit:'Hariri', close:'Funga',
  },
} as const;
