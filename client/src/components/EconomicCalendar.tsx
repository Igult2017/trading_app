import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';

interface EconomicEvent {
  title: string;
  currency: string;
  impactLevel: string;
  eventTime: string;
  expectedValue: string | null;
  previousValue: string | null;
  actualValue: string | null;
  marketImpactAnalysis: string | null;
  isReleased: boolean;
}

export default function EconomicCalendar() {
  const { data: allEvents = [], isLoading } = useQuery<EconomicEvent[]>({
    queryKey: ['/api/economic-events'],
  });

  const events = allEvents.slice(0, 5);

  const getImpactColor = (impact: string) => {
    const impactLower = impact?.toLowerCase() || '';
    switch(impactLower) {
      case 'high': return 'hsl(0 75% 60%)';
      case 'medium': return 'hsl(45 90% 60%)';
      case 'low': return 'hsl(120 60% 50%)';
      default: return '';
    }
  };

  const getMarketSentiment = (event: EconomicEvent) => {
    if (!event.expectedValue || !event.actualValue) {
      return { sentiment: 'neutral', icon: <div className="w-3 h-3 rounded-full bg-muted-foreground/50" /> };
    }
    
    const expected = parseFloat(event.expectedValue);
    const actual = parseFloat(event.actualValue);
    
    if (isNaN(expected) || isNaN(actual)) {
      return { sentiment: 'neutral', icon: <div className="w-3 h-3 rounded-full bg-muted-foreground/50" /> };
    }
    
    if (actual > expected) {
      return { 
        sentiment: 'Bullish', 
        icon: <TrendingUp className="w-3 h-3 text-green-500" />
      };
    } else if (actual < expected) {
      return { 
        sentiment: 'Bearish', 
        icon: <TrendingDown className="w-3 h-3 text-red-500" />
      };
    }
    return { 
      sentiment: 'Neutral', 
      icon: <div className="w-3 h-3 rounded-full bg-muted-foreground/50" />
    };
  };

  if (isLoading) {
    return (
      <Card data-testid="card-economic-calendar">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Calendar className="w-5 h-5" />
            Economic Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">Loading events...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-economic-calendar">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Calendar className="w-5 h-5" />
          Economic Calendar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No upcoming events</p>
          ) : (
            events.map((event, index) => {
              const sentiment = getMarketSentiment(event);
              const eventTime = new Date(event.eventTime);
              
              return (
                <div
                  key={index}
                  className="p-3 rounded-md border border-border hover-elevate transition-colors"
                  data-testid={`card-event-${index}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="secondary"
                        className="text-xs font-medium"
                        style={{ backgroundColor: getImpactColor(event.impactLevel) + '20', color: getImpactColor(event.impactLevel) }}
                      >
                        {event.currency}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground" data-testid={`text-time-${index}`}>
                        {format(eventTime, 'HH:mm')}
                      </span>
                      {event.impactLevel?.toLowerCase() === 'high' && (
                        <AlertTriangle className="w-3 h-3 text-red-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {sentiment.icon}
                      <Badge 
                        variant="outline"
                        className="text-xs"
                        style={{ borderColor: getImpactColor(event.impactLevel), color: getImpactColor(event.impactLevel) }}
                      >
                        {event.impactLevel?.toUpperCase() || 'MEDIUM'}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="mb-2">
                    <h4 className="font-medium text-sm" data-testid={`text-event-${index}`}>
                      {event.title}
                    </h4>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex gap-4">
                      {event.expectedValue && (
                        <div>
                          <span className="text-muted-foreground">Forecast: </span>
                          <span className="font-mono font-medium" data-testid={`text-forecast-${index}`}>
                            {event.expectedValue}
                          </span>
                        </div>
                      )}
                      {event.previousValue && (
                        <div>
                          <span className="text-muted-foreground">Previous: </span>
                          <span className="font-mono font-medium" data-testid={`text-previous-${index}`}>
                            {event.previousValue}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-medium ${
                        sentiment.sentiment === 'Bullish' ? 'text-green-500' : 
                        sentiment.sentiment === 'Bearish' ? 'text-red-500' : 'text-muted-foreground'
                      }`}>
                        {sentiment.sentiment}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}