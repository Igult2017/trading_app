import * as cron from 'node-cron';
import { economicCalendarScraper } from './economicCalendarScraper';
import { interestRateScraper } from './interestRateScraper';
import { cacheService } from './cacheService';
import { scraperSettings } from './config';
import { telegramNotificationService } from '../services/telegramNotification';
import { signalScannerService } from '../services/signalScanner';
import { storage } from '../storage';

export class ScraperScheduler {
  private upcomingEventsJob: ReturnType<typeof cron.schedule> | null = null;
  private fullWeekJob: ReturnType<typeof cron.schedule> | null = null;
  private cleanupJob: ReturnType<typeof cron.schedule> | null = null;
  private notificationJob: ReturnType<typeof cron.schedule> | null = null;
  private signalScanJob: ReturnType<typeof cron.schedule> | null = null;
  private signalCleanupJob: ReturnType<typeof cron.schedule> | null = null;
  private interestRateJob: ReturnType<typeof cron.schedule> | null = null;
  private scraperJobs: ReturnType<typeof cron.schedule>[] = [];
  private sessionAwareScanJobs: ReturnType<typeof cron.schedule>[] = [];
  private isRunning = false;

  private _jobs: Record<string, { enabled: boolean; lastRunAt: number | null; lastResult: 'success' | 'error' | null }> = {
    myfxbook:     { enabled: false, lastRunAt: null, lastResult: null },
    interestRates:{ enabled: false, lastRunAt: null, lastResult: null },
    signalScan:   { enabled: false, lastRunAt: null, lastResult: null },
    notifications:{ enabled: false, lastRunAt: null, lastResult: null },
  };

  getStatus() { return this._jobs; }

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
        telegramNotificationService?.scheduleEventNotifications(events as any);
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

  async fetchInterestRates(): Promise<void> {
    try {
      console.log('[InterestRates] Fetching latest rates...');
      const rates = await interestRateScraper.scrape();
      console.log(`[InterestRates] Fetched ${rates.length} rates`);
      
      const liveRates = rates.filter(r => r.isLiveData);
      if (liveRates.length === 0) {
        console.log('[InterestRates] No live data scraped, skipping database persistence');
        return;
      }
      
      for (const rate of liveRates) {
        try {
          await storage.upsertInterestRate({
            country: rate.country,
            currency: rate.currency,
            centralBank: rate.centralBank,
            centralBankCode: rate.centralBankCode,
            currentRate: rate.currentRate.toString(),
            previousRate: rate.previousRate.toString(),
            changeInBps: rate.changeInBps,
            lastMeeting: rate.lastMeeting,
            nextMeeting: rate.nextMeeting,
            lastUpdated: rate.lastUpdated,
          });
        } catch (err) {
          console.error(`[InterestRates] Failed to persist ${rate.currency}:`, err);
        }
      }
      console.log(`[InterestRates] Persisted ${liveRates.length} live rates to database`);
    } catch (error) {
      console.error('[InterestRates] Error during fetch:', error);
    }
  }

