import * as cron from 'node-cron';
import { interestRateScraper } from './interestRateScraper';
import { cacheService } from './cacheService';
import { scraperSettings } from './config';
import { telegramNotificationService, telegramReady } from '../services/telegramNotification';
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

  // The economic_events table is kept fresh by the curl_cffi homepageCalendar path
  // (server/python/news_calendar.py). The old cloudscraper EconomicCalendarScraper that used to be
  // driven from here was redundant (Cloudflare-challenged from the datacenter IP, only ever logged
  // "All scrapers failed") and has been deleted, along with its fetch/scrape methods and cron jobs.

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

  start(): void {
    console.log('Starting economic calendar scheduler...');

    // Calendar scraping is handled by the curl_cffi homepageCalendar path, not here — the
    // redundant cloudscraper EconomicCalendarScraper and its cron jobs were deleted.

    // ── Cleanup — remove events older than retention window ───────────────────
    this.cleanupJob = cron.schedule('0 1 * * *', async () => {
      await this.runCleanup();
    }, { timezone: 'UTC' });

    // ── 5. Telegram session alerts — reschedule at midnight UTC each day ────
    this._jobs.notifications.enabled = true;
    // WAIT FOR THE BOT. `telegramNotificationService` is created by an async IIFE in
    // telegramNotification.ts, and this line ran while that was still in flight — the optional
    // chain hit `null`, no timers were created, and NOT ONE session alert fired. The startup log
    // ordering shows it: "Starting economic calendar scheduler..." lands BETWEEN "[Telegram]
    // Initializing bot..." and "[Telegram] Bot ready".
    // The midnight cron below would have recovered the next day, but every deploy restarts the
    // container and loses the rest of that day again — which is why it never appeared to work.
    telegramReady
      .then(() => telegramNotificationService?.scheduleTradingSessionNotifications())
      .catch(err => console.error('[scheduler] session alerts not scheduled:', err));
    this.notificationJob = cron.schedule('0 0 * * *', () => {
      telegramNotificationService?.scheduleTradingSessionNotifications();
      this._jobs.notifications.lastRunAt = Date.now();
      this._jobs.notifications.lastResult = 'success';
    }, { timezone: 'UTC' });

    // Signal scanning disabled
    // Interest rate scraper disabled

    console.log('MyFXBook (cloudscraper) scraper: DELETED — economic_events is fed by the curl_cffi');
    console.log('  homepageCalendar path (news_calendar.py).');
    console.log('  • Cleanup:              01:00 UTC daily (still active)');
    console.log('Interest rate scraper:   DISABLED');
    console.log('Telegram notifications:  event-driven (scheduled per event)');
    console.log('Signal scanning:         PYTHON SIGNAL PLATFORM (EUR/USD — see [SignalPlatform] logs)');
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
