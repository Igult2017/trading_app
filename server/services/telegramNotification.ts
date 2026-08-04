import TelegramBot from 'node-telegram-bot-api';
import { db } from '../db';
import { telegramSubscribers, economicEvents } from '@shared/schema';
import { eq, and, lte, gte } from 'drizzle-orm';
import { format } from 'date-fns';
import { buildDailySchedule, shouldStillFire } from './marketSessionAlerts';

// Session definitions and the whole "what fires when" decision live in marketSessionAlerts so the
// weekend rule is testable on any day of the week. The local HIGH_VOLUME_SESSIONS const that used
// to sit here is gone — it was only read by the scheduler this now delegates.

export class TelegramNotificationService {
  private bot: TelegramBot | null = null;
  private isInitialized = false;
  private pollingRetryCount = 0;
  private maxPollingRetries = 5;
  private _eventTimers: NodeJS.Timeout[] = [];
  private _sessionTimers: NodeJS.Timeout[] = [];

  static async create(): Promise<TelegramNotificationService> {
    const service = new TelegramNotificationService();
    await service.initialize();
    return service;
  }

  private constructor() {}

  private async initialize(): Promise<void> {
    try {
      console.log('[Telegram] Initializing bot...');

      let token = process.env.TELEGRAM_BOT_TOKEN_CLEAN || process.env.TELEGRAM_BOT_TOKEN;
      
      if (!token) {
        console.log('[Telegram] TELEGRAM_BOT_TOKEN not found - bot disabled');
        return;
      }

      token = token.trim().replace(/[\r\n\t\s]/g, '');

      const tokenPattern = /^\d+:[A-Za-z0-9_-]+$/;
      if (!tokenPattern.test(token)) {
        console.error('[Telegram] Invalid token format');
        return;
      }

      const testBot = new TelegramBot(token, { polling: false });
      
      try {
        const botInfo = await testBot.getMe();
        console.log(`[Telegram] Bot verified: @${botInfo.username}`);
      } catch (verifyError: any) {
        console.error('[Telegram] Failed to verify bot:', verifyError.message);
        return;
      }

      try {
        console.log('[Telegram] Clearing any pending updates and releasing previous connections...');
        
        await (testBot as any).deleteWebHook({ drop_pending_updates: true });
        
        try {
          const updates = await testBot.getUpdates({ offset: -1, limit: 1, timeout: 0 });
          if (updates && updates.length > 0) {
            const lastUpdateId = updates[updates.length - 1].update_id;
            await testBot.getUpdates({ offset: lastUpdateId + 1, limit: 1, timeout: 0 });
          }
        } catch (updateError: any) {
          console.log('[Telegram] Could not clear update queue:', updateError.message);
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (clearError: any) {
        console.log('[Telegram] Could not clear pending updates:', clearError.message);
      }

      this.bot = new TelegramBot(token, { 
        polling: {
          interval: 5000,
          autoStart: false,
          params: { 
            timeout: 30,
            allowed_updates: ['message', 'callback_query']
          }
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.bot.startPolling();

      this.bot.on('polling_error', async (error: any) => {
        if (error.code === 'ETELEGRAM' && error.response?.statusCode === 409) {
          this.pollingRetryCount++;
          
          if (this.pollingRetryCount <= this.maxPollingRetries) {
            console.log(`[Telegram] Polling conflict detected (attempt ${this.pollingRetryCount}/${this.maxPollingRetries}) - waiting before retry...`);
            
            if (this.bot) {
              this.bot.stopPolling();
            }
            
            const waitTime = Math.min(5000 * this.pollingRetryCount, 30000);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            try {
              const freshBot = new TelegramBot(token!, { polling: false });
              await (freshBot as any).deleteWebHook({ drop_pending_updates: true });
            } catch (e) {
            }
            
            if (this.bot) {
              this.bot.startPolling();
            }
          } else {
            console.log('[Telegram] Max polling retries reached - bot will operate in send-only mode');
            this.bot?.stopPolling();
          }
        } else if (error.code === 'EFATAL') {
          console.error('[Telegram] Fatal polling error - stopping polling');
          this.bot?.stopPolling();
        } else {
          console.error('[Telegram] Polling error:', error.message || error.code);
        }
      });

      this.bot.on('message', () => {
        this.pollingRetryCount = 0;
      });

      this.isInitialized = true;
      this.setupCommands();
      console.log('[Telegram] Bot ready with polling enabled');

    } catch (error: any) {
      console.error('[Telegram] Init error:', error.message || error);
    }
  }

  private setupCommands(): void {
    if (!this.bot) return;

    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const chatIdStr = chatId.toString();
      const user = msg.from;

      console.log(`[Telegram] /start from ${user?.username || chatId}`);

      try {
        const existing = await db
          .select()
          .from(telegramSubscribers)
          .where(eq(telegramSubscribers.chatId, chatIdStr))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(telegramSubscribers).values({
            chatId: chatIdStr,
            username: user?.username || null,
            firstName: user?.first_name || null,
            lastName: user?.last_name || null,
            phoneNumber: null,
            isActive: true,
            createdAt: new Date()
          });

          await this.bot!.sendMessage(chatId, 
            `Welcome to FSDZones Trading Alerts!\n\nYou are now subscribed to receive:\n- Trading signal alerts\n- High-impact economic news\n- Session opening notifications\n\nCommands:\n/stop - Pause notifications\n/resume - Resume notifications\n/status - Check subscription status`
          );
          console.log(`[Telegram] New subscriber: ${user?.username || chatId}`);

        } else if (!existing[0].isActive) {
          await db
            .update(telegramSubscribers)
            .set({ isActive: true })
            .where(eq(telegramSubscribers.chatId, chatIdStr));

          await this.bot!.sendMessage(chatId, `Welcome back! Your notifications have been resumed.`);
          console.log(`[Telegram] Reactivated subscriber: ${user?.username || chatId}`);

        } else {
          await this.bot!.sendMessage(chatId, `You are already subscribed!\n\nCommands:\n/stop - Pause notifications\n/status - Check status`);
        }

      } catch (error: any) {
        console.error('[Telegram] /start error:', error.message);
        try {
          await this.bot!.sendMessage(chatId, `Welcome to FSDZones! There was a minor issue, but your subscription is being processed. Please try /status in a moment.`);
        } catch (sendError) {
          console.error('[Telegram] Failed to send fallback message:', sendError);
        }
      }
    });

    this.bot.onText(/\/stop/, async (msg) => {
      const chatId = msg.chat.id;
      const chatIdStr = chatId.toString();

      try {
        await db
          .update(telegramSubscribers)
          .set({ isActive: false })
          .where(eq(telegramSubscribers.chatId, chatIdStr));

        await this.bot?.sendMessage(chatId, `Notifications paused. Send /resume to restart.`);
        console.log(`[Telegram] Subscriber paused: ${chatId}`);
      } catch (error: any) {
        console.error('[Telegram] /stop error:', error.message);
        await this.bot?.sendMessage(chatId, `Your notifications have been paused.`);
      }
    });

    this.bot.onText(/\/resume/, async (msg) => {
      const chatId = msg.chat.id;
      const chatIdStr = chatId.toString();

      try {
        await db
          .update(telegramSubscribers)
          .set({ isActive: true })
          .where(eq(telegramSubscribers.chatId, chatIdStr));

        await this.bot?.sendMessage(chatId, `Notifications resumed! You will now receive alerts.`);
        console.log(`[Telegram] Subscriber resumed: ${chatId}`);
      } catch (error: any) {
        console.error('[Telegram] /resume error:', error.message);
        await this.bot?.sendMessage(chatId, `Your notifications have been resumed.`);
      }
    });

    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      const chatIdStr = chatId.toString();

      try {
        const subscriber = await db
          .select()
          .from(telegramSubscribers)
          .where(eq(telegramSubscribers.chatId, chatIdStr))
          .limit(1);

        if (subscriber.length === 0) {
          await this.bot?.sendMessage(chatId, `You are not subscribed. Send /start to subscribe.`);
        } else {
          const status = subscriber[0].isActive ? 'Active' : 'Paused';
          const since = subscriber[0].createdAt
            ? format(new Date(subscriber[0].createdAt), 'MMM dd, yyyy')
            : 'Unknown';

          await this.bot?.sendMessage(chatId, 
            `Subscription Status: ${status}\nSubscribed since: ${since}\n\nCommands:\n${subscriber[0].isActive ? '/stop - Pause' : '/resume - Resume'}`
          );
        }
      } catch (error: any) {
        console.error('[Telegram] /status error:', error.message);
        await this.bot?.sendMessage(chatId, `Your subscription is active. Use /stop to pause notifications.`);
      }
    });
  }

