import * as cron from 'node-cron';
import { economicCalendarScraper } from './economicCalendarScraper';
import { cacheService } from './cacheService';
import { scraperSettings } from './config';
import { telegramNotificationService } from '../services/telegramNotification';

export class ScraperScheduler {
  private upcomingEventsJob: ReturnType<typeof cron.schedule> | null = null;
  private fullWeekJob: ReturnType<typeof cron.schedule> | null = null;
  private cleanupJob: ReturnType<typeof cron.schedule> | null = null;
  private notificationJob: ReturnType<typeof cron.schedule> | null = null;
  private isRunning = false;

  async runUpcomingEventsScrape(): Promise<void> {
    if (this.isRunning) {
      console.log('Scrape already in progress, skipping...');
      return;
    }

    try {
      this.isRunning = true;
      console.log('Starting upcoming events scrape...');
      
      const events = await economicCalendarScraper.scrapeWithRetry();
      if (events.length > 0) {
        await cacheService.storeEvents(events);
        console.log(`Successfully scraped and stored ${events.length} events`);
      } else {
        console.log('No events scraped');
      }
    } catch (error) {
      console.error('Error during upcoming events scrape:', error);
    } finally {
      this.isRunning = false;
    }
  }

  async runFullWeekScrape(): Promise<void> {
    try {
      console.log('Starting full week scrape...');
      
      const events = await economicCalendarScraper.scrapeWithRetry();
      if (events.length > 0) {
        await cacheService.storeEvents(events);
        console.log(`Successfully scraped and stored ${events.length} events for the week`);
      } else {
        console.log('No events scraped for the week');
      }
    } catch (error) {
      console.error('Error during full week scrape:', error);
    }
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

  start(): void {
    console.log('Starting economic calendar scraper scheduler...');

    const upcomingIntervalMinutes = Math.floor(
      scraperSettings.schedules.upcomingEventsInterval / (60 * 1000)
    );
    const upcomingCronPattern = `*/${upcomingIntervalMinutes} * * * *`;
    
    this.upcomingEventsJob = cron.schedule(upcomingCronPattern, async () => {
      await this.runUpcomingEventsScrape();
    });

    this.fullWeekJob = cron.schedule(scraperSettings.schedules.fullWeekScrapeTime, async () => {
      await this.runFullWeekScrape();
    });

    const cleanupIntervalHours = Math.floor(
      scraperSettings.cacheSettings.cleanupInterval / (60 * 60 * 1000)
    );
    const cleanupCronPattern = `0 */${cleanupIntervalHours} * * *`;
    
    this.cleanupJob = cron.schedule(cleanupCronPattern, async () => {
      await this.runCleanup();
    });

    this.notificationJob = cron.schedule('*/5 * * * *', async () => {
      console.log('Checking for events to notify...');
      await telegramNotificationService.checkAndNotifyUpcomingEvents();
    });

    console.log(`Scheduled upcoming events scrape: every ${upcomingIntervalMinutes} minutes`);
    console.log(`Scheduled full week scrape: ${scraperSettings.schedules.fullWeekScrapeTime}`);
    console.log(`Scheduled cleanup: every ${cleanupIntervalHours} hours`);
    console.log(`Scheduled Telegram notifications check: every 5 minutes`);

    this.runUpcomingEventsScrape();
  }

  stop(): void {
    console.log('Stopping economic calendar scraper scheduler...');
    
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
    
    console.log('Scheduler stopped');
  }
}

export const scraperScheduler = new ScraperScheduler();
