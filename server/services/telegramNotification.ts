// ✅ Force TELEGRAM_ENABLED to true - no env var needed
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

export class TelegramNotificationService {
  private bot: TelegramBot | null = null;
  private isInitialized = false;
  private notifiedSessions = new Set<string>();

  // ✅ Static factory method for proper async initialization
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
        console.error('❌ TELEGRAM_BOT_TOKEN not found. Telegram notifications disabled.');
        return;
      }

      token = token.trim().replace(/[\r\n\t\s]/g, '');
      const tokenPattern = /^\d+:[A-Za-z0-9_-]+$/;

      if (!tokenPattern.test(token)) {
        console.error('❌ TELEGRAM_BOT_TOKEN has invalid format. Expected: 123456789:ABCdef...');
        return;
      }

      const testBot = new TelegramBot(token, { polling: false });
      const botInfo = await testBot.getMe();
      console.log(`✅ Telegram bot verified: @${botInfo.username}`);

      this.bot = new TelegramBot(token, { 
        polling: { interval: 2000, autoStart: true, params: { timeout: 10 } }
      });

      this.bot.on('polling_error', (error: any) => {
        const errorCode = error?.code || 'UNKNOWN';
        const errorMessage = error?.message || 'Unknown error';
        console.error(`⚠️ Telegram polling error [${errorCode}]:`, errorMessage);
      });

      this.isInitialized = true;
      this.setupCommands();
      console.log('✅ Telegram bot initialized successfully');
    } catch (error: any) {
      console.error('❌ Failed to initialize Telegram bot:', error?.message || error);
    }
  }

  private setupCommands(): void {
    if (!this.bot) return;

    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id.toString();
      const user = msg.from;

      try {
        const existingSubscriber = await db
          .select()
          .from(telegramSubscribers)
          .where(eq(telegramSubscribers.chatId, chatId))
          .limit(1);

        if (existingSubscriber.length === 0) {
          await db.insert(telegramSubscribers).values({
            chatId,
            username: user?.username || null,
            firstName: user?.first_name || null,
            lastName: user?.last_name || null,
            phoneNumber: null,
            isActive: true,
          });

          await this.bot.sendMessage(
            chatId,
            `✅ Welcome to Infod Trading Alerts!\n\nYou're now subscribed to receive Telegram notifications for:\n` +
            `🔔 Trading Sessions - 5 min before London & NY open\n` +
            `📊 High & Medium impact economic events\n\n` +
            `Commands:\n` +
            `/stop - Pause notifications\n` +
            `/resume - Resume notifications\n` +
            `/status - Check subscription status`
          );
        } else if (!existingSubscriber[0].isActive) {
          await db.update(telegramSubscribers).set({ isActive: true }).where(eq(telegramSubscribers.chatId, chatId));
          await this.bot.sendMessage(chatId, `✅ Welcome back! Your notifications have been resumed.`);
        } else {
          await this.bot.sendMessage(chatId, `👋 You're already subscribed. Use /status to check your subscription.`);
        }
      } catch (error) {
        console.error('❌ Error handling /start command:', error);
        await this.bot.sendMessage(chatId, '❌ Something went wrong. Please try again later.');
      }
    });

    this.bot.onText(/\/stop/, async (msg) => {
      const chatId = msg.chat.id.toString();
      try {
        await db.update(telegramSubscribers).set({ isActive: false }).where(eq(telegramSubscribers.chatId, chatId));
        await this.bot.sendMessage(chatId, `⏸️ Notifications paused.\nUse /resume to start receiving alerts again.`);
      } catch (error) {
        console.error('❌ Error handling /stop command:', error);
      }
    });

    this.bot.onText(/\/resume/, async (msg) => {
      const chatId = msg.chat.id.toString();
      try {
        await db.update(telegramSubscribers).set({ isActive: true }).where(eq(telegramSubscribers.chatId, chatId));
        await this.bot.sendMessage(chatId, `▶️ Notifications resumed! You'll receive alerts for upcoming events.`);
      } catch (error) {
        console.error('❌ Error handling /resume command:', error);
      }
    });

    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id.toString();
      try {
        const subscriber = await db.select().from(telegramSubscribers).where(eq(telegramSubscribers.chatId, chatId)).limit(1);
        if (subscriber.length === 0) {
          await this.bot.sendMessage(chatId, `❌ You're not subscribed yet. Use /start to subscribe.`);
        } else {
          const status = subscriber[0].isActive ? '✅ Active' : '⏸️ Paused';
          const subDate = subscriber[0].createdAt ? format(new Date(subscriber[0].createdAt), 'MMM dd, yyyy') : 'Unknown';
          await this.bot.sendMessage(chatId, `📊 Status: ${status}\n📅 Subscribed since: ${subDate}`);
        }
      } catch (error) {
        console.error('❌ Error handling /status command:', error);
      }
    });
  }

  private formatPrice(price: any): string {
    if (price === null || price === undefined) return 'N/A';
    const num = parseFloat(price);
    if (isNaN(num)) return String(price);
    return num < 10 ? num.toFixed(5) : num.toFixed(2);
  }

  async sendTradingSignalNotification(signal: any): Promise<void> {
    try {
      if (!this.isInitialized || !this.bot) return;

      const subscribers = await db.select().from(telegramSubscribers).where(eq(telegramSubscribers.isActive, true));
      if (subscribers.length === 0) return;

      const direction = signal.type || signal.direction || 'buy';
      const typeEmoji = direction === 'buy' ? '🟢' : '🔴';
      const entryPrice = this.formatPrice(signal.entryPrice);
      const stopLoss = this.formatPrice(signal.stopLoss);
      const takeProfit = this.formatPrice(signal.takeProfit);
      const riskReward = signal.riskRewardRatio ? parseFloat(signal.riskRewardRatio).toFixed(2) : '2.00';
      const confidence = signal.overallConfidence || signal.confidence || 70;
      const timeframe = signal.timeframe || '15M';

      const telegramCaption = 
        `${typeEmoji} *${signal.symbol}* │ ${direction.toUpperCase()}\n` +
        `Entry: ${entryPrice} | SL: ${stopLoss} | TP: ${takeProfit}\n` +
        `R:R 1:${riskReward} | Confidence: ${confidence}%`;

      for (const subscriber of subscribers) {
        await this.bot.sendMessage(subscriber.chatId, telegramCaption, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      console.error('❌ Error sending trading signal to Telegram:', error);
    }
  }

  async checkAndNotifyTradingSessions(): Promise<void> {
    try {
      const now = new Date();
      const currentUTC = now.getUTCHours() + now.getUTCMinutes() / 60;
      const dayOfWeek = now.getUTCDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) return;

      for (const session of HIGH_VOLUME_SESSIONS) {
        const sessionKey = `${session.name}-${now.toISOString().split('T')[0]}`;
        if (this.notifiedSessions.has(sessionKey)) continue;

        const minutesToOpen = (session.openUTC - currentUTC) * 60;
        if (minutesToOpen > 0 && minutesToOpen <= 5) {
          const subscribers = await db.select().from(telegramSubscribers).where(eq(telegramSubscribers.isActive, true));
          const message = `🔔 ${session.name} Session opens in ${Math.ceil(minutesToOpen)} minutes. High volatility expected!`;
          for (const subscriber of subscribers) {
            await this.bot?.sendMessage(subscriber.chatId, message);
          }
          this.notifiedSessions.add(sessionKey);
        }
      }

      // Clean old sessions
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      Array.from(this.notifiedSessions).forEach(key => {
        const dateStr = key.split('-')[1];
        if (new Date(dateStr) < yesterday) this.notifiedSessions.delete(key);
      });
    } catch (error) {
      console.error('❌ Error checking trading sessions:', error);
    }
  }

  async sendEventNotification(event: any): Promise<void> {
    try {
      if (!this.isInitialized || !this.bot) return;

      const subscribers = await db.select().from(telegramSubscribers).where(eq(telegramSubscribers.isActive, true));
      const message = `🚨 ${event.impactLevel} Impact: ${event.title}\nCountry: ${event.country} (${event.currency})\nTime: ${format(new Date(event.eventTime), 'MMM dd, HH:mm')} UTC`;

      for (const subscriber of subscribers) {
        await this.bot.sendMessage(subscriber.chatId, message);
      }

      await db.update(economicEvents).set({ telegramNotified: true }).where(eq(economicEvents.id, event.id));
    } catch (error) {
      console.error('❌ Error sending event notification:', error);
    }
  }

  getBot(): TelegramBot | null {
    return this.bot;
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

// ✅ Initialize the service asynchronously
let telegramNotificationService: TelegramNotificationService | null = null;

(async () => {
  try {
    telegramNotificationService = await TelegramNotificationService.create();
    console.log('✅ Telegram Notification Service is ready');
  } catch (error) {
    console.error('❌ Failed to initialize Telegram Notification Service:', error);
  }
})();

export { telegramNotificationService };
