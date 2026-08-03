/**
 * What Telegram should say about the forex WEEK, and when.
 *
 * Pure schedule computation — no bot, no timers, no I/O — so the "should this fire on a Saturday?"
 * question is answerable without waiting for a Saturday. `telegramNotification` owns the timers.
 *
 * THE BUG THIS EXISTS TO KILL. `scheduleTradingSessionNotifications` computed "15 minutes before
 * today's London/New York open" and fired it, guarded only by `if (delay < 0) continue` — i.e. it
 * skipped times already past and nothing else. There was no weekday check anywhere in it, and a cron
 * re-ran it at midnight UTC EVERY day, so subscribers were told "London Session Opening in 15 min"
 * at 07:45 on Saturdays and Sundays with the market shut. Reported live on Sat 2026-08-01.
 *
 * Market state is decided by `isMarketOpen('forex', …)` in lib/marketHours — the definition already
 * used by the app and matching the Python platform's `is_forex_open`. Do not add a second one here;
 * two definitions of "is the market open" is how they drift apart.
 */
import { weekOpenMessage, sessionOpenMessage, weekCloseMessage } from './sessionMessages';
import { isMarketOpen } from '../lib/marketHours';

export type AlertKind = 'session_open' | 'week_close' | 'week_preopen';

export interface ScheduledAlert {
  at: Date;
  kind: AlertKind;
  message: string;
}

interface SessionDef { name: string; openUTC: number; }

export const HIGH_VOLUME_SESSIONS: SessionDef[] = [
  { name: 'London', openUTC: 8 },
  { name: 'New York', openUTC: 13 },
];

export const SESSION_ALERT_MINS = 15;   // how far ahead of a session open to warn
export const PREOPEN_ALERT_MINS = 60;   // his rule: warn 1 hour before the week opens
const WEEK_OPEN_UTC_HOUR = 22;          // Sunday 22:00 UTC — the forex week opens
const WEEK_CLOSE_UTC_HOUR = 22;         // Friday 22:00 UTC — and closes

const atUTC = (d: Date, h: number, m = 0) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m, 0, 0));

const fmt = (d: Date) =>
  d.toUTCString().replace('GMT', 'UTC').replace(/^(\w{3}), /, '$1 ');

/** Alerts to schedule for the UTC day `now` falls in, in chronological order. */
export function buildDailySchedule(now: Date = new Date()): ScheduledAlert[] {
  const out: ScheduledAlert[] = [];
  const day = now.getUTCDay();            // 0=Sun … 6=Sat

  // ── Session opens. Only when the market is actually TRADING at that open. ──────────────────────
  // Checking the OPEN time (not "now") is the point: this runs at midnight and the alert lands
  // hours later. On Sat/Sun both sessions land inside the weekend and are dropped.
  for (const s of HIGH_VOLUME_SESSIONS) {
    const open = atUTC(now, s.openUTC);
    if (!isMarketOpen('forex', open).isOpen) continue;
    out.push({
      at: new Date(open.getTime() - SESSION_ALERT_MINS * 60_000),
      kind: 'session_open',
      message: sessionOpenMessage(s.name, SESSION_ALERT_MINS, s.openUTC),
    });
  }

  // ── Friday: the week closes at 22:00 UTC. ─────────────────────────────────────────────────────
  if (day === 5) {
    const close = atUTC(now, WEEK_CLOSE_UTC_HOUR);
    const reopen = nextWeekOpen(close);
    out.push({
      at: close,
      kind: 'week_close',
      message: weekCloseMessage(WEEK_CLOSE_UTC_HOUR, fmt(reopen)),
    });
  }

  // ── Sunday: the week reopens at 22:00 UTC — warn an hour ahead. ───────────────────────────────
  if (day === 0) {
    const open = atUTC(now, WEEK_OPEN_UTC_HOUR);
    out.push({
      at: new Date(open.getTime() - PREOPEN_ALERT_MINS * 60_000),
      kind: 'week_preopen',
      message: weekOpenMessage(PREOPEN_ALERT_MINS),
    });
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The next Sunday 22:00 UTC strictly after `from`. */
export function nextWeekOpen(from: Date): Date {
  const d = atUTC(from, WEEK_OPEN_UTC_HOUR);
  while (d.getUTCDay() !== 0 || d.getTime() <= from.getTime()) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

/**
 * Re-check at FIRE time, not just at schedule time. A timer set at midnight fires hours later, and
 * a redeploy, a clock change or a DST shift in between must not be able to push a "session opening"
 * message into a closed market. `week_close` and `week_preopen` are exempt: they are ABOUT the
 * market being closed, so gating them on it being open would silence exactly the two new messages.
 */
export function shouldStillFire(kind: AlertKind, when: Date = new Date()): boolean {
  if (kind !== 'session_open') return true;
  return isMarketOpen('forex', when).isOpen;
}
