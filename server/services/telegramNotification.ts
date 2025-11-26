import TelegramBot from "node-telegram-bot-api";

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception:", {
    message: err.message,
    stack: err.stack
  });
});

process.on("unhandledRejection", (reason: any) => {
  console.error("[FATAL] Unhandled Rejection:", {
    message: reason?.message || reason,
    stack: reason?.stack
  });
});

interface Subscriber {
  chatId: string;
  name?: string;
}

export class TelegramService {
  private bot: TelegramBot | null = null;
  private isInitialized = false;
  private subscribers: Subscriber[] = [];

  constructor() {
    this.initialize();

    setInterval(() => {
      console.log("[Telegram Heartbeat]", {
        initialized: this.isInitialized,
        botExists: !!this.bot,
        time: new Date().toISOString()
      });
    }, 30000);
  }

  private async initialize() {
    try {
      const raw =
        process.env.TELEGRAM_BOT_TOKEN_CLEAN ||
        process.env.TELEGRAM_BOT_TOKEN ||
        "";

      const token = raw.trim().replace(/\s+/g, "");

      console.log("[Telegram] ENV Check:", {
        TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED,
        USING_CLEAN_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN_CLEAN,
        USING_DEFAULT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
        RAW_LENGTH: token?.length,
        COLON_PRESENT: token?.includes(":"),
        DOT_PRESENT: token?.includes("."),
        WHITESPACE_PRESENT: /\s/.test(token),
        HAS_NON_PRINTABLE: /[^\x20-\x7E]/.test(token),
      });

      if (!token) {
        console.error("[Telegram] ERROR: Token is empty");
        return;
      }

      const tokenPattern = /^\d+:[A-Za-z0-9_-]{30,100}$/;

      if (!tokenPattern.test(token)) {
        console.error("[Telegram] ERROR: Token format invalid");
        console.log("Token length:", token.length);
        return;
      }

      // TEST FIRST - before full bot creation
      const testBot = new TelegramBot(token, { polling: false });

      try {
        console.time("[Telegram] getMe test");

        const botInfo = await testBot.getMe();

        console.timeEnd("[Telegram] getMe test");

        console.log("[Telegram] getMe RESPONSE:", {
          id: botInfo.id,
          is_bot: botInfo.is_bot,
          username: botInfo.username,
          first_name: botInfo.first_name,
        });

      } catch (err: any) {
        console.error("[Telegram] getMe FAILED:", {
          message: err.message,
          code: err.code,
          response: err.response?.body,
          stack: err.stack
        });

        throw err; // allow failure to propagate
      }

      // ACTUAL BOT
      this.bot = new TelegramBot(token, {
        polling: {
          interval: 2000,
          autoStart: true,
          params: { timeout: 10 }
        }
      });

      this.bot.on("polling_error", (error) => {
        console.error("[Telegram] POLLING ERROR:", {
          message: error?.message,
          code: (error as any)?.code,
          stack: (error as any)?.stack,
        });
      });

      this.bot.on("webhook_error", (error) => {
        console.error("[Telegram] WEBHOOK ERROR:", {
          message: error?.message,
          stack: error?.stack
        });
      });

      this.bot.on("error", (error) => {
        console.error("[Telegram] GENERAL BOT ERROR:", {
          message: error?.message,
          stack: error?.stack
        });
      });

      this.bot.on("message", (msg) => {
        console.log("[Telegram] MESSAGE RECEIVED:", {
          from: msg?.from?.username,
          chatId: msg?.chat?.id,
          text: msg?.text
        });

        if (msg.text === "/start") {
          const chatId = msg.chat.id.toString();

          this.addSubscriber(chatId, msg.from?.username);

          this.bot?.sendMessage(
            chatId,
            "✅ You have been subscribed to notifications."
          );
        }
      });

      this.isInitialized = true;
      console.log("✅ Telegram Bot Initialized Successfully");

    } catch (error: any) {
      console.error("[Telegram] INITIALIZATION FAILED:", {
        message: error.message,
        stack: error.stack
      });

      this.isInitialized = false;
    }
  }

  public addSubscriber(chatId: string, name?: string) {
    if (!this.subscribers.find((s) => s.chatId === chatId)) {
      this.subscribers.push({ chatId, name });

      console.log("[Telegram] SUBSCRIBED:", {
        chatId,
        name
      });
    }
  }

  public async sendNotification(message: string) {
    if (!this.bot || !this.isInitialized) {
      console.error("[Telegram] Cannot send - bot not initialized");
      return;
    }

    if (!this.subscribers.length) {
      console.warn("[Telegram] No subscribers to notify");
      return;
    }

    for (const subscriber of this.subscribers) {
      try {
        await this.bot.sendMessage(subscriber.chatId, message);

        console.log("[Telegram] Sent to:", subscriber.chatId);

      } catch (error: any) {
        console.error("❌ Failed to send Telegram notification", {
          chatId: subscriber.chatId,
          message: error.message,
          code: error.code,
          response: error.response?.body,
          stack: error.stack
        });
      }
    }
  }

  public getStatus() {
    return {
      initialized: this.isInitialized,
      subscriberCount: this.subscribers.length,
      bot: !!this.bot
    };
  }
}
