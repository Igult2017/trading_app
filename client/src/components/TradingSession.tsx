import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Globe } from 'lucide-react';
import { getActiveSessions, getSessionElapsedMinutes, getSessionTimeRemaining } from '@/lib/tradingSessions';

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
  const primarySession = activeSessions[0];
  const elapsedMinutes = primarySession ? getSessionElapsedMinutes(primarySession) : 0;
  const remainingMinutes = primarySession ? getSessionTimeRemaining(primarySession) : 0;

  return (
    <Card data-testid="card-trading-session">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Globe className="w-5 h-5" />
          Trading Sessions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium" data-testid="text-current-time">
              {currentTime.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false })} UTC
            </span>
          </div>
          {activeSessions.length > 0 && (
            <div className="flex gap-1 flex-wrap justify-end">
              {activeSessions.map(session => (
                <Badge 
                  key={session.name}
                  variant="default" 
                  className="text-xs"
                  style={{ backgroundColor: session.color }}
                  data-testid={`badge-active-${session.name.toLowerCase()}`}
                >
                  {session.name}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {primarySession ? (
          <div className="p-3 border border-border rounded-md" data-testid="card-session-details">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">{primarySession.name} Session</h3>
              <span className="text-xs text-muted-foreground">
                {primarySession.openTime} - {primarySession.closeTime} UTC
              </span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span data-testid="text-elapsed-time">
                Elapsed: {elapsedMinutes} min
              </span>
              <span data-testid="text-remaining-time">
                Remaining: {remainingMinutes} min
              </span>
            </div>
            {activeSessions.length > 1 && (
              <div className="mt-2 pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Overlapping with: {activeSessions.slice(1).map(s => s.name).join(', ')}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 border border-border rounded-md text-center" data-testid="card-session-closed">
            <span className="text-sm text-muted-foreground">
              Markets Closed - Weekend
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {sessions.map((session) => (
            <div
              key={session.name}
              className={`p-2 rounded-md border text-center transition-colors hover-elevate ${
                session.isActive ? 'border-primary/50 bg-primary/5' : 'border-border'
              }`}
              data-testid={`card-session-${session.name.toLowerCase()}`}
            >
              <div className="text-xs font-medium">{session.name}</div>
              <div className="text-xs text-muted-foreground">
                {session.openTime}-{session.closeTime}
              </div>
              <Badge 
                variant={session.isActive ? "default" : "secondary"}
                className="text-xs mt-1"
                style={session.isActive ? { backgroundColor: session.color } : {}}
              >
                {session.isActive ? 'Active' : 'Closed'}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}