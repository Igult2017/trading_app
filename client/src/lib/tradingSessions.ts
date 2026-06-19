export interface TradingSession {
  name: string;
  city: string;
  timezone: string;
  openTime: string;
  closeTime: string;
  isActive: boolean;
  color: string;
  openUTC: number;
  closeUTC: number;
}

// Each centre's REAL IANA timezone + standard local session hours. Open/close in
// UTC are derived live from the current offset, so Daylight Saving Time is always
// correct (London/NY shift in N-winter; Sydney in Australian summer) — matching
// the server /api/market-sessions and Google's session clock.
const SESSION_DEFS = [
  { name: 'Sydney',   city: 'Sydney',   tz: 'Australia/Sydney', open: 8, close: 17, color: 'hsl(280 85% 70%)' },
  { name: 'Tokyo',    city: 'Tokyo',    tz: 'Asia/Tokyo',       open: 9, close: 18, color: 'hsl(45 90% 60%)'  },
  { name: 'London',   city: 'London',   tz: 'Europe/London',    open: 8, close: 17, color: 'hsl(120 60% 50%)' },
  { name: 'New York', city: 'New York', tz: 'America/New_York', open: 8, close: 17, color: 'hsl(210 100% 60%)' },
];

const wrap = (h: number): number => ((h % 24) + 24) % 24;

/** Current UTC offset (whole hours) for an IANA zone — reflects live DST. */
function offsetHours(tz: string, at: Date): number {
  const inTz  = new Date(at.toLocaleString('en-US', { timeZone: tz }));
  const inUtc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((inTz.getTime() - inUtc.getTime()) / 3_600_000);
}

/** Human label like "BST (UTC+1)" / "GMT (UTC+0)", computed live. */
function tzLabel(tz: string, off: number, at: Date): string {
  let abbrev = '';
  try {
    abbrev = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? '';
  } catch { /* ignore */ }
  const utc = off === 0 ? 'UTC+0' : `UTC${off > 0 ? '+' : ''}${off}`;
  return abbrev ? `${abbrev} (${utc})` : utc;
}

/** Forex is closed all Saturday, Sunday before 22:00 UTC, and Friday from 22:00 UTC. */
function isForexClosed(now: Date): boolean {
  const dow = now.getUTCDay();   // 0=Sun … 6=Sat
  const h   = now.getUTCHours();
  return dow === 6 || (dow === 0 && h < 22) || (dow === 5 && h >= 22);
}

function formatUTCTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function isSessionActive(openUTC: number, closeUTC: number, currentUTC: number): boolean {
  if (openUTC < closeUTC) {
    return currentUTC >= openUTC && currentUTC < closeUTC;
  } else {
    return currentUTC >= openUTC || currentUTC < closeUTC;
  }
}

export function getActiveSessions(): TradingSession[] {
  const now = new Date();
  const currentUTC = now.getUTCHours() + now.getUTCMinutes() / 60;
  const closed = isForexClosed(now);

  return SESSION_DEFS.map(s => {
    const off      = offsetHours(s.tz, now);     // DST-aware
    const openUTC  = wrap(s.open  - off);
    const closeUTC = wrap(s.close - off);
    const isActive = !closed && isSessionActive(openUTC, closeUTC, currentUTC);

    return {
      name:     s.name,
      city:     s.city,
      timezone: tzLabel(s.tz, off, now),
      openUTC,
      closeUTC,
      openTime: formatUTCTime(openUTC),
      closeTime: formatUTCTime(closeUTC),
      isActive,
      color:    s.color,
    };
  });
}

export function getActiveSessionNames(): string[] {
  return getActiveSessions()
    .filter(s => s.isActive)
    .map(s => s.name);
}

export function getSessionStartTime(session: TradingSession): Date {
  const now = new Date();
  const sessionStart = new Date(now);
  
  const hours = Math.floor(session.openUTC);
  const minutes = Math.round((session.openUTC - hours) * 60);
  
  sessionStart.setUTCHours(hours, minutes, 0, 0);
  
  if (session.openUTC > session.closeUTC && now.getUTCHours() < session.closeUTC) {
    sessionStart.setUTCDate(sessionStart.getUTCDate() - 1);
  }
  
  return sessionStart;
}

export function getSessionTimeRemaining(session: TradingSession): number {
  if (!session.isActive) return 0;
  
  const now = new Date();
  const currentUTC = now.getUTCHours() + now.getUTCMinutes() / 60;
  
  let timeRemaining: number;
  
  if (session.openUTC < session.closeUTC) {
    timeRemaining = session.closeUTC - currentUTC;
  } else {
    if (currentUTC >= session.openUTC) {
      timeRemaining = 24 - currentUTC + session.closeUTC;
    } else {
      timeRemaining = session.closeUTC - currentUTC;
    }
  }
  
  return Math.max(0, Math.floor(timeRemaining * 60));
}

export function getSessionElapsedMinutes(session: TradingSession): number {
  if (!session.isActive) return 0;
  
  const sessionStart = getSessionStartTime(session);
  const now = new Date();
  
  return Math.floor((now.getTime() - sessionStart.getTime()) / (1000 * 60));
}

export function formatMinutesToHoursAndMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours === 0) {
    return `${minutes}m`;
  } else if (minutes === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${minutes}m`;
  }
}

export function getMinutesUntilSessionOpen(session: TradingSession): number {
  if (session.isActive) return 0;
  
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  if (isWeekend) {
    // Calculate time until Monday 00:00 UTC, then add time to session open
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 2;
    const hoursUntilMonday = (24 - now.getUTCHours() - 1) + (daysUntilMonday - 1) * 24;
    const minutesUntilMonday = (60 - now.getUTCMinutes()) + hoursUntilMonday * 60;
    
    // Add time from Monday 00:00 to session open
    const sessionOpenMinutes = Math.floor(session.openUTC * 60);
    return minutesUntilMonday + sessionOpenMinutes;
  }
  
  const currentUTC = now.getUTCHours() + now.getUTCMinutes() / 60;
  let hoursUntilOpen: number;
  
  if (session.openUTC > currentUTC) {
    // Session opens later today
    hoursUntilOpen = session.openUTC - currentUTC;
  } else {
    // Session opens tomorrow
    hoursUntilOpen = 24 - currentUTC + session.openUTC;
  }
  
  return Math.floor(hoursUntilOpen * 60);
}
