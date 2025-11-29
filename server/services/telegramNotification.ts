import TelegramBot from 'node-telegram-bot-api';
import { db } from '../db';
import { telegramSubscribers, economicEvents } from '@shared/schema';
import { eq, and, lte, gte } from 'drizzle-orm';
import { format } from 'date-fns';

interface TradingSession {
  name: string;
  openUTC: number;
  closeUTC: number;
}

const HIGH_VOLUME_SESSIONS: TradingSession[] = [
  { name: 'London', openUTC: 8, closeUTC: 16.5 },
  { name: 'New York', openUTC: 13, closeUTC: 22 }
];

export class TelegramNotificationService {
  private bot: TelegramBot | null = null;
  private isInitialized = false;
  private notifiedSessions = new Set<string>();
  private notifiedEvents = new Set<string>();

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

      this.bot = new TelegramBot(token, { 
        polling: {
          interval: 3000,
          autoStart: true,
          params: { timeout: 10 }
        }
      });

      this.bot.on('polling_error', (error: any) => {
        if (error.code === 'ETELEGRAM' && error.response?.statusCode === 409) {
          console.log('[Telegram] Polling conflict (another instance running) - will retry...');
        } else {
          console.error('[Telegram] Polling error:', error.message || error.code);
        }
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
            `Welcome to Trading Alerts!\n\nYou are now subscribed to receive:\n- Trading signal alerts\n- High-impact economic news\n- Session opening notifications\n\nCommands:\n/stop - Pause notifications\n/resume - Resume notifications\n/status - Check subscription status`
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
        await this.bot!.sendMessage(chatId, `Sorry, there was an error. Please try again later.`);
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
    type: 'buy' | 'sell';
    entry: number;
    stopLoss: number;
    takeProfit: number;
    confidence: number;
    strategy?: string;
  }): Promise<{ sent: number; failed: number }> {
    if (!this.bot) {
      return { sent: 0, failed: 0 };
    }

    const typeIcon = signal.type === 'buy' ? '🟢' : '🔴';
    const riskReward = Math.abs((signal.takeProfit - signal.entry) / (signal.entry - signal.stopLoss)).toFixed(2);

    const message = `${typeIcon} *${signal.symbol}* - ${signal.type.toUpperCase()}

Entry: ${signal.entry}
Stop Loss: ${signal.stopLoss}
Take Profit: ${signal.takeProfit}
Risk/Reward: 1:${riskReward}
Confidence: ${signal.confidence}%
${signal.strategy ? `Strategy: ${signal.strategy}` : ''}`;

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

  async checkAndNotifyUpcomingEvents(): Promise<void> {
    if (!this.bot || !this.isInitialized) return;

    try {
      const now = new Date();
      const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);

      const upcomingEvents = await db
        .select()
        .from(economicEvents)
        .where(
          and(
            gte(economicEvents.eventTime, now),
            lte(economicEvents.eventTime, fifteenMinutesFromNow),
            eq(economicEvents.impactLevel, 'high')
          )
        );

      for (const event of upcomingEvents) {
        const eventKey = `${event.id}-${event.eventTime}`;
        if (this.notifiedEvents.has(eventKey)) continue;

        const message = `📊 *HIGH IMPACT EVENT ALERT*

${event.currency} - ${event.title}
Time: ${format(new Date(event.eventTime), 'HH:mm')} UTC
Impact: ${event.impactLevel?.toUpperCase()}
${event.expectedValue ? `Forecast: ${event.expectedValue}` : ''}
${event.previousValue ? `Previous: ${event.previousValue}` : ''}`;

        const result = await this.broadcastMessage(message, { parse_mode: 'Markdown' });
        if (result.sent > 0) {
          this.notifiedEvents.add(eventKey);
          console.log(`[Telegram] Notified ${result.sent} subscribers about ${event.title}`);
        }
      }
    } catch (error: any) {
      console.error('[Telegram] Error checking upcoming events:', error.message);
    }
  }

  async checkAndNotifyTradingSessions(): Promise<void> {
    if (!this.bot || !this.isInitialized) return;

    try {
      const now = new Date();
      const currentHour = now.getUTCHours() + now.getUTCMinutes() / 60;
      const today = format(now, 'yyyy-MM-dd');

      for (const session of HIGH_VOLUME_SESSIONS) {
        const sessionKey = `${session.name}-${today}`;
        
        if (this.notifiedSessions.has(sessionKey)) continue;

        const minutesToOpen = (session.openUTC - currentHour) * 60;
        
        if (minutesToOpen > 0 && minutesToOpen <= 15) {
          const message = `🔔 *${session.name} Session Opening Soon*

The ${session.name} trading session opens in ~${Math.round(minutesToOpen)} minutes.

Session Hours: ${session.openUTC}:00 - ${session.closeUTC}:00 UTC
Expect increased volatility and volume.`;

          const result = await this.broadcastMessage(message, { parse_mode: 'Markdown' });
          if (result.sent > 0) {
            this.notifiedSessions.add(sessionKey);
            console.log(`[Telegram] Notified ${result.sent} subscribers about ${session.name} session`);
          }
        }
      }

      if (now.getUTCHours() === 0 && now.getUTCMinutes() < 5) {
        this.notifiedSessions.clear();
        this.notifiedEvents.clear();
      }
    } catch (error: any) {
      console.error('[Telegram] Error checking trading sessions:', error.message);
    }
  }

  stopPolling(): void {
    if (this.bot) {
      this.bot.stopPolling();
      console.log('[Telegram] Polling stopped');
    }
  }
}

let telegramNotificationService: TelegramNotificationService | null = null;

(async () => {
  try {
    telegramNotificationService = await TelegramNotificationService.create();
    if (telegramNotificationService?.isReady()) {
      console.log('[Telegram] Service ready - users can subscribe via /start');
    }
  } catch (error) {
    console.error('[Telegram] Failed to initialize:', error);
  }
})();

export { telegramNotificationService };
