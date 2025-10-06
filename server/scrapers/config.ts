export interface ScraperConfig {
  name: string;
  url: string;
  enabled: boolean;
  priority: number;
  selectors: {
    eventRow?: string;
    eventName?: string;
    country?: string;
    date?: string;
    time?: string;
    impact?: string;
    actual?: string;
    forecast?: string;
    previous?: string;
    currency?: string;
  };
  dataMapping?: {
    impactLevels?: Record<string, string>;
    countryCodes?: Record<string, string>;
  };
}

export const scraperConfigs: Record<string, ScraperConfig> = {
  investingCom: {
    name: 'Investing.com',
    url: 'https://www.investing.com/economic-calendar/',
    enabled: true,
    priority: 1,
    selectors: {
      eventRow: 'tr.js-event-item',
      eventName: 'td.event a',
      country: 'td.flagCur',
      date: 'td.time',
      time: 'td.time',
      impact: 'td.sentiment',
      actual: 'td#actual',
      forecast: 'td#forecast',
      previous: 'td#previous',
    },
    dataMapping: {
      impactLevels: {
        'bull1': 'Low',
        'bull2': 'Medium',
        'bull3': 'High',
        'grayFullBullishIcon': 'Holiday',
      },
      countryCodes: {
        'United States': 'USD',
        'Eurozone': 'EUR',
        'United Kingdom': 'GBP',
        'Japan': 'JPY',
        'Canada': 'CAD',
        'Australia': 'AUD',
        'New Zealand': 'NZD',
        'Switzerland': 'CHF',
        'China': 'CNY',
      },
    },
  },
  
  forexFactory: {
    name: 'ForexFactory',
    url: 'https://www.forexfactory.com/calendar',
    enabled: true,
    priority: 2,
    selectors: {
      eventRow: 'tr.calendar__row',
      eventName: 'td.calendar__event span.calendar__event-title',
      country: 'td.calendar__currency',
      time: 'td.calendar__time',
      impact: 'td.calendar__impact span',
      actual: 'td.calendar__actual',
      forecast: 'td.calendar__forecast',
      previous: 'td.calendar__previous',
    },
    dataMapping: {
      impactLevels: {
        'icon--ff-impact-yel': 'Low',
        'icon--ff-impact-ora': 'Medium',
        'icon--ff-impact-red': 'High',
        'icon--ff-impact-gra': 'Holiday',
      },
      countryCodes: {
        'USD': 'USD',
        'EUR': 'EUR',
        'GBP': 'GBP',
        'JPY': 'JPY',
        'CAD': 'CAD',
        'AUD': 'AUD',
        'NZD': 'NZD',
        'CHF': 'CHF',
        'CNY': 'CNY',
      },
    },
  },

  fxStreet: {
    name: 'FXStreet',
    url: 'https://www.fxstreet.com/economic-calendar',
    enabled: true,
    priority: 3,
    selectors: {
      eventRow: 'div.fxs_calendar_row',
      eventName: 'div.fxs_event_title',
      country: 'div.fxs_c_currency',
      time: 'div.fxs_c_time',
      impact: 'div.fxs_c_volatility',
      actual: 'div.fxs_c_actual',
      forecast: 'div.fxs_c_consensus',
      previous: 'div.fxs_c_previous',
    },
    dataMapping: {
      impactLevels: {
        'low': 'Low',
        'medium': 'Medium',
        'high': 'High',
      },
    },
  },

  tradingEconomics: {
    name: 'TradingEconomics',
    url: 'https://tradingeconomics.com/calendar',
    enabled: false,
    priority: 4,
    selectors: {
      eventRow: 'tr[data-event]',
      eventName: 'td.calendar-event a',
      country: 'td.calendar-country',
      time: 'td.calendar-time',
      impact: 'td.calendar-importance',
      actual: 'td.calendar-actual',
      forecast: 'td.calendar-forecast',
      previous: 'td.calendar-previous',
    },
    dataMapping: {
      impactLevels: {
        '1': 'Low',
        '2': 'Medium',
        '3': 'High',
      },
    },
  },
};

export const scraperSettings = {
  requestDelay: 3000,
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 5000,
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ],
  cacheSettings: {
    cacheDuration: 15 * 60 * 1000,
    dataRetentionDays: 7,
    cleanupInterval: 60 * 60 * 1000,
  },
  schedules: {
    upcomingEventsInterval: 15 * 60 * 1000,
    fullWeekScrapeTime: '0 0 * * *',
  },
};

export function getRandomUserAgent(): string {
  return scraperSettings.userAgents[
    Math.floor(Math.random() * scraperSettings.userAgents.length)
  ];
}

export function getActiveScrapers(): ScraperConfig[] {
  return Object.values(scraperConfigs)
    .filter(config => config.enabled)
    .sort((a, b) => a.priority - b.priority);
}
