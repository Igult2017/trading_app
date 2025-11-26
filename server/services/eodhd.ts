import axios from 'axios';
import { db } from '../db';
import { economicEvents, InsertEconomicEvent } from '@shared/schema';
import { gte, and, eq } from 'drizzle-orm';

interface EODHDEvent {
  date: string;
  country: string;
  actual: string | null;
  previous: string | null;
  estimate: string | null;
  event: string;
  impact: string;
  change: string | null;
  change_percentage: string | null;
  unit: string | null;
}

interface APICallLog {
  timestamp: Date;
  success: boolean;
}

class EODHDService {
  private apiKey: string | undefined;
  private baseUrl = 'https://eodhd.com/api/economic-events';
  private dailyCallLimit = 20;
  private callsToday: APICallLog[] = [];
  private lastResetDate: string = '';

  constructor() {
    this.apiKey = process.env.EODHD_API_KEY;
  }

  private resetDailyCounterIfNeeded(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastResetDate !== today) {
      this.callsToday = [];
      this.lastResetDate = today;
      console.log('[EODHD] Daily API call counter reset');
    }
  }

  getCallsRemaining(): number {
    this.resetDailyCounterIfNeeded();
    return this.dailyCallLimit - this.callsToday.length;
  }

  getCallsMadeToday(): number {
    this.resetDailyCounterIfNeeded();
    return this.callsToday.length;
  }

  canMakeCall(): boolean {
    return this.getCallsRemaining() > 0 && !!this.apiKey;
  }

  private countryToCode(country: string): string {
    const mapping: Record<string, string> = {
      'USA': 'USD',
      'United States': 'USD',
      'Eurozone': 'EUR',
      'Euro Area': 'EUR',
      'Germany': 'EUR',
      'France': 'EUR',
      'Italy': 'EUR',
      'Spain': 'EUR',
      'United Kingdom': 'GBP',
      'UK': 'GBP',
      'Japan': 'JPY',
      'Canada': 'CAD',
      'Australia': 'AUD',
      'New Zealand': 'NZD',
      'Switzerland': 'CHF',
      'China': 'CNY',
    };
    return mapping[country] || 'USD';
  }

  private getRegionFromCountry(country: string): string {
    const regionMapping: Record<string, string> = {
      'USA': 'Americas',
      'United States': 'Americas',
      'Canada': 'Americas',
      'Eurozone': 'Europe',
      'Euro Area': 'Europe',
      'Germany': 'Europe',
      'France': 'Europe',
      'Italy': 'Europe',
      'Spain': 'Europe',
      'United Kingdom': 'Europe',
      'UK': 'Europe',
      'Switzerland': 'Europe',
      'Japan': 'Asia',
      'China': 'Asia',
      'Australia': 'Asia-Pacific',
      'New Zealand': 'Asia-Pacific',
    };
    return regionMapping[country] || 'Other';
  }

  private mapImpact(impact: string): 'High' | 'Medium' | 'Low' {
    const impactLower = impact?.toLowerCase() || '';
    if (impactLower === 'high' || impactLower === '3') return 'High';
    if (impactLower === 'medium' || impactLower === '2') return 'Medium';
    return 'Low';
  }

  async fetchEvents(fromDate?: string, toDate?: string): Promise<EODHDEvent[]> {
    if (!this.apiKey) {
      console.log('[EODHD] No API key configured');
      return [];
    }

    if (!this.canMakeCall()) {
      console.log(`[EODHD] Daily limit reached (${this.dailyCallLimit} calls). Using scraper fallback.`);
      return [];
    }

    try {
      const params: Record<string, string> = {
        api_token: this.apiKey,
        fmt: 'json',
      };

      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;

      console.log(`[EODHD] Fetching events (call ${this.callsToday.length + 1}/${this.dailyCallLimit})`);
      
      const response = await axios.get<EODHDEvent[]>(this.baseUrl, { 
        params,
        timeout: 10000 
      });

      this.callsToday.push({ timestamp: new Date(), success: true });
      
      console.log(`[EODHD] Fetched ${response.data.length} events. Calls remaining: ${this.getCallsRemaining()}`);
      
      return response.data;
    } catch (error) {
      console.error('[EODHD] API error:', error);
      this.callsToday.push({ timestamp: new Date(), success: false });
      return [];
    }
  }

  async fetchAndStoreEvents(): Promise<number> {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const fromDate = today.toISOString().split('T')[0];
    const toDate = nextWeek.toISOString().split('T')[0];

    const events = await this.fetchEvents(fromDate, toDate);
    
    if (events.length === 0) {
      return 0;
    }

    try {
      const eventsToInsert: InsertEconomicEvent[] = events.map(event => {
        const eventTime = new Date(event.date);
        const currency = this.countryToCode(event.country);
        
        return {
          title: event.event,
          description: null,
          eventType: 'economic',
          country: event.country,
          countryCode: currency,
          region: this.getRegionFromCountry(event.country),
          currency: currency,
          impactLevel: this.mapImpact(event.impact),
          eventTime: eventTime,
          expectedValue: event.estimate || null,
          previousValue: event.previous || null,
          actualValue: event.actual || null,
          unit: event.unit || null,
          futuresImpliedExpectation: null,
          surpriseFactor: event.change_percentage || null,
          marketImpactAnalysis: null,
          affectedCurrencies: [currency],
          affectedStocks: null,
          isReleased: !!event.actual,
          sourceSite: 'EODHD',
          sourceUrl: 'https://eodhd.com/api/economic-events',
        };
      });

      await db.delete(economicEvents).where(
        and(
          gte(economicEvents.eventTime, new Date()),
          eq(economicEvents.sourceSite, 'EODHD')
        )
      );

      if (eventsToInsert.length > 0) {
        await db.insert(economicEvents).values(eventsToInsert);
      }

      console.log(`[EODHD] Stored ${eventsToInsert.length} events in database`);
      return eventsToInsert.length;
    } catch (error) {
      console.error('[EODHD] Error storing events:', error);
      return 0;
    }
  }

  getStatus(): { available: boolean; callsRemaining: number; callsMade: number } {
    return {
      available: !!this.apiKey,
      callsRemaining: this.getCallsRemaining(),
      callsMade: this.getCallsMadeToday(),
    };
  }
}

export const eodhdService = new EODHDService();
