import { db } from '../db';
import { economicEvents, InsertEconomicEvent } from '@shared/schema';
import { eq, gte, lte, and, sql, inArray, isNull } from 'drizzle-orm';
import { ScrapedEvent } from './economicCalendarScraper';
import { scraperSettings } from './config';

export class CacheService {
  private cacheDuration = scraperSettings.cacheSettings.cacheDuration;
  private dataRetentionDays = scraperSettings.cacheSettings.dataRetentionDays;

  async isCacheFresh(): Promise<boolean> {
    try {
      const recentEvent = await db
        .select()
        .from(economicEvents)
        .where(
          gte(
            economicEvents.lastScraped,
            new Date(Date.now() - this.cacheDuration)
          )
        )
        .limit(1);

      return recentEvent.length > 0;
    } catch (error) {
      console.error('Error checking cache freshness:', error);
      return false;
    }
  }

  async storeEvents(scrapedEvents: ScrapedEvent[]): Promise<void> {
    if (scrapedEvents.length === 0) {
      console.log('No events to store');
      return;
    }

    try {
      const eventsToInsert: InsertEconomicEvent[] = scrapedEvents.map(event => ({
        title: event.title,
        description: null,
        eventType: 'economic',
        country: event.country,
        countryCode: event.countryCode || null,
        region: this.getRegionFromCountry(event.country),
        currency: event.currency || event.countryCode || 'USD',
        impactLevel: event.impactLevel,
        eventTime: event.eventTime,
        expectedValue: event.expectedValue || null,
        previousValue: event.previousValue || null,
        actualValue: event.actualValue || null,
        unit: null,
        futuresImpliedExpectation: null,
        surpriseFactor: null,
        marketImpactAnalysis: null,
        affectedCurrencies: event.currency ? [event.currency] : null,
        affectedStocks: null,
        isReleased: !!event.actualValue,
        sourceSite: event.sourceSite,
        sourceUrl: event.sourceUrl,
      }));

      await db.delete(economicEvents).where(
        and(
          gte(economicEvents.eventTime, new Date()),
          eq(economicEvents.sourceSite, scrapedEvents[0].sourceSite)
        )
      );

      await db.insert(economicEvents).values(eventsToInsert);

      console.log(`Stored ${eventsToInsert.length} events in cache`);
    } catch (error) {
      console.error('Error storing events:', error);
      throw error;
    }
  }

  async getUpcomingEvents(hoursAhead: number = 24): Promise<typeof economicEvents.$inferSelect[]> {
    try {
      const now = new Date();
      const futureTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

      const events = await db
        .select()
        .from(economicEvents)
        .where(
          and(
            gte(economicEvents.eventTime, now),
            sql`${economicEvents.eventTime} <= ${futureTime}`
          )
        )
        .orderBy(economicEvents.eventTime);

      return events;
    } catch (error) {
      console.error('Error fetching upcoming events:', error);
      return [];
    }
  }

  async getTodayEvents(): Promise<typeof economicEvents.$inferSelect[]> {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      const events = await db
        .select()
        .from(economicEvents)
        .where(
          and(
            gte(economicEvents.eventTime, startOfDay),
            sql`${economicEvents.eventTime} < ${endOfDay}`
          )
        )
        .orderBy(economicEvents.eventTime);

      return events;
    } catch (error) {
      console.error('Error fetching today events:', error);
      return [];
    }
  }

  async getWeekEvents(): Promise<typeof economicEvents.$inferSelect[]> {
    try {
      const now = new Date();
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const events = await db
        .select()
        .from(economicEvents)
        .where(
          and(
            gte(economicEvents.eventTime, now),
            sql`${economicEvents.eventTime} <= ${weekLater}`
          )
        )
        .orderBy(economicEvents.eventTime);

      return events;
    } catch (error) {
      console.error('Error fetching week events:', error);
      return [];
    }
  }

  /**
   * Returns true when a High or Medium impact event is scheduled to release
   * within the next `windowMinutes` minutes AND has not yet published an actual.
   * This is a pure DB query — zero network cost.
   */
  async hasImminentHighMediumEvent(windowMinutes: number = 35): Promise<boolean> {
    try {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);
      // Also catch events that released up to 10 min ago but still have no actual
      const windowStart = new Date(now.getTime() - 10 * 60 * 1000);

      const hits = await db
        .select({ id: economicEvents.id })
        .from(economicEvents)
        .where(
          and(
            gte(economicEvents.eventTime, windowStart),
            lte(economicEvents.eventTime, windowEnd),
            inArray(economicEvents.impactLevel, ['High', 'Medium']),
            isNull(economicEvents.actualValue)
          )
        )
        .limit(1);

      return hits.length > 0;
    } catch (error) {
      console.error('[CacheService] Error checking imminent events:', error);
      return false;
    }
  }

  async cleanupOldEvents(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.dataRetentionDays);

      await db
        .delete(economicEvents)
        .where(sql`${economicEvents.eventTime} < ${cutoffDate}`);

      console.log(`Cleaned up events older than ${this.dataRetentionDays} days`);
    } catch (error) {
      console.error('Error cleaning up old events:', error);
    }
  }

  private getRegionFromCountry(country: string): string {
    const regionMap: Record<string, string> = {
      'United States': 'Americas',
      'Canada': 'Americas',
      'Eurozone': 'Europe',
      'Euro Zone': 'Europe',
      'United Kingdom': 'Europe',
      'Switzerland': 'Europe',
      'Japan': 'Asia',
      'China': 'Asia',
      'Australia': 'Asia Pacific',
      'New Zealand': 'Asia Pacific',
    };

    return regionMap[country] || 'Global';
  }

  async getOrFetchEvents(
    type: 'today' | 'week' | 'upcoming',
    scraper: any
  ): Promise<typeof economicEvents.$inferSelect[]> {
    const isFresh = await this.isCacheFresh();

    if (!isFresh) {
      console.log('Cache is stale, fetching new data...');
      const scrapedEvents = await scraper.scrapeWithRetry();
      await this.storeEvents(scrapedEvents);
    }

    switch (type) {
      case 'today':
        return this.getTodayEvents();
      case 'week':
        return this.getWeekEvents();
      case 'upcoming':
        return this.getUpcomingEvents(24);
      default:
        return this.getTodayEvents();
    }
  }

  async getEventById(id: string): Promise<typeof economicEvents.$inferSelect | undefined> {
    try {
      const event = await db
        .select()
        .from(economicEvents)
        .where(eq(economicEvents.id, id))
        .limit(1);

      return event[0];
    } catch (error) {
      console.error('Error fetching event by ID:', error);
      return undefined;
    }
  }
}

export const cacheService = new CacheService();
