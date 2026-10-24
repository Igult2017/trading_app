import * as cron from 'node-cron';
import { interestRateScraper } from './interestRateScraper';
import { cacheService } from './cacheService';
import { scraperSettings } from './config';
import { telegramNotificationService, telegramReady } from '../services/telegramNotification';
import { signalScannerService } from '../services/signalScanner';
import { storage } from '../storage';
import { db } from '../db';
import { economicEvents } from '@shared/schema';
import { and, gte, lte, sql } from 'drizzle-orm';
import { MAX_HORIZON_MS, groupReleases, outcomeMessage, affectedPairs } from '../services/newsAlerts';
import { refreshReleasedValues } from '../services/homepageCalendar';

export class ScraperScheduler {
  private upcomingEventsJob: ReturnType<typeof cron.schedule> | null = null;
  private fullWeekJob: ReturnType<typeof cron.schedule> | null = null;
  private cleanupJob: ReturnType<typeof cron.schedule> | null = null;
  private notificationJob: ReturnType<typeof cron.schedule> | null = null;
  private newsAlertJob: ReturnType<typeof cron.schedule> | null = null;
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

  /** Load the next few hours of HIGH-impact events and (re)arm their 15m / 5m warnings.
   *
   * Only rows still AHEAD of us are fetched — a past event cannot produce a future warning, and
   * pulling the whole calendar would make `buildNewsSchedule` sift thousands of rows every hour to
   * find a handful.
   */
  /** MINUTES AFTER A RELEASE AT WHICH TO LOOK FOR THE NUMBER.
   *
   * ⚠ THESE FOUR VALUES ARE A GUESS AND ARE MARKED AS ONE. How quickly Trading Economics fills a
   * released figure has NOT been measured — the ladder exists so a slow publisher does not cost the
   * message, and it stops at the first check that finds a value. Measure it against a real release
   * and set these from the measurement; do not let the guess harden into a fact. */
  private static readonly OUTCOME_CHECKS_MIN = [2, 5, 10, 15];

  /** Releases already reported, so the ladder and the hourly re-arm cannot send twice. */
  private _outcomeSent = new Set<string>();
  private _outcomeTimers: NodeJS.Timeout[] = [];

  /**
   * Arm the "what the number actually was" message for releases that have just happened or are
   * about to.
   *
   * HIS INSTRUCTION, 2026-10-25: *"the economic calendar should also send the outcome of news and
   * the expected move of specific pairs affected by that news after the news release."*
   *
   * WHY IT NEEDS ITS OWN PASS. The warning messages are built once from rows already in hand; this
   * one cannot be, because the number does not exist yet at arming time. Each check re-fetches the
   * released values (Trading Economics — the ForexFactory feed carries none), re-reads the rows,
   * and only then decides whether there is anything to say.
   *
   * ⚠ SILENCE IS THE DEFAULT. If the number has not been published, `outcomeMessage` returns "" and
   * nothing is sent. A message that says nothing is worse than no message.
   */
  private async refreshNewsOutcomes(): Promise<void> {
    try {
      this._outcomeTimers.forEach(t => clearTimeout(t));
      this._outcomeTimers = [];

      const now = new Date();
      // Releases from the recent past (whose number may now exist) through the next few hours.
      const from = new Date(now.getTime() - 60 * 60_000);
      const to   = new Date(now.getTime() + MAX_HORIZON_MS);
      const rows = await db.select().from(economicEvents)
        .where(and(gte(economicEvents.eventTime, from),
                   lte(economicEvents.eventTime, to),
                   sql`lower(${economicEvents.impactLevel}) = 'high'`));

      let armed = 0;
      for (const release of groupReleases(rows as any)) {
        const pairs = affectedPairs(release.currency);
        if (pairs.length === 0) continue;
        const key = 'outcome_' + release.currency + '_' + release.at.getTime();
        if (this._outcomeSent.has(key)) continue;

        for (const mins of ScraperScheduler.OUTCOME_CHECKS_MIN) {
          const delay = release.at.getTime() + mins * 60_000 - now.getTime();
          if (delay < 0 || delay > MAX_HORIZON_MS) continue;
          const t = setTimeout(() => { void this.trySendOutcome(key, release.at, release.currency); }, delay);
          this._outcomeTimers.push(t);
          armed += 1;
        }
      }
      console.log(`[scheduler] armed ${armed} news-outcome check(s)`);
    } catch (err) {
      console.error('[scheduler] news outcome refresh failed:', err);
    }
  }

