import * as cron from 'node-cron';
import { economicCalendarScraper } from './economicCalendarScraper';
import { cacheService } from './cacheService';
import { scraperSettings } from './config';
import { telegramNotificationService } from '../services/telegramNotification';
import { signalScannerService } from '../services/signalScanner';

export class ScraperScheduler {
  private upcomingEventsJob: ReturnType<typeof cron.schedule> | null = null;
  private fullWeekJob: ReturnType<typeof cron.schedule> | null = null;
  private cleanupJob: ReturnType<typeof cron.schedule> | null = null;
  private notificationJob: ReturnType<typeof cron.schedule> | null = null;
  private signalScanJob: ReturnType<typeof cron.schedule> | null = null;
  private signalCleanupJob: ReturnType<typeof cron.schedule> | null = null;
  private scraperJobs: ReturnType<typeof cron.schedule>[] = [];
  private isRunning = false;

  async fetchEvents(): Promise<void> {
    if (this.isRunning) {
      console.log('[Calendar] Fetch already in progress, skipping...');
      return;
    }

    try {
      this.isRunning = true;
      console.log('[Calendar] Starting web scraper...');
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
    await this.fetchEvents();
  }

  async runFullWeekScrape(): Promise<void> {
    await this.fetchEvents();
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

  private setupScraperSchedule(): void {
    this.scraperJobs.forEach(job => job.stop());
    this.scraperJobs = [];

    // Pre-London session fetch (10 min before open)
    this.scraperJobs.push(
      cron.schedule('50 7 * * 1-5', async () => {
        console.log('[Calendar] Pre-London fetch (10 min before open)');
        await this.fetchEvents();
      }, { timezone: 'Europe/London' })
    );

    // Pre-NY session fetch (10 min before open)
    this.scraperJobs.push(
      cron.schedule('20 9 * * 1-5', async () => {
        console.log('[Calendar] Pre-NY fetch (10 min before open)');
        await this.fetchEvents();
      }, { timezone: 'America/New_York' })
    );

    // Hourly fetch during trading hours (every 2 hours)
    this.scraperJobs.push(
      cron.schedule('0 */2 * * 1-5', async () => {
        console.log('[Calendar] Scheduled hourly fetch');
        await this.fetchEvents();
      }, { timezone: 'UTC' })
    );

    // Weekend fetch
    this.scraperJobs.push(
      cron.schedule('0 12 * * 0,6', async () => {
        console.log('[Calendar] Weekend fetch');
        await this.fetchEvents();
      }, { timezone: 'UTC' })
    );

    console.log('[Calendar] Web scraper scheduled:');
    console.log('  - Pre-London session (7:50 London time)');
    console.log('  - Pre-NY session (9:20 NY time)');
    console.log('  - Every 2 hours on weekdays');
    console.log('  - Weekend maintenance at noon UTC');
  }

  start(): void {
    console.log('Starting economic calendar scheduler (scraper only)...');

    this.setupScraperSchedule();

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

    this.fetchEvents();
    signalScannerService.scanMarkets();
  }

  stop(): void {
    console.log('Stopping economic calendar scheduler...');
    
    this.scraperJobs.forEach(job => job.stop());
    this.scraperJobs = [];

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
