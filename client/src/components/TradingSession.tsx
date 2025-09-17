import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Globe } from 'lucide-react';

interface Session {
  name: string;
  city: string;
  timezone: string;
  openTime: string;
  closeTime: string;
  isActive: boolean;
  color: string;
}

export default function TradingSession() {
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // TODO: Remove mock data - replace with real session data
  const sessions: Session[] = [
    {
      name: 'London',
      city: 'London',
      timezone: 'GMT',
      openTime: '08:00',
      closeTime: '17:00',
      isActive: true,
      color: 'hsl(120 60% 50%)'
    },
    {
      name: 'New York',
      city: 'New York',
      timezone: 'EST',
      openTime: '08:00',
      closeTime: '17:00',
      isActive: false,
      color: 'hsl(210 100% 60%)'
    },
    {
      name: 'Tokyo',
      city: 'Tokyo',
      timezone: 'JST',
      openTime: '09:00',
      closeTime: '15:00',
      isActive: false,
      color: 'hsl(45 90% 60%)'
    },
    {
      name: 'Sydney',
      city: 'Sydney',
      timezone: 'AEST',
      openTime: '09:00',
      closeTime: '17:00',
      isActive: false,
      color: 'hsl(280 85% 70%)'
    }
  ];

  const activeSession = sessions.find(s => s.isActive);
  const sessionStartTime = new Date();
  sessionStartTime.setHours(8, 0, 0, 0); // Mock session start at 8 AM
  const elapsedMinutes = Math.floor((currentTime.getTime() - sessionStartTime.getTime()) / (1000 * 60));

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
              {currentTime.toLocaleTimeString()}
            </span>
          </div>
          {activeSession && (
            <Badge 
              variant="default" 
              className="text-xs"
              style={{ backgroundColor: activeSession.color }}
              data-testid="badge-active-session"
            >
              {activeSession.name} Active
            </Badge>
          )}
        </div>

        {activeSession && (
          <div className="p-3 border border-border rounded-md" data-testid="card-session-details">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">{activeSession.name} Session</h3>
              <span className="text-xs text-muted-foreground">
                {activeSession.openTime} - {activeSession.closeTime} {activeSession.timezone}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              <span data-testid="text-elapsed-time">
                Elapsed: {Math.max(0, elapsedMinutes)} minutes
              </span>
            </div>
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