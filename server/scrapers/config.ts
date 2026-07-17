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