  private setupSessionAwareScanJobs(): void {
    this.sessionAwareScanJobs.forEach(job => job.stop());
    this.sessionAwareScanJobs = [];

    this.sessionAwareScanJobs.push(
      cron.schedule('0,15,30,45 7,8 * * 1-5', async () => {
        console.log('[SignalScanner] London session open - intensive scan (every 15 min)');
        await signalScannerService.scanMarkets();
      }, { timezone: 'UTC' })
    );

    this.sessionAwareScanJobs.push(
      cron.schedule('0,15,30,45 12,13,14 * * 1-5', async () => {
        console.log('[SignalScanner] NY session open - intensive scan (every 15 min)');
        await signalScannerService.scanMarkets();
      }, { timezone: 'UTC' })
    );

    console.log('[SignalScanner] Session-aware scanning configured:');
    console.log('  - London open (7:00-9:00 UTC): every 15 minutes');
    console.log('  - NY open (12:00-15:00 UTC): every 15 minutes');
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
    console.log('Starting economic calendar scheduler...');

    // ── 1. Daily full scrape — midnight UTC ──────────────────────────────────
    // Populates the full week of events so the watchdog has data to check.
    this._jobs.myfxbook.enabled = true;
    this.fullWeekJob = cron.schedule('0 0 * * *', async () => {
      console.log('[Calendar] Daily full scrape (midnight UTC)');
      await this.fetchEvents();
      this._jobs.myfxbook.lastRunAt = Date.now();
      this._jobs.myfxbook.lastResult = 'success';
    }, { timezone: 'UTC' });

    // ── 2. Every-5-min event watchdog ────────────────────────────────────────
    // Pure DB query — no network cost unless a High/Medium event is imminent.
    // Fires a real Myfxbook scrape only when an unreleased High/Medium event
    // is within 35 minutes (or released up to 10 min ago with no actual yet).
    this.upcomingEventsJob = cron.schedule('*/5 * * * *', async () => {
      try {
        const imminent = await cacheService.hasImminentHighMediumEvent(35);
        if (!imminent) return;
        console.log('[Calendar] Imminent High/Medium event detected — fetching actuals from Myfxbook');
        await this.fetchEvents();
        this._jobs.myfxbook.lastRunAt = Date.now();
        this._jobs.myfxbook.lastResult = 'success';
      } catch (err: any) {
        this._jobs.myfxbook.lastResult = 'error';
        console.error('[Calendar] Watchdog error:', err?.message);
      }
    }, { timezone: 'UTC' });

    // ── 3. Safety-net every-2-hour scrape on weekdays ────────────────────────
    // Catches any data drift and refreshes Low-impact events the watchdog skips.
    this.scraperJobs.push(
      cron.schedule('0 */2 * * 1-5', async () => {
        console.log('[Calendar] Safety-net 2-hour scrape');
        await this.fetchEvents();
        this._jobs.myfxbook.lastRunAt = Date.now();
        this._jobs.myfxbook.lastResult = 'success';
      }, { timezone: 'UTC' })
    );

    // ── 4. Cleanup — remove events older than retention window ───────────────
    this.cleanupJob = cron.schedule('0 1 * * *', async () => {
      await this.runCleanup();
    }, { timezone: 'UTC' });

    // ── 5. Telegram session alerts — reschedule at midnight UTC each day ────
    this._jobs.notifications.enabled = true;
    telegramNotificationService?.scheduleTradingSessionNotifications();
    this.notificationJob = cron.schedule('0 0 * * *', () => {
      telegramNotificationService?.scheduleTradingSessionNotifications();
      this._jobs.notifications.lastRunAt = Date.now();
      this._jobs.notifications.lastResult = 'success';
    }, { timezone: 'UTC' });

    // Signal scanning disabled
    // Interest rate scraper disabled

    console.log('MyFXBook scraper: ENABLED (event-aware)');
    console.log('  • Daily full scrape:    midnight UTC');
    console.log('  • Watchdog (5-min):     scrapes only when High/Medium event imminent');
    console.log('  • Safety-net:           every 2 hours on weekdays');
    console.log('  • Cleanup:              01:00 UTC daily');
    console.log('Interest rate scraper:   DISABLED');
    console.log('Telegram notifications:  event-driven (scheduled per event)');
    console.log('Signal scanning:         DISABLED');
  }

  stop(): void {
    console.log('Stopping economic calendar scheduler...');
    
    this.scraperJobs.forEach(job => job.stop());
    this.scraperJobs = [];

    this.sessionAwareScanJobs.forEach(job => job.stop());
    this.sessionAwareScanJobs = [];

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

    if (this.interestRateJob) {
      this.interestRateJob.stop();
      this.interestRateJob = null;
    }
    
    console.log('Scheduler stopped');
  }
}

export const scraperScheduler = new ScraperScheduler();
