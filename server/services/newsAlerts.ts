/**
 * HIGH-IMPACT NEWS WARNINGS — 15 minutes out, then 5 minutes out.
 *
 * The user, 2026-08-04: *"It should also notify on high impact news affecting pairs traded by any
 * strategy 15 mins before the news and then 5 mins before the news."*
 *
 * Only the SCHEDULE lives here, with no Telegram and no database, so the whole rule is testable on
 * a fixed clock instead of by waiting for a real release. `telegramNotification` owns the timers and
 * the sending, exactly as it does for session opens.
 *
 * There WAS a `scheduleEventNotifications` on the service. It was dead code — nothing ever called
 * it — and it did 15 minutes only, filtered nothing by instrument, and broadcast to /start
 * subscribers rather than the channel. It is deleted rather than extended.
 */

/** Warning offsets, in minutes before the release. Both fire for every qualifying event. */
export const LEAD_MINUTES = [15, 5] as const;

/** Ignore anything further out than this — the calendar is refreshed regularly and a timer days
 *  long would survive a stale event that has since moved or been revised. */
export const MAX_HORIZON_MS = 6 * 60 * 60 * 1000;

/**
 * The pairs the platform actually trades.
 *
 * MUST MIRROR `signal_platform/config/instruments.py TRADEABLE_INSTRUMENTS`. That list is the
 * platform's own source of truth and lives in Python; this is the Node view of it. `tradedPairs.check.ts`
 * asserts the two agree by parsing the Python file, so adding a pair there and forgetting this one
 * fails a check rather than silently going unwatched.
 */
export const TRADED_PAIRS: ReadonlyArray<readonly [string, string, string]> = [
  ["EUR/USD", "EUR", "USD"],
  ["GBP/USD", "GBP", "USD"],
  ["USD/JPY", "USD", "JPY"],
  ["GBP/JPY", "GBP", "JPY"],
];

/** Every currency that appears in a traded pair — the set a release has to touch to matter here. */
export const TRADED_CURRENCIES: ReadonlySet<string> = new Set(
  TRADED_PAIRS.flatMap(([, base, quote]) => [base, quote]),
);

/** Which traded pairs a currency moves. "USD" hits all four; "JPY" only the two yen crosses. */
export function affectedPairs(currency: string): string[] {
  const c = (currency || "").trim().toUpperCase();
  return TRADED_PAIRS.filter(([, b, q]) => b === c || q === c).map(([sym]) => sym);
}

export interface NewsEventLike {
  id: string | number;
  title: string;
  currency: string;
  impactLevel: string;
  eventTime: Date | string;
  expectedValue?: string | null;
  previousValue?: string | null;
}

export interface NewsAlert {
  at: Date;
  leadMinutes: number;
  key: string;            // stable per event+lead, so a reschedule cannot double-book one warning
  message: string;
}

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const RULE = "━".repeat(21);

export function newsMessage(ev: NewsEventLike, lead: number, pairs: string[]): string {
  const t = new Date(ev.eventTime);
  const hhmm = `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
  const urgent = lead <= 5;
  const detail = [
    ev.expectedValue ? `Forecast <b>${esc(ev.expectedValue)}</b>` : "",
    ev.previousValue ? `Previous <b>${esc(ev.previousValue)}</b>` : "",
  ].filter(Boolean).join("   ·   ");
  return (
    `${urgent ? "🚨" : "⚠️"} <b>HIGH-IMPACT NEWS IN ${lead} MINUTES</b>\n` +
    `${RULE}\n\n` +
    `<b>${esc(ev.currency)} — ${esc(ev.title)}</b>\n` +
    `🕐 ${hhmm} UTC\n` +
    (detail ? `${detail}\n` : "") +
    `\n📉 <b>Affects:</b> ${pairs.map(esc).join(" · ")}\n\n` +
    (urgent
      ? `<blockquote>Spreads widen and stops get hunted through a release. If you are already in, ` +
        `know where your stop is. If you are not, waiting costs nothing.</blockquote>`
      : `<blockquote>Our agents keep scanning, but price around a release is news-driven, not ` +
        `structure-driven. Size accordingly — <b>1–2% of your account</b>.</blockquote>`) +
    `\n\n<i>⚠️ Trade&amp;Journal does not offer financial advice and is not liable for any losses ` +
    `you incur.</i>`
  );
}

/**
 * The warnings to schedule for `events`, in chronological order.
 *
 * Filters, in order: HIGH impact only; the currency must touch a traded pair; the warning must be
 * in the FUTURE (a 15-minute warning for a release 6 minutes away is noise, and the 5-minute one
 * still fires); and no further out than `MAX_HORIZON_MS`.
 */
export function buildNewsSchedule(events: NewsEventLike[], now: Date = new Date()): NewsAlert[] {
  const out: NewsAlert[] = [];
  for (const ev of events ?? []) {
    if (String(ev.impactLevel || "").toLowerCase() !== "high") continue;
    const pairs = affectedPairs(ev.currency);
    if (pairs.length === 0) continue;                    // a currency we never trade
    const eventMs = new Date(ev.eventTime).getTime();
    if (!Number.isFinite(eventMs)) continue;
    for (const lead of LEAD_MINUTES) {
      const at = new Date(eventMs - lead * 60_000);
      const delay = at.getTime() - now.getTime();
      if (delay <= 0 || delay > MAX_HORIZON_MS) continue;
      out.push({ at, leadMinutes: lead, key: `news_${ev.id}_${lead}`,
                 message: newsMessage(ev, lead, pairs) });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