  /** One rung of the ladder: fetch, re-read, and send only if the number is actually there. */
  private async trySendOutcome(key: string, at: Date, currency: string): Promise<void> {
    if (this._outcomeSent.has(key)) return;
    try {
      await refreshReleasedValues();          // pull whatever has been published since
      const pad = 90 * 1000;                  // the release's own minute, give or take
      const rows = await db.select().from(economicEvents)
        .where(and(gte(economicEvents.eventTime, new Date(at.getTime() - pad)),
                   lte(economicEvents.eventTime, new Date(at.getTime() + pad)),
                   sql`lower(${economicEvents.impactLevel}) = 'high'`));
      const release = groupReleases(rows as any).find(r => r.currency === currency);
      if (!release) return;

      const message = outcomeMessage(release, affectedPairs(currency));
      if (!message) return;                   // not published yet — say nothing, try the next rung

      const ok = await telegramNotificationService?.sendToChannel(message, { parse_mode: 'HTML' })
        .catch(() => false);
      if (ok) {
        this._outcomeSent.add(key);
        console.log(`[scheduler] news OUTCOME sent for ${key}`);
      }
    } catch (err) {
      console.error('[scheduler] news outcome send failed:', err);
    }
  }

  private async refreshNewsAlerts(): Promise<void> {
    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + MAX_HORIZON_MS);
      // ⚠ COMPARED IN LOWER CASE, AND THAT IS THE WHOLE BUG THIS LINE ONCE WAS.
      //
      // Until 2026-10-11 this read `eq(economicEvents.impactLevel, 'high')`. Every writer stores
      // 'High' with a capital H (news_calendar.py:293 -> calendarDb.ts:43, and calendarDb.ts:60
      // types the column High|Medium|Low), and Postgres text comparison is case-sensitive — so
      // this matched NOTHING, EVER. The feature shipped, logged "Scheduled 0 news warning(s)"
      // every hour, and in all that time not one high-impact warning reached the channel. He
      // reported it as never having seen one; production had 13 'High' events that week.
      //
      // `lower(...)` rather than swapping one spelling for another: the casing is set by a Python
      // scraper two files away, and the next person to change it must not be able to switch this
      // feature off again without noticing.
      const rows = await db.select().from(economicEvents)
        .where(and(gte(economicEvents.eventTime, now),
                   lte(economicEvents.eventTime, horizon),
                   sql`lower(${economicEvents.impactLevel}) = 'high'`));
      telegramNotificationService?.scheduleNewsNotifications(rows as any);
      void this.refreshNewsOutcomes();
    } catch (err) {
      // Never allowed to take the scheduler down — a missed news warning is a missed courtesy;
      // a dead scheduler also stops the session alerts and the cleanup.
      console.error('[scheduler] news alert refresh failed:', err);
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
      .then(() => {
        telegramNotificationService?.scheduleTradingSessionNotifications();
        return this.refreshNewsAlerts();
      })
      .catch(err => console.error('[scheduler] session/news alerts not scheduled:', err));

    // NEWS WARNINGS — refreshed HOURLY, not daily. `buildNewsSchedule` only looks 6 hours ahead
    // (a timer days long would outlive a revision to the calendar), so a once-a-day pass would
    // miss every release after the first six hours.
    this.newsAlertJob = cron.schedule('5 * * * *', () => this.refreshNewsAlerts(),
                                      { timezone: 'UTC' });
    this.notificationJob = cron.schedule('0 0 * * *', () => {
      telegramNotificationService?.scheduleTradingSessionNotifications();
      void this.refreshNewsAlerts();
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
