import TelegramBot from 'node-telegram-bot-api';
import { db } from '../db';
import { telegramSubscribers } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { format } from 'date-fns';

export class TelegramNotificationService {
  private bot: TelegramBot | null = null;
  private isInitialized = false;

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

      this.bot = new TelegramBot(token, { polling: false });
      
      try {
        const botInfo = await this.bot.getMe();
        console.log(`[Telegram] Bot verified: @${botInfo.username}`);
        this.isInitialized = true;
      } catch (verifyError: any) {
        console.error('[Telegram] Failed to verify bot:', verifyError.message);
        this.bot = null;
        return;
      }

    } catch (error: any) {
      console.error('[Telegram] Init error:', error.message || error);
    }
  }

  async sendMessage(chatId: string | number, message: string, options?: any): Promise<boolean> {
    if (!this.bot) {
      console.log('[Telegram] Bot not initialized, cannot send message');
      return false;
    }

    try {
      await this.bot.sendMessage(chatId, message, options);
      return true;
    } catch (error: any) {
      console.error(`[Telegram] Failed to send message to ${chatId}:`, error.message);
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
}

let telegramNotificationService: TelegramNotificationService | null = null;

(async () => {
  try {
    telegramNotificationService = await TelegramNotificationService.create();
    if (telegramNotificationService?.isReady()) {
      console.log('[Telegram] Notification Service ready (send-only mode)');
    }
  } catch (error) {
    console.error('[Telegram] Failed to initialize:', error);
  }
})();

export { telegramNotificationService };
