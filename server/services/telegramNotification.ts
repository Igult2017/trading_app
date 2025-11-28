// Force TELEGRAM_ENABLED to true (for dev/standalone use)
process.env.TELEGRAM_ENABLED = 'true';

import TelegramBot from 'node-telegram-bot-api';
import { db } from '../db';
import { telegramSubscribers, economicEvents } from '@shared/schema';
import { eq, and, lte, gte } from 'drizzle-orm';
import { format } from 'date-fns';
import { notificationService } from './notificationService';
import { 
  generateTradingSignalChart, 
  readChartAsBuffer, 
  ChartCandle, 
  ZoneInfo 
} from './chartGenerator';
import { fetchMultiTimeframeData } from '../strategies/shared/multiTimeframe';

interface TradingSession {
  name: string;
  openUTC: number;
  closeUTC: number;
}

const HIGH_VOLUME_SESSIONS: TradingSession[] = [
  { name: 'London', openUTC: 8, closeUTC: 16.5 },
  { name: 'New York', openUTC: 13, closeUTC: 22 }
];

class TelegramNotificationService {
  private bot: TelegramBot | null = null;
  private isInitialized = false;
  private notifiedSessions = new Set<string>();

  static async create(): Promise<TelegramNotificationService> {
    const service = new TelegramNotificationService();
    await service.initialize();
    return service;
  }

  private constructor() {}

  private async initialize() {
    try {
      // Telegram is always enabled
      console.log('[Telegram] Initializing bot...');
      let token = process.env.TELEGRAM_BOT_TOKEN_CLEAN || process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        console.error('❌ TELEGRAM_BOT_TOKEN not found.');
        return;
      }

      token = token.trim().replace(/[\r\n\t\s]/g, '');
      if (!(token.length >= 44 && token.length <= 50 && token.includes(':AA'))) {
        const match = token.match(/(\d{9,10}:AA[A-Za-z0-9_-]{30,40})/);
        if (match) {
          token = match[1];
        }
      }
      const tokenPattern = /^\d+:[A-Za-z0-9_-]+$/;
      if (!tokenPattern.test(token)) {
        console.error('❌ TELEGRAM_BOT_TOKEN has invalid format.');
        return;
      }

      const testBot = new TelegramBot(token, { polling: false });
      const botInfo = await testBot.getMe();
      console.log(`✅ Telegram bot verified: @${botInfo.username}`);

      this.bot = new TelegramBot(token, {
        polling: {
          interval: 2000,
          autoStart: true,
          params: { timeout: 10 }
        }
      });

      this.bot.on('polling_error', (error: any) => {
        const code = error?.code || 'UNKNOWN';
        const message = error?.message || 'Unknown error';
        if (code === 'ETELEGRAM' && message.includes('404')) {
          console.error('❌ Telegram bot token is invalid (404). Stopping bot.');
          this.bot?.stopPolling();
          this.isInitialized = false;
        } else if (code === 'EFATAL') {
          console.error('❌ Telegram fatal error:', message);
        } else {
          console.error(`Telegram polling error [${code}]:`, message);
        }
      });

      this.isInitialized = true;
      this.setupCommands();
      console.log('✅ Telegram bot initialized successfully with polling');
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('404')) {
        console.error('❌ Telegram bot token is invalid or bot was deleted.');
      } else if (errorMessage.includes('401')) {
        console.error('❌ Telegram bot token is unauthorized.');
      } else {
        console.error('❌ Failed to initialize Telegram bot:', errorMessage);
      }
    }
  }

  private setupCommands() {
    if (!this.bot) return;

    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id.toString();
      const user = msg.from;
      try {
        const existing = await db.select().from(telegramSubscribers)
          .where(eq(telegramSubscribers.chatId, chatId))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(telegramSubscribers).values({
            chatId,
            username: user?.username || null,
            firstName: user?.first_name || null,
            lastName: user?.last_name || null,
            phoneNumber: null,
            isActive: true,
          });
          await this.bot!.sendMessage(
            chatId,
            `✅ Welcome to Infod Trading Alerts!\n\n` +
            `You're now subscribed to receive Telegram notifications for:\n` +
            `🔔 Trading Sessions - 5 min before London & NY open\n` +
            `📊 High/Medium impact economic events\n\n` +
            `ℹ️ Other notifications (like trading signals) can be viewed on the dashboard.\n\n` +
            `Commands:\n` +
            `/stop - Pause notifications\n` +
            `/resume - Resume notifications\n` +
            `/status - Check subscription status`
          );
        } else if (!existing[0].isActive) {
          await db.update(telegramSubscribers).set({ isActive: true })
            .where(eq(telegramSubscribers.chatId, chatId));
          await this.bot!.sendMessage(chatId, `✅ Welcome back! Your notifications have been resumed.`);
        } else {
          await this.bot!.sendMessage(chatId,
            `👋 You're already subscribed!\n\nUse /status to check your subscription.`);
        }
      } catch (error) {
        console.error('Error handling /start:', error);
        await this.bot!.sendMessage(chatId, '❌ Something went wrong. Try again later.');
      }
    });

    this.bot.onText(/\/stop/, async (msg) => {
      const chatId = msg.chat.id.toString();
      try {
        await db.update(telegramSubscribers).set({ isActive: false })
          .where(eq(telegramSubscribers.chatId, chatId));
        await this.bot!.sendMessage(chatId, `⏸️ Notifications paused.\n\nUse /resume to start receiving alerts again.`);
      } catch (error) {
        console.error('Error handling /stop:', error);
      }
    });

    this.bot.onText(/\/resume/, async (msg) => {
      const chatId = msg.chat.id.toString();
      try {
        await db.update(telegramSubscribers).set({ isActive: true })
          .where(eq(telegramSubscribers.chatId, chatId));
        await this.bot!.sendMessage(chatId, `▶️ Notifications resumed!\n\nYou'll receive alerts for upcoming events.`);
      } catch (error) {
        console.error('Error handling /resume:', error);
      }
    });

    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id.toString();
      try {
        const subscriber = await db.select().from(telegramSubscribers)
          .where(eq(telegramSubscribers.chatId, chatId)).limit(1);

        if (subscriber.length === 0) {
          await this.bot!.sendMessage(chatId, `❌ You're not subscribed yet.\n\nUse /start to subscribe.`);
        } else {
          const status = subscriber[0].isActive ? '✅ Active' : '⏸️ Paused';
          const subDate = format(new Date(subscriber[0].createdAt!), 'MMM dd, yyyy');
          await this.bot!.sendMessage(
            chatId,
            `📊 Subscription Status: ${status}\n` +
            `📅 Subscribed since: ${subDate}\n\n` +
            `Receiving Telegram notifications for:\n` +
            `• Trading sessions (London & NY)\n` +
            `• High/Medium impact economic events\n\n` +
            `ℹ️ View all notifications on the dashboard`
          );
        }
      } catch (error) {
        console.error('Error handling /status:', error);
      }
    });
  }

  // ... (rest of your methods: sendEventNotification, checkAndNotifyUpcomingEvents, etc. -- no critical changes needed to those)

  getBot(): TelegramBot | null {
    return this.bot;
  }
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Export as an async Promise to guarantee readiness for consumers
const telegramNotificationServicePromise = TelegramNotificationService.create();

export { telegramNotificationServicePromise };
