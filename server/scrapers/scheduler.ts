import * as cron from 'node-cron';
import { economicCalendarScraper } from './economicCalendarScraper';
import { cacheService } from './cacheService';
import { scraperSettings } from './config';
import { telegramNotificationService } from '../services/telegramNotification';
import { signalScannerService } from '../services/signalScanner';
import { eodhdService } from '../services/eodhd';

export class ScraperScheduler {
  private upcomingEventsJob: ReturnType<typeof cron.schedule> | null = null;
  private fullWeekJob: ReturnType<typeof cron.schedule> | null = null;
  private cleanupJob: ReturnType<typeof cron.schedule> | null = null;
  private notificationJob: ReturnType<typeof cron.schedule> | null = null;
  private signalScanJob: ReturnType<typeof cron.schedule> | null = null;
  private signalCleanupJob: ReturnType<typeof cron.schedule> | null = null;
  private eodhdJobs: ReturnType<typeof cron.schedule>[] = [];
  private isRunning = false;

  async fetchWithEODHDPriority(): Promise<void> {
    if (this.isRunning) {
      console.log('[Calendar] Fetch already in progress, skipping...');
      return;
    }

    try {
      this.isRunning = true;
      const status = eodhdService.getStatus();
      
      if (status.available && status.callsRemaining > 0) {
        console.log(`[Calendar] Using EODHD API (${status.callsRemaining} calls remaining)`);
        const count = await eodhdService.fetchAndStoreEvents();
        
        if (count > 0) {
          console.log(`[Calendar] EODHD fetched ${count} events successfully`);
          return;
        }
        console.log('[Calendar] EODHD returned no events, falling back to scraper');
      } else {
        console.log(`[Calendar] EODHD unavailable (${status.callsRemaining} calls remaining), using scraper`);
      }

      console.log('[Calendar] Starting web scraper fallback...');
      const events = await economicCalendarScraper.scrapeWithRetry();
      if (events.length > 0) {
        await cacheService.storeEvents(events);
        console.log(`[Calendar] Scraper fetched ${events.length} events`);
      } else {
        console.log('[Calendar] Scraper returned no events');
      }
    } catch (error) {
      console.error('[Calendar] Error during fetch:', error);
    } finally {
      this.isRunning = false;
    }
  }

  async runUpcomingEventsScrape(): Promise<void> {
    await this.fetchWithEODHDPriority();
  }

  async runFullWeekScrape(): Promise<void> {
    await this.fetchWithEODHDPriority();
  }

  async runCleanup(): Promise<void> {
    try {
      console.log('Running cleanup of old events...');
      await cacheService.cleanupOldEvents();
      console.log('Cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  private setupEODHDSchedule(): void {
    this.eodhdJobs.forEach(job => job.stop());
    this.eodhdJobs = [];

    this.eodhdJobs.push(
      cron.schedule('50 7 * * 1-5', async () => {
        console.log('[EODHD] Pre-London fetch (10 min before open)');
        await this.fetchWithEODHDPriority();
      }, { timezone: 'Europe/London' })
    );

    this.eodhdJobs.push(
      cron.schedule('20 9 * * 1-5', async () => {
        console.log('[EODHD] Pre-NY fetch (10 min before open)');
        await this.fetchWithEODHDPriority();
      }, { timezone: 'America/New_York' })
    );

    const londonHours = [9, 11, 13, 15, 17];
    londonHours.forEach((hour, index) => {
      this.eodhdJobs.push(
        cron.schedule(`0 ${hour} * * 1-5`, async () => {
          console.log(`[EODHD] London session fetch #${index + 1}`);
          await this.fetchWithEODHDPriority();
        }, { timezone: 'Europe/London' })
      );
    });

    const nyHours = [10, 11, 13, 14, 15];
    nyHours.forEach((hour, index) => {
      this.eodhdJobs.push(
        cron.schedule(`30 ${hour} * * 1-5`, async () => {
          console.log(`[EODHD] NY session fetch #${index + 1}`);
          await this.fetchWithEODHDPriority();
        }, { timezone: 'America/New_York' })
      );
    });

    const offHours = [6, 19, 22];
    offHours.forEach((hour, index) => {
      this.eodhdJobs.push(
        cron.schedule(`0 ${hour} * * 1-5`, async () => {
          console.log(`[EODHD] Off-hours fetch #${index + 1}`);
          await this.fetchWithEODHDPriority();
        }, { timezone: 'UTC' })
      );
    });

    this.eodhdJobs.push(
      cron.schedule('0 12 * * 0,6', async () => {
        console.log('[EODHD] Weekend fetch');
        await this.fetchWithEODHDPriority();
      }, { timezone: 'UTC' })
    );

    console.log('[EODHD] Strategic API calls scheduled (20/day):');
    console.log('  - 2 calls: 10 min before London/NY sessions');
    console.log('  - 5 calls: During London session hours');
    console.log('  - 5 calls: During NY session hours');
    console.log('  - 3 calls: Off-hours coverage');
    console.log('  - 1 call: Weekend maintenance');
    console.log('  - Fallback: Web scraper when API exhausted');
  }

  start(): void {
    console.log('Starting economic calendar scheduler with EODHD priority...');

    this.setupEODHDSchedule();

    const cleanupIntervalHours = Math.floor(
      scraperSettings.cacheSettings.cleanupInterval / (60 * 60 * 1000)
    );
    const cleanupCronPattern = `0 */${cleanupIntervalHours} * * *`;
    
    this.cleanupJob = cron.schedule(cleanupCronPattern, async () => {
      await this.runCleanup();
    });

    this.notificationJob = cron.schedule('*/5 * * * *', async () => {
      console.log('Checking for events and sessions to notify...');
      await telegramNotificationService.checkAndNotifyUpcomingEvents();
      await telegramNotificationService.checkAndNotifyTradingSessions();
    });

    this.signalScanJob = cron.schedule('*/1 * * * *', async () => {
      console.log('Running automated signal market scan...');
      await signalScannerService.scanMarkets();
    });

    this.signalCleanupJob = cron.schedule('0 */2 * * *', async () => {
      console.log('Running signal cleanup...');
      await signalScannerService.cleanupExpiredSignals();
    });

    console.log(`Scheduled cleanup: every ${cleanupIntervalHours} hours`);
    console.log('Scheduled Telegram notifications: every 5 minutes');
    console.log('Scheduled signal scanning: every 1 minute');
    console.log('Scheduled signal cleanup: every 2 hours');

    this.fetchWithEODHDPriority();
    signalScannerService.scanMarkets();
  }

  stop(): void {
    console.log('Stopping economic calendar scheduler...');
    
    this.eodhdJobs.forEach(job => job.stop());
    this.eodhdJobs = [];

    if (this.upcomingEventsJob) {
      this.upcomingEventsJob.stop();
      this.upcomingEventsJob = null;
    }
    
    if (this.fullWeekJob) {
      this.fullWeekJob.stop();
      this.fullWeekJob = null;
    }
    
    if (this.cleanupJob) {
      this.cleanupJob.stop();
      this.cleanupJob = null;
    }

    if (this.notificationJob) {
      this.notificationJob.stop();
      this.notificationJob = null;
    }

    if (this.signalScanJob) {
      this.signalScanJob.stop();
      this.signalScanJob = null;
    }

    if (this.signalCleanupJob) {
      this.signalCleanupJob.stop();
      this.signalCleanupJob = null;
    }
    
    console.log('Scheduler stopped');
  }
}

export const scraperScheduler = new ScraperScheduler();
