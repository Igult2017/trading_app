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
        console.error('❌ TELEGRAM_BOT_TOKEN not found.');
        return;
      }

      token = token.trim().replace(/[\r\n\t\s]/g, '');

      const tokenPattern = /^\d+:[A-Za-z0-9_-]+$/;
      if (!tokenPattern.test(token)) {
        console.error('❌ TELEGRAM_BOT_TOKEN invalid format.');
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
        console.error('Polling error:', error);
      });

      this.isInitialized = true;
      this.setupCommands();

    } catch (error: any) {
      console.error('❌ Telegram init error:', error.message || error);
    }
  }

  private setupCommands(): void {
    if (!this.bot) return;

    // =================================================
    // ✅ START COMMAND — FULL ERROR CAPTURE ENABLED ✅
    // =================================================
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const chatIdStr = chatId.toString();
      const user = msg.from;

      console.log("\n==== /start command hit ====");
      console.log("Chat ID:", chatId);
      console.log("User:", user?.username, user?.first_name);

      try {
        const existingSubscriber = await db
          .select()
          .from(telegramSubscribers)
          .where(eq(telegramSubscribers.chatId, chatIdStr))
          .limit(1);

        if (existingSubscriber.length === 0) {

          await db.insert(telegramSubscribers).values({
            chatId: chatIdStr,
            username: user?.username || null,
            firstName: user?.first_name || null,
            lastName: user?.last_name || null,
            phoneNumber: null,
            isActive: true,
            createdAt: new Date()
          });

          await this.bot!.sendMessage(
            chatId,
            `✅ Welcome to Infod Trading Alerts!\n\nYou have been subscribed successfully ✅`
          );

        } else if (!existingSubscriber[0].isActive) {

          await db
            .update(telegramSubscribers)
            .set({ isActive: true })
            .where(eq(telegramSubscribers.chatId, chatIdStr));

          await this.bot!.sendMessage(chatId, `✅ Welcome back! Notifications resumed.`);

        } else {
          await this.bot!.sendMessage(chatId, `👋 You are already subscribed.`);
        }

      } catch (error: any) {
        console.error('\n❌ /start command FAILURE');
        console.error(error);

        const cleanError =
          error?.message?.substring(0, 350) ||
          JSON.stringify(error)?.substring(0, 350) ||
          'Unknown error';

        await this.bot!.sendMessage(
          chatId,
          `❌ *SUBSCRIBE ERROR*\n\n\`${cleanError}\`\n\nThis is a database / schema problem.`,
          { parse_mode: "Markdown" }
        );
      }
    });

    // =================================================
    this.bot.onText(/\/stop/, async (msg) => {
      const chatId = msg.chat.id;
      const chatIdStr = chatId.toString();

      try {
        await db
          .update(telegramSubscribers)
          .set({ isActive: false })
          .where(eq(telegramSubscribers.chatId, chatIdStr));

        await this.bot?.sendMessage(chatId, `⏸️ Notifications paused.`);
      } catch (error) {
        console.error('Error /stop:', error);
      }
    });

    // =================================================
    this.bot.onText(/\/resume/, async (msg) => {
      const chatId = msg.chat.id;
      const chatIdStr = chatId.toString();

      try {
        await db
          .update(telegramSubscribers)
          .set({ isActive: true })
          .where(eq(telegramSubscribers.chatId, chatIdStr));

        await this.bot?.sendMessage(chatId, `▶️ Notifications resumed.`);
      } catch (error) {
        console.error('Error /resume:', error);
      }
    });

    // =================================================
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
          await this.bot?.sendMessage(chatId, `❌ You are not subscribed.`);
        } else {
          const status = subscriber[0].isActive ? '✅ Active' : '⏸️ Paused';
          const subDate = subscriber[0].createdAt
            ? format(new Date(subscriber[0].createdAt), 'MMM dd, yyyy')
            : 'Unknown';

          await this.bot?.sendMessage(
            chatId,
            `📊 Subscription Status: ${status}\n📅 Since: ${subDate}`
          );
        }
      } catch (error: any) {
        console.error('Error /status:', error);
        await this.bot?.sendMessage(chatId, `❌ ${error.message}`);
      }
    });
  }

  getBot(): TelegramBot | null {
    return this.bot;
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

// ✅ Initialize the service
let telegramNotificationService: TelegramNotificationService | null = null;

(async () => {
  try {
    telegramNotificationService = await TelegramNotificationService.create();
    console.log('✅ Telegram Notification Service is ready');
  } catch (error) {
    console.error('❌ Failed to init Telegram:', error);
  }
})();

export { telegramNotificationService };
