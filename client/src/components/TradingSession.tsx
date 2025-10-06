import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, Globe, TrendingUp, Timer } from 'lucide-react';
import { getActiveSessions, getSessionElapsedMinutes, getSessionTimeRemaining, formatMinutesToHoursAndMinutes } from '@/lib/tradingSessions';
import { Progress } from '@/components/ui/progress';

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
    <div data-testid="card-trading-session" className="bg-white dark:bg-background">
      <div className="pb-4 mb-4 border-b border-border/50">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Globe className="w-5 h-5" />
          Global Trading Sessions
        </div>
      </div>
      <div className="space-y-5">
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-muted/50 to-muted/30 rounded-lg border border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-background rounded-md">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Current Time</div>
              <div className="text-lg font-bold tabular-nums" data-testid="text-current-time">
                {currentTime.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false })} UTC
              </div>
            </div>
          </div>
          {activeSessions.length > 0 && (
            <div className="flex gap-2 flex-wrap justify-end">
              {activeSessions.map(session => (
                <Badge 
                  key={session.name}
                  variant="default" 
                  className="text-xs font-semibold px-3 py-1"
                  style={{ backgroundColor: session.color }}
                  data-testid={`badge-active-${session.name.toLowerCase()}`}
                >
                  {session.name}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {activeSessions.length > 0 ? (
          <div className="space-y-3">
            {activeSessions.map((session) => {
              const elapsed = getSessionElapsedMinutes(session);
              const remaining = getSessionTimeRemaining(session);
              const total = elapsed + remaining;
              const progress = total > 0 ? (elapsed / total) * 100 : 0;
              
              return (
                <div 
                  key={session.name}
                  className="p-4 border rounded-lg bg-gradient-to-br from-primary/5 to-transparent" 
                  style={{ borderColor: `${session.color}50` }}
                  data-testid="card-session-details"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" style={{ color: session.color }} />
                      <h3 className="font-semibold text-base">{session.name} Session</h3>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">
                      {session.openTime} - {session.closeTime} UTC
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 flex-1">
                        <Timer className="w-4 h-4 text-green-500" />
                        <div>
                          <div className="text-xs text-muted-foreground">Elapsed</div>
                          <div className="text-sm font-bold tabular-nums text-foreground" data-testid={`text-elapsed-time-${session.name.toLowerCase()}`}>
                            {formatMinutesToHoursAndMinutes(elapsed)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="h-8 w-px bg-border" />
                      
                      <div className="flex items-center gap-2 flex-1 justify-end">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Remaining</div>
                          <div className="text-sm font-bold tabular-nums text-foreground" data-testid={`text-remaining-time-${session.name.toLowerCase()}`}>
                            {formatMinutesToHoursAndMinutes(remaining)}
                          </div>
                        </div>
                        <Clock className="w-4 h-4 text-orange-500" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Progress value={progress} className="h-2" style={{ backgroundColor: `${session.color}20` }} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{Math.round(progress)}% Complete</span>
                        <span>{formatMinutesToHoursAndMinutes(total)} Total</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 border border-border/50 rounded-lg text-center bg-muted/20" data-testid="card-session-closed">
            <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
            <span className="text-sm font-medium text-muted-foreground">
              Markets Closed - Weekend
            </span>
          </div>
        )}

        <div className="space-y-0 divide-y divide-border/50">
          {sessions.map((session, index) => (
            <div
              key={session.name}
              className={`py-4 transition-all ${
                session.isActive 
                  ? 'hover-elevate' 
                  : ''
              } ${index === 0 ? 'pt-0' : ''}`}
              data-testid={`card-session-${session.name.toLowerCase()}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div 
                      className="w-1 h-4 rounded-full" 
                      style={{ backgroundColor: session.isActive ? session.color : 'hsl(var(--muted-foreground) / 0.3)' }}
                    />
                    <div className="text-sm font-semibold">{session.name}</div>
                    {session.name === 'New York' && sessions.find(s => s.name === 'London')?.isActive && session.isActive && (
                      <Badge variant="outline" className="text-xs ml-1">
                        Overlaps with London
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono ml-5">
                    {session.openTime} - {session.closeTime}
                  </div>
                </div>
                <Badge 
                  variant={session.isActive ? "default" : "secondary"}
                  className="text-xs mr-2"
                  style={session.isActive ? { backgroundColor: session.color } : {}}
                >
                  {session.isActive ? 'Active' : 'Closed'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}