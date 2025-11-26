export type MarketType = 'forex' | 'stock' | 'crypto' | 'commodity' | 'index';

interface TradingSession {
  name: string;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  timezone: string;
  daysOpen: number[];
}

interface MarketHoursConfig {
  sessions: TradingSession[];
  is24_7: boolean;
  is24_5: boolean;
  isDSTAware?: boolean;
}

function isUSInDST(date: Date): boolean {
  const year = date.getUTCFullYear();
  
  const marchSecondSunday = new Date(Date.UTC(year, 2, 1));
  marchSecondSunday.setUTCDate(1 + ((7 - marchSecondSunday.getUTCDay()) % 7) + 7);
  marchSecondSunday.setUTCHours(7, 0, 0, 0);
  
  const novFirstSunday = new Date(Date.UTC(year, 10, 1));
  novFirstSunday.setUTCDate(1 + ((7 - novFirstSunday.getUTCDay()) % 7));
  novFirstSunday.setUTCHours(6, 0, 0, 0);
  
  return date >= marchSecondSunday && date < novFirstSunday;
}

function getUSMarketHours(date: Date): { openHour: number; openMinute: number; closeHour: number; closeMinute: number } {
  const isDST = isUSInDST(date);
  
  if (isDST) {
    return { openHour: 13, openMinute: 30, closeHour: 20, closeMinute: 0 };
  } else {
    return { openHour: 14, openMinute: 30, closeHour: 21, closeMinute: 0 };
  }
}

const MARKET_HOURS: Record<MarketType, MarketHoursConfig> = {
  forex: {
    sessions: [
      { name: 'Sydney', openHour: 22, openMinute: 0, closeHour: 7, closeMinute: 0, timezone: 'UTC', daysOpen: [0, 1, 2, 3, 4] },
      { name: 'Tokyo', openHour: 0, openMinute: 0, closeHour: 9, closeMinute: 0, timezone: 'UTC', daysOpen: [1, 2, 3, 4, 5] },
      { name: 'London', openHour: 8, openMinute: 0, closeHour: 17, closeMinute: 0, timezone: 'UTC', daysOpen: [1, 2, 3, 4, 5] },
      { name: 'New York', openHour: 13, openMinute: 0, closeHour: 22, closeMinute: 0, timezone: 'UTC', daysOpen: [1, 2, 3, 4, 5] },
    ],
    is24_7: false,
    is24_5: true,
  },
  
  stock: {
    sessions: [
      { name: 'US Market', openHour: 14, openMinute: 30, closeHour: 21, closeMinute: 0, timezone: 'America/New_York', daysOpen: [1, 2, 3, 4, 5] },
    ],
    is24_7: false,
    is24_5: false,
    isDSTAware: true,
  },
  
  crypto: {
    sessions: [],
    is24_7: true,
    is24_5: false,
  },
  
  commodity: {
    sessions: [
      { name: 'COMEX Gold/Silver', openHour: 23, openMinute: 0, closeHour: 22, closeMinute: 0, timezone: 'UTC', daysOpen: [0, 1, 2, 3, 4] },
      { name: 'Oil NYMEX', openHour: 23, openMinute: 0, closeHour: 22, closeMinute: 0, timezone: 'UTC', daysOpen: [0, 1, 2, 3, 4] },
    ],
    is24_7: false,
    is24_5: true,
  },
  
  index: {
    sessions: [
      { name: 'US Index Futures', openHour: 23, openMinute: 0, closeHour: 22, closeMinute: 0, timezone: 'UTC', daysOpen: [0, 1, 2, 3, 4] },
    ],
    is24_7: false,
    is24_5: true,
  },
};

