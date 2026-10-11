/**
 * HIGH-IMPACT NEWS WARNINGS — an hour out, then 15 minutes, then 5.
 *
 * The user, 2026-08-04: *"It should also notify on high impact news affecting pairs traded by any
 * strategy 15 mins before the news and then 5 mins before the news."* And 2026-10-11, adding the
 * hour: *"i have never seen high impact news beeing announced in the channel like 'CPI release in
 * the next 1HR'."*
 *
 * ⚠ HE HAD NEVER SEEN ONE BECAUSE NOT ONE HAD EVER BEEN SENT. Nothing in this file was at fault —
 * the query that feeds it asked for `impactLevel = 'high'` while every writer stores `'High'`, and
 * Postgres is case-sensitive, so it matched nothing for as long as the feature existed. Fixed at
 * `server/scrapers/scheduler.ts:53`, which now compares in lower case. Worth knowing when reading
 * this file: it was correct and dead at the same time, and every check here passed throughout.
 *
 * Only the SCHEDULE lives here, with no Telegram and no database, so the whole rule is testable on
 * a fixed clock instead of by waiting for a real release. `telegramNotification` owns the timers and
 * the sending, exactly as it does for session opens.
 *
 * There WAS a `scheduleEventNotifications` on the service. It was dead code — nothing ever called
 * it — and it did 15 minutes only, filtered nothing by instrument, and broadcast to /start
 * subscribers rather than the channel. It is deleted rather than extended.
 */

// THE ONLY IMPORT IN THIS FILE, AND IT IS A PURE STRING. The header above keeps this module
// free of Telegram and the database so the whole rule stays testable on a fixed clock; that is
// about I/O, not about constants. `brand.ts` has no side effects and no dependencies of its
// own. It is here because the app name was written out BY HAND in this file and in
// sessionMessages.ts, and the 2026-10-11 rename missed this copy — a full-text sweep caught
// it, not the file list. One definition means a third message cannot drift.
import { RISK_DISCLAIMER_HTML } from '../lib/brand';
// Pure functions, no I/O — same justification as brand.ts above. The direction rules are shared
// rather than copied so the channel and the web calendar can never disagree about which way a
// release points, and so there is one place to be right. Tested in newsDirection.check.ts.
import { currencyOutlook } from './sentimentAnalysis';

/** Warning offsets, in minutes before the release. Every one fires for every qualifying release.
 *
 *  60 WAS ADDED 2026-10-11, in his words: *"i have never seen high impact news beeing announced in
 *  the channel like 'CPI release in the next 1HR'."* The hour's notice is the one that is actually
 *  actionable — at 5 minutes the only useful advice is "do not open anything". */
export const LEAD_MINUTES = [60, 15, 5] as const;

/** Ignore anything further out than this — the calendar is refreshed regularly and a timer days
 *  long would survive a stale event that has since moved or been revised. */
export const MAX_HORIZON_MS = 6 * 60 * 60 * 1000;

/**
 * The pairs the platform actually trades.
 *
 * MUST MIRROR `signal_platform/config/instruments.py TRADEABLE_INSTRUMENTS`. That list is the
 * platform's own source of truth and lives in Python; this is the Node view of it. The check in
 * `__tests__/newsAlerts.check.ts` asserts the two agree by parsing the Python file, so adding a
 * pair there and forgetting this one fails a check rather than silently going unwatched.
 */
export const TRADED_PAIRS: ReadonlyArray<readonly [string, string, string]> = [
  ["EUR/USD", "EUR", "USD"],
  ["GBP/USD", "GBP", "USD"],
  ["USD/JPY", "USD", "JPY"],
  ["GBP/JPY", "GBP", "JPY"],
  // GOLD, added 2026-10-11 (docs/OPEN.md C14). It was missing here while the platform traded it,
  // so no release ever flagged gold — and the check above had been failing on exactly that.
  //
  // ⚠ "XAU" IS NOT A CURRENCY WITH A CALENDAR, so this pair can only ever be matched through its
  // QUOTE side: gold is flagged on USD releases and on nothing else. That is the right behaviour
  // (gold is driven by US data) and it is already recorded as a known consequence at
  // signal_platform/config/instruments.py:29-31 — recorded there before shipping, not discovered
  // afterwards.
  ["XAU/USD", "XAU", "USD"],
];

/** Every currency that appears in a traded pair — the set a release has to touch to matter here. */
export const TRADED_CURRENCIES: ReadonlySet<string> = new Set(
  TRADED_PAIRS.flatMap(([, base, quote]) => [base, quote]),
);

/** Which traded pairs a currency moves. "USD" hits all five; "JPY" only the two yen crosses. */
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
  key: string;            // stable per release+lead, so a re-arm cannot double-book one warning
  message: string;
}

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const RULE = "━".repeat(21);
const NL = "\n";

/**
 * ONE RELEASE — every high-impact event a currency publishes at the SAME MINUTE.
 *
 * ⚠ THIS EXISTS BECAUSE OF WHAT THE REAL CALENDAR LOOKS LIKE, not for tidiness. Measured on
 * production for the week of 12 Oct 2026: Tuesday 12:30 UTC carries FOUR separate high-impact USD
 * rows — Core CPI m/m, Core CPI y/y, CPI m/m, CPI y/y — because one CPI release publishes four
 * numbers. Wednesday 12:30 carries another four (PPI and Retail Sales). Warning per ROW would put
 * twelve messages into the channel inside one minute, three times over. Nobody reads the twelfth.
 */
export interface NewsRelease {
  currency: string;
  at: Date;
  events: NewsEventLike[];
}

