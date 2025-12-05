import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScraperConfig, scraperSettings, getRandomUserAgent, getActiveScrapers } from './config';

export interface ScrapedEvent {
  title: string;
  country: string;
  countryCode?: string;
  eventTime: Date;
  impactLevel: string;
  expectedValue?: string;
  previousValue?: string;
  actualValue?: string;
  currency?: string;
  sourceSite: string;
  sourceUrl: string;
}

export class EconomicCalendarScraper {
  private lastRequestTime = 0;

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < scraperSettings.requestDelay) {
      await this.delay(scraperSettings.requestDelay - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
  }

  private async fetchHTML(url: string): Promise<string> {
    await this.respectRateLimit();

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: scraperSettings.timeout,
      });

      return response.data;
    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error);
      throw error;
    }
  }

  private parseInvestingCom(html: string, config: ScraperConfig): ScrapedEvent[] {
    const $ = cheerio.load(html);
    const events: ScrapedEvent[] = [];
    const today = new Date();

    $(config.selectors.eventRow!).each((_, element) => {
      try {
        const $row = $(element);
        
        const title = $row.find(config.selectors.eventName!).text().trim();
        if (!title) return;

        const countryText = $row.find(config.selectors.country!).attr('title') || '';
        const timeText = $row.find(config.selectors.time!).text().trim();
        const impactClass = $row.find(config.selectors.impact!).find('i').attr('class') || '';
        const actual = $row.find(config.selectors.actual!).text().trim();
        const forecast = $row.find(config.selectors.forecast!).text().trim();
        const previous = $row.find(config.selectors.previous!).text().trim();

        let impactLevel = 'Low';
        if (impactClass.includes('bull3')) impactLevel = 'High';
        else if (impactClass.includes('bull2')) impactLevel = 'Medium';

        const eventTime = this.parseTimeString(timeText, today);
        const countryCode = config.dataMapping?.countryCodes?.[countryText];

        events.push({
          title,
          country: countryText,
          countryCode: countryCode || this.extractCurrencyFromCountry(countryText),
          eventTime,
          impactLevel,
          expectedValue: forecast || undefined,
          previousValue: previous || undefined,
          actualValue: actual || undefined,
          currency: countryCode,
          sourceSite: config.name,
          sourceUrl: config.url,
        });
      } catch (error) {
        console.error('Error parsing event row:', error);
      }
    });

    return events;
  }

  private parseForexFactory(html: string, config: ScraperConfig): ScrapedEvent[] {
    const $ = cheerio.load(html);
    const events: ScrapedEvent[] = [];
    const today = new Date();

    $(config.selectors.eventRow!).each((_, element) => {
      try {
        const $row = $(element);
        
        const title = $row.find(config.selectors.eventName!).text().trim();
        if (!title) return;

        const currency = $row.find(config.selectors.country!).text().trim();
        const timeText = $row.find(config.selectors.time!).text().trim();
        const impactClass = $row.find(config.selectors.impact!).attr('class') || '';
        const actual = $row.find(config.selectors.actual!).text().trim();
        const forecast = $row.find(config.selectors.forecast!).text().trim();
        const previous = $row.find(config.selectors.previous!).text().trim();

        let impactLevel = 'Low';
        if (impactClass.includes('red')) impactLevel = 'High';
        else if (impactClass.includes('ora')) impactLevel = 'Medium';

        const eventTime = this.parseTimeString(timeText, today);

        events.push({
          title,
          country: this.getCurrencyCountry(currency),
          countryCode: currency,
          eventTime,
          impactLevel,
          expectedValue: forecast || undefined,
          previousValue: previous || undefined,
          actualValue: actual || undefined,
          currency,
          sourceSite: config.name,
          sourceUrl: config.url,
        });
      } catch (error) {
        console.error('Error parsing event row:', error);
      }
    });

    return events;
  }

  private parseMyFxBook(html: string, config: ScraperConfig): ScrapedEvent[] {
    const $ = cheerio.load(html);
    const events: ScrapedEvent[] = [];
    const currentYear = new Date().getFullYear();

    $('tr.economicCalendarRow').each((_, element) => {
      try {
        const $row = $(element);
        const cells = $row.find('td.calendarToggleCell');
        
        if (cells.length < 9) return;

        const dateTimeText = $(cells[0]).text().trim();
        const timeLeftText = $(cells[1]).text().trim();
        const currency = $(cells[3]).text().trim();
        const title = $(cells[4]).text().trim().replace(/\s+/g, ' ');
        const impactText = $(cells[5]).text().trim();
        const previous = $(cells[6]).text().trim();
        const consensus = $(cells[7]).text().trim();
        const actual = $(cells[8]).text().trim();

        if (!title || !currency) return;

        const eventTime = this.parseMyFxBookDateTime(dateTimeText, timeLeftText, currentYear);

        let impactLevel = 'Low';
        if (impactText === 'High') impactLevel = 'High';
        else if (impactText === 'Medium') impactLevel = 'Medium';
        else if (impactText === 'None') impactLevel = 'None';

        events.push({
          title,
          country: this.getCurrencyCountry(currency),
          countryCode: currency,
          eventTime,
          impactLevel,
          expectedValue: consensus || undefined,
          previousValue: previous || undefined,
          actualValue: actual || undefined,
          currency,
          sourceSite: config.name,
          sourceUrl: config.url,
        });
      } catch (error) {
        console.error('Error parsing MyFXBook event row:', error);
      }
    });

    console.log(`[MyFXBook] Parsed ${events.length} events`);
    return events;
  }

  private parseMyFxBookDateTime(dateTimeStr: string, timeLeftStr: string, currentYear: number): Date {
    try {
      const parts = dateTimeStr.split(',');
      
      let monthDay: string;
      let timeStr: string;

      if (parts.length >= 2) {
        monthDay = parts[0].trim();
        timeStr = parts[1].trim();
      } else {
        monthDay = dateTimeStr.trim();
        const timeMatch = timeLeftStr.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          timeStr = `${timeMatch[1]}:${timeMatch[2]}`;
        } else {
          const hoursMatch = timeLeftStr.match(/(\d+)h\s*(\d+)?m?/);
          if (hoursMatch) {
            const hoursToAdd = parseInt(hoursMatch[1], 10) || 0;
            const minutesToAdd = parseInt(hoursMatch[2], 10) || 0;
            const futureTime = new Date(Date.now() + (hoursToAdd * 60 + minutesToAdd) * 60000);
            return futureTime;
          }
          timeStr = '00:00';
        }
      }

      const monthDayParts = monthDay.split(' ').filter(p => p);
      const monthStr = monthDayParts[0] || 'Jan';
      const dayStr = monthDayParts[1] || '1';
      
      const monthMap: Record<string, number> = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
      };

      const month = monthMap[monthStr] ?? 0;
      const day = parseInt(dayStr, 10) || 1;

      const timeParts = timeStr.split(':');
      const hours = parseInt(timeParts[0], 10) || 0;
      const minutes = parseInt(timeParts[1], 10) || 0;

      let eventDate = new Date(Date.UTC(currentYear, month, day, hours, minutes, 0, 0));

      if (eventDate.getTime() < Date.now() - 86400000 * 7) {
        eventDate = new Date(Date.UTC(currentYear + 1, month, day, hours, minutes, 0, 0));
      }

      return eventDate;
    } catch (error) {
      console.error('Error parsing MyFXBook date:', dateTimeStr, error);
      return new Date();
    }
  }

  private parseTimeString(timeStr: string, baseDate: Date): Date {
    const time = new Date(baseDate);
    
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const isPM = timeMatch[3]?.toUpperCase() === 'PM';
      
      if (isPM && hours < 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
      
      time.setHours(hours, minutes, 0, 0);
    }
    
    return time;
  }

  private extractCurrencyFromCountry(country: string): string {
    const currencyMap: Record<string, string> = {
      'United States': 'USD',
      'Eurozone': 'EUR',
      'Euro Zone': 'EUR',
      'United Kingdom': 'GBP',
      'Japan': 'JPY',
      'Canada': 'CAD',
      'Australia': 'AUD',
      'New Zealand': 'NZD',
      'Switzerland': 'CHF',
      'China': 'CNY',
    };
    
    return currencyMap[country] || 'USD';
  }

  private getCurrencyCountry(currency: string): string {
    const countryMap: Record<string, string> = {
      'USD': 'United States',
      'EUR': 'Eurozone',
      'GBP': 'United Kingdom',
      'JPY': 'Japan',
      'CAD': 'Canada',
      'AUD': 'Australia',
      'NZD': 'New Zealand',
      'CHF': 'Switzerland',
      'CNY': 'China',
    };
    
    return countryMap[currency] || currency;
  }

  private parseEvents(html: string, config: ScraperConfig): ScrapedEvent[] {
    switch (config.name) {
      case 'MyFXBook':
        return this.parseMyFxBook(html, config);
      case 'Investing.com':
        return this.parseInvestingCom(html, config);
      case 'ForexFactory':
        return this.parseForexFactory(html, config);
      default:
        console.warn(`No parser implemented for ${config.name}`);
        return [];
    }
  }

  async scrape(): Promise<ScrapedEvent[]> {
    const scrapers = getActiveScrapers();
    let allEvents: ScrapedEvent[] = [];
    
    for (const config of scrapers) {
      try {
        console.log(`Attempting to scrape from ${config.name}...`);
        const html = await this.fetchHTML(config.url);
        const events = this.parseEvents(html, config);
        
        console.log(`Successfully scraped ${events.length} events from ${config.name}`);
        allEvents = allEvents.concat(events);
        
        if (events.length > 0) {
          break;
        }
      } catch (error) {
        console.error(`Failed to scrape ${config.name}:`, error);
        
        if (config.priority === scrapers[scrapers.length - 1].priority) {
          console.error('All scrapers failed');
        } else {
          console.log('Falling back to next scraper...');
        }
      }
    }

    return this.deduplicateEvents(allEvents);
  }

  private deduplicateEvents(events: ScrapedEvent[]): ScrapedEvent[] {
    const seen = new Set<string>();
    const unique: ScrapedEvent[] = [];

    for (const event of events) {
      const key = `${event.title}-${event.eventTime.toISOString()}-${event.country}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(event);
      }
    }

    return unique;
  }

  async scrapeWithRetry(maxAttempts: number = scraperSettings.retryAttempts): Promise<ScrapedEvent[]> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const events = await this.scrape();
        if (events.length > 0) {
          return events;
        }
      } catch (error) {
        console.error(`Scrape attempt ${attempt} failed:`, error);
        
        if (attempt < maxAttempts) {
          console.log(`Retrying in ${scraperSettings.retryDelay / 1000} seconds...`);
          await this.delay(scraperSettings.retryDelay);
        }
      }
    }

    console.error('All scrape attempts failed');
    return [];
  }
}

export const economicCalendarScraper = new EconomicCalendarScraper();
