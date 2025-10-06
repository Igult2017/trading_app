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

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token) {
      console.error('TELEGRAM_BOT_TOKEN not found. Telegram notifications disabled.');
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: true });
      this.isInitialized = true;
      this.setupCommands();
      console.log('Telegram bot initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Telegram bot:', error);
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

          await this.bot?.sendMessage(
            chatId,
            `✅ Welcome to Infod Trading Alerts!\n\n` +
            `You're now subscribed to receive Telegram notifications for:\n` +
            `🔔 Trading Sessions - 5 min before London & NY open\n` +
            `📊 High impact economic events\n` +
            `📈 Medium impact economic events\n\n` +
            `ℹ️ Other notifications (like trading signals) can be viewed on the dashboard.\n\n` +
            `Commands:\n` +
            `/stop - Pause notifications\n` +
            `/resume - Resume notifications\n` +
            `/status - Check subscription status`
          );
        } else if (!existingSubscriber[0].isActive) {
          await db
            .update(telegramSubscribers)
            .set({ isActive: true })
            .where(eq(telegramSubscribers.chatId, chatId));

          await this.bot?.sendMessage(
            chatId,
            `✅ Welcome back! Your notifications have been resumed.`
          );
        } else {
          await this.bot?.sendMessage(
            chatId,
            `👋 You're already subscribed to trading alerts!\n\n` +
            `Use /status to check your subscription.`
          );
        }
      } catch (error) {
        console.error('Error handling /start command:', error);
        await this.bot?.sendMessage(
          chatId,
          '❌ Something went wrong. Please try again later.'
        );
      }
    });

    this.bot.onText(/\/stop/, async (msg) => {
      const chatId = msg.chat.id.toString();

      try {
        await db
          .update(telegramSubscribers)
          .set({ isActive: false })
          .where(eq(telegramSubscribers.chatId, chatId));

        await this.bot?.sendMessage(
          chatId,
          `⏸️ Notifications paused.\n\nUse /resume to start receiving alerts again.`
        );
      } catch (error) {
        console.error('Error handling /stop command:', error);
      }
    });

    this.bot.onText(/\/resume/, async (msg) => {
      const chatId = msg.chat.id.toString();

      try {
        await db
          .update(telegramSubscribers)
          .set({ isActive: true })
          .where(eq(telegramSubscribers.chatId, chatId));

        await this.bot?.sendMessage(
          chatId,
          `▶️ Notifications resumed!\n\nYou'll receive alerts for upcoming economic events.`
        );
      } catch (error) {
        console.error('Error handling /resume command:', error);
      }
    });

    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id.toString();

      try {
        const subscriber = await db
          .select()
          .from(telegramSubscribers)
          .where(eq(telegramSubscribers.chatId, chatId))
          .limit(1);

        if (subscriber.length === 0) {
          await this.bot?.sendMessage(
            chatId,
            `❌ You're not subscribed yet.\n\nUse /start to subscribe to trading alerts.`
          );
        } else {
          const status = subscriber[0].isActive ? '✅ Active' : '⏸️ Paused';
          const subDate = format(new Date(subscriber[0].createdAt!), 'MMM dd, yyyy');
          
          await this.bot?.sendMessage(
            chatId,
            `📊 Subscription Status: ${status}\n` +
            `📅 Subscribed since: ${subDate}\n\n` +
            `Receiving Telegram notifications for:\n` +
            `• Trading sessions (London & NY)\n` +
            `• High impact economic events\n` +
            `• Medium impact economic events\n\n` +
            `ℹ️ View all notifications on the dashboard`
          );
        }
      } catch (error) {
        console.error('Error handling /status command:', error);
      }
    });
  }

  private formatEventMessage(event: any): string {
    const impactEmoji = event.impactLevel === 'High' ? '🔴' : '🟡';
    const timeStr = format(new Date(event.eventTime), 'MMM dd, yyyy HH:mm');
    
    let message = `${impactEmoji} *${event.impactLevel} Impact Event*\n\n`;
    message += `📊 *${event.title}*\n`;
    message += `🌍 ${event.country} (${event.currency})\n`;
    message += `⏰ ${timeStr} UTC\n\n`;

    if (event.expectedValue) {
      message += `📈 Expected: ${event.expectedValue}\n`;
    }
    if (event.previousValue) {
      message += `📉 Previous: ${event.previousValue}\n`;
    }
    
    if (event.marketImpactAnalysis) {
      message += `\n💡 *Impact:*\n${event.marketImpactAnalysis}\n`;
    }

    return message;
  }

  async sendEventNotification(event: any): Promise<void> {
    if (!this.isInitialized || !this.bot) {
      console.log('Telegram bot not initialized, skipping notification');
      return;
    }

    try {
      const subscribers = await db
        .select()
        .from(telegramSubscribers)
        .where(eq(telegramSubscribers.isActive, true));

      if (subscribers.length === 0) {
        console.log('No active Telegram subscribers');
        return;
      }

      const message = this.formatEventMessage(event);

      for (const subscriber of subscribers) {
        try {
          await this.bot.sendMessage(subscriber.chatId, message, {
            parse_mode: 'Markdown',
          });
          console.log(`Notification sent to ${subscriber.chatId}`);
        } catch (error) {
          console.error(`Failed to send notification to ${subscriber.chatId}:`, error);
        }
      }

      await db
        .update(economicEvents)
        .set({ telegramNotified: true })
        .where(eq(economicEvents.id, event.id));

    } catch (error) {
      console.error('Error sending Telegram notifications:', error);
    }
  }

  async checkAndNotifyUpcomingEvents(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      const now = new Date();
      const notificationWindow = new Date(now.getTime() + 30 * 60 * 1000);

      const upcomingEvents = await db
        .select()
        .from(economicEvents)
        .where(
          and(
            eq(economicEvents.telegramNotified, false),
            eq(economicEvents.isReleased, false),
            gte(economicEvents.eventTime, now),
            lte(economicEvents.eventTime, notificationWindow)
          )
        );

      const highMediumEvents = upcomingEvents.filter(
        event => event.impactLevel === 'High' || event.impactLevel === 'Medium'
      );

      console.log(`Found ${highMediumEvents.length} events to notify`);

      for (const event of highMediumEvents) {
        await this.sendEventNotification(event);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Error checking upcoming events:', error);
    }
  }

  async checkAndNotifyTradingSessions(): Promise<void> {
    if (!this.isInitialized || !this.bot) {
      return;
    }

    try {
      const now = new Date();
      const currentUTC = now.getUTCHours() + now.getUTCMinutes() / 60;
      const dayOfWeek = now.getUTCDay();
      
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      if (isWeekend) {
        return;
      }

      const subscribers = await db
        .select()
        .from(telegramSubscribers)
        .where(eq(telegramSubscribers.isActive, true));

      if (subscribers.length === 0) {
        return;
      }

      for (const session of HIGH_VOLUME_SESSIONS) {
        const sessionKey = `${session.name}-${now.toISOString().split('T')[0]}-${Math.floor(session.openUTC)}`;
        
        if (this.notifiedSessions.has(sessionKey)) {
          continue;
        }

        const minutesToOpen = (session.openUTC - currentUTC) * 60;
        
        if (minutesToOpen > 0 && minutesToOpen <= 6) {
          const message = 
            `🔔 *${session.name} Session Opening Soon!*\n\n` +
            `⏰ Opens in ${Math.ceil(minutesToOpen)} minutes\n` +
            `🌍 High volume trading session\n` +
            `💹 Increased volatility expected\n\n` +
            `Prepare your trading setups!`;

          for (const subscriber of subscribers) {
            try {
              await this.bot.sendMessage(subscriber.chatId, message, {
                parse_mode: 'Markdown',
              });
            } catch (error) {
              console.error(`Failed to send session alert to ${subscriber.chatId}:`, error);
            }
          }

          this.notifiedSessions.add(sessionKey);
          console.log(`Sent ${session.name} session alert`);
        }
      }

      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      Array.from(this.notifiedSessions).forEach(key => {
        const dateStr = key.split('-').slice(1, 4).join('-');
        if (new Date(dateStr) < yesterday) {
          this.notifiedSessions.delete(key);
        }
      });

    } catch (error) {
      console.error('Error checking trading sessions:', error);
    }
  }


  getBot(): TelegramBot | null {
    return this.bot;
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

export const telegramNotificationService = new TelegramNotificationService();