  async sendMessage(chatId: string | number, message: string, options?: any): Promise<boolean> {
    if (!this.bot) {
      return false;
    }

    try {
      await this.bot.sendMessage(chatId, message, options);
      return true;
    } catch (error: any) {
      console.error(`[Telegram] Failed to send to ${chatId}:`, error.message);
      return false;
    }
  }

  async sendPhoto(chatId: string | number, photo: Buffer | string, options?: any): Promise<boolean> {
    if (!this.bot) {
      return false;
    }

    try {
      await this.bot.sendPhoto(chatId, photo, options);
      return true;
    } catch (error: any) {
      console.error(`[Telegram] Failed to send photo to ${chatId}:`, error.message);
      return false;
    }
  }

  /** Post to the PUBLIC CHANNEL (TELEGRAM_CHAT_ID) — one message, one destination.
   *
   * `broadcastMessage` fans out to `telegram_subscribers`, i.e. people who DM'd the bot /start.
   * Session-open announcements are not that: they are a public post, and routing them through the
   * subscriber fan-out meant they never reached the channel at all — which is what the user saw.
   */
  async sendToChannel(message: string, options?: any): Promise<boolean> {
    const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim().replace(/^['"]|['"]$/g, "");
    if (!this.bot || !chatId) {
      console.warn("[Telegram] channel post skipped — %s",
        !this.bot ? "no bot" : "TELEGRAM_CHAT_ID not set");
      return false;
    }
    try {
      await this.bot.sendMessage(chatId, message, options);
      return true;
    } catch (error) {
      console.error("[Telegram] channel post FAILED:", error);
      return false;
    }
  }

  async broadcastMessage(message: string, options?: any): Promise<{ sent: number; failed: number }> {
    if (!this.bot) {
      return { sent: 0, failed: 0 };
    }

    try {
      const subscribers = await db
        .select()
        .from(telegramSubscribers)
        .where(eq(telegramSubscribers.isActive, true));

      let sent = 0;
      let failed = 0;

      for (const subscriber of subscribers) {
        try {
          await this.bot.sendMessage(subscriber.chatId, message, options);
          sent++;
        } catch (error) {
          failed++;
        }
      }

      if (sent > 0) {
        console.log(`[Telegram] Broadcast sent to ${sent} subscribers`);
      }

      return { sent, failed };
    } catch (error: any) {
      console.error('[Telegram] Broadcast error:', error.message);
      return { sent: 0, failed: 0 };
    }
  }

  async sendTradingSignalNotification(signal: {
    symbol: string;
    type: string;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    overallConfidence: number;
    strategy?: string;
    riskRewardRatio?: number;
    timeframe?: string;
    entryType?: string;
    trend?: string;
    htfTimeframe?: string;
    zoneType?: string;
    zoneTimeframe?: string;
    refinedTimeframe?: string;
    assetClass?: string;
  }): Promise<{ sent: number; failed: number }> {
    if (!this.bot) {
      return { sent: 0, failed: 0 };
    }

    const direction = signal.type === 'buy' ? 'BUY' : 'SELL';
    const typeIcon = signal.type === 'buy' ? '🟢' : '🔴';

    const rr = signal.riskRewardRatio
      ? signal.riskRewardRatio.toFixed(2)
      : Math.abs(
          (signal.takeProfit - signal.entryPrice) /
          (signal.entryPrice - signal.stopLoss)
        ).toFixed(2);

    const confidenceBar = signal.overallConfidence >= 80
      ? '🔥 High'
      : signal.overallConfidence >= 65
      ? '⚡ Moderate'
      : '⚠️ Low';

    const lines: string[] = [
      `${typeIcon} *${signal.symbol}* — ${direction}`,
      ``,
      `📍 Entry:      \`${signal.entryPrice}\``,
      `🛑 Stop Loss:  \`${signal.stopLoss}\``,
      `🎯 Take Profit:\`${signal.takeProfit}\``,
      `📊 R:R         1:${rr}`,
      ``,
      `🧠 Confidence: ${signal.overallConfidence}% (${confidenceBar})`,
    ];

    if (signal.strategy) {
      lines.push(`📐 Strategy:   ${signal.strategy}`);
    }
    if (signal.timeframe) {
      lines.push(`⏱ Timeframe:  ${signal.timeframe}`);
    }
    if (signal.entryType) {
      lines.push(`🔍 Entry Type: ${signal.entryType.replace(/_/g, ' ')}`);
    }
    if (signal.trend && signal.htfTimeframe) {
      lines.push(`📈 HTF Trend:  ${signal.trend.toUpperCase()} (${signal.htfTimeframe})`);
    }
    if (signal.zoneType && signal.zoneTimeframe) {
      lines.push(`🗺 Zone:       ${signal.zoneType} @ ${signal.zoneTimeframe}`);
    }
    if (signal.assetClass) {
      lines.push(`🏷 Asset:      ${signal.assetClass}`);
    }

    const message = lines.join('\n');
    return this.broadcastMessage(message, { parse_mode: 'Markdown' });
  }

  getBot(): TelegramBot | null {
    return this.bot;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async addSubscriber(chatId: string, username?: string, firstName?: string, lastName?: string): Promise<boolean> {
    try {
      const existing = await db
        .select()
        .from(telegramSubscribers)
        .where(eq(telegramSubscribers.chatId, chatId))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(telegramSubscribers).values({
          chatId,
          username: username || null,
          firstName: firstName || null,
          lastName: lastName || null,
          phoneNumber: null,
          isActive: true,
          createdAt: new Date()
        });
      } else if (!existing[0].isActive) {
        await db
          .update(telegramSubscribers)
          .set({ isActive: true })
          .where(eq(telegramSubscribers.chatId, chatId));
      }
      return true;
    } catch (error: any) {
      console.error('[Telegram] Add subscriber error:', error.message);
      return false;
    }
  }

  async removeSubscriber(chatId: string): Promise<boolean> {
    try {
      await db
        .update(telegramSubscribers)
        .set({ isActive: false })
        .where(eq(telegramSubscribers.chatId, chatId));
      return true;
    } catch (error: any) {
      console.error('[Telegram] Remove subscriber error:', error.message);
      return false;
    }
  }

  scheduleEventNotifications(events: Array<{ id: string | number; eventTime: Date | string; impactLevel: string; currency?: string; title: string; expectedValue?: string; previousValue?: string }>): void {
    if (!this.bot || !this.isInitialized) return;

    this._eventTimers.forEach(t => clearTimeout(t));
    this._eventTimers = [];

    const now = Date.now();
    const ALERT_MS = 15 * 60 * 1000;
    const MAX_MS   = 48 * 60 * 60 * 1000;

    for (const event of events) {
      if (event.impactLevel?.toLowerCase() !== 'high') continue;
      const eventMs  = new Date(event.eventTime).getTime();
      const fireAt   = eventMs - ALERT_MS;
      const delay    = fireAt - now;
      if (delay < 0 || delay > MAX_MS) continue;

      const t = setTimeout(async () => {
        const message = `📊 *HIGH IMPACT EVENT — 15 MIN WARNING*\n\n${event.currency ?? ''} - ${event.title}\nTime: ${format(new Date(event.eventTime), 'HH:mm')} UTC${event.expectedValue ? `\nForecast: ${event.expectedValue}` : ''}${event.previousValue ? `\nPrevious: ${event.previousValue}` : ''}`;
        const result = await this.broadcastMessage(message, { parse_mode: 'Markdown' }).catch(() => ({ sent: 0 }));
        if (result.sent > 0) console.log(`[Telegram] Event alert sent: ${event.title} (${result.sent} subscribers)`);
      }, delay);
      this._eventTimers.push(t);
    }
    console.log(`[Telegram] Scheduled ${this._eventTimers.length} event alert(s)`);
  }

  /**
   * Schedule today's market-week alerts. Re-run by cron at midnight UTC.
   *
   * The schedule itself lives in `marketSessionAlerts.buildDailySchedule` so it can be tested
   * without waiting for a Saturday. This method only owns timers. It used to compute the times
   * inline with NO weekday check at all, which announced "London Session Opening in 15 min" every
   * Saturday and Sunday morning with the market shut.
   */
  scheduleTradingSessionNotifications(): void {
    if (!this.bot || !this.isInitialized) return;

    this._sessionTimers.forEach(t => clearTimeout(t));
    this._sessionTimers = [];

    const planned = buildDailySchedule(new Date());
    for (const alert of planned) {
      const delay = alert.at.getTime() - Date.now();
      if (delay < 0) continue;                         // already past today
      const t = setTimeout(async () => {
        // Re-check on FIRING, not only on scheduling — hours pass in between.
        if (!shouldStillFire(alert.kind)) {
          console.log(`[Telegram] ${alert.kind} suppressed — market closed at fire time`);
          return;
        }
        // HTML, not Markdown: the session copy uses <blockquote> for the risk rule, which legacy
        // Markdown cannot express. `sessionMessages` builds HTML and escapes `&` in "Trade&Journal"
        // — the two must stay in step, or Telegram rejects the message and nobody is told anything.
        const ok = await this.sendToChannel(alert.message, { parse_mode: 'HTML' }).catch(() => false);
        console.log(`[Telegram] ${alert.kind} -> channel: ${ok ? 'sent' : 'FAILED'}`);
      }, delay);
      this._sessionTimers.push(t);
    }
    const kinds = planned.map(a => a.kind).join(', ') || 'none';
    console.log(`[Telegram] Scheduled ${this._sessionTimers.length} market alert(s) today [${kinds}]`);
  }

  stopPolling(): void {
    if (this.bot) {
      this.bot.stopPolling();
      console.log('[Telegram] Polling stopped');
    }
  }
}

let telegramNotificationService: TelegramNotificationService | null = null;

// Re-enabled so price alerts (and other Telegram notifications) actually fire.
const TELEGRAM_MUTED = false;

export const telegramReady: Promise<void> = (async () => {
  if (TELEGRAM_MUTED) {
    console.log('[Telegram] Service is muted. Notifications disabled.');
    return;
  }
  try {
    telegramNotificationService = await TelegramNotificationService.create();
    if (telegramNotificationService?.isReady()) {
      console.log('[Telegram] Service ready - users can subscribe via /start');
    }
  } catch (error) {
    console.error('[Telegram] Failed to initialize:', error);
  }
})();
// `telegramReady` resolves when the bot has finished initialising. The scrapers scheduler used to
// call `telegramNotificationService?.scheduleTradingSessionNotifications()` at startup, while this
// IIFE was still running — the optional chain hit `null`, no timers were ever created, and NO
// session alert fired all day. The startup log ordering shows it plainly:
//     [Telegram] Initializing bot...
//     Starting economic calendar scheduler...      <- schedules against null
//     [Telegram] Bot ready with polling enabled    <- service exists only now
// The midnight cron would have recovered it, but every deploy restarts the container and loses the
// rest of that day again.

export { telegramNotificationService };