export function isMarketOpen(assetClass: string, now: Date = new Date()): { isOpen: boolean; reason: string; nextOpen?: Date } {
  const marketType = assetClass as MarketType;
  const config = MARKET_HOURS[marketType];
  
  if (!config) {
    return { isOpen: true, reason: 'Unknown asset class - assuming open' };
  }
  
  if (config.is24_7) {
    return { isOpen: true, reason: 'Crypto markets trade 24/7' };
  }
  
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const utcDay = now.getUTCDay();
  
  if (config.is24_5) {
    const isFridayAfterClose = utcDay === 5 && utcHour >= 22;
    const isSaturday = utcDay === 6;
    const isSundayBeforeOpen = utcDay === 0 && utcHour < 22;
    
    if (isFridayAfterClose || isSaturday || isSundayBeforeOpen) {
      const nextSunday = new Date(now);
      if (utcDay === 5) {
        nextSunday.setUTCDate(nextSunday.getUTCDate() + 2);
      } else if (utcDay === 6) {
        nextSunday.setUTCDate(nextSunday.getUTCDate() + 1);
      }
      nextSunday.setUTCHours(22, 0, 0, 0);
      
      return { 
        isOpen: false, 
        reason: 'Weekend - markets closed Friday 10PM to Sunday 10PM UTC',
        nextOpen: nextSunday
      };
    }
    
    return { isOpen: true, reason: `${assetClass} markets open (24/5)` };
  }
  
  if (config.isDSTAware && marketType === 'stock') {
    const { openHour, openMinute, closeHour, closeMinute } = getUSMarketHours(now);
    
    if (!config.sessions[0].daysOpen.includes(utcDay)) {
      const nextOpen = findNextUSMarketOpen(now);
      return { 
        isOpen: false, 
        reason: 'US stock market closed - weekend',
        nextOpen
      };
    }
    
    const currentMinutes = utcHour * 60 + utcMinute;
    const openMinutes = openHour * 60 + openMinute;
    const closeMinutes = closeHour * 60 + closeMinute;
    
    if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
      const isDST = isUSInDST(now);
      return { isOpen: true, reason: `US Market session active (${isDST ? 'EDT' : 'EST'})` };
    }
    
    const nextOpen = findNextUSMarketOpen(now);
    const isDST = isUSInDST(now);
    return { 
      isOpen: false, 
      reason: `US stock market closed - outside ${isDST ? '9:30 AM - 4:00 PM EDT' : '9:30 AM - 4:00 PM EST'}`,
      nextOpen
    };
  }
  
  for (const session of config.sessions) {
    if (!session.daysOpen.includes(utcDay)) {
      continue;
    }
    
    const currentMinutes = utcHour * 60 + utcMinute;
    const openMinutes = session.openHour * 60 + session.openMinute;
    const closeMinutes = session.closeHour * 60 + session.closeMinute;
    
    if (closeMinutes > openMinutes) {
      if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
        return { isOpen: true, reason: `${session.name} session active` };
      }
    } else {
      if (currentMinutes >= openMinutes || currentMinutes < closeMinutes) {
        return { isOpen: true, reason: `${session.name} session active` };
      }
    }
  }
  
  const nextSession = findNextSession(config, now);
  return { 
    isOpen: false, 
    reason: `${assetClass} market closed - outside trading hours`,
    nextOpen: nextSession
  };
}

function findNextUSMarketOpen(now: Date): Date {
  const nextOpen = new Date(now);
  const { openHour, openMinute } = getUSMarketHours(now);
  
  nextOpen.setUTCHours(openHour, openMinute, 0, 0);
  
  if (nextOpen <= now) {
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
  }
  
  while (nextOpen.getUTCDay() === 0 || nextOpen.getUTCDay() === 6) {
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
  }
  
  const futureHours = getUSMarketHours(nextOpen);
  nextOpen.setUTCHours(futureHours.openHour, futureHours.openMinute, 0, 0);
  
  return nextOpen;
}

function findNextSession(config: MarketHoursConfig, now: Date): Date | undefined {
  if (config.sessions.length === 0) return undefined;
  
  const session = config.sessions[0];
  const nextOpen = new Date(now);
  
  nextOpen.setUTCHours(session.openHour, session.openMinute, 0, 0);
  
  if (nextOpen <= now) {
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
  }
  
  while (!session.daysOpen.includes(nextOpen.getUTCDay())) {
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
  }
  
  return nextOpen;
}

export function getActiveSession(assetClass: string, now: Date = new Date()): string | null {
  const marketType = assetClass as MarketType;
  const config = MARKET_HOURS[marketType];
  
  if (!config) return null;
  
  if (config.is24_7) return 'Always Open';
  
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const utcDay = now.getUTCDay();
  
  for (const session of config.sessions) {
    if (!session.daysOpen.includes(utcDay)) continue;
    
    const currentMinutes = utcHour * 60 + utcMinute;
    const openMinutes = session.openHour * 60 + session.openMinute;
    const closeMinutes = session.closeHour * 60 + session.closeMinute;
    
    if (closeMinutes > openMinutes) {
      if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
        return session.name;
      }
    } else {
      if (currentMinutes >= openMinutes || currentMinutes < closeMinutes) {
        return session.name;
      }
    }
  }
  
  return null;
}

export function getMarketStatus(assetClass: string): {
  isOpen: boolean;
  session: string | null;
  reason: string;
  nextOpen?: string;
} {
  const now = new Date();
  const { isOpen, reason, nextOpen } = isMarketOpen(assetClass, now);
  const session = getActiveSession(assetClass, now);
  
  return {
    isOpen,
    session,
    reason,
    nextOpen: nextOpen?.toISOString(),
  };
}

export function filterTradeableInstruments<T extends { assetClass: string; symbol: string }>(
  instruments: T[],
  now: Date = new Date()
): { tradeable: T[]; skipped: { instrument: T; reason: string }[] } {
  const tradeable: T[] = [];
  const skipped: { instrument: T; reason: string }[] = [];
  
  for (const instrument of instruments) {
    const { isOpen, reason } = isMarketOpen(instrument.assetClass, now);
    
    if (isOpen) {
      tradeable.push(instrument);
    } else {
      skipped.push({ instrument, reason });
    }
  }
  
  return { tradeable, skipped };
}
