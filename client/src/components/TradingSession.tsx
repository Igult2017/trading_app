import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import { getActiveSessions, getSessionElapsedMinutes, getSessionTimeRemaining, formatMinutesToHoursAndMinutes } from '@/lib/tradingSessions';
import { Card } from '@/components/ui/card';

export default function TradingSession() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sessions, setSessions] = useState(getActiveSessions());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      setSessions(getActiveSessions());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const activeSessions = sessions.filter(s => s.isActive);

  return (
    <Card data-testid="card-trading-session" className="border-blue-500/50">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-blue-500/10">
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-foreground uppercase tracking-wide">Trading Sessions</h2>
              <p className="text-xs text-muted-foreground font-semibold tabular-nums" data-testid="text-current-time">
                {currentTime.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false })} UTC
              </p>
            </div>
          </div>
          
          {activeSessions.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {activeSessions.map(session => (
                <Badge 
                  key={session.name}
                  variant="default" 
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-1"
                  style={{ backgroundColor: session.color }}
                  data-testid={`badge-active-${session.name.toLowerCase()}`}
                >
                  {session.name}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Session Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {sessions.map((session) => {
            const elapsed = getSessionElapsedMinutes(session);
            const remaining = getSessionTimeRemaining(session);
            const total = elapsed + remaining;
            const progress = total > 0 ? (elapsed / total) * 100 : 0;
            
            return (
              <div
                key={session.name}
                className={`relative overflow-hidden rounded-lg border-2 p-4 transition-all ${
                  session.isActive 
                    ? 'bg-card border-border hover-elevate' 
                    : 'bg-muted/30 border-border/50 opacity-60'
                }`}
                style={session.isActive ? { borderLeftColor: session.color, borderLeftWidth: '4px' } : {}}
                data-testid={`card-session-${session.name.toLowerCase()}`}
              >
                {/* Session Name and Status */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-extrabold text-foreground uppercase tracking-tight">
                      {session.name}
                    </h3>
                    <Badge 
                      variant={session.isActive ? "default" : "secondary"}
                      className="text-[9px] font-bold uppercase px-1.5 py-0.5"
                      style={session.isActive ? { backgroundColor: session.color } : {}}
                    >
                      {session.isActive ? 'LIVE' : 'CLOSED'}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono font-semibold">
                    {session.openTime} - {session.closeTime} UTC
                  </p>
                </div>

                {/* Progress Bar */}
                {session.isActive && (
                  <div className="space-y-2" data-testid="card-session-details">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full transition-all duration-1000"
                        style={{ 
                          width: `${progress}%`,
                          backgroundColor: session.color
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className="text-muted-foreground tabular-nums" data-testid={`text-elapsed-time-${session.name.toLowerCase()}`}>
                        {formatMinutesToHoursAndMinutes(elapsed)}
                      </span>
                      <span className="text-muted-foreground">{Math.round(progress)}%</span>
                      <span className="text-muted-foreground tabular-nums" data-testid={`text-remaining-time-${session.name.toLowerCase()}`}>
                        {formatMinutesToHoursAndMinutes(remaining)}
                      </span>
                    </div>
                  </div>
                )}
                
                {!session.isActive && (
                  <div className="text-center py-2" data-testid="card-session-closed">
                    <Clock className="w-6 h-6 mx-auto text-muted-foreground opacity-30" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}