/**
 * priceAlertChecker.ts
 * Polls active price alerts every 60 s and fires Telegram when triggered.
 */
import { db } from "../db";
import { priceAlerts } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getCachedPrice } from "../lib/priceService";
import { telegramNotificationService } from "./telegramNotification";

const ASSET_CLASS_MAP: Record<string, string> = {
  "BTC/USDT":"crypto","ETH/USDT":"crypto","SOL/USDT":"crypto",
  "XRP/USDT":"crypto","BNB/USDT":"crypto","ADA/USDT":"crypto",
  "DOGE/USDT":"crypto","AVAX/USDT":"crypto","LTC/USDT":"crypto",
  "EUR/USD":"forex","GBP/USD":"forex","USD/JPY":"forex",
  "USD/CHF":"forex","AUD/USD":"forex","NZD/USD":"forex",
  "USD/CAD":"forex","EUR/GBP":"forex","EUR/JPY":"forex",
  "GBP/JPY":"forex","EUR/AUD":"forex","EUR/CAD":"forex",
  "GBP/AUD":"forex","GBP/CAD":"forex","AUD/JPY":"forex",
  "EUR/CHF":"forex","GBP/CHF":"forex","XAU/USD":"commodity",
  "XAG/USD":"commodity","WTI":"commodity",
  "US100":"stock","US500":"stock","US30":"stock",
};

function guessAssetClass(symbol: string, stored: string): string {
  return ASSET_CLASS_MAP[symbol] ?? stored ?? "stock";
}

async function runCheck(): Promise<void> {
  try {
    const active = await db
      .select()
      .from(priceAlerts)
      .where(and(eq(priceAlerts.isTriggered, false)));

    if (!active.length) return;

    // Group by symbol to batch price fetches
    const symbolMap = new Map<string, typeof active>();
    for (const alert of active) {
      const list = symbolMap.get(alert.symbol) ?? [];
      list.push(alert);
      symbolMap.set(alert.symbol, list);
    }

    for (const [symbol, alerts] of symbolMap.entries()) {
      const ac = guessAssetClass(symbol, alerts[0].assetClass);
      const priceResult = await getCachedPrice(symbol, ac);
      if (!priceResult.price) continue;

      const currentPrice = priceResult.price;

      for (const alert of alerts) {
        const target = parseFloat(alert.targetPrice);
        const hit =
          alert.direction === "above"
            ? currentPrice >= target
            : currentPrice <= target;

        if (!hit) continue;

        await db
          .update(priceAlerts)
          .set({ isTriggered: true, triggeredAt: new Date() })
          .where(eq(priceAlerts.id, alert.id));

        const dir = alert.direction === "above" ? "▲ rose above" : "▼ fell below";
        const msg =
          `🔔 *Price Alert Triggered*\n\n` +
          `*${symbol}* ${dir} *${target}*\n` +
          `Current price: *${currentPrice.toPrecision(6)}*\n\n` +
          `_Alert set via FSD Zones_`;

        await telegramNotificationService.broadcastMessage(msg, { parse_mode: "Markdown" });
        console.log(`[PriceAlert] ${symbol} triggered @ ${currentPrice} (target ${target} ${alert.direction})`);
      }
    }
  } catch (err: any) {
    console.error("[PriceAlert] Check error:", err?.message);
  }
}

export function startPriceAlertChecker(): void {
  setInterval(runCheck, 60_000);
  // Run once shortly after startup
  setTimeout(runCheck, 10_000);
}
