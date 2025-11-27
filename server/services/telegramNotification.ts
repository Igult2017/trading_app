import { eq } from "drizzle-orm";
import { telegramSubscribers } from "./schema"; // adjust import if needed
import { db } from "./db";
import { format } from "date-fns";
import type TelegramBot from "node-telegram-bot-api";

export function registerStartCommand(bot: TelegramBot) {

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id; // IMPORTANT: no toString yet
    const username = msg.from?.username || null;
    const firstName = msg.from?.first_name || null;
    const lastName = msg.from?.last_name || null;

    console.log("==== /start triggered ====");
    console.log("Chat ID:", chatId);
    console.log("User:", username, firstName, lastName);

    try {
      // ✅ Check if subscriber exists
      const existingSubscriber = await db
        .select()
        .from(telegramSubscribers)
        .where(eq(telegramSubscribers.chatId, chatId))
        .limit(1);

      // ✅ If not exists → create one
      if (existingSubscriber.length === 0) {
        await db.insert(telegramSubscribers).values({
          chatId,
          username,
          firstName,
          lastName,
          phoneNumber: null,
          isActive: true,
          createdAt: new Date(), // THIS IS CRITICAL
        });
      }

      // ✅ Fetch updated subscriber
      const subscriber = await db
        .select()
        .from(telegramSubscribers)
        .where(eq(telegramSubscribers.chatId, chatId))
        .limit(1);

      const subDate = subscriber[0]?.createdAt
        ? format(new Date(subscriber[0].createdAt), "dd MMM yyyy")
        : "Unknown";

      const welcomeMessage = `
✅ *Bot Activated Successfully*

👤 User: ${firstName ?? ""} ${lastName ?? ""}
🔗 Username: ${username ? `@${username}` : "N/A"}
🗓 Member since: ${subDate}
📊 Status: Active

Type /help to see what I can do.
      `;

      await bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: "Markdown",
      });

    } catch (error: any) {
      console.error("❌ START COMMAND ERROR:", error);

      const debugMessage = `
❌ *Internal error occurred*

Here is the real reason:

\`${error.message}\`

This is NOT a Telegram error — it is a Database or Schema issue.

Fix this and the bot will work.
`;

      await bot.sendMessage(chatId, debugMessage, {
        parse_mode: "Markdown"
      });
    }

  });

}

