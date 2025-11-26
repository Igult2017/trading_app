import cron, { ScheduledTask } from 'node-cron';
import { eodhdService } from './eodhd';
import { EconomicCalendarScraper } from '../scrapers/economicCalendarScraper';
import { CacheService } from '../scrapers/cacheService';

class EODHDScheduler {
  private scraper: EconomicCalendarScraper;
  private cacheService: CacheService;
  private scheduledJobs: ScheduledTask[] = [];

  constructor() {
    this.scraper = new EconomicCalendarScraper();
    this.cacheService = new CacheService();
  }

  async fetchWithFallback(): Promise<void> {
    const status = eodhdService.getStatus();
    
    if (status.available && status.callsRemaining > 0) {
      console.log(`[Scheduler] Using EODHD API (${status.callsRemaining} calls remaining)`);
      const count = await eodhdService.fetchAndStoreEvents();
      
      if (count > 0) {
        console.log(`[Scheduler] EODHD fetched ${count} events successfully`);
        return;
      }
    }

    console.log('[Scheduler] Falling back to web scraper');
    try {
      await this.cacheService.getOrFetchEvents('week', this.scraper);
      console.log('[Scheduler] Scraper fallback completed');
    } catch (error) {
      console.error('[Scheduler] Scraper fallback failed:', error);
    }
  }

  start(): void {
    console.log('[EODHD Scheduler] Initializing smart API call distribution...');
    
    this.scheduledJobs.forEach(job => job.stop());
    this.scheduledJobs = [];

    this.scheduledJobs.push(
      cron.schedule('50 7 * * 1-5', async () => {
        console.log('[EODHD] Pre-London fetch #1 (10 min before open)');
        await this.fetchWithFallback();
      }, { timezone: 'Europe/London' })
    );

    this.scheduledJobs.push(
      cron.schedule('55 7 * * 1-5', async () => {
        console.log('[EODHD] Pre-London fetch #2 (5 min before open)');
        await this.fetchWithFallback();
      }, { timezone: 'Europe/London' })
    );

    this.scheduledJobs.push(
      cron.schedule('20 9 * * 1-5', async () => {
        console.log('[EODHD] Pre-NY fetch #1 (10 min before open)');
        await this.fetchWithFallback();
      }, { timezone: 'America/New_York' })
    );

    this.scheduledJobs.push(
      cron.schedule('25 9 * * 1-5', async () => {
        console.log('[EODHD] Pre-NY fetch #2 (5 min before open)');
        await this.fetchWithFallback();
      }, { timezone: 'America/New_York' })
    );

    const londonHours = [9, 10, 12, 14, 16];
    londonHours.forEach((hour, index) => {
      this.scheduledJobs.push(
        cron.schedule(`0 ${hour} * * 1-5`, async () => {
          console.log(`[EODHD] London session fetch #${index + 1}`);
          await this.fetchWithFallback();
        }, { timezone: 'Europe/London' })
      );
    });

    const nyHours = [10, 11, 13, 14, 15];
    nyHours.forEach((hour, index) => {
      this.scheduledJobs.push(
        cron.schedule(`30 ${hour} * * 1-5`, async () => {
          console.log(`[EODHD] NY session fetch #${index + 1}`);
          await this.fetchWithFallback();
        }, { timezone: 'America/New_York' })
      );
    });

    const offHours = [6, 18, 21];
    offHours.forEach((hour, index) => {
      this.scheduledJobs.push(
        cron.schedule(`0 ${hour} * * 1-5`, async () => {
          console.log(`[EODHD] Off-hours fetch #${index + 1}`);
          await this.fetchWithFallback();
        }, { timezone: 'UTC' })
      );
    });

    this.scheduledJobs.push(
      cron.schedule('0 12 * * 0,6', async () => {
        console.log('[EODHD] Weekend maintenance fetch');
        await this.fetchWithFallback();
      }, { timezone: 'UTC' })
    );

    console.log('[EODHD Scheduler] Scheduled 20 strategic API calls:');
    console.log('  - 2 calls: 10 & 5 min before London open (7:50, 7:55 GMT)');
    console.log('  - 2 calls: 10 & 5 min before NY open (9:20, 9:25 EST)');
    console.log('  - 5 calls: During London session (9, 10, 12, 14, 16 GMT)');
    console.log('  - 5 calls: During NY session (10:30, 11:30, 13:30, 14:30, 15:30 EST)');
    console.log('  - 3 calls: Off-hours coverage (6, 18, 21 UTC)');
    console.log('  - 1 call: Weekend maintenance (12:00 UTC Sat/Sun)');
    console.log('  - Fallback: Web scraper when API limit reached');

    this.fetchWithFallback().then(() => {
      console.log('[EODHD Scheduler] Initial fetch completed');
    });
  }

  stop(): void {
    this.scheduledJobs.forEach(job => job.stop());
    this.scheduledJobs = [];
    console.log('[EODHD Scheduler] Stopped all scheduled jobs');
  }

  getStatus(): {
    apiStatus: { available: boolean; callsRemaining: number; callsMade: number };
    scheduledJobs: number;
  } {
    return {
      apiStatus: eodhdService.getStatus(),
      scheduledJobs: this.scheduledJobs.length,
    };
  }
}

export const eodhdScheduler = new EODHDScheduler();
