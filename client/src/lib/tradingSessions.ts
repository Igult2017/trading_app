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

const SESSION_DEFINITIONS = [
  {
    name: 'Sydney',
    city: 'Sydney',
    timezone: 'AEDT (UTC+11)',
    openUTC: 22,
    closeUTC: 7,
    color: 'hsl(280 85% 70%)',
  },
  {
    name: 'Tokyo',
    city: 'Tokyo',
    timezone: 'JST (UTC+9)',
    openUTC: 0,
    closeUTC: 9,
    color: 'hsl(45 90% 60%)',
  },
  {
    name: 'London',
    city: 'London',
    timezone: 'BST (UTC+1)',
    openUTC: 7,
    closeUTC: 15.5,
    color: 'hsl(120 60% 50%)',
  },
  {
    name: 'New York',
    city: 'New York',
    timezone: 'EDT (UTC-4)',
    openUTC: 12,
    closeUTC: 21,
    color: 'hsl(210 100% 60%)',
  },
];

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
  const dayOfWeek = now.getUTCDay();
  
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  return SESSION_DEFINITIONS.map(session => {
    const isActive = !isWeekend && isSessionActive(session.openUTC, session.closeUTC, currentUTC);
    
    return {
      ...session,
      openTime: formatUTCTime(session.openUTC),
      closeTime: formatUTCTime(session.closeUTC),
      isActive,
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
