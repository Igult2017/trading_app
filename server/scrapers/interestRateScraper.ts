import axios from 'axios';
import * as cheerio from 'cheerio';
import { getRandomUserAgent, scraperSettings } from './config';

export interface InterestRateData {
  country: string;
  currency: string;
  centralBank: string;
  centralBankCode: string;
  currentRate: number;
  previousRate: number;
  changeInBps: number;
  lastMeeting: string;
  nextMeeting: string;
  lastUpdated: Date;
  isLiveData: boolean;
}

const MAJOR_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY'];

const CURRENCY_MAP: Record<string, string> = {
  'United States': 'USD',
  'Euro Area': 'EUR',
  'United Kingdom': 'GBP',
  'Japan': 'JPY',
  'Canada': 'CAD',
  'Australia': 'AUD',
  'New Zealand': 'NZD',
  'Switzerland': 'CHF',
  'China': 'CNY',
  'Germany': 'EUR',
  'France': 'EUR',
  'Italy': 'EUR',
  'Spain': 'EUR',
  'Netherlands': 'EUR',
  'Belgium': 'EUR',
  'Austria': 'EUR',
  'Ireland': 'EUR',
  'Finland': 'EUR',
  'Portugal': 'EUR',
  'Greece': 'EUR',
  'Luxembourg': 'EUR',
  'Slovakia': 'EUR',
  'Slovenia': 'EUR',
  'Estonia': 'EUR',
  'Latvia': 'EUR',
  'Lithuania': 'EUR',
  'Malta': 'EUR',
  'Cyprus': 'EUR',
};

