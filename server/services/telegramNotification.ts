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

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    let token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token) {
      console.error('TELEGRAM_BOT_TOKEN not found. Telegram notifications disabled.');
      return;
    }

    // Clean the token - remove any whitespace or invisible characters
    token = token.trim().replace(/[\r\n\t\s]/g, '');
    
    // Log token info for debugging (mask the secret part)
    const tokenParts = token.split(':');
    if (tokenParts.length === 2) {
      console.log(`Telegram token format: ${tokenParts[0]}:${tokenParts[1].substring(0, 5)}... (${tokenParts[1].length} chars)`);
    } else {
      console.log(`Telegram token has ${tokenParts.length} parts (expected 2)`);
    }

    // Validate token format (should be like 123456789:ABC-DEF...)
    const tokenPattern = /^\d+:[A-Za-z0-9_-]+$/;
    if (!tokenPattern.test(token)) {
      console.error('TELEGRAM_BOT_TOKEN has invalid format. Expected format: 123456789:ABCdef...');
      console.error(`Token length: ${token.length}, Contains colon: ${token.includes(':')}`);
      return;
    }

    try {
      // First, test the token by calling getMe API
      const testBot = new TelegramBot(token, { polling: false });
      const botInfo = await testBot.getMe();
      console.log(`Telegram bot verified: @${botInfo.username} (${botInfo.first_name})`);
      
      // Token is valid, now create the actual bot with polling
      this.bot = new TelegramBot(token, { 
        polling: {
          interval: 2000,
          autoStart: true,
          params: {
            timeout: 10
          }
        }
      });
      
      // Handle polling errors gracefully
      this.bot.on('polling_error', (error: any) => {
        // Only log once per error type to avoid spam
        const errorCode = error?.code || 'UNKNOWN';
        const errorMessage = error?.message || 'Unknown error';
        
        if (errorCode === 'ETELEGRAM' && errorMessage.includes('404')) {
          // Token became invalid, stop polling
          console.error('Telegram bot token is invalid (404). Stopping bot.');
          this.bot?.stopPolling();
          this.isInitialized = false;
        } else if (errorCode === 'EFATAL') {
          console.error('Telegram fatal error:', errorMessage);
        } else {
          // Log other errors less frequently
          console.error(`Telegram polling error [${errorCode}]:`, errorMessage);
        }
      });
      
      this.isInitialized = true;
      this.setupCommands();
      console.log('Telegram bot initialized successfully with polling');
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
        console.error('Telegram bot token is invalid or bot was deleted. Please check with @BotFather.');
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        console.error('Telegram bot token is unauthorized. Please get a new token from @BotFather.');
      } else {
        console.error('Failed to initialize Telegram bot:', errorMessage);
      }
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
    const impactLabel = event.impactLevel === 'High' ? 'HIGH IMPACT' : 'MEDIUM IMPACT';
    const timeStr = format(new Date(event.eventTime), 'MMM dd, HH:mm');
    
    let message = `${impactEmoji} ${impactLabel} NEWS\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📰 ${event.title}\n`;
    message += `🌍 ${event.country} (${event.currency})\n`;
    message += `⏰ ${timeStr} UTC\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;

    if (event.expectedValue || event.previousValue) {
      message += `📊 Forecast: ${event.expectedValue || 'N/A'}\n`;
      message += `📉 Previous: ${event.previousValue || 'N/A'}\n`;
      message += `━━━━━━━━━━━━━━━━━━━━\n`;
    }
    
    const impactSummary = this.generateImpactSummary(event);
    message += `💡 Expected Impact:\n${impactSummary}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `🔗 More info: www.findbuyandsellzones.com/calendar\n\n`;
    message += `⚠️ Educational only — not financial advice.`;

    return message;
  }

  private formatHighImpactEventMessage(event: any): string {
    const timeStr = format(new Date(event.eventTime), 'MMM dd, HH:mm');
    const now = new Date();
    const eventTime = new Date(event.eventTime);
    const minutesUntil = Math.ceil((eventTime.getTime() - now.getTime()) / (1000 * 60));
    
    let message = `🚨 *HIGH IMPACT NEWS ALERT*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📰 *${event.title}*\n`;
    message += `🌍 ${event.country} (${event.currency})\n`;
    message += `⏰ In ${minutesUntil} minutes (${timeStr} UTC)\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;

    if (event.expectedValue || event.previousValue) {
      message += `📊 Forecast: ${event.expectedValue || 'N/A'}\n`;
      message += `📉 Previous: ${event.previousValue || 'N/A'}\n`;
      message += `━━━━━━━━━━━━━━━━━━━━\n`;
    }
    
    message += `⚠️ *Expect high volatility!*\n`;
    message += `Consider closing or reducing positions.\n\n`;
    message += `🔗 www.findbuyandsellzones.com/calendar`;

    return message;
  }

  private generateImpactSummary(event: any): string {
    const currency = event.currency || 'USD';
    const title = (event.title || '').toLowerCase();
    
    if (title.includes('interest rate') || title.includes('fomc') || title.includes('rate decision')) {
      return `Rate decisions directly impact ${currency} strength. Higher rates = bullish ${currency}, lower rates = bearish ${currency}.`;
    }
    if (title.includes('nfp') || title.includes('non-farm') || title.includes('employment') || title.includes('jobs')) {
      return `Employment data affects ${currency} significantly. Strong jobs = bullish ${currency}, weak jobs = bearish ${currency}.`;
    }
    if (title.includes('cpi') || title.includes('inflation') || title.includes('ppi')) {
      return `Inflation data influences rate expectations. Higher inflation = potential rate hikes = bullish ${currency}.`;
    }
    if (title.includes('gdp') || title.includes('growth')) {
      return `GDP reflects economic health. Strong growth = bullish ${currency}, weak growth = bearish ${currency}.`;
    }
    if (title.includes('pmi') || title.includes('manufacturing') || title.includes('services')) {
      return `PMI above 50 = expansion (bullish ${currency}), below 50 = contraction (bearish ${currency}).`;
    }
    if (title.includes('retail') || title.includes('consumer')) {
      return `Consumer spending drives growth. Strong retail = bullish ${currency}, weak retail = bearish ${currency}.`;
    }
    if (title.includes('trade') || title.includes('balance')) {
      return `Trade surplus = bullish ${currency}, trade deficit = bearish ${currency}.`;
    }
    if (title.includes('housing') || title.includes('home')) {
      return `Housing data reflects economic confidence. Strong housing = bullish ${currency}.`;
    }
    
    return `${event.impactLevel} impact event for ${currency}. Watch for volatility around release time.`;
  }

  async sendEventNotification(event: any): Promise<void> {
    try {
      const impactEmoji = event.impactLevel === 'High' ? '🔴' : event.impactLevel === 'Medium' ? '🟡' : '🟢';
      const timeStr = format(new Date(event.eventTime), 'MMM dd, HH:mm');
      
      const title = `${impactEmoji} ${event.impactLevel} Impact: ${event.title}`;
      let message = `${event.country} (${event.currency}) - ${timeStr} UTC`;
      
      if (event.expectedValue || event.previousValue) {
        const parts = [];
        if (event.expectedValue) parts.push(`Expected: ${event.expectedValue}`);
        if (event.previousValue) parts.push(`Previous: ${event.previousValue}`);
        message += ` | ${parts.join(', ')}`;
      }
      
      await notificationService.createNotification({
        type: 'economic_event',
        title,
        message,
        impactLevel: event.impactLevel,
        metadata: JSON.stringify(event),
      });

      if (this.isInitialized && this.bot && event.impactLevel === 'High') {
        const subscribers = await db
          .select()
          .from(telegramSubscribers)
          .where(eq(telegramSubscribers.isActive, true));

        if (subscribers.length > 0) {
          const telegramMessage = this.formatHighImpactEventMessage(event);

          for (const subscriber of subscribers) {
            try {
              await this.bot.sendMessage(subscriber.chatId, telegramMessage, {
                parse_mode: 'Markdown',
              });
              console.log(`High impact event notification sent to ${subscriber.chatId}`);
            } catch (error) {
              console.error(`Failed to send Telegram notification to ${subscriber.chatId}:`, error);
            }
          }
        }
      }

      await db
        .update(economicEvents)
        .set({ telegramNotified: true })
        .where(eq(economicEvents.id, event.id));

    } catch (error) {
      console.error('Error sending event notifications:', error);
    }
  }

  async checkAndNotifyUpcomingEvents(): Promise<void> {
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

      console.log(`Found ${upcomingEvents.length} events to notify`);

      for (const event of upcomingEvents) {
        await this.sendEventNotification(event);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Error checking upcoming events:', error);
    }
  }

  async checkAndNotifyTradingSessions(): Promise<void> {
    try {
      const now = new Date();
      const currentUTC = now.getUTCHours() + now.getUTCMinutes() / 60;
      const dayOfWeek = now.getUTCDay();
      
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      if (isWeekend) {
        return;
      }

      for (const session of HIGH_VOLUME_SESSIONS) {
        const sessionKey = `${session.name}-${now.toISOString().split('T')[0]}-${Math.floor(session.openUTC)}`;
        
        if (this.notifiedSessions.has(sessionKey)) {
          continue;
        }

        const minutesToOpen = (session.openUTC - currentUTC) * 60;
        
        if (minutesToOpen > 0 && minutesToOpen <= 5) {
          const title = `🔔 ${session.name} Session Opening in 5 Minutes!`;
          const message = `Opens in ${Math.ceil(minutesToOpen)} minutes - High volume trading session with increased volatility expected`;
          
          await notificationService.createNotification({
            type: 'trading_session',
            title,
            message,
            metadata: JSON.stringify({ session: session.name, minutesToOpen: Math.ceil(minutesToOpen) }),
          });

          if (this.isInitialized && this.bot) {
            const subscribers = await db
              .select()
              .from(telegramSubscribers)
              .where(eq(telegramSubscribers.isActive, true));

            if (subscribers.length > 0) {
              const telegramMessage = 
                `🔔 *${session.name} Session Opening in 5 Minutes!*\n\n` +
                `⏰ Opens in ${Math.ceil(minutesToOpen)} minutes\n` +
                `🌍 High volume trading session\n` +
                `💹 Increased volatility expected\n` +
                `📊 Prepare your setups!\n\n` +
                `🔗 www.findbuyandsellzones.com`;

              for (const subscriber of subscribers) {
                try {
                  await this.bot.sendMessage(subscriber.chatId, telegramMessage, {
                    parse_mode: 'Markdown',
                  });
                } catch (error) {
                  console.error(`Failed to send session alert to ${subscriber.chatId}:`, error);
                }
              }
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


  private escapeMarkdown(text: string): string {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  private formatPrice(price: any): string {
    if (price === null || price === undefined) return 'N/A';
    const num = parseFloat(price);
    if (isNaN(num)) return String(price);
    return num < 10 ? num.toFixed(5) : num.toFixed(2);
  }

  async sendTradingSignalNotification(signal: any): Promise<void> {
    try {
      if (!this.isInitialized || !this.bot) {
        console.log('Telegram bot not initialized, skipping signal notification');
        return;
      }

      const subscribers = await db
        .select()
        .from(telegramSubscribers)
        .where(eq(telegramSubscribers.isActive, true));

      if (subscribers.length === 0) {
        console.log('No active Telegram subscribers for signal notification');
        return;
      }

      const direction = signal.type || signal.direction || 'buy';
      const typeEmoji = direction === 'buy' ? '🟢' : '🔴';
      
      const entryPrice = this.formatPrice(signal.entryPrice);
      const stopLoss = this.formatPrice(signal.stopLoss);
      const takeProfit = this.formatPrice(signal.takeProfit);
      const riskReward = signal.riskRewardRatio ? parseFloat(signal.riskRewardRatio).toFixed(2) : '2.00';
      const confidence = signal.overallConfidence || signal.confidence || 70;
      const timeframe = signal.timeframe || '15M';
      
      const now = new Date();
      const timeStr = format(now, 'MMM dd, HH:mm');
      
      const telegramCaption = 
        `${typeEmoji} *${signal.symbol}* │ ${direction.toUpperCase()}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 Entry: ${entryPrice}\n` +
        `🛑 SL: ${stopLoss}\n` +
        `🎯 TP: ${takeProfit}\n` +
        `📊 R:R 1:${riskReward} │ ${confidence}% confidence\n` +
        `⏱ Timeframe: ${timeframe}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔗 www.findbuyandsellzones.com/signals\n\n` +
        `⚠️ Educational only — not financial advice.`;

      let chartBuffer: Buffer | null = null;
      
      try {
        console.log(`[Telegram] Generating chart for ${signal.symbol}...`);
        
        const currentPrice = parseFloat(signal.entryPrice) || 0;
        const mtfData = await fetchMultiTimeframeData(signal.symbol, signal.assetClass || 'forex', currentPrice);
        
        if (mtfData && mtfData.m15 && mtfData.m15.length > 0) {
          const candles: ChartCandle[] = mtfData.m15.slice(-60).map(c => ({
            date: new Date(c.timestamp).toISOString(),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume || 0,
          }));
          
          const supplyZones: ZoneInfo[] = [];
          const demandZones: ZoneInfo[] = [];
          
          if (signal.zones) {
            if (signal.zones.m15) {
              signal.zones.m15.forEach((zone: any) => {
                if (zone.type === 'supply') {
                  supplyZones.push({ top: zone.topPrice, bottom: zone.bottomPrice });
                } else {
                  demandZones.push({ top: zone.topPrice, bottom: zone.bottomPrice });
                }
              });
            }
            if (signal.zones.h4) {
              signal.zones.h4.forEach((zone: any) => {
                if (zone.type === 'supply') {
                  supplyZones.push({ top: zone.topPrice, bottom: zone.bottomPrice });
                } else {
                  demandZones.push({ top: zone.topPrice, bottom: zone.bottomPrice });
                }
              });
            }
          }
          
          const chartResult = await generateTradingSignalChart(
            signal.symbol,
            timeframe,
            candles,
            {
              direction: direction.toUpperCase() as 'BUY' | 'SELL',
              entryPrice: parseFloat(signal.entryPrice) || 0,
              stopLoss: parseFloat(signal.stopLoss) || 0,
              takeProfit: parseFloat(signal.takeProfit) || 0,
              confidence: confidence,
            },
            supplyZones,
            demandZones
          );
          
          if (chartResult.success && chartResult.path) {
            chartBuffer = readChartAsBuffer(chartResult.path);
            console.log(`[Telegram] Chart generated successfully: ${chartResult.path}`);
          } else {
            console.log(`[Telegram] Chart generation failed: ${chartResult.error}`);
          }
        }
      } catch (chartError) {
        console.error('[Telegram] Error generating chart:', chartError);
      }

      for (const subscriber of subscribers) {
        try {
          if (chartBuffer) {
            await this.bot.sendPhoto(subscriber.chatId, chartBuffer, {
              caption: telegramCaption,
              parse_mode: 'Markdown',
            });
            console.log(`Trading signal with chart sent to Telegram subscriber ${subscriber.chatId}`);
          } else {
            await this.bot.sendMessage(subscriber.chatId, telegramCaption, {
              parse_mode: 'Markdown',
            });
            console.log(`Trading signal (text only) sent to Telegram subscriber ${subscriber.chatId}`);
          }
        } catch (error) {
          console.error(`Failed to send signal to Telegram ${subscriber.chatId}:`, error);
        }
      }

    } catch (error) {
      console.error('Error sending trading signal to Telegram:', error);
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