/** Group events into releases by currency and exact release time, earliest first. */
export function groupReleases(events: NewsEventLike[]): NewsRelease[] {
  const byKey = new Map<string, NewsRelease>();
  for (const ev of events ?? []) {
    const ms = new Date(ev.eventTime).getTime();
    if (!Number.isFinite(ms)) continue;
    const currency = String(ev.currency || "").trim().toUpperCase();
    const key = currency + "@" + ms;
    const hit = byKey.get(key);
    if (hit) hit.events.push(ev);
    else byKey.set(key, { currency, at: new Date(ms), events: [ev] });
  }
  return [...byKey.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** "Forecast 0.2%   ·   Previous 0.3%", or "" when the feed carried neither. */
function figures(ev: NewsEventLike): string {
  return [
    ev.expectedValue ? "Forecast <b>" + esc(ev.expectedValue) + "</b>" : "",
    ev.previousValue ? "Previous <b>" + esc(ev.previousValue) + "</b>" : "",
  ].filter(Boolean).join("   ·   ");
}

/** The body of the warning: a sentence for one number, a list for several. */
function releaseBody(release: NewsRelease): string {
  if (release.events.length === 1) {
    const e = release.events[0];
    const f = figures(e);
    return "<b>" + esc(release.currency) + " — " + esc(e.title) + "</b>" + (f ? NL + f : "");
  }
  const lines = release.events.map(e => {
    const f = figures(e);
    return "   • " + esc(e.title) + (f ? NL + "      " + f : "");
  });
  return "<b>" + esc(release.currency) + " — " + release.events.length + " releases</b>"
       + NL + lines.join(NL);
}

/**
 * "If it lands as forecast" — which way each traded pair points, or "" when no honest call exists.
 *
 * His ask, 2026-10-11: *"what it means to what pairs saying if the pairs are expected to go
 * bearish or bullish."*
 *
 * ⚠ IT COMPARES THE FORECAST WITH THE PREVIOUS READING, which answers "what is expected", not
 * "what happened" — the released number is not in this feed (docs/OPEN.md C6). Said plainly in the
 * wording so it cannot be read as a call on the outcome.
 *
 * THE DIRECTION IS DROPPED ENTIRELY when the release is not one we model, or the figures are
 * missing. A guessed direction on a channel people trade from is worse than no direction.
 */
function outlookLine(release: NewsRelease, pairs: string[]): string {
  // The release's own headline number — the first row carrying both figures.
  const lead = release.events.find(e => e.expectedValue && e.previousValue);
  if (!lead) return "";
  const dir = currencyOutlook(lead.title, lead.expectedValue, lead.previousValue);
  if (dir === null || dir === "neutral") return "";

  const stronger = dir === "bullish";
  const moves = pairs.map(p => {
    // The currency is this pair's BASE when the pair starts with it. Stronger base lifts the pair;
    // stronger QUOTE sinks it.
    const isBase = p.startsWith(release.currency);
    const up = isBase ? stronger : !stronger;
    return esc(p) + " " + (up ? "↑" : "↓");
  });
  return NL + "🧭 <b>If it lands as forecast:</b> " + esc(release.currency) + " "
       + (stronger ? "stronger" : "weaker") + " — " + moves.join("  ·  ") + NL;
}

/** The warning sent before a release. ONE message however many numbers the release publishes. */
export function newsMessage(release: NewsRelease, lead: number, pairs: string[]): string {
  const t = release.at;
  const hhmm = String(t.getUTCHours()).padStart(2, "0") + ":" + String(t.getUTCMinutes()).padStart(2, "0");
  const urgent = lead <= 5;
  const advice = urgent
    ? "<blockquote>Spreads widen and stops get hunted through a release. If you are already in, "
      + "know where your stop is. If you are not, waiting costs nothing.</blockquote>"
    : "<blockquote>Our agents keep scanning, but price around a release is news-driven, not "
      + "structure-driven. Size accordingly — <b>1–2% of your account</b>.</blockquote>";

  return (urgent ? "🚨" : "⚠️") + " <b>HIGH-IMPACT NEWS IN " + lead + " MINUTES</b>" + NL
    + RULE + NL + NL
    + releaseBody(release) + NL
    + "🕐 " + hhmm + " UTC" + NL
    + NL + "📉 <b>Affects:</b> " + pairs.map(esc).join(" · ") + NL
    + outlookLine(release, pairs)
    + NL + advice
    + NL + NL + RISK_DISCLAIMER_HTML;
}

/**
 * The warnings to schedule for `events`, in chronological order.
 *
 * Events are GROUPED INTO RELEASES first (see `groupReleases`), so a release publishing four
 * numbers produces one message per lead rather than four.
 *
 * Filters, in order: HIGH impact only; the currency must touch a traded pair; the warning must be
 * in the FUTURE (a 15-minute warning for a release 6 minutes away is noise, and the 5-minute one
 * still fires); and no further out than `MAX_HORIZON_MS`.
 */
export function buildNewsSchedule(events: NewsEventLike[], now: Date = new Date()): NewsAlert[] {
  const high = (events ?? []).filter(
    ev => String(ev.impactLevel || "").toLowerCase() === "high",
  );
  const out: NewsAlert[] = [];
  for (const release of groupReleases(high)) {
    const pairs = affectedPairs(release.currency);
    if (pairs.length === 0) continue;                    // a currency we never trade
    for (const lead of LEAD_MINUTES) {
      const at = new Date(release.at.getTime() - lead * 60_000);
      const delay = at.getTime() - now.getTime();
      if (delay <= 0 || delay > MAX_HORIZON_MS) continue;
      // KEYED ON THE RELEASE, not on one row's id — the four CPI rows are one warning now, and the
      // hourly re-arm must not be able to double-book it.
      out.push({
        at,
        leadMinutes: lead,
        key: "news_" + release.currency + "_" + release.at.getTime() + "_" + lead,
        message: newsMessage(release, lead, pairs),
      });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