export class InterestRateScraper {
  private lastRequestTime = 0;
  private cachedRates: InterestRateData[] = [];
  private lastFetchTime = 0;
  private cacheDuration = 60 * 60 * 1000;

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
      console.error(`[InterestRates] Failed to fetch ${url}:`, error);
      throw error;
    }
  }

  private parseInterestRates(html: string): InterestRateData[] {
    const $ = cheerio.load(html);
    const rates: InterestRateData[] = [];
    const seenCurrencies = new Set<string>();

    $('table tbody tr').each((_, element) => {
      try {
        const $row = $(element);
        const cells = $row.find('td');
        
        if (cells.length < 7) return;

        const countryCell = $(cells[0]);
        const country = countryCell.find('a').first().text().trim() || countryCell.text().trim();
        
        if (!country) return;

        const centralBankCode = $(cells[1]).text().trim();
        const centralBank = $(cells[2]).find('a').text().trim() || $(cells[2]).text().trim();
        const currentRateStr = $(cells[3]).text().trim().replace('%', '');
        const previousRateStr = $(cells[4]).text().trim().replace('%', '');
        const changeStr = $(cells[5]).text().trim().replace('bp', '');
        const lastMeeting = $(cells[6]).text().trim();
        const nextMeeting = $(cells[7])?.text().trim() || '';

        const currentRate = parseFloat(currentRateStr);
        const previousRate = parseFloat(previousRateStr);
        const changeInBps = parseInt(changeStr, 10) || 0;

        if (isNaN(currentRate)) return;

        const currency = CURRENCY_MAP[country] || this.inferCurrency(country, centralBankCode);
        
        if (!currency) return;

        if (!MAJOR_CURRENCIES.includes(currency)) return;

        if (seenCurrencies.has(currency)) return;
        seenCurrencies.add(currency);

        rates.push({
          country,
          currency,
          centralBank,
          centralBankCode,
          currentRate,
          previousRate: isNaN(previousRate) ? currentRate : previousRate,
          changeInBps,
          lastMeeting,
          nextMeeting,
          lastUpdated: new Date(),
          isLiveData: true,
        });
      } catch (error) {
        console.error('[InterestRates] Error parsing row:', error);
      }
    });

    return rates;
  }

  private inferCurrency(country: string, centralBankCode: string): string | null {
    if (centralBankCode === 'FED' || country.includes('United States')) return 'USD';
    if (centralBankCode === 'ECB') return 'EUR';
    if (centralBankCode === 'BOE') return 'GBP';
    if (centralBankCode === 'BOJ' && country.includes('Japan')) return 'JPY';
    if (centralBankCode === 'BOC') return 'CAD';
    if (centralBankCode === 'RBA') return 'AUD';
    if (centralBankCode === 'RBNZ') return 'NZD';
    if (centralBankCode === 'SNB') return 'CHF';
    if (centralBankCode === 'PBC' || centralBankCode === 'PBOC') return 'CNY';
    return null;
  }

  async scrape(): Promise<InterestRateData[]> {
    const now = Date.now();
    if (this.cachedRates.length > 0 && (now - this.lastFetchTime) < this.cacheDuration) {
      console.log('[InterestRates] Returning cached rates');
      return this.cachedRates;
    }

    try {
      console.log('[InterestRates] Fetching interest rates from MyFXBook...');
      const html = await this.fetchHTML('https://www.myfxbook.com/forex-economic-calendar/interest-rates');
      const rates = this.parseInterestRates(html);
      
      if (rates.length > 0) {
        this.cachedRates = rates;
        this.lastFetchTime = now;
        console.log(`[InterestRates] Successfully scraped ${rates.length} interest rates`);
        return rates;
      } else {
        console.log('[InterestRates] No rates parsed from HTML');
        if (this.cachedRates.length > 0) {
          console.log('[InterestRates] Returning previously cached rates');
          return this.cachedRates;
        }
        return this.getDefaultRates();
      }
    } catch (error) {
      console.error('[InterestRates] Scrape failed:', error);
      if (this.cachedRates.length > 0) {
        console.log('[InterestRates] Returning previously cached rates');
        return this.cachedRates;
      }
      return this.getDefaultRates();
    }
  }

  private getDefaultRates(): InterestRateData[] {
    console.log('[InterestRates] WARNING: Using fallback default rates (not live data)');
    return [
      { country: 'United States', currency: 'USD', centralBank: 'Federal Reserve', centralBankCode: 'FED', currentRate: 4.50, previousRate: 4.75, changeInBps: -25, lastMeeting: 'N/A', nextMeeting: 'N/A', lastUpdated: new Date(), isLiveData: false },
      { country: 'Euro Area', currency: 'EUR', centralBank: 'European Central Bank', centralBankCode: 'ECB', currentRate: 2.15, previousRate: 2.40, changeInBps: -25, lastMeeting: 'N/A', nextMeeting: 'N/A', lastUpdated: new Date(), isLiveData: false },
      { country: 'United Kingdom', currency: 'GBP', centralBank: 'Bank of England', centralBankCode: 'BOE', currentRate: 4.00, previousRate: 4.25, changeInBps: -25, lastMeeting: 'N/A', nextMeeting: 'N/A', lastUpdated: new Date(), isLiveData: false },
      { country: 'Japan', currency: 'JPY', centralBank: 'Bank of Japan', centralBankCode: 'BOJ', currentRate: 0.50, previousRate: 0.25, changeInBps: 25, lastMeeting: 'N/A', nextMeeting: 'N/A', lastUpdated: new Date(), isLiveData: false },
      { country: 'Canada', currency: 'CAD', centralBank: 'Bank of Canada', centralBankCode: 'BOC', currentRate: 3.75, previousRate: 4.25, changeInBps: -50, lastMeeting: 'N/A', nextMeeting: 'N/A', lastUpdated: new Date(), isLiveData: false },
      { country: 'Australia', currency: 'AUD', centralBank: 'Reserve Bank of Australia', centralBankCode: 'RBA', currentRate: 4.35, previousRate: 4.35, changeInBps: 0, lastMeeting: 'N/A', nextMeeting: 'N/A', lastUpdated: new Date(), isLiveData: false },
      { country: 'New Zealand', currency: 'NZD', centralBank: 'Reserve Bank of New Zealand', centralBankCode: 'RBNZ', currentRate: 4.25, previousRate: 4.75, changeInBps: -50, lastMeeting: 'N/A', nextMeeting: 'N/A', lastUpdated: new Date(), isLiveData: false },
      { country: 'Switzerland', currency: 'CHF', centralBank: 'Swiss National Bank', centralBankCode: 'SNB', currentRate: 1.00, previousRate: 1.25, changeInBps: -25, lastMeeting: 'N/A', nextMeeting: 'N/A', lastUpdated: new Date(), isLiveData: false },
      { country: 'China', currency: 'CNY', centralBank: "People's Bank of China", centralBankCode: 'PBOC', currentRate: 3.00, previousRate: 3.10, changeInBps: -10, lastMeeting: 'N/A', nextMeeting: 'N/A', lastUpdated: new Date(), isLiveData: false },
    ];
  }

  async getInterestRateForCurrency(currency: string): Promise<InterestRateData | null> {
    const rates = await this.scrape();
    return rates.find(r => r.currency === currency.toUpperCase()) || null;
  }

  async getInterestRateDifferential(baseCurrency: string, quoteCurrency: string): Promise<{ differential: number; baseRate: number; quoteRate: number } | null> {
    const rates = await this.scrape();
    const baseRate = rates.find(r => r.currency === baseCurrency.toUpperCase());
    const quoteRate = rates.find(r => r.currency === quoteCurrency.toUpperCase());
    
    if (!baseRate || !quoteRate) return null;
    
    return {
      differential: baseRate.currentRate - quoteRate.currentRate,
      baseRate: baseRate.currentRate,
      quoteRate: quoteRate.currentRate,
    };
  }

  clearCache(): void {
    this.cachedRates = [];
    this.lastFetchTime = 0;
  }
}

export const interestRateScraper = new InterestRateScraper();
